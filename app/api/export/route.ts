import { assertCronRequest } from '@/lib/cron-auth'
import { buildSnapshot } from '@/lib/export'

/**
 * The season's history as JSON, for the weekly backup workflow.
 *
 * Behind the same bearer secret as the sync job. The data is not secret — the
 * pool's rules and results are plainly visible in the app — but an unauthenticated
 * endpoint that dumps every row is still an invitation.
 *
 * Pretty-printed on purpose: the output is committed to git, and a readable
 * diff is the entire point of keeping it there.
 */
export async function GET() {
  const denied = await assertCronRequest()
  if (denied) return denied

  try {
    const snapshot = await buildSnapshot()
    return new Response(JSON.stringify(snapshot, null, 2) + '\n', {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
