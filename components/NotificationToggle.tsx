'use client'

import { useState, useSyncExternalStore } from 'react'

/** What this browser can do, which we cannot know until we are in it. */
type Capability = 'checking' | 'unsupported' | 'needs-install' | 'blocked' | 'available'

/** Never changes: capability is fixed for the life of the page. */
const subscribeToNothing = () => () => {}

function detectCapability(): Capability {
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

  if (!supported) {
    // On an iPhone these APIs appear only once the site is installed to the
    // Home Screen, so which message is useful depends on which case this is.
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'needs-install' : 'unsupported'
  }

  return Notification.permission === 'denied' ? 'blocked' : 'available'
}

/**
 * Turns web push on for this device.
 *
 * The awkward part is Apple: iPhones only deliver web push to a site that has
 * been added to the Home Screen, and only from iOS 16.4. In a normal Safari tab
 * the APIs are simply absent, so rather than offering a button that silently
 * fails we detect that case and say what to do about it.
 *
 * Permission is per device, not per person — a phone and a laptop each need
 * their own. That is a property of web push, not a decision.
 */
export function NotificationToggle({ enabled }: { enabled: boolean }) {
  // Read through useSyncExternalStore rather than an effect: this is an
  // external value being read once, not state being synchronised, and setting
  // state from an effect on mount triggers a second render for everyone.
  const capability = useSyncExternalStore(
    subscribeToNothing,
    detectCapability,
    () => 'checking' as const
  )

  const [subscribed, setSubscribed] = useState(enabled)
  const [busy, setBusy] = useState(false)

  const turnOn = async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) throw new Error('missing public key')

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      })

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!response.ok) throw new Error('could not save')

      setSubscribed(true)
    } catch {
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
      setSubscribed(false)
    } finally {
      setBusy(false)
    }
  }

  if (capability === 'checking') return null

  if (capability === 'needs-install') {
    return (
      <p className="text-xs text-muted">
        For notifications on iPhone, tap Share &rarr; Add to Home Screen, then open
        it from there. Apple only allows them once the app is installed.
      </p>
    )
  }

  if (capability === 'unsupported') return null

  if (capability === 'blocked') {
    return (
      <p className="text-xs text-muted">
        Notifications are blocked for this site. Turn them back on in your browser
        settings if you want them.
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={subscribed ? turnOff : turnOn}
      className="text-xs font-medium text-muted underline underline-offset-2 transition hover:text-foreground disabled:opacity-50"
    >
      {busy
        ? 'One moment…'
        : subscribed
          ? 'Turn off notifications'
          : 'Notify me about the big moments'}
    </button>
  )
}

/**
 * The subscribe API wants raw bytes; VAPID keys travel as base64url.
 *
 * Returns an ArrayBuffer rather than a Uint8Array view, which is what
 * `applicationServerKey` actually accepts.
 */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))

  const buffer = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i)
  return buffer
}
