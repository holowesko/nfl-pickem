import { cookies } from 'next/headers'

export type Theme = 'light' | 'dark'

export const THEME_COOKIE = 'theme'

/**
 * The player's explicit choice, or null if they have never picked one.
 *
 * Null is meaningful: it means "follow the device", which the CSS handles on
 * its own. The server has no way to know what the device prefers, so it must
 * not guess a value here.
 */
export async function currentTheme(): Promise<Theme | null> {
  const value = (await cookies()).get(THEME_COOKIE)?.value
  return value === 'light' || value === 'dark' ? value : null
}
