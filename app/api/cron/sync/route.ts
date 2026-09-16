import { assertCronRequest } from '@/lib/cron-auth'
import { fetchCurrentScoreboard, fetchWeek, isWeekComplete } from '@/lib/espn'
import { syncScoreboard, freezeLockedSpreads, setCurrentWeek } from '@/lib/queries'

/**
 * The one scheduled job. A single ESPN request carries the schedule, the point
 * spreads, and the scores, so there is nothing to coordinate between sources.
 *
 * Every step is idempotent: run it twice in a row, or not at all for six hours,
 * and the result is the same. That matters because the schedule runs on GitHub
 * Actions, which does not promise punctuality.
 *
 * POST /api/cron/sync          - sync whatever week ESPN says is current
 * POST /api/cron/sync?week=3   - backfill a specific week
 */
export async function POST(request: Request) {
  const denied = await assertCronRequest()
  if (denied) return denied

  const url = new URL(request.url)
  const weekParam = url.searchParams.get('week')
  const seasonParam = url.searchParams.get('season')

  try {
    const board =
      weekParam !== null
        ? await fetchWeek(
            Number(seasonParam) || new Date().getUTCFullYear(),
            Number(weekParam)
          )
        : await fetchCurrentScoreboard()

    let current = board
    let { games, snapshots } = await syncScoreboard(board)

    // Only the live sync should move the pointer; a backfill of week 3 must not
    // drag the app back to week 3.
    if (weekParam === null) {
      // ESPN's own "current week" lingers on a finished week for a day or more
      // — it still said week 1 on the Tuesday after week 1 ended, while week 2
      // lines were already posted. So read the schedule rather than trusting
      // that pointer: once every game in a week has been played, move on.
      if (isWeekComplete(board)) {
        const next = await fetchWeek(board.season, board.week + 1).catch(() => null)

        // Guard against the end of the season and against ESPN handing back
        // something other than what was asked for.
        if (next && next.games.length > 0 && next.week === board.week + 1) {
          const added = await syncScoreboard(next)
          games += added.games
          snapshots += added.snapshots
          current = next
        }
      }

      await setCurrentWeek(current.season, current.week)
    }

    const frozen = await freezeLockedSpreads()

    return Response.json({
      ok: true,
      season: current.season,
      week: current.week,
      games,
      snapshots,
      frozen,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ ok: false, error: message }, { status: 502 })
  }
}
