import assert from 'node:assert/strict'
import test from 'node:test'

import { positiveInteger } from './config.js'

test('positiveInteger accepts positive whole-number overrides', () => {
  assert.equal(positiveInteger('1', 20), 1)
  assert.equal(positiveInteger('1000', 20), 1000)
})

test('positiveInteger falls back for empty, fractional, zero, negative, and invalid values', () => {
  for (const value of [undefined, '', '1.5', '0', '-1', 'nope']) {
    assert.equal(positiveInteger(value, 20), 20)
  }
})
