import { test } from 'node:test'
import assert from 'node:assert/strict'
import { insightsFor, type InsightContext } from './insights'
import type { Game, Pick, Bonus } from './scoring'

function game(i: number, over: Partial<Game> = {}): Game {
  return {
    id: `g${i}`,
    week: 1,
    kickoff: '2026-09-13T17:00:00Z',
    homeTeam: 'KC',
    awayTeam: 'DEN',
    spreadHome: -7,
    lockedSpreadHome: -7,
    homeScore: 30,
    awayScore: 20,
    final: true,
    ...over,
  }
}

function ctx(over: Partial<InsightContext> = {}): InsightContext {
  return {
    player: { id: 'dad', name: 'Dad' },
    others: [{ id: 'john', name: 'John' }],
    games: [],
    picks: [],
    bonuses: [],
    timings: [],
    snapshots: [],
    ...over,
  }
}

test('an empty season produces no insights rather than inventions', () => {
  assert.deepEqual(insightsFor(ctx()), [])
})

test('a handful of picks is still too thin to claim a tendency', () => {
  const games = [0, 1, 2].map((i) => game(i))
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))
  // Three games is below every generator's floor.
  assert.deepEqual(insightsFor(ctx({ games, picks })), [])
})

test('a lopsided lean is reported, and carries its sample size', () => {
  const games = Array.from({ length: 10 }, (_, i) => game(i))
  // Home is the -7 favorite in every game; taking home every time is pure chalk.
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))

  const found = insightsFor(ctx({ games, picks }))
  const chalk = found.find((i) => i.id === 'chalk-or-dogs')

  assert.ok(chalk, 'expected the favorite lean to be reported')
  assert.match(chalk.headline, /Dad/)
  assert.equal(chalk.sample, 10)
  assert.equal(chalk.confidence, 'emerging')
})

test('an even split is not a personality, so it is not reported', () => {
  const games = Array.from({ length: 10 }, (_, i) => game(i))
  const picks: Pick[] = games.map((g, i) => ({
    playerId: 'dad',
    gameId: g.id,
    side: i % 2 === 0 ? 'home' : 'away',
  }))

  const found = insightsFor(ctx({ games, picks }))
  assert.equal(found.find((i) => i.id === 'chalk-or-dogs'), undefined)
})

test('head to head only counts games where the two actually disagreed', () => {
  // Home covers -7 in all six. Dad takes home throughout; John differs on four.
  const games = Array.from({ length: 6 }, (_, i) => game(i))
  const picks: Pick[] = []
  for (const [i, g] of games.entries()) {
    picks.push({ playerId: 'dad', gameId: g.id, side: 'home' })
    picks.push({ playerId: 'john', gameId: g.id, side: i < 4 ? 'away' : 'home' })
  }

  const found = insightsFor(ctx({ games, picks }))
  const h2h = found.find((i) => i.id === 'head-to-head-john')

  assert.ok(h2h, 'expected a head-to-head insight')
  assert.equal(h2h.sample, 4, 'the two agreed on the other two games')
  assert.match(h2h.detail, /4–0/)
})

test('unpicked games are called out', () => {
  const games = Array.from({ length: 8 }, (_, i) => game(i))
  const picks: Pick[] = games.slice(0, 5).map((g) => ({
    playerId: 'dad',
    gameId: g.id,
    side: 'home',
  }))

  const found = insightsFor(ctx({ games, picks }))
  const missed = found.find((i) => i.id === 'left-on-the-table')
  assert.ok(missed)
  assert.match(missed.detail, /3 finished games/)
})

test('a bonus pick that never lands is reported as such', () => {
  // Home wins outright every time; Dad keeps taking the away side.
  const games = Array.from({ length: 4 }, (_, i) => game(i))
  const bonuses: Bonus[] = [
    { playerId: 'dad', week: 1, kind: 'lock', gameId: 'g0', side: 'away' },
    { playerId: 'dad', week: 2, kind: 'upset', gameId: 'g1', side: 'away' },
  ]

  const found = insightsFor(ctx({ games, bonuses }))
  const bonus = found.find((i) => i.id === 'bonus-record')
  assert.ok(bonus)
  assert.equal(bonus.tone, 'bad')
  assert.match(bonus.detail, /0 of them right|2 bonus picks/)
})

test('never more than the requested number of insights', () => {
  const games = Array.from({ length: 20 }, (_, i) => game(i))
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))
  assert.ok(insightsFor(ctx({ games, picks }), 5).length <= 5)
  assert.ok(insightsFor(ctx({ games, picks }), 2).length <= 2)
})

test('insights arrive strongest first', () => {
  const games = Array.from({ length: 20 }, (_, i) => game(i))
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))
  const found = insightsFor(ctx({ games, picks }))
  const scores = found.map((i) => i.score)
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a))
})

// --- team loyalty and time slots ------------------------------------------

/** A game in a named slot, between two named teams. */
function matchup(i: number, home: string, away: string, kickoff: string, homeWins = true): Game {
  return game(i, {
    id: `m${i}`,
    homeTeam: home,
    awayTeam: away,
    kickoff,
    lockedSpreadHome: -7,
    spreadHome: -7,
    homeScore: homeWins ? 30 : 10,
    awayScore: homeWins ? 10 : 30,
  })
}

