import { test } from 'node:test'
import assert from 'node:assert/strict'
import { liveEntries, type LiveContext } from './live'
import type { Game, Pick, Bonus } from './scoring'

const PLAYERS = [
  { id: 'dad', name: 'Dad' },
  { id: 'john', name: 'John' },
  { id: 'nick', name: 'Nick' },
]

// Sunday 1:00pm ET kickoff; "now" is mid-afternoon, so it is under way.
const KICKOFF = '2026-09-20T17:00:00Z'
const NOW = new Date('2026-09-20T19:30:00Z')

function game(over: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    week: 2,
    kickoff: KICKOFF,
    homeTeam: 'KC',
    awayTeam: 'DEN',
    spreadHome: -7,
    lockedSpreadHome: -7,
    homeScore: 14,
    awayScore: 10,
    final: false,
    ...over,
  }
}

function ctx(over: Partial<LiveContext> = {}): LiveContext {
  return { players: PLAYERS, games: [], picks: [], bonuses: [], now: NOW, ...over }
}

test('nothing is said about a game that has not kicked off', () => {
  const upcoming = game({ kickoff: '2026-09-21T17:00:00Z', homeScore: null, awayScore: null })
  const bonuses: Bonus[] = [
    { playerId: 'dad', week: 2, kind: 'lock', gameId: 'g1', side: 'home' },
  ]
  assert.deepEqual(liveEntries(ctx({ games: [upcoming], bonuses })), [])
})

test('nothing is said about a game that has finished', () => {
  const done = game({ final: true })
  const bonuses: Bonus[] = [
    { playerId: 'dad', week: 2, kind: 'lock', gameId: 'g1', side: 'home' },
  ]
  const found = liveEntries(ctx({ games: [done], bonuses }))
  assert.equal(found.filter((e) => e.id.startsWith('bonus-')).length, 0)
})

test('a Lock being blown out leads, and names the deficit', () => {
  // Dad locked DEN; DEN are 17 down.
  const blowout = game({ homeScore: 31, awayScore: 14 })
  const bonuses: Bonus[] = [
    { playerId: 'dad', week: 2, kind: 'lock', gameId: 'g1', side: 'away' },
  ]

  const found = liveEntries(ctx({ games: [blowout], bonuses }))
  assert.ok(found.length > 0)
  assert.equal(found[0].id, 'bonus-dad-lock')
  assert.match(found[0].headline, /dismantled/)
  assert.match(found[0].detail, /down 17/)
  assert.equal(found[0].tone, 'bad')
})

test('an Upset that is leading is celebrated', () => {
  // Nick took DEN as the +7 dog, and DEN lead by 3.
  const upsetOn = game({ homeScore: 14, awayScore: 17 })
  const bonuses: Bonus[] = [
    { playerId: 'nick', week: 2, kind: 'upset', gameId: 'g1', side: 'away' },
  ]

  const found = liveEntries(ctx({ games: [upsetOn], bonuses }))
  const entry = found.find((e) => e.id === 'bonus-nick-upset')
  assert.ok(entry)
  assert.match(entry.headline, /actually happening/)
  assert.equal(entry.tone, 'good')
})

test('the spread is respected: leading is not the same as covering', () => {
  // KC lead by 4 but are laying 7, so a KC pick is short by 3.
  const narrow = game({ homeScore: 14, awayScore: 10 })
  const picks: Pick[] = PLAYERS.map((p) => ({
    playerId: p.id,
    gameId: 'g1',
    side: 'home',
  }))

  const found = liveEntries(ctx({ games: [narrow], picks }))

  // Leading by 4 while laying 7 is losing against the number by 3 — outside
  // the hook window, so nothing is said about it.
  assert.equal(
    found.find((e) => e.id.startsWith('hook-')),
    undefined,
    'a pick 3 short of the number is not on the hook'
  )
})

test('a pick sitting on the number is flagged as on the hook', () => {
  // KC lay 7 and lead by 8, so a KC pick is covering by exactly 1.
  const hooked = game({ homeScore: 18, awayScore: 10 })
  const picks: Pick[] = [{ playerId: 'dad', gameId: 'g1', side: 'home' }]

  const found = liveEntries(ctx({ games: [hooked], picks }))
  const hook = found.find((e) => e.id === 'hook-g1-dad')
  assert.ok(hook)
  assert.match(hook.detail, /Covering by 1\b/)
})

test('a game everyone took the same way, going badly, is called out once', () => {
  // All three on KC -7; KC lead by only 2, so all are 5 short. Not enough.
  // Make it worse: KC trail by 3, so everyone is 10 short.
  const bad = game({ homeScore: 14, awayScore: 17 })
  const picks: Pick[] = PLAYERS.map((p) => ({
    playerId: p.id,
    gameId: 'g1',
    side: 'home',
  }))

  const found = liveEntries(ctx({ games: [bad], picks }))
  const sweeps = found.filter((e) => e.id === 'sweep-g1')
  assert.equal(sweeps.length, 1, 'one entry for the group, not one per player')
  assert.match(sweeps[0].detail, /10 short/)
})

