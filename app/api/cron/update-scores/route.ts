import { assertCronRequest } from '@/lib/cron-auth'

/**
 * Pulls final scores from ESPN and marks games final so the leaderboard can
 * recompute. Scoring itself is derived from lib/scoring.ts at read time, so
 * this job only needs to keep the raw results current.
 */
export async function POST() {
  const denied = await assertCronRequest()
  if (denied) return denied

  // TODO: fetch the ESPN scoreboard for the current week and update
  // home_score / away_score / final.
  return Response.json({ ok: true, updated: 0 })
}
