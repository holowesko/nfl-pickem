/**
 * End-to-end check against the embedded PGlite database: pull the live slate
 * from ESPN, store it, make picks, freeze a line, and score a finished game.
 *
 *   npx tsx scripts/verify.mts
 */
import { fetchCurrentScoreboard } from '../lib/espn'
import {
  syncScoreboard,
  setCurrentWeek,
  getCurrentWeek,
  getWeekGames,
  getWeekPicks,
  upsertPick,
  setWeeklyFlag,
  freezeLockedSpreads,
} from '../lib/queries'
import { groupSlate, formatSpread } from '../lib/slate'
import { scoreWeek, underdogSide } from '../lib/scoring'
import { db, type Row } from '../lib/db'
import { lockTimeFor, etParts } from '../lib/time'

const fmt = (d: Date) => {
  const p = etParts(d)
  return `${p.weekday} ${p.month}/${p.day} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')} ET`
}

function ok(label: string, condition: boolean, detail = '') {
  console.log(`${condition ? '  PASS' : '  FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) process.exitCode = 1
}

console.log('\n1. Importing the live slate from ESPN')
const board = await fetchCurrentScoreboard()
const synced = await syncScoreboard(board)
await setCurrentWeek(board.season, board.week)
console.log(`   season ${board.season}, week ${board.week}`)
ok('games stored', synced.games === board.games.length, `${synced.games} games`)
ok('line snapshots recorded', synced.snapshots > 0, `${synced.snapshots} snapshots`)

const current = await getCurrentWeek()
ok('current week pointer set', current?.week === board.week)

console.log('\n2. Re-running the sync is idempotent')
const second = await syncScoreboard(board)
ok('no duplicate snapshots for unchanged lines', second.snapshots === 0)
const afterTwo = await getWeekGames(board.season, board.week)
ok('game count unchanged', afterTwo.length === board.games.length, `${afterTwo.length} games`)

console.log('\n3. Lock windows')
const games = await getWeekGames(board.season, board.week)
for (const group of groupSlate(games)) {
  console.log(
    `   ${group.label.padEnd(26)} locks ${fmt(new Date(group.lockAt))}  (${group.games.length} games)`
  )
}

console.log('\n4. Making picks as Dad')
const openGames = games.filter((g) => g.spreadHome !== null)
const favourite = openGames.find((g) => g.spreadHome !== null && g.spreadHome < 0)!
// Deliberately a different game: two picks on one matchup would just replace
// each other, which is correct behaviour but not what this step is testing.
const dogGame = openGames.find(
  (g) => g.id !== favourite.id && underdogSide(g.spreadHome) === 'away'
)!

await upsertPick('dad', favourite.id, 'home')
await setWeeklyFlag('dad', favourite.id, board.season, board.week, 'lock', true)
await upsertPick('dad', dogGame.id, 'away')
await setWeeklyFlag('dad', dogGame.id, board.season, board.week, 'upset', true)

let picks = await getWeekPicks(board.season, board.week)
const dadPicks = picks.filter((p) => p.playerId === 'dad')
ok('two picks stored', dadPicks.length === 2)
ok('lock set', dadPicks.filter((p) => p.isLock).length === 1)
ok('upset set', dadPicks.filter((p) => p.isUpset).length === 1)
console.log(
  `   Lock:  ${favourite.awayTeam} @ ${favourite.homeTeam} (home ${formatSpread(favourite.spreadHome, 'home')})`
)
console.log(
  `   Upset: ${dogGame.awayTeam} @ ${dogGame.homeTeam} (away ${formatSpread(dogGame.spreadHome, 'away')})`
)

console.log('\n5. Moving the Lock to another game clears the old one')
const other = openGames.find((g) => g.id !== favourite.id && g.id !== dogGame.id)!
await upsertPick('dad', other.id, 'home')
await setWeeklyFlag('dad', other.id, board.season, board.week, 'lock', true)
picks = await getWeekPicks(board.season, board.week)
const locks = picks.filter((p) => p.playerId === 'dad' && p.isLock)
ok('exactly one lock remains', locks.length === 1, `on game ${locks[0]?.gameId}`)
ok('the lock moved to the new game', locks[0]?.gameId === other.id)

console.log('\n6. The database trigger rejects a second lock')
const sql = await db()
let rejected = false
try {
  await sql`update picks set is_lock = true where player_id = 'dad' and game_id = ${favourite.id}`
} catch {
  rejected = true
}
ok('a hand-written second lock is refused', rejected)

console.log('\n7. Freezing the graded line after a deadline passes')
// Pretend it is one minute after this game's lock window closed.
const target = games[0]
const justAfterLock = new Date(lockTimeFor(new Date(target.kickoff)).getTime() + 60_000)
const frozen = await freezeLockedSpreads(justAfterLock)
ok('at least one line frozen', frozen > 0, `${frozen} games`)
const [reloaded] = (await sql`select locked_spread_home from games where id = ${target.id}`) as Row[]
ok('frozen line matches the live line', Number(reloaded.locked_spread_home) === target.spreadHome,
   `${reloaded.locked_spread_home} vs ${target.spreadHome}`)

console.log('\n8. Scoring a finished game')
// Force a final result: home team wins by 100, which covers any line.
await sql`update games set home_score = 110, away_score = 10, final = true where id = ${other.id}`
await sql`update games set locked_spread_home = spread_home where id = ${other.id}`
const scored = await getWeekGames(board.season, board.week)
const week = scoreWeek('dad', board.week, scored, (await getWeekPicks(board.season, board.week)).filter((p) => p.playerId === 'dad'))
ok('lock that covers and wins outright is worth 3', week.points === 3, `${week.points} points`)
ok('one correct pick', week.correct === 1)

console.log('\nDone.\n')
