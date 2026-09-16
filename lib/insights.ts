import { spreadWinner, underdogSide, type Game, type Pick, type Bonus } from './scoring'
import { timeSlot, TIME_SLOT_LABELS, type TimeSlot } from './slate'
import type { TimedPick, SeasonSnapshot } from './queries'

/**
 * What the Analysis tab says about each player.
 *
 * The hard part here is not computing statistics — it is choosing which five to
 * show. A card that says "50% on favorites" is worse than an empty one: it
 * burns a slot and teaches people the tab is filler. So every generator returns
 * a `score` alongside its finding, and only the strongest five survive.
 *
 * The other half of that discipline is sample size. Fifteen picks is not a
 * tendency. Every insight carries its `n` and a confidence, generators refuse
 * to speak below a floor, and the ranker discounts thin evidence rather than
 * letting a 3-game fluke lead the card.
 *
 * Tone is deliberate: these are three family members needling each other, so
 * the headline is the joke and the detail is the evidence for it. The joke is
 * never allowed to be the part that is untrue.
 */

export type Confidence = 'thin' | 'emerging' | 'established'
export type Tone = 'good' | 'bad' | 'neutral'

export type Insight = {
  id: string
  /** The line that lands. Written to be read out loud. */
  headline: string
  /** The numbers underneath it. Always checkable. */
  detail: string
  sample: number
  confidence: Confidence
  tone: Tone
  score: number
}

export type InsightContext = {
  player: { id: string; name: string }
  others: { id: string; name: string }[]
  games: Game[]
  picks: Pick[]
  bonuses: Bonus[]
  timings: TimedPick[]
  snapshots: SeasonSnapshot[]
}

// --- helpers ---------------------------------------------------------------

function confidenceFor(n: number): Confidence {
  if (n < 6) return 'thin'
  if (n < 16) return 'emerging'
  return 'established'
}

/**
 * How much a finding is worth showing.
 *
 * Deviation from the baseline is what makes something interesting, but a wild
 * rate over four games is noise. Weighting by log of the sample lets a strong
 * early signal appear while keeping it below a steadier one later.
 */