test('a lone wolf is only a lone wolf when both others took the other side', () => {
  const g = game({ homeScore: 24, awayScore: 10 })
  // Dad alone on KC; the other two on DEN.
  const picks: Pick[] = [
    { playerId: 'dad', gameId: 'g1', side: 'home' },
    { playerId: 'john', gameId: 'g1', side: 'away' },
    { playerId: 'nick', gameId: 'g1', side: 'away' },
  ]

  const found = liveEntries(ctx({ games: [g], picks }))
  assert.ok(found.find((e) => e.id === 'lone-g1-dad'))
  assert.equal(found.find((e) => e.id === 'lone-g1-john'), undefined)
})

test('the day record only counts games finished today', () => {
  const earlier = (id: string, homeScore: number) =>
    game({ id, final: true, homeScore, awayScore: 10 })

  // Three finished today: KC -7 covers at 20-10 and 30-10, fails at 14-10.
  const games = [earlier('a', 20), earlier('b', 30), earlier('c', 14)]
  const picks: Pick[] = games.map((g) => ({
    playerId: 'dad',
    gameId: g.id,
    side: 'home',
  }))

  const found = liveEntries(ctx({ games, picks }))
  const day = found.find((e) => e.id === 'day-dad')
  assert.ok(day)
  assert.match(day.headline, /2–1/)
})

test('a day with nothing right says so', () => {
  const lost = (id: string) => game({ id, final: true, homeScore: 10, awayScore: 10 })
  const games = [lost('a'), lost('b'), lost('c')]
  const picks: Pick[] = games.map((g) => ({
    playerId: 'john',
    gameId: g.id,
    side: 'home',
  }))

  const day = liveEntries(ctx({ games, picks })).find((e) => e.id === 'day-john')
  assert.ok(day)
  assert.match(day.headline, /has not won a game today/)
  assert.equal(day.tone, 'bad')
})

test('entries arrive most urgent first, and respect the limit', () => {
  const blowout = game({ id: 'a', homeScore: 31, awayScore: 7 })
  const bonuses: Bonus[] = [
    { playerId: 'dad', week: 2, kind: 'lock', gameId: 'a', side: 'away' },
  ]
  const picks: Pick[] = PLAYERS.map((p) => ({ playerId: p.id, gameId: 'a', side: 'away' }))

  const found = liveEntries(ctx({ games: [blowout], picks, bonuses }), 2)
  assert.ok(found.length <= 2)
  const urgencies = found.map((e) => e.urgency)
  assert.deepEqual(urgencies, [...urgencies].sort((a, b) => b - a))
})

test('one player having a bad afternoon does not fill the section', () => {
  // Dad is alone on four different games, all going badly. That is one story.
  const games: Game[] = []
  const picks: Pick[] = []
  for (let i = 0; i < 4; i++) {
    games.push(game({ id: `g${i}`, homeScore: 30, awayScore: 3 }))
    picks.push({ playerId: 'dad', gameId: `g${i}`, side: 'away' })
    picks.push({ playerId: 'john', gameId: `g${i}`, side: 'home' })
    picks.push({ playerId: 'nick', gameId: `g${i}`, side: 'home' })
  }

  const found = liveEntries(ctx({ games, picks }))
  const dadIslands = found.filter((e) => e.id.startsWith('lone-') && e.playerId === 'dad')
  assert.equal(dadIslands.length, 1, 'four islands collapse to the worst one')
})

test('the section mixes players rather than letting one dominate', () => {
  // Dad and John both have something to say on separate games.
  const games: Game[] = [
    game({ id: 'a', homeScore: 30, awayScore: 3 }),
    game({ id: 'b', homeScore: 3, awayScore: 30 }),
  ]
  const picks: Pick[] = [
    { playerId: 'dad', gameId: 'a', side: 'away' },
    { playerId: 'john', gameId: 'a', side: 'home' },
    { playerId: 'nick', gameId: 'a', side: 'home' },
    { playerId: 'john', gameId: 'b', side: 'home' },
    { playerId: 'dad', gameId: 'b', side: 'away' },
    { playerId: 'nick', gameId: 'b', side: 'away' },
  ]

  const found = liveEntries(ctx({ games, picks }))
  for (let i = 1; i < found.length; i++) {
    if (found[i].playerId === found[i - 1].playerId) {
      const othersLeft = found.slice(i).some((e) => e.playerId !== found[i].playerId)
      assert.equal(othersLeft, false, 'repeat only when nobody else is left')
    }
  }
})
