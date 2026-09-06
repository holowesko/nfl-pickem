import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displaySpread, formatSpread } from './slate'

test('only the favorite carries the number', () => {
  // Home favored by 3.5.
  assert.equal(displaySpread(-3.5, 'home'), '-3.5')
  assert.equal(displaySpread(-3.5, 'away'), null, 'the dog shows nothing')

  // Away favored by 3.5 — home is getting points.
  assert.equal(displaySpread(3.5, 'away'), '-3.5')
  assert.equal(displaySpread(3.5, 'home'), null, 'the dog shows nothing')
})

test('the favorite’s number is always negative, whichever side it is', () => {
  assert.equal(displaySpread(-7, 'home'), '-7')
  assert.equal(displaySpread(7, 'away'), '-7')
})

test('a pick-em has no favorite, so both sides say PK', () => {
  assert.equal(displaySpread(0, 'home'), 'PK')
  assert.equal(displaySpread(0, 'away'), 'PK')
})

test('a game with no line yet shows nothing on either side', () => {
  assert.equal(displaySpread(null, 'home'), null)
  assert.equal(displaySpread(null, 'away'), null)
})

test('formatSpread still gives both sides, for anywhere that needs the pair', () => {
  assert.equal(formatSpread(-3.5, 'home'), '-3.5')
  assert.equal(formatSpread(-3.5, 'away'), '+3.5')
})
