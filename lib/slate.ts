import { etParts, spreadLockTimeFor, lockWindowKey, type Weekday } from './time'
import type { Game } from './scoring'

const DAY_NAMES: Record<Weekday, string> = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
}

export type SlateGroup<T extends Game = Game> = {
  key: string
  /** e.g. "Sunday & Monday", "Thursday", "Sunday early kickoff" */
  label: string
  lockAt: string
  games: T[]
}

/**
 * Split a week into its lock windows, in kickoff order.
 *
 * The grouping comes from `spreadLockTimeFor`, so Sunday and Monday games land in
 * one group and an early international kickoff separates itself out — the UI
 * never has to know those rules, it just renders the groups it is handed.
 */
export function groupSlate<T extends Game>(games: T[]): SlateGroup<T>[] {
  const groups = new Map<string, T[]>()

  const ordered = [...games].sort(
    (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
  )

  for (const game of ordered) {
    const key = lockWindowKey(new Date(game.kickoff))
    const bucket = groups.get(key)
    if (bucket) bucket.push(game)
    else groups.set(key, [game])
  }

  return [...groups.entries()].map(([key, groupGames]) => {
    const lockAt = spreadLockTimeFor(new Date(groupGames[0].kickoff))
    return { key, label: labelFor(groupGames, lockAt), lockAt: lockAt.toISOString(), games: groupGames }
  })
}

function labelFor(games: Game[], lockAt: Date): string {
  const days: string[] = []
  for (const game of games) {
    const day = DAY_NAMES[etParts(new Date(game.kickoff)).weekday]
    if (!days.includes(day)) days.push(day)
  }

  const dayLabel =
    days.length === 1 ? days[0] : `${days.slice(0, -1).join(', ')} & ${days[days.length - 1]}`

  // The 7am window only ever exists because a game kicks off unusually early;
  // say so, otherwise two "Sunday" headers on one page look like a bug.
  return etParts(lockAt).hour < 10 ? `${dayLabel} early kickoff` : dayLabel
}

/** "-3.5" / "+3.5" / "PK" for a pick-em, from one side's point of view. */
export function formatSpread(spreadHome: number | null, side: 'home' | 'away'): string {
  if (spreadHome === null) return '—'
  const value = side === 'home' ? spreadHome : -spreadHome
  if (value === 0) return 'PK'
  return value > 0 ? `+${value}` : `${value}`
}

/**
 * What to print on one team's row.
 *
 * Only the favorite carries the number. Stating it on both rows says the same
 * thing twice — everyone knows the other side is the same number with the sign
 * flipped — and the duplication makes the card harder to scan, not easier.
 *
 * Null means "print nothing on this row": either the underdog, or a game with
 * no line yet, which the card calls out separately.
 */
export function displaySpread(
  spreadHome: number | null,
  side: 'home' | 'away'
): string | null {
  if (spreadHome === null) return null

  // A pick-em has no favorite, so it is the one case where both rows are the
  // same and both should say so.
  if (spreadHome === 0) return 'PK'

  const favorite = spreadHome < 0 ? 'home' : 'away'
  return side === favorite ? formatSpread(spreadHome, side) : null
}

/** "Sun 9/13 · 1:00pm ET" — a game's kickoff, in the league's own time zone. */
export function kickoffLabel(iso: string): string {
  const p = etParts(new Date(iso))
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'am' : 'pm'
  return `${p.weekday} ${p.month}/${p.day} · ${hour12}:${String(p.minute).padStart(2, '0')}${meridiem} ET`
}

/** "Sun 10:00am ET" — a deadline, without the date. */
export function deadlineLabel(iso: string): string {
  const p = etParts(new Date(iso))
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const meridiem = p.hour < 12 ? 'am' : 'pm'
  return `${p.weekday} ${hour12}:${String(p.minute).padStart(2, '0')}${meridiem} ET`
}
