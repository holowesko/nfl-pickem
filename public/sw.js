/*
 * Service worker for web push.
 *
 * Kept deliberately small: it exists because Apple will not deliver a web push
 * without one, and because a push has to be handled with the page closed. It
 * does no caching — the app is server-rendered and always wants fresh scores,
 * so an offline cache would only ever serve a stale slate.
 */

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    return
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'HoloPicks', {
      body: payload.body ?? '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One notification per story. A later push about the same game replaces
      // the earlier one rather than stacking another buzz on top.
      tag: payload.tag ?? 'holopicks',
      data: { url: payload.url ?? '/analysis' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/analysis'

  // Focus the app if it is already open rather than opening a second copy.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
