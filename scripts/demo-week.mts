/**
 * Fills the LOCAL development database with a played-out week, so the revealed
 * state can be seen as the players will see it.
 *
 * Real teams and real spreads from the current slate, but the kickoffs are
 * moved into the past and THE FINAL SCORES ARE INVENTED — the games have not
 * been played. It exists to look at the UI, nothing else.
 *
 * A finished week could not be used instead: ESPN stops returning the spread
 * once a game is final, so a past week has scores but no lines.
 *
 * Local only — talks to PGlite, never to Neon. To undo: stop the dev server,
 * delete .pglite/, restart, then `npm run seed`.
 *
 *   npx tsx scripts/demo-week.mts
 */
import {
  getCurrentWeek,
  getWeekGames,
  freezeLockedSpreads,
  upsertPick,
  setBonus,
} from '../lib/queries'
import { underdogSide, type Side } from '../lib/scoring'
import { db } from '../lib/db'

const sql = await db()

const current = await getCurrentWeek()
if (!current) throw new Error('Run `npm run seed` first.')
const { season, week } = current

// Push every kickoff a week into the past so picks are closed and revealed.
await sql`
  update games set kickoff = kickoff - interval '8 days'
  where season = ${season} and week = ${week}
`

// With the windows now past, the current line becomes the graded line.
const frozen = await freezeLockedSpreads()
const games = await getWeekGames(season, week)
console.log(`${games.length} games backdated, ${frozen} lines frozen`)

/**
 * Invented results, chosen to show every outcome the card can display:
 * a favourite covering, a favourite winning without covering, an underdog
 * winning outright, and an exact push.
 */
const margins = [17, 3, -6, 0, 10, -3, 24, 1, -14, 7, 4, -8, 13, -1, 21, 6]

for (const [i, game] of games.entries()) {
  const spread = game.lockedSpreadHome ?? 0
  // Build a home margin that lands on the intended relationship to the line.
  const homeMargin = Math.round(-spread + margins[i % margins.length])
  const base = 17
  const homeScore = base + Math.max(0, homeMargin)
  const awayScore = base + Math.max(0, -homeMargin)
  await sql`
    update games set home_score = ${homeScore}, away_score = ${awayScore}, final = true
    where id = ${game.id}
  `
}
console.log('Final scores set (invented)')

// Three different-looking weeks: Dad leans favourites, John mixes, Nick chases
// dogs and leaves two games unpicked so a missed game shows too.
const plans: Record<string, (i: number, dog: Side | null) => Side> = {
  dad: (_i, dog) => (dog === 'home' ? 'away' : 'home'),
  john: (i, dog) => (i % 3 === 0 ? (dog ?? 'home') : dog === 'home' ? 'away' : 'home'),
  nick: (_i, dog) => dog ?? 'away',
}

for (const [playerId, choose] of Object.entries(plans)) {
  let made = 0
  for (const [i, game] of games.entries()) {
    if (game.lockedSpreadHome === null) continue
    if (playerId === 'nick' && i >= games.length - 2) continue
    await upsertPick(playerId, game.id, choose(i, underdogSide(game.lockedSpreadHome)))
    made += 1
  }
  console.log(`  ${playerId}: ${made} picks`)
}

const withDog = games.filter((g) => underdogSide(g.lockedSpreadHome) !== null)
const plan: [string, number, number][] = [
  ['dad', 0, 1],
  ['john', 1, 2],
  ['nick', 2, 0],
]

for (const [playerId, lockIdx, upsetIdx] of plan) {
  const lockGame = withDog[lockIdx]
  const upsetGame = withDog[upsetIdx]
  if (lockGame) {
    const dog = underdogSide(lockGame.lockedSpreadHome)
    await setBonus(playerId, season, week, 'lock', lockGame.id, dog === 'home' ? 'away' : 'home')
  }
  if (upsetGame) {
    await setBonus(
      playerId,
      season,
      week,
      'upset',
      upsetGame.id,
      underdogSide(upsetGame.lockedSpreadHome)!
    )
  }
}
console.log('  Locks and Upsets set for all three')

console.log('\nStart the dev server and open the Picks tab.')
process.exit(0)