function score(deviation: number, n: number): number {
  return deviation * Math.log2(n + 1)
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function graded(games: Game[]): Game[] {
  return games.filter((g) => g.final && g.lockedSpreadHome !== null)
}

/** Did this pick cover? Null on a push or an ungradeable game. */
function covered(pick: Pick, game: Game): boolean | null {
  const ats = spreadWinner(game)
  if (ats === null || ats === 'push') return null
  return ats === pick.side
}

function record(results: (boolean | null)[]): { won: number; lost: number; n: number; rate: number } {
  const decided = results.filter((r) => r !== null) as boolean[]
  const won = decided.filter(Boolean).length
  const lost = decided.length - won
  return { won, lost, n: decided.length, rate: decided.length ? won / decided.length : 0 }
}

type TeamTally = { seen: number; backed: number; won: number; lost: number }

/**
 * Per team: how often the player had the chance to take them, how often he did,
 * and how it went. Every pick backs one team and fades the other, so both sides
 * of a game count as a sighting.
 */
function teamTallies(playerId: string, picks: Pick[], games: Game[]): Map<string, TeamTally> {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const tallies = new Map<string, TeamTally>()

  const of = (team: string): TeamTally => {
    const existing = tallies.get(team)
    if (existing) return existing
    const fresh = { seen: 0, backed: 0, won: 0, lost: 0 }
    tallies.set(team, fresh)
    return fresh
  }

  for (const p of picks) {
    if (p.playerId !== playerId) continue
    const game = gradedGames.get(p.gameId)
    if (!game) continue

    const taken = p.side === 'home' ? game.homeTeam : game.awayTeam
    const faded = p.side === 'home' ? game.awayTeam : game.homeTeam

    const backedTally = of(taken)
    backedTally.seen += 1
    backedTally.backed += 1
    const result = covered(p, game)
    if (result === true) backedTally.won += 1
    else if (result === false) backedTally.lost += 1

    of(faded).seen += 1
  }

  return tallies
}

// --- generators ------------------------------------------------------------

type Generator = (ctx: InsightContext) => Insight | null

/** Does this player back the favorite, or chase points? */
const chalkOrDogs: Generator = ({ player, picks, games }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const mine = picks.filter((p) => p.playerId === player.id && gradedGames.has(p.gameId))
  if (mine.length < 6) return null

  const onDogs = mine.filter((p) => {
    const g = gradedGames.get(p.gameId)!
    return underdogSide(g.lockedSpreadHome) === p.side
  })

  const dogRate = onDogs.length / mine.length
  const deviation = Math.abs(dogRate - 0.5) * 2
  if (deviation < 0.3) return null // an even split is not a personality

  const chalky = dogRate < 0.5
  return {
    id: 'chalk-or-dogs',
    headline: chalky
      ? `${player.name} has never seen a favorite he didn't like`
      : `${player.name} cannot resist a hard-luck story`,
    detail: chalky
      ? `${pct(1 - dogRate)} of his picks are on the favorite. Bold.`
      : `${pct(dogRate)} of his picks are on the underdog.`,
    sample: mine.length,
    confidence: confidenceFor(mine.length),
    tone: 'neutral',
    score: score(deviation, mine.length),
  }
}

/** Where the points actually come from: favorites or dogs. */
const betterSide: Generator = ({ player, picks, games }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const mine = picks.filter((p) => p.playerId === player.id && gradedGames.has(p.gameId))

  const dogs = record(
    mine
      .filter((p) => underdogSide(gradedGames.get(p.gameId)!.lockedSpreadHome) === p.side)
      .map((p) => covered(p, gradedGames.get(p.gameId)!))
  )
  const favs = record(
    mine
      .filter((p) => underdogSide(gradedGames.get(p.gameId)!.lockedSpreadHome) !== p.side)
      .map((p) => covered(p, gradedGames.get(p.gameId)!))
  )

  if (dogs.n < 4 || favs.n < 4) return null

  const gap = dogs.rate - favs.rate
  if (Math.abs(gap) < 0.25) return null

  const dogsBetter = gap > 0
  const n = dogs.n + favs.n
  return {
    id: 'better-side',
    headline: dogsBetter
      ? `${player.name} should stop apologising for taking dogs`
      : `${player.name}'s underdogs are a charitable donation`,
    detail: dogsBetter
      ? `${dogs.won}–${dogs.lost} on underdogs against ${favs.won}–${favs.lost} on favorites.`
      : `${favs.won}–${favs.lost} on favorites against ${dogs.won}–${dogs.lost} on dogs.`,
    sample: n,
    confidence: confidenceFor(n),
    tone: 'neutral',
    score: score(Math.abs(gap), n),
  }
}

/** Who wins the games where two players disagree. */
const headToHead: Generator = ({ player, others, picks, games }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  let best: Insight | null = null

  for (const other of others) {
    const results: (boolean | null)[] = []

    for (const [id, game] of gradedGames) {
      const mine = picks.find((p) => p.playerId === player.id && p.gameId === id)
      const theirs = picks.find((p) => p.playerId === other.id && p.gameId === id)
      if (!mine || !theirs || mine.side === theirs.side) continue
      results.push(covered(mine, game))
    }

    const r = record(results)
    if (r.n < 4) continue

    const deviation = Math.abs(r.rate - 0.5) * 2
    if (deviation < 0.3) continue

    const winning = r.rate > 0.5
    const candidate: Insight = {
      id: `head-to-head-${other.id}`,
      headline: winning
        ? `${player.name} owns ${other.name} when they differ`
        : `${other.name} has ${player.name}'s number`,
      detail: `${r.won}–${r.lost} on the ${r.n} games where they took opposite sides.`,
      sample: r.n,
      confidence: confidenceFor(r.n),
      tone: winning ? 'good' : 'bad',
      score: score(deviation, r.n),
    }

    if (!best || candidate.score > best.score) best = candidate
  }

  return best
}

/** How the picks get made: one sitting, or a week of second thoughts. */
const dithering: Generator = ({ player, timings }) => {
  const mine = timings.filter((t) => t.playerId === player.id)
  if (mine.length < 6) return null

  // Picks settled within half an hour of each other are one sitting.
  const buckets = new Set(
    mine.map((t) => Math.floor(new Date(t.decidedAt).getTime() / (30 * 60_000)))
  )
  const revisions = mine.filter(
    (t) => new Date(t.decidedAt).getTime() - new Date(t.firstAt).getTime() > 60_000
  ).length

  const sittings = buckets.size
  const perSitting = mine.length / sittings

  // Descriptive, not predictive — no sample-size caveat needed, but it still
  // has to be unusual to earn a slot.
  if (sittings <= 2) {
    return {
      id: 'dithering',
      headline: `${player.name} picks once and never looks back`,
      detail:
        sittings === 1
          ? `All ${mine.length} picks in a single sitting. No second thoughts, no regrets.`
          : `${mine.length} picks across ${sittings} sittings, and ${revisions} changed after the fact.`,
      sample: mine.length,
      confidence: 'established',
      tone: 'neutral',
      score: score(0.6, mine.length),
    }
  }

  if (perSitting < 3) {
    return {
      id: 'dithering',
      headline: `${player.name} agonises`,
      detail: `${mine.length} picks spread over ${sittings} separate sittings${
        revisions > 0 ? `, ${revisions} of them changed after first going in` : ''
      }.`,
      sample: mine.length,
      confidence: 'established',
      tone: 'neutral',
      score: score(0.7, mine.length),
    }
  }

  return null
}

/** The Lock and the Upset: the two picks with the player's name on them. */
const bonusRecord: Generator = ({ player, bonuses, games }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const mine = bonuses.filter((b) => b.playerId === player.id && gradedGames.has(b.gameId))
  if (mine.length < 2) return null

  const outcome = (b: Bonus) => {
    const g = gradedGames.get(b.gameId)!
    if (g.homeScore === null || g.awayScore === null) return null
    const winner = g.homeScore > g.awayScore ? 'home' : g.awayScore > g.homeScore ? 'away' : null
    return winner === b.side
  }

  const locks = record(mine.filter((b) => b.kind === 'lock').map(outcome))
  const upsets = record(mine.filter((b) => b.kind === 'upset').map(outcome))
  const hits = locks.won + upsets.won
  const total = locks.n + upsets.n
  if (total < 2) return null

  const rate = hits / total
  const deviation = Math.abs(rate - 0.5) * 2

  if (hits === 0) {
    return {
      id: 'bonus-record',
      headline: `${player.name}'s Lock of the Week is a rumour`,
      detail: `${total} bonus picks this season, ${hits} of them right. Worth 0 points.`,
      sample: total,
      confidence: confidenceFor(total),
      tone: 'bad',
      score: score(0.9, total),
    }
  }

  return {
    id: 'bonus-record',
    headline:
      rate >= 0.6
        ? `${player.name} calls his shots and they land`
        : `${player.name}'s bonus picks are a coin flip with extra steps`,
    detail: `Locks ${locks.won}–${locks.lost}, Upsets ${upsets.won}–${upsets.lost}.`,
    sample: total,
    confidence: confidenceFor(total),
    tone: rate >= 0.6 ? 'good' : 'neutral',
    score: score(Math.max(deviation, 0.35), total),
  }
}

/**
 * Whether the market moved toward a pick after it was made.
 *
 * This is the one thing a normal pool cannot say, because it needs both the
 * line history and the moment each pick was settled — and we keep both.
 */
const marketAgreement: Generator = ({ player, timings, games, snapshots }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const byGame = new Map<string, SeasonSnapshot[]>()
  for (const s of snapshots) {
    const list = byGame.get(s.gameId)
    if (list) list.push(s)
    else byGame.set(s.gameId, [s])
  }

  let toward = 0
  let away = 0

  for (const t of timings.filter((x) => x.playerId === player.id)) {
    const game = gradedGames.get(t.gameId)
    const history = byGame.get(t.gameId)
    if (!game || !history || game.lockedSpreadHome === null) continue

    const decidedAt = new Date(t.decidedAt).getTime()
    const atPick = [...history]
      .reverse()
      .find((s) => new Date(s.capturedAt).getTime() <= decidedAt)
    if (!atPick) continue

    const drift = game.lockedSpreadHome - atPick.spreadHome
    if (Math.abs(drift) < 0.5) continue // not a real move

    // A falling number means the home side got more favored.
    const movedTowardHome = drift < 0
    if ((t.side === 'home') === movedTowardHome) toward += 1
    else away += 1
  }

  const n = toward + away
  if (n < 4) return null

  const rate = toward / n
  const deviation = Math.abs(rate - 0.5) * 2
  if (deviation < 0.3) return null

  const early = rate > 0.5
  return {
    id: 'market-agreement',
    headline: early
      ? `${player.name} gets there before the money does`
      : `${player.name} picks, and the market immediately disagrees`,
    detail: early
      ? `On ${toward} of ${n} picks where the line moved, it moved toward his side.`
      : `On ${away} of ${n} picks where the line moved, it moved against his side.`,
    sample: n,
    confidence: confidenceFor(n),
    tone: early ? 'good' : 'bad',
    score: score(deviation, n),
  }
}

/** Games left on the table. */
const leftOnTheTable: Generator = ({ player, picks, games }) => {
  const gradedGames = graded(games)
  const mine = new Set(
    picks.filter((p) => p.playerId === player.id).map((p) => p.gameId)
  )
  const missed = gradedGames.filter((g) => !mine.has(g.id)).length
  if (missed === 0) return null

  return {
    id: 'left-on-the-table',
    headline: `${player.name} keeps forgetting to play`,
    detail: `${missed} finished ${missed === 1 ? 'game' : 'games'} never picked. Points donated to the cause.`,
    sample: gradedGames.length,
    confidence: 'established',
    tone: 'bad',
    score: score(0.5 + Math.min(missed, 5) * 0.1, gradedGames.length),
  }
}

/** Comfortable covers, or a season of sweating the last drive. */
const sweatiness: Generator = ({ player, picks, games }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const margins: number[] = []

  for (const p of picks.filter((x) => x.playerId === player.id)) {
    const g = gradedGames.get(p.gameId)
    if (!g || g.homeScore === null || g.awayScore === null || g.lockedSpreadHome === null) {
      continue
    }
    if (covered(p, g) !== true) continue
    const adjusted = g.homeScore - g.awayScore + g.lockedSpreadHome
    margins.push(Math.abs(adjusted))
  }

  if (margins.length < 5) return null
  const sweaty = margins.filter((m) => m <= 3).length
  const rate = sweaty / margins.length
  if (rate < 0.4) return null

  return {
    id: 'sweatiness',
    headline: `${player.name} is not good, he is lucky`,
    detail: `${sweaty} of his ${margins.length} covers came by a field goal or less.`,
    sample: margins.length,
    confidence: confidenceFor(margins.length),
    tone: 'neutral',
    score: score(rate, margins.length),
  }
}

/**
 * A team backed at nearly every opportunity.
 *
 * Needs several weeks by nature: a team plays once a week, so this cannot speak
 * before week four, and it stays quiet until then.
 */
const teamLoyalty: Generator = ({ player, picks, games }) => {
  const tallies = teamTallies(player.id, picks, games)

  let best: { team: string; t: TeamTally } | null = null
  for (const [team, t] of tallies) {
    // Four sightings, matching the aversion floor. Three weeks of taking the
    // same team is a coincidence; a month of it is a habit.
    if (t.seen < 4) continue
    if (t.backed / t.seen < 0.75) continue
    if (!best || t.backed > best.t.backed) best = { team, t }
  }
  if (!best) return null

  const { team, t } = best
  const paying = t.won > t.lost
  const always = t.backed === t.seen
  const timesPhrase = always
    ? `all ${t.seen} times they have played`
    : `${t.backed} of the ${t.seen} times they have played`

  return {
    id: 'team-loyalty',
    headline: paying
      ? `${player.name}'s faith in ${team} is being repaid`
      : `${player.name} keeps going back to ${team}, and ${team} keeps taking his money`,
    detail: `Backed them ${timesPhrase}, going ${t.won}–${t.lost}.`,
    sample: t.backed,
    confidence: confidenceFor(t.backed),
    tone: paying ? 'good' : 'bad',
    score: score(0.4 + (t.backed / Math.max(t.seen, 1)) * 0.4, t.backed),
  }
}

/** A team never trusted, whatever the number. */
const teamAversion: Generator = ({ player, picks, games }) => {
  const tallies = teamTallies(player.id, picks, games)

  let worst: { team: string; t: TeamTally } | null = null
  for (const [team, t] of tallies) {
    // Four chances, not three. "Will not touch them" is a strong claim, and
    // three sightings is the kind of thin evidence this tab exists to refuse.
    if (t.seen < 4 || t.backed > 0) continue
    if (!worst || t.seen > worst.t.seen) worst = { team, t }
  }
  if (!worst) return null

  const { team, t } = worst
  return {
    id: 'team-aversion',
    headline: `${player.name} will not touch ${team}`,
    detail: `${t.seen} chances to take them, ${t.seen} times he looked the other way.`,
    sample: t.seen,
    confidence: confidenceFor(t.seen),
    tone: 'neutral',
    score: score(0.55, t.seen),
  }
}

/** The part of the week where a player is unlike himself. */
const bestSlot: Generator = ({ player, picks, games }) => {
  const gradedGames = new Map(graded(games).map((g) => [g.id, g]))
  const mine = picks.filter((p) => p.playerId === player.id && gradedGames.has(p.gameId))
  const overall = record(mine.map((p) => covered(p, gradedGames.get(p.gameId)!)))
  if (overall.n < 10) return null

  const bySlot = new Map<TimeSlot, (boolean | null)[]>()
  for (const p of mine) {
    const game = gradedGames.get(p.gameId)!
    const slot = timeSlot(game.kickoff)
    const list = bySlot.get(slot)
    if (list) list.push(covered(p, game))
    else bySlot.set(slot, [covered(p, game)])
  }

  let best: Insight | null = null
  for (const [slot, results] of bySlot) {
    const r = record(results)
    if (r.n < 6) continue

    const gap = r.rate - overall.rate
    if (Math.abs(gap) < 0.25) continue

    const good = gap > 0
    const label = TIME_SLOT_LABELS[slot]
    const candidate: Insight = {
      id: 'best-slot',
      headline: good
        ? `${player.name} is a different animal on ${label}`
        : `${player.name} should be kept away from ${label}`,
      detail: `${r.won}–${r.lost} there against ${overall.won}–${overall.lost} everywhere else combined.`,
      sample: r.n,
      confidence: confidenceFor(r.n),
      tone: good ? 'good' : 'bad',
      score: score(Math.abs(gap), r.n),
    }

    if (!best || candidate.score > best.score) best = candidate
  }

  return best
}

const GENERATORS: Generator[] = [
  teamLoyalty,
  teamAversion,
  bestSlot,
  chalkOrDogs,
  betterSide,
  headToHead,
  dithering,
  bonusRecord,
  marketAgreement,
  leftOnTheTable,
  sweatiness,
]

/**
 * The strongest findings about one player, best first.
 *
 * Returns fewer than `limit` when the season has not earned them — an empty
 * card in week one is the honest answer, and better than five inventions.
 */
export function insightsFor(ctx: InsightContext, limit = 5): Insight[] {
  return GENERATORS.map((generate) => generate(ctx))
    .filter((i): i is Insight => i !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
