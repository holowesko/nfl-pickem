'use server'

import { refresh } from 'next/cache'
import { currentPlayer } from '@/lib/players'
import { arePicksClosed } from '@/lib/time'
import { validateBonus, type BonusKind, type Side } from '@/lib/scoring'
import {
  getGame,
  getBonus,
  upsertPick,
  removePick,
  setBonus,
  clearBonus,
} from '@/lib/queries'

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
  if (arePicksClosed(new Date(game.kickoff))) {
    throw new Error(`Picks for ${game.awayTeam} @ ${game.homeTeam} are closed.`)
  }
  return game
}

/**
 * A Lock or Upset cannot be moved or cleared once the game it sits on has
 * kicked off — otherwise a player could erase a bonus after watching it score,
 * or after watching it fail. `chooseBonus` already checks the game being moved
 * TO; this checks the one being moved FROM.
 */
async function requireBonusChangeable(
  playerId: string,
  season: number,
  week: number,
  kind: BonusKind
) {
  const existing = await getBonus(playerId, season, week, kind)
  if (!existing) return

  const game = await getGame(existing.gameId)
  if (game && arePicksClosed(new Date(game.kickoff))) {
    throw new Error(
      `Your ${kind === 'lock' ? 'Lock' : 'Upset'} is settled — ` +
        `${game.awayTeam} @ ${game.homeTeam} has already kicked off.`
    )
  }
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
 * Choose the Lock or the Upset for a week.
 *
 * These are selections in their own right — picking a team here does not imply
 * a spread pick on that game, and does not require one.
 */
export async function chooseBonus(
  kind: BonusKind,
  gameId: string,
  side: Side
): Promise<ActionResult> {
  try {
    const player = await requirePlayer()
    const game = await getGame(gameId)
    if (!game) throw new Error('That game is not on this week’s slate.')

    const problem = validateBonus(game, side, kind)
    if (problem) throw new Error(problem.message)

    await requireBonusChangeable(player.id, game.season, game.week, kind)

    await setBonus(player.id, game.season, game.week, kind, gameId, side)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}

export async function removeBonus(
  kind: BonusKind,
  season: number,
  week: number
): Promise<ActionResult> {
  try {
    const player = await requirePlayer()
    await requireBonusChangeable(player.id, season, week, kind)
    await clearBonus(player.id, season, week, kind)
    refresh()
    return { ok: true }
  } catch (error) {
    return fail(error)
  }
}
