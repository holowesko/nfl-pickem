'use server'

import { cookies } from 'next/headers'
import { refresh } from 'next/cache'
import { PLAYERS, PLAYER_COOKIE, currentPlayer } from '@/lib/players'
import { setAvatar, clearAvatar } from '@/lib/queries'
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

/** Forget who is using this device, so the name picker comes back. */
export async function clearPlayer() {
  const store = await cookies()
  store.delete(PLAYER_COOKIE)
  refresh()
}

/**
 * Save a photo for whoever is using this device.
 *
 * The browser has already cropped and resized the image, so anything arriving
 * here should be a few kilobytes. The cap is a backstop against a direct POST,
 * not a limit the UI is expected to hit.
 */
const MAX_AVATAR_BYTES = 400_000
const ALLOWED_AVATAR_TYPES = ['image/webp', 'image/jpeg', 'image/png']

export async function uploadAvatar(formData: FormData) {
  const player = await currentPlayer()
  if (!player) throw new Error('Tap your name before adding a photo.')

  const file = formData.get('photo')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('No image was received.')
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    throw new Error('That file type is not supported.')
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('That image is too large.')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  await setAvatar(player.id, bytes.toString('base64'), file.type)

  refresh()
}

export async function removeAvatar() {
  const player = await currentPlayer()
  if (!player) throw new Error('Tap your name first.')
  await clearAvatar(player.id)
  refresh()
}
