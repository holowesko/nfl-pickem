'use server'

import { refresh } from 'next/cache'
import { currentPlayer } from '@/lib/players'
import { isLocked } from '@/lib/time'
import { isValidUpsetPick, type Side } from '@/lib/scoring'
import { getGame, getPick, upsertPick, removePick, setWeeklyFlag } from '@/lib/queries'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Server Actions are reachable by direct POST, not just through our buttons, so
 * every rule is enforced here rather than relying on the UI to disable things.
 * The deadline check in particular is the whole game.
 */
async function requirePlayer() {
  const player = await currentPlayer()
  if (!player) throw new Error('Tap your name before making picks.')
  return player
}

async function requireOpenGame(gameId: string) {
  const game = await getGame(gameId)
  if (!game) throw new Error('That game is not on this week’s slate.')
  if (isLocked(new Date(game.kickoff))) {
    throw new Error(`Picks for ${game.awayTeam} @ ${game.homeTeam} are locked.`)
  }
  return game
}

function fail(error: unknown): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

/** Pick a side, or tap the same side again to clear the pick. */
export async function setPick(gameId: string, side: Side): Promise<ActionResult> {
  try {
    const player = await requirePlayer()
    await requireOpenGame(gameId)
    await upsertPick(player.id, gameId, side)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function clearPick(gameId: string): Promise<ActionResult> {
  try {
    const player = await requirePlayer()
    await requireOpenGame(gameId)
    await removePick(player.id, gameId)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

/**
 * Setting the Lock or the Upset moves it off whatever game previously held it,
 * so there is never more than one of each in a week.
 */
export async function setLock(gameId: string, value: boolean): Promise<ActionResult> {
  try {
    const player = await requirePlayer()
    const game = await requireOpenGame(gameId)
    await setWeeklyFlag(player.id, gameId, game.season, game.week, 'lock', value)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function setUpset(gameId: string, value: boolean): Promise<ActionResult> {
  try {
    const player = await requirePlayer()
    const game = await requireOpenGame(gameId)

    if (value) {
      const pick = await getPick(player.id, gameId)
      if (!pick) {
        throw new Error('Pick the underdog first, then flag it as your Upset.')
      }
      if (!isValidUpsetPick(game.spreadHome, pick.side)) {
        const team = pick.side === 'home' ? game.homeTeam : game.awayTeam
        throw new Error(`${team} is not an underdog — the Upset must be a plus-spread team.`)
      }
    }

    await setWeeklyFlag(player.id, gameId, game.season, game.week, 'upset', value)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
