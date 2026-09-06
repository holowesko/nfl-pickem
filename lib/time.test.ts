import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  spreadLockTimeFor,
  arePicksClosed,
  isSpreadLocked,
  picksCloseAt,
  etParts,
  etWallToUtc,
  lockWindowKey,
} from './time'

/** Readable Eastern-time rendering for assertions. */
function et(d: Date): string {
  const p = etParts(d)
  return `${p.weekday} ${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

test('Thursday night football locks Thursday at 10am ET', () => {
  // 2026-09-10 8:15pm ET kickoff.
  const kickoff = new Date('2026-09-11T00:15:00Z')
  assert.equal(et(kickoff), 'Thu 2026-09-10 20:15')
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Thu 2026-09-10 10:00')
})

test('Sunday afternoon games lock Sunday at 10am ET', () => {
  const kickoff = new Date('2026-09-13T17:00:00Z') // Sun 1:00pm ET
  assert.equal(et(kickoff), 'Sun 2026-09-13 13:00')
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Sun 2026-09-13 10:00')
})

test('Sunday night football locks with the rest of Sunday', () => {
  const kickoff = new Date('2026-09-14T00:20:00Z') // Sun 8:20pm ET
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Sun 2026-09-13 10:00')
})

test('Monday night football locks Sunday morning, not Monday', () => {
  const kickoff = new Date('2026-09-15T00:15:00Z') // Mon 8:15pm ET
  assert.equal(et(kickoff), 'Mon 2026-09-14 20:15')
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Sun 2026-09-13 10:00')
})

test('a London game kicking at 9:30am ET locks at 7am ET that morning', () => {
  const kickoff = new Date('2026-10-04T13:30:00Z') // Sun 9:30am ET
  assert.equal(et(kickoff), 'Sun 2026-10-04 09:30')
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Sun 2026-10-04 07:00')
})

test('the early rule is driven by kickoff time, so it catches a Saturday morning game too', () => {
  const kickoff = new Date('2026-12-19T14:30:00Z') // Sat 9:30am ET
  assert.equal(et(kickoff), 'Sat 2026-12-19 09:30')
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Sat 2026-12-19 07:00')
})

test('Saturday afternoon games late in the season lock Saturday at 10am ET', () => {
  const kickoff = new Date('2026-12-19T18:00:00Z') // Sat 1:00pm ET
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Sat 2026-12-19 10:00')
})

test('a Friday holiday game locks Friday morning', () => {
  const kickoff = new Date('2026-12-25T18:00:00Z') // Fri 1:00pm ET
  assert.equal(et(kickoff), 'Fri 2026-12-25 13:00')
  assert.equal(et(spreadLockTimeFor(kickoff)), 'Fri 2026-12-25 10:00')
})

test('lock times land correctly on both sides of the DST change', () => {
  // DST ends Nov 1 2026. A game before and after should both lock at 10am ET.
  const beforeDst = new Date('2026-10-25T17:00:00Z') // Sun 1pm EDT
  const afterDst = new Date('2026-11-08T18:00:00Z') // Sun 1pm EST
  assert.equal(et(spreadLockTimeFor(beforeDst)), 'Sun 2026-10-25 10:00')
  assert.equal(et(spreadLockTimeFor(afterDst)), 'Sun 2026-11-08 10:00')
  // And the underlying UTC instants differ by an hour, as they should.
  assert.equal(spreadLockTimeFor(beforeDst).toISOString(), '2026-10-25T14:00:00.000Z')
  assert.equal(spreadLockTimeFor(afterDst).toISOString(), '2026-11-08T15:00:00.000Z')
})

test('the spread lock flips exactly at the window deadline', () => {
  const kickoff = new Date('2026-09-13T17:00:00Z') // Sun 1pm ET
  const lock = spreadLockTimeFor(kickoff)
  assert.equal(isSpreadLocked(kickoff, new Date(lock.getTime() - 1000)), false)
  assert.equal(isSpreadLocked(kickoff, lock), true)
})

test('picks close at kickoff, not at the spread deadline', () => {
  const kickoff = new Date('2026-09-13T17:00:00Z') // Sun 1pm ET
  assert.equal(picksCloseAt(kickoff).getTime(), kickoff.getTime())

  // 10am ET Sunday: the line is frozen but picks are still open.
  const atSpreadLock = spreadLockTimeFor(kickoff)
  assert.equal(isSpreadLocked(kickoff, atSpreadLock), true)
  assert.equal(arePicksClosed(kickoff, atSpreadLock), false, 'still pickable at 10am')

  // A second before kickoff, still open. At kickoff, closed.
  assert.equal(arePicksClosed(kickoff, new Date(kickoff.getTime() - 1000)), false)
  assert.equal(arePicksClosed(kickoff, kickoff), true)
})

test('a Monday night game stays pickable all through Sunday', () => {
  const monday = new Date('2026-09-15T00:15:00Z') // Mon 8:15pm ET
  const sundayNoon = new Date('2026-09-13T16:00:00Z') // Sun noon ET
  const sundayNight = new Date('2026-09-14T02:00:00Z') // Sun 10pm ET
  const mondayAfternoon = new Date('2026-09-14T20:00:00Z') // Mon 4pm ET

  // Its spread froze Sunday morning with the rest of the slate...
  assert.equal(isSpreadLocked(monday, sundayNoon), true)

  // ...but it can still be picked right up to Monday night kickoff.
  assert.equal(arePicksClosed(monday, sundayNoon), false)
  assert.equal(arePicksClosed(monday, sundayNight), false)
  assert.equal(arePicksClosed(monday, mondayAfternoon), false)
  assert.equal(arePicksClosed(monday, monday), true)
})

test('Sunday and Monday games share a lock window; Thursday has its own', () => {
  const sunday = new Date('2026-09-13T17:00:00Z')
  const monday = new Date('2026-09-15T00:15:00Z')
  const thursday = new Date('2026-09-11T00:15:00Z')
  const london = new Date('2026-10-04T13:30:00Z')

  assert.equal(lockWindowKey(sunday), lockWindowKey(monday))
  assert.notEqual(lockWindowKey(sunday), lockWindowKey(thursday))
  assert.notEqual(lockWindowKey(london), lockWindowKey(sunday), 'early games lock separately')
})

test('etWallToUtc round-trips through etParts', () => {
  const d = etWallToUtc(2026, 11, 8, 10, 0)
  const p = etParts(d)
  assert.equal(p.hour, 10)
  assert.equal(p.day, 8)
})
