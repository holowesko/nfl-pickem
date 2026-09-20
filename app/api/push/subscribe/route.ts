import { currentPlayer } from '@/lib/players'
import { saveSubscription, removeSubscription } from '@/lib/queries'

/**
 * Records a browser's push subscription against whoever is using it.
 *
 * Identity is the same cookie the rest of the app trusts. That is the existing
 * trust model of this pool — anyone with the link can claim to be anyone — and
 * the worst case here is somebody signing themselves up for another player's
 * notifications, which is a family problem rather than a security one.
 */
export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) {
    return Response.json({ ok: false, error: 'Tap your name first.' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const endpoint: unknown = body?.endpoint
    const p256dh: unknown = body?.keys?.p256dh
    const auth: unknown = body?.keys?.auth

    if (
      typeof endpoint !== 'string' ||
      typeof p256dh !== 'string' ||
      typeof auth !== 'string'
    ) {
      return Response.json({ ok: false, error: 'Malformed subscription.' }, { status: 400 })
    }

    await saveSubscription({ endpoint, playerId: player.id, p256dh, auth })
    return Response.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

/** Turning notifications off. */
export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    if (typeof body?.endpoint !== 'string') {
      return Response.json({ ok: false }, { status: 400 })
    }
    await removeSubscription(body.endpoint)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
}
