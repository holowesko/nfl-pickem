/**
 * The rules of the game, as pure functions. Nothing in here touches the
 * database or the network, so it can be tested directly (see scoring.test.ts).
 *
 * Scoring summary:
 *   - 1 point for picking a game correctly against the spread
 *   - +2 for the Lock of the Week if that team wins outright
 *   - +3 for the Upset of the Week if that underdog wins outright
 *   - a push (result lands exactly on the number) is 0 for everyone
 *   - an unpicked game is 0 — there is no auto-pick
 *
 * The Lock and the Upset are chosen for the week as a whole, not attached to a
 * spread pick. Picking a team as your Lock says nothing about whether you also
 * took them against the number; if you did both and both land, you collect
 * both, which is where the maximum of 3 on a Lock game (and 4 on an Upset)
 * still comes from.
 */

import { arePicksClosed } from './time'

export type Side = 'home' | 'away'

export type Game = {
  id: string
  week: number
  kickoff: string // ISO 8601, UTC
  homeTeam: string
  awayTeam: string
  /**
   * The spread from the home team's perspective: -3 means the home team is
   * favored by 3. Null until the line is first fetched.
   *
   * `spreadHome` is the live line and moves during the week. `lockedSpreadHome`
   * is the snapshot taken when the game's window closed, and it is the number
   * that actually grades the pick.
   */
  spreadHome: number | null
  lockedSpreadHome: number | null
  homeScore: number | null
  awayScore: number | null
  final: boolean
}

/** A pick against the spread on one game. */
export type Pick = {
  playerId: string
  gameId: string
  side: Side
}

export type BonusKind = 'lock' | 'upset'

/** One of the two weekly bonus selections: a team, in a game, for a week. */
export type Bonus = {
  playerId: string
  week: number
  kind: BonusKind
  gameId: string
  side: Side
}

export const POINTS_SPREAD = 1
export const POINTS_LOCK = 2
export const POINTS_UPSET = 3

/** Which side the underdog is on, or null for a pick'em. */
export function underdogSide(spreadHome: number | null): Side | null {
  if (spreadHome === null || spreadHome === 0) return null
  return spreadHome > 0 ? 'home' : 'away'
}

/** Whether a side may be taken as the Upset of the Week on this line. */
export function isValidUpsetPick(spreadHome: number | null, side: Side): boolean {
  return underdogSide(spreadHome) === side
}

/** Who won outright, ignoring the spread. Null on a tie or an unfinished game. */
export function outrightWinner(game: Game): Side | null {
  if (!game.final || game.homeScore === null || game.awayScore === null) return null
  if (game.homeScore > game.awayScore) return 'home'
  if (game.awayScore > game.homeScore) return 'away'
  return null // ties win nothing
}

/** Who covered the graded spread, or 'push' if it landed exactly on the number. */
export function spreadWinner(game: Game): Side | 'push' | null {
  const spread = game.lockedSpreadHome
  if (!game.final || game.homeScore === null || game.awayScore === null || spread === null) {
    return null
  }
  const adjustedMargin = game.homeScore - game.awayScore + spread
  if (adjustedMargin === 0) return 'push'
  return adjustedMargin > 0 ? 'home' : 'away'
}

export type PickScore = {
  points: number
  /** Null while the game is unfinished, or on a push. */
  correct: boolean | null
  push: boolean
}

/** Points earned by a single pick against the spread. */
export function scorePick(pick: Pick, game: Game): PickScore {
  const ats = spreadWinner(game)
  if (ats === null) return { points: 0, correct: null, push: false }

  if (ats === 'push') return { points: 0, correct: null, push: true }

  const covered = ats === pick.side
  return { points: covered ? POINTS_SPREAD : 0, correct: covered, push: false }
}

/**
 * Points earned by a weekly bonus selection.
 *
 * The Upset bonus additionally requires the team to have been an underdog on
 * the graded line. If the line flipped after the pick was made and the team
 * ended up favored, the bonus lapses — winning as a favorite is not an upset.
 */
export function scoreBonus(bonus: Bonus, game: Game): number {
  if (outrightWinner(game) !== bonus.side) return 0

  if (bonus.kind === 'lock') return POINTS_LOCK

  return isValidUpsetPick(game.lockedSpreadHome, bonus.side) ? POINTS_UPSET : 0
}

export type WeekScore = {
  playerId: string
  week: number
  points: number
  correct: number
  incorrect: number
  pushes: number
  /** Games that were final but never picked. */
  missed: number
  lockPoints: number
  upsetPoints: number
}

/** Roll a player's week up into a single line on the leaderboard. */
export function scoreWeek(
  playerId: string,
  week: number,
  games: Game[],
  picks: Pick[],
  bonuses: Bonus[] = []
): WeekScore {
  const byGame = new Map(picks.map((p) => [p.gameId, p]))
  const gamesById = new Map(games.map((g) => [g.id, g]))

  const result: WeekScore = {
    playerId,
    week,
    points: 0,
    correct: 0,
    incorrect: 0,
    pushes: 0,
    missed: 0,
    lockPoints: 0,
    upsetPoints: 0,
  }

  for (const game of games) {
    if (!game.final) continue
    const pick = byGame.get(game.id)
    if (!pick) {
      result.missed += 1
      continue
    }
    const score = scorePick(pick, game)
    result.points += score.points
    if (score.push) result.pushes += 1
    else if (score.correct) result.correct += 1
    else result.incorrect += 1
  }

  for (const bonus of bonuses) {
    const game = gamesById.get(bonus.gameId)
    if (!game || !game.final) continue
    const points = scoreBonus(bonus, game)
    result.points += points
    if (bonus.kind === 'lock') result.lockPoints += points
    else result.upsetPoints += points
  }

  return result
}

export type PickValidationError = {
  code: 'GAME_LOCKED' | 'UPSET_NOT_UNDERDOG' | 'NO_LINE'
  message: string
}

/** Check a proposed spread pick. Returns every problem found, not just the first. */
export function validateWeekPicks(
  games: Game[],
  picks: Pick[],
  now: Date = new Date()
): PickValidationError[] {
  const errors: PickValidationError[] = []
  const gamesById = new Map(games.map((g) => [g.id, g]))

  for (const pick of picks) {
    const game = gamesById.get(pick.gameId)
    if (!game) continue

    if (arePicksClosed(new Date(game.kickoff), now)) {
      errors.push({
        code: 'GAME_LOCKED',
        message: `Picks for ${game.awayTeam} @ ${game.homeTeam} are closed.`,
      })
    }
  }

  return errors
}

/** Check a proposed Lock or Upset selection. */
export function validateBonus(
  game: Game,
  side: Side,
  kind: BonusKind,
  now: Date = new Date()
): PickValidationError | null {
  if (arePicksClosed(new Date(game.kickoff), now)) {
    return {
      code: 'GAME_LOCKED',
      message: `${game.awayTeam} @ ${game.homeTeam} has already kicked off.`,
    }
  }

  if (kind === 'upset') {
    if (game.spreadHome === null) {
      return { code: 'NO_LINE', message: 'That game has no line yet.' }
    }
    if (!isValidUpsetPick(game.spreadHome, side)) {
      const team = side === 'home' ? game.homeTeam : game.awayTeam
      return {
        code: 'UPSET_NOT_UNDERDOG',
        message: `${team} is not an underdog this week.`,
      }
    }
  }

  return null
}
