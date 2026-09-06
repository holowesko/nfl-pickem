import { getAvatar } from '@/lib/queries'
import { PLAYERS } from '@/lib/players'

/**
 * Serves a player's photo.
 *
 * The image lives in the database, but it is served from here rather than
 * inlined into the page: three photos embedded as data URIs would be re-sent
 * with every render of every tab, while this is fetched once and then cached by
 * the browser.
 *
 * Callers append `?v=<version>` so a new photo busts that cache immediately —
 * which is why the response can be cached hard and for a long time.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params

  if (!PLAYERS.some((p) => p.id === playerId)) {
    return new Response('Not found', { status: 404 })
  }

  const avatar = await getAvatar(playerId)
  if (!avatar) return new Response('Not found', { status: 404 })

  const bytes = Buffer.from(avatar.dataBase64, 'base64')

  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': avatar.mime,
      'content-length': String(bytes.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}
