'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The primary navigation, as a fixed tab bar.
 *
 * Bottom rather than top because this is used on phones, one-handed, while
 * arguing about a spread — the thumb is already down there.
 *
 * The bar sits above the iPhone home indicator via the safe-area inset, and
 * the layout reserves matching space at the foot of the page so the last game
 * on the slate is never trapped underneath it.
 */
const tabs = [
  {
    href: '/',
    label: 'Picks',
    icon: (
      <>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    ),
  },
  {
    href: '/leaderboard',
    label: 'Leaderboard',
    // A trophy, not bars — bars sat next to the Analysis trend line and the
    // two read as a pair of charts rather than as different destinations.
    icon: (
      <>
        <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
        <path d="M17 5h2.5a2.5 2.5 0 0 1 0 5H17" />
        <path d="M7 5H4.5a2.5 2.5 0 0 0 0 5H7" />
        <path d="M12 14v4" />
        <path d="M8.5 21h7" />
        <path d="M10 18h4l1 3H9l1-3z" />
      </>
    ),
  },
  {
    href: '/analysis',
    label: 'Analysis',
    // A trend line rather than bars, so it does not read as the leaderboard.
    icon: (
      <>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M7 14l3.5-4.5 3 3L18 7" />
      </>
    ),
  },
  {
    href: '/rules',
    label: 'Rules',
    icon: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {/* Matches the page's own column so the bar does not look adrift on a
          wide screen. */}
      <div className="mx-auto flex w-full max-w-3xl">
        {tabs.map((tab) => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.7rem] font-medium transition ${
                active ? 'text-accent' : 'text-muted hover:text-foreground'
              }`}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {tab.icon}
              </svg>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
