import { headers } from 'next/headers'

/**
 * The scheduled jobs run from GitHub Actions, not from inside Vercel, so the
 * endpoints are public URLs. A shared bearer secret keeps them ours.
 */
export async function assertCronRequest(): Promise<Response | null> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  const auth = (await headers()).get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
