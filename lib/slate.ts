import { etParts, lockTimeFor, lockWindowKey, type Weekday } from './time'
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
 * The grouping comes from `lockTimeFor`, so the Sunday and Monday games land in
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
    const lockAt = lockTimeFor(new Date(groupGames[0].kickoff))
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
