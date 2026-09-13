import { fetchCurrentScoreboard } from '@/lib/espn'
import {
  syncScoreboard,
  freezeLockedSpreads,
  setCurrentWeek,
  hasLiveGame,
  claimLiveSync,
} from '@/lib/queries'

/** Never pull from ESPN more often than this, however many people are watching. */
const MIN_INTERVAL_MS = 40_000

/**
 * Pulls fresh scores while games are being played, triggered by the page rather
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
 * session to prove. Two things keep that safe: it only acts while a game is in
 * progress, and the interval claim is atomic, so any number of callers still
 * produce at most one ESPN request per interval. The work itself is the same
 * idempotent upsert the cron job runs.
 */
export async function POST() {
  try {
    if (!(await hasLiveGame())) {
      return Response.json({ synced: false, reason: 'no games in progress' })
    }

    if (!(await claimLiveSync(MIN_INTERVAL_MS))) {
      return Response.json({ synced: false, reason: 'synced moments ago' })
    }

    const board = await fetchCurrentScoreboard()
    const { games } = await syncScoreboard(board)
    await setCurrentWeek(board.season, board.week)
    await freezeLockedSpreads()

    return Response.json({ synced: true, week: board.week, games })
  } catch (error) {
    // A refresh should never fail because ESPN hiccuped; the page still
    // re-renders with whatever is stored.
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ synced: false, error: message }, { status: 200 })
  }
}
