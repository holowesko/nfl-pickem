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
