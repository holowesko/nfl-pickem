import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { ThemeToggle } from '@/components/ThemeToggle'
import { BottomNav } from '@/components/BottomNav'
import { currentTheme } from '@/lib/theme'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'HoloPicks NFL Duel',
  description: 'Season-long NFL picks against the spread.',
  // This is a private family pool sitting at an unlisted URL; keep it out of
  // search results.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d12' },
  ],
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = await currentTheme()

  return (
    <html
      lang="en"
      // Rendered on the server from the cookie, so a player who has chosen a
      // theme never sees the other one flash first. Absent means "follow the
      // device", which the CSS resolves on its own.
      data-theme={theme ?? undefined}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-4">
            <Link
              href="/"
              className="whitespace-nowrap text-lg font-bold tracking-tight"
            >
              HoloPicks NFL Duel
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>

        <footer className="mx-auto w-full max-w-3xl px-4 pt-6 text-xs text-muted">
          Picks close at each kickoff. Lines freeze earlier so everyone plays the same number.
        </footer>

        {/* Clears the fixed tab bar: its own height plus the phone's safe area. */}
        <div aria-hidden="true" className="h-[4.5rem] pb-[env(safe-area-inset-bottom)]" />

        <BottomNav />
      </body>
    </html>
  )
}
