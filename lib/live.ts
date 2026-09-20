import { etParts } from './time'
import { arePicksClosed } from './time'
import type { Game, Pick, Bonus, Side } from './scoring'
import type { Tone } from './insights'

/**
 * What the feed says while the games are still being played.
 *
 * These are a different animal from the season insights in `lib/insights.ts`.
 * Those describe a tendency and have to earn their place with a sample size;
 * these describe a moment and are true for as long as the moment lasts. A
 * player being 17 points down is not evidence of anything — it is just funny
 * right now, and gone by Tuesday.
 *
 * So nothing here is persisted and nothing carries a confidence. They are
 * computed fresh on every render, and the page re-renders every 45 seconds
 * while anything is in progress.
 *
 * No game clock: ESPN sends the quarter and time remaining and we do not store
 * it, so the copy never claims to know how long is left. "Down 17" is safe at
 * any point in a game; "down 17 in the fourth" would not be.
 */

export type LiveEntry = {
  id: string
  playerId: string
  headline: string
  detail: string
  tone: Tone
  /** Higher sorts first. A Lock in trouble beats a passing observation. */
  urgency: number
}

export type LiveContext = {
  players: { id: string; name: string }[]
  games: Game[]
  picks: Pick[]
  bonuses: Bonus[]
  now?: Date
}

// --- helpers ---------------------------------------------------------------

/** Kicked off, not finished, and actually reporting a score. */
function inProgress(game: Game, now: Date): boolean {
  return (
    arePicksClosed(new Date(game.kickoff), now) &&
    !game.final &&
    game.homeScore !== null &&
    game.awayScore !== null
  )
}

function sameEtDay(a: Date, b: Date): boolean {
  const x = etParts(a)
  const y = etParts(b)
  return x.year === y.year && x.month === y.month && x.day === y.day
}

/** How far ahead the picked side is, ignoring the spread. */
function outrightMargin(game: Game, side: Side): number {
  const home = (game.homeScore ?? 0) - (game.awayScore ?? 0)
  return side === 'home' ? home : -home
}

/** How far ahead the picked side is against the number. Negative is trailing. */
function spreadMargin(game: Game, side: Side): number | null {
  if (game.lockedSpreadHome === null || game.homeScore === null || game.awayScore === null) {
    return null
  }
  const adjusted = game.homeScore - game.awayScore + game.lockedSpreadHome
  return side === 'home' ? adjusted : -adjusted
}

function teamFor(game: Game, side: Side): string {
  return side === 'home' ? game.homeTeam : game.awayTeam
}

function nameOf(players: { id: string; name: string }[], id: string): string {
  return players.find((p) => p.id === id)?.name ?? id
}

// --- generators ------------------------------------------------------------

type LiveGenerator = (ctx: LiveContext, now: Date) => LiveEntry[]

/**
 * The Lock and the Upset, live. These are the picks with a player's name on
 * them, so they are the ones worth shouting about either way.
 */
