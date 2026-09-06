import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scorePick,
  scoreBonus,
  scoreWeek,
  spreadWinner,
  outrightWinner,
  underdogSide,
  isValidUpsetPick,
  validateWeekPicks,
  validateBonus,
  type Bonus,
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
  return { playerId: 'dad', gameId: 'g1', side: 'home', ...overrides }
}

function bonus(overrides: Partial<Bonus> = {}): Bonus {
  return { playerId: 'dad', week: 1, kind: 'lock', gameId: 'g1', side: 'home', ...overrides }
}

// --- the line -----------------------------------------------------------

test('underdog is the side with the plus number', () => {
  assert.equal(underdogSide(-7), 'away') // home favored by 7
  assert.equal(underdogSide(3), 'home') // home getting 3
  assert.equal(underdogSide(0), null) // pick'em has no underdog
  assert.equal(underdogSide(null), null)
})

test('spread winner accounts for the line, not just the result', () => {
  assert.equal(spreadWinner(game({ homeScore: 30, awayScore: 20, final: true })), 'home')
  assert.equal(spreadWinner(game({ homeScore: 23, awayScore: 20, final: true })), 'away')
  assert.equal(spreadWinner(game({ homeScore: 27, awayScore: 20, final: true })), 'push')
})

// --- spread picks -------------------------------------------------------

test('an unfinished game scores nothing', () => {
  const score = scorePick(pick(), game())
  assert.equal(score.points, 0)
  assert.equal(score.correct, null)
})

test('a correct spread pick is worth 1', () => {
  const score = scorePick(pick(), game({ homeScore: 30, awayScore: 20, final: true }))
  assert.equal(score.points, 1)
  assert.equal(score.correct, true)
})

test('a push is 0 for everyone and counts as neither right nor wrong', () => {
  const g = game({ homeScore: 27, awayScore: 20, final: true })
  assert.equal(scorePick(pick({ side: 'home' }), g).points, 0)
  assert.equal(scorePick(pick({ side: 'away' }), g).points, 0)
  assert.equal(scorePick(pick({ side: 'home' }), g).push, true)
  assert.equal(scorePick(pick({ side: 'home' }), g).correct, null)
})

test('a spread pick never carries a bonus of its own', () => {
  // The Lock lives on the week, not on the pick, so a winning pick is 1 flat.
  const score = scorePick(pick(), game({ homeScore: 30, awayScore: 20, final: true }))
  assert.equal(score.points, 1)
})

// --- the Lock -----------------------------------------------------------

test('a Lock is worth 2 when the team wins outright', () => {
  const g = game({ homeScore: 30, awayScore: 20, final: true })
  assert.equal(scoreBonus(bonus(), g), 2)
})

test('a Lock pays even when the team fails to cover', () => {
  // KC favored by 7 wins by only 3: loses ATS, still wins the game.
  const g = game({ homeScore: 23, awayScore: 20, final: true })
  assert.equal(scoreBonus(bonus(), g), 2)
})

test('a Lock on a losing team is worth nothing', () => {
  const g = game({ homeScore: 20, awayScore: 24, final: true })
  assert.equal(scoreBonus(bonus(), g), 0)
})

test('a Lock does not require a spread pick on that game', () => {
  // No pick at all, just the Lock.
  const g = game({ homeScore: 30, awayScore: 20, final: true })
  const week = scoreWeek('dad', 1, [g], [], [bonus()])
  assert.equal(week.points, 2)
  assert.equal(week.lockPoints, 2)
  assert.equal(week.missed, 1, 'the game was still final and unpicked')
})

// --- the Upset ----------------------------------------------------------

test('an Upset is worth 3 when the underdog wins outright', () => {
  const g = game({ homeScore: 20, awayScore: 24, final: true })
  assert.equal(scoreBonus(bonus({ kind: 'upset', side: 'away' }), g), 3)
})

test('an Upset that only covers is worth nothing', () => {
  // DEN +7 loses by 3: covers, but does not win.
  const g = game({ homeScore: 23, awayScore: 20, final: true })
  assert.equal(scoreBonus(bonus({ kind: 'upset', side: 'away' }), g), 0)
})

test('the Upset lapses if the line flipped and the team was favored at lock', () => {
  const g = game({
    spreadHome: 2,
    lockedSpreadHome: 2, // DEN is now the favorite
    homeScore: 20,
    awayScore: 24,
    final: true,
  })
  assert.equal(
    scoreBonus(bonus({ kind: 'upset', side: 'away' }), g),
    0,
    'winning as the favorite is not an upset'
  )
})