const SUN_EARLY = '2026-09-13T17:00:00Z' // Sun 1:00pm ET
const SUN_NIGHT = '2026-09-14T00:20:00Z' // Sun 8:20pm ET
const THU_NIGHT = '2026-09-11T00:15:00Z' // Thu 8:15pm ET

test('one sighting of a team is not loyalty', () => {
  const games = [matchup(0, 'KC', 'DEN', SUN_EARLY)]
  const picks: Pick[] = [{ playerId: 'dad', gameId: 'm0', side: 'home' }]
  const found = insightsFor(ctx({ games, picks }))
  assert.equal(found.find((i) => i.id === 'team-loyalty'), undefined)
})

test('backing the same team every week is loyalty, with its record', () => {
  // KC play four times and cover every one; Dad takes them each time.
  const games = [0, 1, 2, 3].map((i) => matchup(i, 'KC', 'DEN', SUN_EARLY))
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))

  const found = insightsFor(ctx({ games, picks }))
  const loyalty = found.find((i) => i.id === 'team-loyalty')

  assert.ok(loyalty, 'expected loyalty to be reported')
  assert.match(loyalty.headline, /KC/)
  assert.match(loyalty.detail, /all 4 times/)
  assert.match(loyalty.detail, /4–0/)
  assert.equal(loyalty.tone, 'good')
})

test('loyalty that keeps losing is reported as such', () => {
  // DEN lose every week and Dad backs them anyway.
  const games = [0, 1, 2, 3].map((i) => matchup(i, 'KC', 'DEN', SUN_EARLY))
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'away' }))

  const loyalty = insightsFor(ctx({ games, picks })).find((i) => i.id === 'team-loyalty')
  assert.ok(loyalty)
  assert.match(loyalty.headline, /keeps taking his money/)
  assert.equal(loyalty.tone, 'bad')
})

test('three chances is not yet an aversion, four is', () => {
  const three = [0, 1, 2].map((i) => matchup(i, 'KC', 'DEN', SUN_EARLY))
  const pick3: Pick[] = three.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))
  assert.equal(
    insightsFor(ctx({ games: three, picks: pick3 })).find((i) => i.id === 'team-aversion'),
    undefined,
    'three sightings is too thin for "will not touch them"'
  )

  const four = [0, 1, 2, 3].map((i) => matchup(i, 'KC', 'DEN', SUN_EARLY))
  const pick4: Pick[] = four.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))
  const aversion = insightsFor(ctx({ games: four, picks: pick4 })).find(
    (i) => i.id === 'team-aversion'
  )
  assert.ok(aversion)
  assert.match(aversion.headline, /will not touch DEN/)
  assert.equal(aversion.sample, 4)
})

test('a time slot is only called out when it differs from the player’s own baseline', () => {
  // Twelve Sunday-early games, all covered — no slot stands out from itself.
  const games = Array.from({ length: 12 }, (_, i) => matchup(i, 'KC', 'DEN', SUN_EARLY))
  const picks: Pick[] = games.map((g) => ({ playerId: 'dad', gameId: g.id, side: 'home' }))
  const found = insightsFor(ctx({ games, picks }))
  assert.equal(found.find((i) => i.id === 'best-slot'), undefined)
})

test('a slot where a player is unlike himself is reported', () => {
  const games: Game[] = []
  const picks: Pick[] = []

  // Twelve Sunday-early games he wins, then six Sunday-night games he loses.
  for (let i = 0; i < 12; i++) {
    games.push(matchup(i, 'KC', 'DEN', SUN_EARLY, true))
    picks.push({ playerId: 'dad', gameId: `m${i}`, side: 'home' })
  }
  for (let i = 12; i < 18; i++) {
    games.push(matchup(i, 'KC', 'DEN', SUN_NIGHT, false))
    picks.push({ playerId: 'dad', gameId: `m${i}`, side: 'home' })
  }

  const slot = insightsFor(ctx({ games, picks })).find((i) => i.id === 'best-slot')
  assert.ok(slot, 'expected a slot insight')
  assert.match(slot.headline, /Sunday night/)
  assert.equal(slot.tone, 'bad')
  assert.equal(slot.sample, 6)
})

test('Thursday night is its own slot', () => {
  const games: Game[] = []
  const picks: Pick[] = []
  for (let i = 0; i < 12; i++) {
    games.push(matchup(i, 'KC', 'DEN', SUN_EARLY, false))
    picks.push({ playerId: 'dad', gameId: `m${i}`, side: 'home' })
  }
  for (let i = 12; i < 18; i++) {
    games.push(matchup(i, 'KC', 'DEN', THU_NIGHT, true))
    picks.push({ playerId: 'dad', gameId: `m${i}`, side: 'home' })
  }

  const slot = insightsFor(ctx({ games, picks })).find((i) => i.id === 'best-slot')
  assert.ok(slot)
  assert.match(slot.headline, /Thursday night/)
  assert.equal(slot.tone, 'good')
})
