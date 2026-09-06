import { assertCronRequest } from '@/lib/cron-auth'

/**
 * Records the current point spread for every upcoming game, and freezes the
 * graded line for any game whose lock window has just closed.
 *
 * Runs every 30 minutes. Because the graded line is defined as "the last
 * snapshot at or before the lock time", a late run costs accuracy of at most
 * one polling interval rather than breaking the week.
 */
export async function POST() {
  const denied = await assertCronRequest()
  if (denied) return denied

  // TODO: fetch the week's lines from The Odds API, insert into line_snapshots,
  // then set locked_spread_home for games past their lock time.
  return Response.json({ ok: true, snapshotted: 0, locked: 0 })
}
