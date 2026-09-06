'use server'

import { cookies } from 'next/headers'
import { refresh } from 'next/cache'
import { PLAYERS, PLAYER_COOKIE } from '@/lib/players'
import { THEME_COOKIE, type Theme } from '@/lib/theme'

/** Remember who is using this device. Setting the cookie re-renders the tree. */
export async function choosePlayer(playerId: string) {
  if (!PLAYERS.some((p) => p.id === playerId)) {
    throw new Error(`Unknown player: ${playerId}`)
  }

  const store = await cookies()
  store.set(PLAYER_COOKIE, playerId, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  refresh()
}

/** Remember a light/dark choice for this device. */
export async function chooseTheme(theme: Theme) {
  if (theme !== 'light' && theme !== 'dark') {
    throw new Error(`Unknown theme: ${theme}`)
  }

  const store = await cookies()
  store.set(THEME_COOKIE, theme, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  refresh()
}
