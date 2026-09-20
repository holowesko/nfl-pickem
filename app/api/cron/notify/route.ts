import webpush from 'web-push'
import { assertCronRequest } from '@/lib/cron-auth'
import { PLAYERS } from '@/lib/players'
import {
  getCurrentWeek,
  getWeekGames,
  getWeekPicks,
  getWeekBonuses,
  getSubscriptions,
  removeSubscription,
  claimAnnouncements,
} from '@/lib/queries'
import { liveEntries, notableEntries } from '@/lib/live'

/**
 * Sends the handful of live moments worth interrupting an afternoon for.
 *
 * This is the one job that cannot be viewer-triggered. The whole value of a
 * notification is reaching somebody who is *not* looking at the app, which is
 * exactly when nothing else in this codebase runs. So it needs a scheduler that
 * actually fires — see the deploy notes; GitHub's has been landing hours late.
 *
 * Everything here is idempotent. `claimAnnouncements` inserts the key as the
 * claim, so a double-run sends nothing twice, and two pollers racing cannot
 * both win the same story.
 */
export async function POST() {
  const denied = await assertCronRequest()
  if (denied) return denied

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return Response.json(
      { ok: false, error: 'VAPID keys are not configured' },
      { status: 500 }
    )
  }

  webpush.setVapidDetails('mailto:noreply@holopicks.invalid', publicKey, privateKey)

  try {
    const current = await getCurrentWeek()
    if (!current) return Response.json({ ok: true, sent: 0, reason: 'no week loaded' })

    const [games, picks, bonuses] = await Promise.all([
      getWeekGames(current.season, current.week),
      getWeekPicks(current.season, current.week),
      getWeekBonuses(current.season, current.week),
    ])

    const notable = notableEntries(
      liveEntries({ players: PLAYERS, games, picks, bonuses }, 50)
    )
    if (notable.length === 0) {
      return Response.json({ ok: true, sent: 0, reason: 'nothing worth saying' })
    }

    // The week is part of the key so the same story can recur next Sunday.
    const keyFor = (id: string) => `${current.season}-${current.week}-${id}`
    const fresh = new Set(await claimAnnouncements(notable.map((e) => keyFor(e.id))))
    const toSend = notable.filter((e) => fresh.has(keyFor(e.id)))

    if (toSend.length === 0) {
      return Response.json({ ok: true, sent: 0, reason: 'already announced' })
    }

    const subscriptions = await getSubscriptions()
    let sent = 0
    let pruned = 0

    for (const entry of toSend) {
      const payload = JSON.stringify({
        title: entry.headline,
        body: entry.detail,
        tag: entry.id,
        url: '/analysis',
      })

      // Everyone hears about everyone. The needling is the point, and a
      // notification only the victim can see is no fun for anybody.
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          )
          sent += 1
        } catch (error) {
          // 404 and 410 mean the browser threw the subscription away — the app
          // was deleted, or permission was revoked. Stop writing to it.
          const status = (error as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            await removeSubscription(sub.endpoint)
            pruned += 1
          }
        }
      }
    }

    return Response.json({
      ok: true,
      announced: toSend.length,
      sent,
      pruned,
      subscribers: subscriptions.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
