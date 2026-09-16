import { fetchCurrentScoreboard, fetchWeek, isWeekComplete } from '@/lib/espn'
import {
  syncScoreboard,
  freezeLockedSpreads,
  setCurrentWeek,
  hasLiveGame,
  claimLiveSync,
} from '@/lib/queries'

/**
 * Never pull from ESPN more often than this, however many people are watching.
 *
 * Tight while a game is being played, relaxed otherwise — but never off. A page
 * view on a quiet Tuesday is what rolls the pool over to the next week, so
 * "nothing is live" must not mean "do nothing".
 */
const LIVE_INTERVAL_MS = 40_000
const IDLE_INTERVAL_MS = 5 * 60_000

/**
 * Pulls fresh data whenever someone opens the app, triggered by the page rather
 * than by a scheduler.
 *
 * The scheduled job on GitHub Actions cannot do this on its own: schedules there
 * are best-effort, and on this repository they have been landing two to four
 * hours apart rather than on the half hour. That is fine for freezing lines
 * overnight and useless for a Sunday afternoon.
 *
 * So the people looking at the page keep it current. `LiveRefresh` calls this
 * before each refresh, which means the data is fresh exactly when someone cares
 * and nothing runs at all when nobody is watching.
 *
 * Deliberately unauthenticated, because the browser calls it and there is no
 * session to prove. What keeps that safe is the atomic interval claim: any
 * number of simultaneous callers still produce at most one ESPN request per
 * interval. The work itself is the same idempotent upsert the cron job runs.
 */
export async function POST() {
  try {
    const live = await hasLiveGame()

    if (!(await claimLiveSync(live ? LIVE_INTERVAL_MS : IDLE_INTERVAL_MS))) {
      return Response.json({ synced: false, reason: 'synced recently' })
    }

    const board = await fetchCurrentScoreboard()
    let current = board
    const { games } = await syncScoreboard(board)

    // Same rule as the scheduled job: a finished week rolls over, because
    // ESPN's own pointer does not.
    if (isWeekComplete(board)) {
      const next = await fetchWeek(board.season, board.week + 1).catch(() => null)
      if (next && next.games.length > 0 && next.week === board.week + 1) {
        await syncScoreboard(next)
        current = next
      }
    }

    await setCurrentWeek(current.season, current.week)
    await freezeLockedSpreads()

    return Response.json({ synced: true, week: current.week, games })
  } catch (error) {
    // A refresh should never fail because ESPN hiccuped; the page still
    // re-renders with whatever is stored.
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ synced: false, error: message }, { status: 200 })
  }
}
