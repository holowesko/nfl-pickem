/**
 * The rules of the game, as pure functions. Nothing in here touches the
 * database or the network, so it can be tested directly (see scoring.test.ts).
 *
 * Scoring summary:
 *   - 1 point for picking a game correctly against the spread
 *   - +2 more if that game was your Lock of the Week and the team won outright
 *   - +3 more if that game was your Upset of the Week and the underdog won
 *   - a push (result lands exactly on the number) is 0 for everyone
 *   - an unpicked game is 0 — there is no auto-pick
 */

import { isLocked } from './time'

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
   * is the snapshot taken when the game's lock window closed, and it is the
   * number that actually grades the pick.
   */
  spreadHome: number | null
  lockedSpreadHome: number | null
  homeScore: number | null
  awayScore: number | null
  final: boolean
}

export type Pick = {
  playerId: string
  gameId: string
  side: Side
  isLock: boolean
  isUpset: boolean
}

export const POINTS_SPREAD = 1
export const POINTS_LOCK_BONUS = 2
export const POINTS_UPSET_BONUS = 3

/** Which side the underdog is on, or null for a pick'em. */
export function underdogSide(spreadHome: number | null): Side | null {
  if (spreadHome === null || spreadHome === 0) return null
  return spreadHome > 0 ? 'home' : 'away'
}

/** Whether a side may be flagged as the Upset of the Week on this line. */
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
  spreadPoints: number
  lockPoints: number
  upsetPoints: number
  total: number
  /** Null while the game is unfinished. */
  correct: boolean | null
  push: boolean
}

const ZERO: PickScore = {
  spreadPoints: 0,
  lockPoints: 0,
  upsetPoints: 0,
  total: 0,
  correct: null,
  push: false,
}

/** Points earned by a single pick on a single game. */
export function scorePick(pick: Pick, game: Game): PickScore {
  if (!game.final) return { ...ZERO }

  const ats = spreadWinner(game)
  const outright = outrightWinner(game)

  if (ats === null) return { ...ZERO }

  const push = ats === 'push'
  const coveredSpread = ats === pick.side
  const wonOutright = outright === pick.side

  const spreadPoints = coveredSpread ? POINTS_SPREAD : 0

  const lockPoints = pick.isLock && wonOutright ? POINTS_LOCK_BONUS : 0

  // The Upset bonus requires the picked team to have actually been the underdog
  // on the graded line. If the line flipped after the pick was made and your
  // team ended up favored, the bonus lapses — the 1-point spread pick stands.
  const upsetPoints =
    pick.isUpset && wonOutright && isValidUpsetPick(game.lockedSpreadHome, pick.side)
      ? POINTS_UPSET_BONUS
      : 0

  return {
    spreadPoints,
    lockPoints,
    upsetPoints,
    total: spreadPoints + lockPoints + upsetPoints,
    correct: push ? null : coveredSpread,
    push,
  }
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
}

/** Roll a player's picks up into a single week's line on the leaderboard. */
export function scoreWeek(
  playerId: string,
  week: number,
  games: Game[],
  picks: Pick[]
): WeekScore {
  const byGame = new Map(picks.map((p) => [p.gameId, p]))
  const result: WeekScore = {
    playerId,
    week,
    points: 0,
    correct: 0,
    incorrect: 0,
    pushes: 0,
    missed: 0,
  }

  for (const game of games) {
    if (!game.final) continue
    const pick = byGame.get(game.id)
    if (!pick) {
      result.missed += 1
      continue
    }
    const score = scorePick(pick, game)
    result.points += score.total
    if (score.push) result.pushes += 1
    else if (score.correct) result.correct += 1
    else result.incorrect += 1
  }

  return result
}

export type PickValidationError = {
  code: 'GAME_LOCKED' | 'UPSET_NOT_UNDERDOG' | 'DUPLICATE_LOCK' | 'DUPLICATE_UPSET'
  message: string
}

/**
 * Check a proposed set of picks for one player for one week. Returns every
 * problem found rather than stopping at the first, so the UI can show them all.
 */
export function validateWeekPicks(
  games: Game[],
  picks: Pick[],
  now: Date = new Date()
): PickValidationError[] {
  const errors: PickValidationError[] = []
  const gamesById = new Map(games.map((g) => [g.id, g]))

  const locks = picks.filter((p) => p.isLock)
  const upsets = picks.filter((p) => p.isUpset)

  if (locks.length > 1) {
    errors.push({
      code: 'DUPLICATE_LOCK',
      message: 'Only one Lock of the Week is allowed.',
    })
  }
  if (upsets.length > 1) {
    errors.push({
      code: 'DUPLICATE_UPSET',
      message: 'Only one Upset of the Week is allowed.',
    })
  }

  for (const pick of picks) {
    const game = gamesById.get(pick.gameId)
    if (!game) continue

    if (isLocked(new Date(game.kickoff), now)) {
      errors.push({
        code: 'GAME_LOCKED',
        message: `Picks for ${game.awayTeam} @ ${game.homeTeam} are already locked.`,
      })
    }

    if (pick.isUpset && !isValidUpsetPick(game.spreadHome, pick.side)) {
      errors.push({
        code: 'UPSET_NOT_UNDERDOG',
        message: `Your Upset of the Week must be an underdog, and ${
          pick.side === 'home' ? game.homeTeam : game.awayTeam
        } is not.`,
      })
    }
  }

  return errors
}