const bonusWatch: LiveGenerator = ({ players, games, bonuses }, now) => {
  const live = new Map(games.filter((g) => inProgress(g, now)).map((g) => [g.id, g]))
  const entries: LiveEntry[] = []

  for (const bonus of bonuses) {
    const game = live.get(bonus.gameId)
    if (!game) continue

    const name = nameOf(players, bonus.playerId)
    const team = teamFor(game, bonus.side)
    const margin = outrightMargin(game, bonus.side)
    const label = bonus.kind === 'lock' ? 'Lock' : 'Upset'
    const points = bonus.kind === 'lock' ? 2 : 3

    if (margin <= -10) {
      entries.push({
        id: `bonus-${bonus.playerId}-${bonus.kind}`,
        playerId: bonus.playerId,
        headline: `${name}'s ${label} is being dismantled`,
        detail: `${team} down ${Math.abs(margin)}. That is ${points} points evaporating in real time.`,
        tone: 'bad',
        urgency: 100 + Math.abs(margin),
      })
    } else if (margin < 0) {
      entries.push({
        id: `bonus-${bonus.playerId}-${bonus.kind}`,
        playerId: bonus.playerId,
        headline: `${name}'s ${label} is losing`,
        detail: `${team} trail by ${Math.abs(margin)}. Nervous yet?`,
        tone: 'bad',
        urgency: 90,
      })
    } else if (margin === 0) {
      entries.push({
        id: `bonus-${bonus.playerId}-${bonus.kind}`,
        playerId: bonus.playerId,
        headline: `${name}'s ${label} is tied, which helps nobody`,
        detail: `${team} level. ${points} points hanging on it.`,
        tone: 'neutral',
        urgency: 85,
      })
    } else if (bonus.kind === 'upset') {
      entries.push({
        id: `bonus-${bonus.playerId}-${bonus.kind}`,
        playerId: bonus.playerId,
        headline: `${name}'s Upset is actually happening`,
        detail: `${team} lead by ${margin} as underdogs. He will not shut up about this.`,
        tone: 'good',
        urgency: 95,
      })
    } else {
      entries.push({
        id: `bonus-${bonus.playerId}-${bonus.kind}`,
        playerId: bonus.playerId,
        headline: `${name}'s Lock is holding up`,
        detail: `${team} up ${margin}, and he wants everyone to know it was obvious.`,
        tone: 'good',
        urgency: 70,
      })
    }
  }

  return entries
}

/** A game all three took the same way, going badly or well for everyone. */
const sweepWatch: LiveGenerator = ({ players, games, picks }, now) => {
  const entries: LiveEntry[] = []

  for (const game of games.filter((g) => inProgress(g, now))) {
    const theirs = players.map((p) =>
      picks.find((x) => x.playerId === p.id && x.gameId === game.id)
    )
    if (theirs.some((p) => !p)) continue

    const side = theirs[0]!.side
    if (!theirs.every((p) => p!.side === side)) continue

    const margin = spreadMargin(game, side)
    if (margin === null || Math.abs(margin) < 7) continue

    const team = teamFor(game, side)
    entries.push({
      id: `sweep-${game.id}`,
      playerId: theirs[0]!.playerId,
      headline:
        margin < 0
          ? `All three of you took ${team}`
          : `All three of you took ${team}, and for once that was right`,
      detail:
        margin < 0
          ? `${team} are ${Math.abs(margin)} short of the number. A rare moment of unity.`
          : `${team} clear of the number by ${margin}. Nobody gains anything.`,
      tone: margin < 0 ? 'bad' : 'neutral',
      urgency: margin < 0 ? 80 : 40,
    })
  }

  return entries
}

/** One player alone on a side while it is being decided. */
const loneWolfWatch: LiveGenerator = ({ players, games, picks }, now) => {
  const entries: LiveEntry[] = []

  for (const game of games.filter((g) => inProgress(g, now))) {
    for (const player of players) {
      const mine = picks.find((p) => p.playerId === player.id && p.gameId === game.id)
      if (!mine) continue

      const others = players
        .filter((p) => p.id !== player.id)
        .map((p) => picks.find((x) => x.playerId === p.id && x.gameId === game.id))
      if (others.some((p) => !p)) continue
      if (!others.every((p) => p!.side !== mine.side)) continue

      const margin = spreadMargin(game, mine.side)
      if (margin === null || Math.abs(margin) < 4) continue

      const team = teamFor(game, mine.side)
      entries.push({
        id: `lone-${game.id}-${player.id}`,
        // Replaced below by whichever of this player's islands is most extreme.
        playerId: player.id,
        headline:
          margin > 0
            ? `${player.name} is alone on ${team} and it is working`
            : `${player.name} is alone on ${team} and it is not working`,
        detail:
          margin > 0
            ? `Both of you faded him. ${team} are ${margin} clear of the number.`
            : `Nobody else wanted them. ${team} are ${Math.abs(margin)} short.`,
        tone: margin > 0 ? 'good' : 'bad',
        urgency: margin > 0 ? 75 : 60,
      })
    }
  }

  // Being alone on three games at once is one story, not three. Keep the most
  // extreme per player so a contrarian does not flood the section.
  const strongest = new Map<string, LiveEntry>()
  for (const entry of entries) {
    const held = strongest.get(entry.playerId)
    if (!held || entry.urgency > held.urgency) strongest.set(entry.playerId, entry)
  }
  return [...strongest.values()]
}

