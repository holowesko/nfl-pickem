'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Pulls fresh scores into the page while games are being played.
 *
 * `router.refresh()` re-renders the server components and merges the result
 * without touching client state or scroll position, so a refresh landing while
 * someone has the summary dialog open does not close it or jump the page.
 *
 * Only rendered when a game is actually in progress — see `app/page.tsx`. There
 * is no point polling on a Tuesday.
 */
export function LiveRefresh({
  live,
  intervalMs = 45_000,
}: {
  /** Is a game in progress? Controls polling, not whether we sync at all. */
  live: boolean
  intervalMs?: number
}) {
  const router = useRouter()

  useEffect(() => {
    // Ask the server to pull fresh scores before re-rendering, rather than
    // re-rendering whatever the last scheduled job happened to leave behind.
    // The endpoint rate-limits itself, so three people refreshing at once still
    // produce one request to ESPN.
    const sync = async () => {
      try {
        await fetch('/api/sync-live', { method: 'POST' })
      } catch {
        // Offline or ESPN down — refresh anyway and show what we have.
      }
      router.refresh()
    }

    // A phone in a pocket should not be polling. Pausing while hidden also
    // means the page is stale on return, so refresh immediately on wake —
    // which is the moment someone is actually looking.
    const tick = () => {
      if (!document.hidden) void sync()
    }

    const onVisible = () => {
      if (!document.hidden) void sync()
    }

    // Always sync once on arrival, live or not. This is what rolls the pool
    // over to a new week on a quiet Tuesday, when there is nothing to poll for
    // and the scheduled job may be hours late.
    void sync()

    // Polling is only worth it while something is actually being played.
    const timer = live ? setInterval(tick, intervalMs) : null
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, intervalMs, live])

  return null
}
