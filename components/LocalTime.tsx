'use client'

import { useEffect, useState } from 'react'

/**
 * Deadlines are defined in Eastern time, which is what the server renders. Once
 * we are in the browser we also know the reader's own zone, so we swap in their
 * local time and a countdown.
 *
 * Rendering the Eastern string first and replacing it after mount keeps the
 * server and client markup identical, so there is no hydration mismatch.
 */
export function LocalTime({ iso, etLabel }: { iso: string; etLabel: string }) {
  const [local, setLocal] = useState<string | null>(null)

  useEffect(() => {
    const target = new Date(iso)

    const render = () => {
      const time = target.toLocaleString(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
      setLocal(`${time} your time · ${relative(target)}`)
    }

    render()
    const timer = setInterval(render, 30_000)
    return () => clearInterval(timer)
  }, [iso])

  return <span suppressHydrationWarning>{local ?? etLabel}</span>
}

function relative(target: Date): string {
  const ms = target.getTime() - Date.now()
  if (ms <= 0) return 'locked'

  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `locks in ${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `locks in ${hours}h ${minutes % 60}m`

  const days = Math.floor(hours / 24)
  return `locks in ${days}d ${hours % 24}h`
}
