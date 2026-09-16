import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseScoreboard, isWeekComplete } from './espn'

/** Minimal stand-in for an ESPN event, shaped like the real payload. */
function event({
  id = '1',
  date = '2026-09-13T17:00:00Z',
  home = 'IND',
  away = 'BAL',
  odds = undefined as unknown,
  state = 'pre',
  completed = false,
  homeScore = '0',
  awayScore = '0',
} = {}) {
  return {
    id,
    date,
    competitions: [
      {
        status: { type: { state, completed } },
        odds,
        competitors: [
          { homeAway: 'home', score: homeScore, team: { abbreviation: home, name: home } },
          { homeAway: 'away', score: awayScore, team: { abbreviation: away, name: away } },
        ],
      },
    ],
  }
}

function board(events: unknown[]) {
  return parseScoreboard({ season: { year: 2026 }, week: { number: 1 }, events })
}

test('reads season and week', () => {
  const result = board([event()])
  assert.equal(result.season, 2026)
  assert.equal(result.week, 1)
  assert.equal(result.games.length, 1)
})

test('a home favorite keeps ESPN’s negative spread', () => {
  const result = board([
    event({ home: 'SEA', away: 'NE', odds: [{ spread: -3.5, details: 'SEA -3.5' }] }),
  ])
  assert.equal(result.games[0].spreadHome, -3.5)
})

test('an away favorite yields a positive spread for the home team', () => {
  // This is the real BAL@IND case: the Ravens are favored on the road.
  const result = board([
    event({ home: 'IND', away: 'BAL', odds: [{ spread: 3.5, details: 'BAL -3.5' }] }),
  ])
  assert.equal(result.games[0].spreadHome, 3.5, 'home team is getting 3.5')
})

test('falls back to parsing the details string when spread is missing', () => {
  const homeFav = board([event({ home: 'SEA', away: 'NE', odds: [{ details: 'SEA -3.5' }] })])
  assert.equal(homeFav.games[0].spreadHome, -3.5)

  const awayFav = board([event({ home: 'IND', away: 'BAL', odds: [{ details: 'BAL -3.5' }] })])
  assert.equal(awayFav.games[0].spreadHome, 3.5, 'the line must flip for the home team')
})

test('EVEN is a pick’em, not a missing line', () => {
  const result = board([event({ odds: [{ details: 'EVEN' }] })])
  assert.equal(result.games[0].spreadHome, 0)
})

test('a game with no odds yet has a null spread rather than throwing', () => {
  assert.equal(board([event({ odds: undefined })]).games[0].spreadHome, null)
  assert.equal(board([event({ odds: [] })]).games[0].spreadHome, null)
  assert.equal(board([event({ odds: [{ details: 'nonsense' }] })]).games[0].spreadHome, null)
})

test('prefers the highest-priority sportsbook', () => {
  const result = board([
    event({
      home: 'SEA',
      odds: [
        { spread: -7, provider: { priority: 5 } },
        { spread: -3.5, provider: { priority: 1 } },
      ],
    }),
  ])
  assert.equal(result.games[0].spreadHome, -3.5)
})

test('scores are null until kickoff, then read through', () => {
  const pre = board([event({ state: 'pre', homeScore: '0', awayScore: '0' })])
  assert.equal(pre.games[0].homeScore, null)
  assert.equal(pre.games[0].final, false)

  const done = board([
    event({ state: 'post', completed: true, homeScore: '24', awayScore: '20' }),
  ])
  assert.equal(done.games[0].homeScore, 24)
  assert.equal(done.games[0].awayScore, 20)
  assert.equal(done.games[0].final, true)
})

test('kickoff is normalised to a full ISO instant', () => {
  // ESPN sends "2026-09-10T00:20Z" without seconds.
  const result = board([event({ date: '2026-09-10T00:20Z' })])
  assert.equal(result.games[0].kickoff, '2026-09-10T00:20:00.000Z')
})

test('malformed events are skipped, not fatal', () => {
  const result = board([event({ id: 'good' }), { id: 'bad', competitions: [] }, {}])
  assert.equal(result.games.length, 1)
  assert.equal(result.games[0].id, 'good')
})

test('a payload with no season is an error worth surfacing', () => {
  assert.throws(() => parseScoreboard({ events: [] }), /season and week/)
})

test('a week is complete only when every game is final', () => {
  const board = (finals: boolean[]) => ({
    season: 2026,
    week: 1,
    games: finals.map((final, i) => ({
      id: String(i),
      season: 2026,
      week: 1,
      kickoff: '2026-09-13T17:00:00Z',
      homeTeam: 'KC',
      awayTeam: 'DEN',
      homeName: 'Chiefs',
      awayName: 'Broncos',
      spreadHome: -3,
      homeScore: final ? 24 : null,
      awayScore: final ? 20 : null,
      final,
    })),
  })

  assert.equal(isWeekComplete(board([true, true, true])), true)
  assert.equal(isWeekComplete(board([true, false, true])), false)
  assert.equal(isWeekComplete(board([false])), false)

  // Asking for week 19 of an 18-week season returns nothing. Calling that
  // "complete" would advance the pointer past the end of the schedule.
  assert.equal(isWeekComplete(board([])), false)
})
