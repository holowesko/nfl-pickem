import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scorePick,
  scoreWeek,
  spreadWinner,
  outrightWinner,
  underdogSide,
  isValidUpsetPick,
  validateWeekPicks,
  type Game,
  type Pick,
} from './scoring'

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    week: 1,
    kickoff: '2026-09-13T17:00:00Z', // Sunday 1pm ET
    homeTeam: 'KC',
    awayTeam: 'DEN',
    spreadHome: -7,
    lockedSpreadHome: -7,
    homeScore: null,
    awayScore: null,
    final: false,
    ...overrides,
  }
}

function pick(overrides: Partial<Pick> = {}): Pick {
  return {
    playerId: 'dad',
    gameId: 'g1',
    side: 'home',
    isLock: false,
    isUpset: false,
    ...overrides,
  }
}

test('underdog is the side with the plus number', () => {
  assert.equal(underdogSide(-7), 'away') // home favored by 7
  assert.equal(underdogSide(3), 'home') // home getting 3
  assert.equal(underdogSide(0), null) // pick'em has no underdog
  assert.equal(underdogSide(null), null)
})

test('spread winner accounts for the line, not just the result', () => {
  // KC favored by 7, wins by 10 -> KC covers.
  assert.equal(spreadWinner(game({ homeScore: 30, awayScore: 20, final: true })), 'home')
  // KC favored by 7, wins by only 3 -> DEN covers.
  assert.equal(spreadWinner(game({ homeScore: 23, awayScore: 20, final: true })), 'away')
  // KC favored by 7, wins by exactly 7 -> push.
  assert.equal(spreadWinner(game({ homeScore: 27, awayScore: 20, final: true })), 'push')
})

test('an unfinished game scores nothing', () => {
  const score = scorePick(pick(), game())
  assert.equal(score.total, 0)
  assert.equal(score.correct, null)
})

test('a correct spread pick is worth 1', () => {
  const score = scorePick(pick(), game({ homeScore: 30, awayScore: 20, final: true }))
  assert.equal(score.total, 1)
  assert.equal(score.correct, true)
})

test('a push is 0 for everyone and counts as neither right nor wrong', () => {
  const g = game({ homeScore: 27, awayScore: 20, final: true })
  assert.equal(scorePick(pick({ side: 'home' }), g).total, 0)
  assert.equal(scorePick(pick({ side: 'away' }), g).total, 0)
  assert.equal(scorePick(pick({ side: 'home' }), g).push, true)
  assert.equal(scorePick(pick({ side: 'home' }), g).correct, null)
})

test('a Lock that covers and wins outright stacks to 3', () => {
  const score = scorePick(
    pick({ isLock: true }),
    game({ homeScore: 30, awayScore: 20, final: true })
  )
  assert.equal(score.spreadPoints, 1)
  assert.equal(score.lockPoints, 2)
  assert.equal(score.total, 3)
})

test('a Lock that wins outright but fails to cover still earns the 2', () => {
  // KC favored by 7 wins by only 3: loses ATS, wins the game.
  const score = scorePick(
    pick({ isLock: true }),
    game({ homeScore: 23, awayScore: 20, final: true })
  )
  assert.equal(score.spreadPoints, 0)
  assert.equal(score.lockPoints, 2)
  assert.equal(score.total, 2)
})

test('an Upset that lands stacks to 4', () => {
  // DEN is the +7 underdog and wins outright, so it also covers.
  const score = scorePick(
    pick({ side: 'away', isUpset: true }),
    game({ homeScore: 20, awayScore: 24, final: true })
  )
  assert.equal(score.spreadPoints, 1)
  assert.equal(score.upsetPoints, 3)
  assert.equal(score.total, 4)
})

test('an Upset pick that covers but loses outright earns only the spread point', () => {
  // DEN +7 loses by 3: covers the spread, no upset.
  const score = scorePick(
    pick({ side: 'away', isUpset: true }),
    game({ homeScore: 23, awayScore: 20, final: true })
  )
  assert.equal(score.total, 1)
  assert.equal(score.upsetPoints, 0)
})

test('the Upset bonus lapses if the line flipped and your team was favored at lock', () => {
  // Picked DEN as an underdog, but by lock time DEN was favored by 2.
  const g = game({
    spreadHome: 2,
    lockedSpreadHome: 2, // home KC is now the dog; DEN is favored
    homeScore: 20,
    awayScore: 24,
    final: true,
  })
  const score = scorePick(pick({ side: 'away', isUpset: true }), g)
  assert.equal(score.upsetPoints, 0, 'no upset bonus for winning as the favorite')
  assert.equal(score.spreadPoints, 1, 'the spread point still stands')
  assert.equal(score.total, 1)
})

test('a Lock and an Upset on the same game both pay out', () => {
  const g = game({ homeScore: 20, awayScore: 24, final: true })
  const score = scorePick(pick({ side: 'away', isLock: true, isUpset: true }), g)
  assert.equal(score.total, 1 + 2 + 3)
})

test('a tie pays the spread but never the outright bonuses', () => {
  const g = game({ spreadHome: 3, lockedSpreadHome: 3, homeScore: 20, awayScore: 20, final: true })
  assert.equal(outrightWinner(g), null)
  const score = scorePick(pick({ side: 'home', isLock: true }), g)
  assert.equal(score.spreadPoints, 1, 'home +3 covers a tie game')
  assert.equal(score.lockPoints, 0)
})

test('unpicked games are counted as missed and score nothing', () => {
  const games = [
    game({ id: 'a', homeScore: 30, awayScore: 20, final: true }),
    game({ id: 'b', homeScore: 30, awayScore: 20, final: true }),
    game({ id: 'c', final: false }),
  ]
  const week = scoreWeek('dad', 1, games, [pick({ gameId: 'a' })])
  assert.equal(week.points, 1)
  assert.equal(week.correct, 1)
  assert.equal(week.missed, 1, 'game b was final and unpicked')
})

test('upset validity is enforced against the underdog', () => {
  assert.equal(isValidUpsetPick(-7, 'away'), true)
  assert.equal(isValidUpsetPick(-7, 'home'), false)
  assert.equal(isValidUpsetPick(0, 'home'), false)
})

test('validation rejects a second Lock, a second Upset, and a favored Upset', () => {
  const games = [game({ id: 'a' }), game({ id: 'b' })]
  const now = new Date('2026-09-09T12:00:00Z') // well before lock
  const errors = validateWeekPicks(
    games,
    [
      pick({ gameId: 'a', isLock: true, isUpset: true, side: 'home' }),
      pick({ gameId: 'b', isLock: true }),
    ],
    now
  )
  const codes = errors.map((e) => e.code)
  assert.ok(codes.includes('DUPLICATE_LOCK'))
  assert.ok(codes.includes('UPSET_NOT_UNDERDOG'), 'home is the -7 favorite')
})

test('validation rejects picks made after the deadline', () => {
  const games = [game({ id: 'a' })]
  const afterLock = new Date('2026-09-13T15:00:00Z') // 11am ET Sunday
  const errors = validateWeekPicks(games, [pick({ gameId: 'a' })], afterLock)
  assert.ok(errors.some((e) => e.code === 'GAME_LOCKED'))
})
