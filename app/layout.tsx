import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { PLAYERS, currentPlayer } from '@/lib/players'
import { PlayerPicker } from '@/components/PlayerPicker'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Holowesko Pick’em',
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
  const player = await currentPlayer()

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto w-full max-w-3xl px-4 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <Link href="/" className="text-lg font-bold tracking-tight">
                Pick&rsquo;em
              </Link>
              <nav className="flex gap-4 text-sm font-medium text-muted">
                <Link href="/" className="hover:text-foreground">
                  This Week
                </Link>
                <Link href="/leaderboard" className="hover:text-foreground">
                  Leaderboard
                </Link>
                <Link href="/rules" className="hover:text-foreground">
                  Rules
                </Link>
              </nav>
            </div>

            <div className="mt-4">
              <PlayerPicker players={PLAYERS} currentId={player?.id} />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>

        <footer className="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-muted">
          All deadlines are US Eastern. Games kicking before 10:00am ET lock at 7:00am ET.
        </footer>
      </body>
    </html>
  )
}
