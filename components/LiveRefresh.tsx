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
export function LiveRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    // A phone in a pocket should not be polling. Pausing while hidden also
    // means the page is stale on return, so refresh immediately on wake —
    // which is the moment someone is actually looking.
    const tick = () => {
      if (!document.hidden) router.refresh()
    }

    const onVisible = () => {
      if (!document.hidden) router.refresh()
    }

    const timer = setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [router, intervalMs])

  return null
}