test('a tie pays neither bonus', () => {
  const g = game({ homeScore: 20, awayScore: 20, final: true })
  assert.equal(outrightWinner(g), null)
  assert.equal(scoreBonus(bonus(), g), 0)
  assert.equal(scoreBonus(bonus({ kind: 'upset', side: 'away' }), g), 0)
})

// --- the two together ---------------------------------------------------

test('a spread pick and a Lock on the same team stack to 3', () => {
  const g = game({ homeScore: 30, awayScore: 20, final: true })
  const week = scoreWeek('dad', 1, [g], [pick()], [bonus()])
  assert.equal(week.points, 3)
})

test('a spread pick and an Upset on the same underdog stack to 4', () => {
  const g = game({ homeScore: 20, awayScore: 24, final: true })
  const week = scoreWeek(
    'dad',
    1,
    [g],
    [pick({ side: 'away' })],
    [bonus({ kind: 'upset', side: 'away' })]
  )
  assert.equal(week.points, 4)
})

test('the Lock and the Upset may sit on the same game', () => {
  const g = game({ homeScore: 20, awayScore: 24, final: true })
  const week = scoreWeek(
    'dad',
    1,
    [g],
    [pick({ side: 'away' })],
    [bonus({ kind: 'lock', side: 'away' }), bonus({ kind: 'upset', side: 'away' })]
  )
  assert.equal(week.points, 1 + 2 + 3)
})

test('bonuses on unfinished games score nothing yet', () => {
  const week = scoreWeek('dad', 1, [game()], [], [bonus()])
  assert.equal(week.points, 0)
})

test('unpicked games are counted as missed and score nothing', () => {
  const games = [
    game({ id: 'a', homeScore: 30, awayScore: 20, final: true }),
    game({ id: 'b', homeScore: 30, awayScore: 20, final: true }),
    game({ id: 'c', final: false }),
  ]
  const week = scoreWeek('dad', 1, games, [pick({ gameId: 'a' })], [])
  assert.equal(week.points, 1)
  assert.equal(week.correct, 1)
  assert.equal(week.missed, 1, 'game b was final and unpicked')
})

// --- validation ---------------------------------------------------------

test('upset validity is enforced against the underdog', () => {
  assert.equal(isValidUpsetPick(-7, 'away'), true)
  assert.equal(isValidUpsetPick(-7, 'home'), false)
  assert.equal(isValidUpsetPick(0, 'home'), false)
})

test('validation allows picks after the spread froze but before kickoff', () => {
  const games = [game({ id: 'a' })]
  const afterSpreadLock = new Date('2026-09-13T15:00:00Z') // 11am ET Sunday
  const errors = validateWeekPicks(games, [pick({ gameId: 'a' })], afterSpreadLock)
  assert.equal(errors.length, 0)
})

test('validation rejects picks made after kickoff', () => {
  const games = [game({ id: 'a' })]
  const afterKickoff = new Date('2026-09-13T17:00:01Z')
  const errors = validateWeekPicks(games, [pick({ gameId: 'a' })], afterKickoff)
  assert.ok(errors.some((e) => e.code === 'GAME_LOCKED'))
})

test('an Upset on a favorite is refused', () => {
  const before = new Date('2026-09-13T12:00:00Z')
  const problem = validateBonus(game(), 'home', 'upset', before)
  assert.equal(problem?.code, 'UPSET_NOT_UNDERDOG')
})

test('an Upset on the underdog is allowed', () => {
  const before = new Date('2026-09-13T12:00:00Z')
  assert.equal(validateBonus(game(), 'away', 'upset', before), null)
})

test('an Upset needs a line; a Lock does not', () => {
  const noLine = game({ spreadHome: null, lockedSpreadHome: null })
  const before = new Date('2026-09-13T12:00:00Z')
  assert.equal(validateBonus(noLine, 'home', 'upset', before)?.code, 'NO_LINE')
  assert.equal(
    validateBonus(noLine, 'home', 'lock', before),
    null,
    'the Lock is about winning outright, so it needs no number'
  )
})

test('neither bonus can be set after kickoff', () => {
  const afterKickoff = new Date('2026-09-13T17:00:01Z')
  assert.equal(validateBonus(game(), 'home', 'lock', afterKickoff)?.code, 'GAME_LOCKED')
  assert.equal(validateBonus(game(), 'away', 'upset', afterKickoff)?.code, 'GAME_LOCKED')
})
