import { cookies } from 'next/headers'

export type Player = { id: string; name: string }

/**
 * There are no accounts and no passwords. Everyone shares one link, taps who
 * they are on first visit, and that choice is remembered in a cookie. All picks
 * are visible to everyone anyway, so this is a convenience, not a security
 * boundary — and it is deliberately easy to switch.
 */
export const PLAYERS: Player[] = [
  { id: 'dad', name: 'Dad' },
  { id: 'john', name: 'John' },
  { id: 'nick', name: 'Nick' },
]

export const PLAYER_COOKIE = 'player'

export async function currentPlayer(): Promise<Player | null> {
  const store = await cookies()
  const id = store.get(PLAYER_COOKIE)?.value
  return PLAYERS.find((p) => p.id === id) ?? null
}
