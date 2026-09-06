/**
 * All deadlines in this game are defined in US Eastern time, regardless of
 * where Dad, John, or Nick happen to be. These helpers convert between UTC
 * instants (how we store everything) and Eastern wall-clock time (how the
 * rules are written).
 */

export const ET_ZONE = 'America/New_York'

const etFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ET_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
})

export type Weekday = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'

export type EtParts = {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
  second: number
  weekday: Weekday
}

/** Break a UTC instant into its Eastern-time wall-clock parts. */
export function etParts(instant: Date): EtParts {
  const parts = etFormatter.formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)!.value
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: get('weekday') as Weekday,
  }
}

/** Offset of Eastern time from UTC at a given instant, in ms (EDT = -4h). */
function etOffsetMs(instant: Date): number {
  const p = etParts(instant)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asIfUtc - instant.getTime()
}

/**
 * Turn an Eastern wall-clock time into the UTC instant it refers to.
 *
 * Two passes are enough because the offset only changes at 2am ET, and every
 * deadline we construct is at 7am or 10am ET — never inside a DST transition.
 */
export function etWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  let ts = naive - etOffsetMs(new Date(naive))
  ts = naive - etOffsetMs(new Date(ts))
  return new Date(ts)
}

/** Shift an Eastern calendar date by whole days, staying in Eastern time. */
function shiftEtDate(p: EtParts, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day))
  d.setUTCDate(d.getUTCDate() + days)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** The hour (ET) before which a kickoff counts as an "early" international game. */
const EARLY_KICKOFF_HOUR_ET = 10
const EARLY_LOCK_HOUR_ET = 7
const STANDARD_LOCK_HOUR_ET = 10

/**
 * When a game's spread freezes — the moment the number it will be graded on
 * stops moving. This is NOT the pick deadline; see `picksCloseAt`.
 *
 * Games are grouped into windows so that everyone in a window plays the same
 * number. The rules, in order of precedence:
 *
 *  1. Any game kicking before 10:00am ET locks at 7:00am ET that morning. This
 *     is what covers the London / Berlin / Madrid games, and it is written as a
 *     kickoff-time rule rather than a "London" flag so it also catches any other
 *     unusually early start the schedule throws at us.
 *  2. Monday games lock with the Sunday slate — 10:00am ET on Sunday.
 *  3. Everything else locks at 10:00am ET on its own day (Thursday games
 *     Thursday morning, Saturday games Saturday morning, Sunday games Sunday
 *     morning, and the occasional Friday/holiday game that morning too).
 */
export function spreadLockTimeFor(kickoff: Date): Date {
  const p = etParts(kickoff)

  if (p.hour < EARLY_KICKOFF_HOUR_ET) {
    return etWallToUtc(p.year, p.month, p.day, EARLY_LOCK_HOUR_ET)
  }

  if (p.weekday === 'Mon') {
    const sunday = shiftEtDate(p, -1)
    return etWallToUtc(sunday.year, sunday.month, sunday.day, STANDARD_LOCK_HOUR_ET)
  }

  return etWallToUtc(p.year, p.month, p.day, STANDARD_LOCK_HOUR_ET)
}

/**
 * When picks close for a game: its own kickoff.
 *
 * This is deliberately a different instant from `spreadLockTimeFor`. The two
 * used to be the same, and separating them is the point:
 *
 *   - The **spread** freezes early, per window, so all three players are graded
 *     on the same number no matter when they picked.
 *   - **Picks** stay open right up to kickoff, per game, so a Monday night game
 *     can still be picked on Monday night.
 *
 * Keep them apart. Collapsing them again would either freeze the line at
 * kickoff (so players are graded on numbers they never saw) or close picks at
 * 10am (which is what we just moved away from).
 */
export function picksCloseAt(kickoff: Date): Date {
  return kickoff
}

/** Has this game kicked off, and therefore stopped accepting picks? */
export function arePicksClosed(kickoff: Date, now: Date = new Date()): boolean {
  return now.getTime() >= picksCloseAt(kickoff).getTime()
}

/** Has this game's window closed, fixing the spread it will be graded on? */
export function isSpreadLocked(kickoff: Date, now: Date = new Date()): boolean {
  return now.getTime() >= spreadLockTimeFor(kickoff).getTime()
}

/**
 * A label for the lock window a game belongs to, used to group the slate in the
 * UI ("Thursday", "Sunday + Monday", "Early kickoff").
 */
export function lockWindowKey(kickoff: Date): string {
  const lock = spreadLockTimeFor(kickoff)
  const p = etParts(lock)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}`
}