/** A live pick sitting right on the number, where a late score swings it. */
const onTheHook: LiveGenerator = ({ players, games, picks }, now) => {
  const entries: LiveEntry[] = []

  for (const game of games.filter((g) => inProgress(g, now))) {
    for (const player of players) {
      const mine = picks.find((p) => p.playerId === player.id && p.gameId === game.id)
      if (!mine) continue

      const margin = spreadMargin(game, mine.side)
      if (margin === null || Math.abs(margin) > 1.5) continue

      entries.push({
        id: `hook-${game.id}-${player.id}`,
        playerId: player.id,
        headline: `${player.name} is on the hook in ${teamFor(game, mine.side)}`,
        detail:
          margin > 0
            ? `Covering by ${margin}. One score either way and it is gone.`
            : `Short by ${Math.abs(margin)}. One score either way and it is his.`,
        tone: 'neutral',
        urgency: 65,
      })
    }
  }

  return entries
}

/** How the day is going, once enough of it has been decided. */
const dayRecord: LiveGenerator = ({ players, games, picks }, now) => {
  const today = games.filter(
    (g) => g.final && sameEtDay(new Date(g.kickoff), now) && g.lockedSpreadHome !== null
  )
  if (today.length < 3) return []

  const entries: LiveEntry[] = []

  for (const player of players) {
    let won = 0
    let lost = 0

    for (const game of today) {
      const mine = picks.find((p) => p.playerId === player.id && p.gameId === game.id)
      if (!mine) continue
      const margin = spreadMargin(game, mine.side)
      if (margin === null || margin === 0) continue
      if (margin > 0) won += 1
      else lost += 1
    }

    if (won + lost < 3) continue

    const blanked = won === 0
    const perfect = lost === 0
    entries.push({
      id: `day-${player.id}`,
      playerId: player.id,
      headline: blanked
        ? `${player.name} has not won a game today`
        : perfect
          ? `${player.name} has not lost one yet`
          : `${player.name} is ${won}–${lost} so far today`,
      detail: blanked
        ? `0 for ${lost}. At some point this stops being variance.`
        : perfect
          ? `${won} from ${won}. Insufferable, and entitled to be.`
          : `${won} right, ${lost} wrong, with the rest still out there.`,
      tone: blanked ? 'bad' : perfect ? 'good' : 'neutral',
      urgency: blanked ? 72 : perfect ? 68 : 30,
    })
  }

  return entries
}

const GENERATORS: LiveGenerator[] = [
  bonusWatch,
  sweepWatch,
  loneWolfWatch,
  onTheHook,
  dayRecord,
]

/**
 * Everything worth saying about games that are being played right now, most
 * urgent first. Empty when nothing is in progress, which is most of the week.
 */
export function liveEntries(ctx: LiveContext, limit = 8): LiveEntry[] {
  const now = ctx.now ?? new Date()

  const remaining = GENERATORS.flatMap((generate) => generate(ctx, now)).sort(
    (a, b) => b.urgency - a.urgency
  )

  // Same nudge as the season feed: the most urgent thing still leads, but one
  // player having a catastrophic afternoon should not fill the whole section.
  const out: LiveEntry[] = []
  let previous: string | null = null

  while (remaining.length > 0 && out.length < limit) {
    let index = remaining.findIndex((entry) => entry.playerId !== previous)
    if (index === -1) index = 0
    const [next] = remaining.splice(index, 1)
    out.push(next)
    previous = next.playerId
  }

  return out
}
