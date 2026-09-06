'use client'

import { useTransition } from 'react'
import { chooseTheme } from '@/app/actions'

/**
 * Light/dark switch.
 *
 * The document attribute is set immediately on click so the change is instant,
 * and the cookie is written in the background. Waiting for the server round
 * trip would make tapping the sun feel broken for a moment.
 *
 * Which icon shows is decided in CSS, not here — see globals.css. That keeps
 * the right one in the first paint, since the server cannot know the device's
 * preference and this component must not guess before hydration.
 */
export function ThemeToggle() {
  const [, startTransition] = useTransition()

  const toggle = () => {
    const root = document.documentElement
    const current =
      root.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'

    root.dataset.theme = next
    startTransition(() => chooseTheme(next))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark"
      // Inherits the header band's ink rather than the page tokens, so it stays
      // legible on the turf in either theme.
      className="-mr-1 rounded-lg p-1.5 text-current opacity-80 transition hover:bg-white/10 hover:opacity-100"
    >
      <svg
        className="icon-sun"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>

      <svg
        className="icon-moon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  )
}
