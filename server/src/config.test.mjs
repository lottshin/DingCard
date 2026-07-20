import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
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

test('production refuses to start without JWT_SECRET', () => {
  const configUrl = new URL('./config.js', import.meta.url).href
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(configUrl)})`],
    {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '' },
    },
  )

  assert.notEqual(result.status, 0)
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /JWT_SECRET must be set in production \(refusing to start with an empty secret\)/,
  )
})
