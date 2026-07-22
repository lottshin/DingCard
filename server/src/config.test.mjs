import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'

import { positiveInteger } from './config.js'

const configUrl = new URL('./config.js', import.meta.url).href

function loadConfig(environment = {}) {
  const {
    WEB_ROOT: _webRoot,
    DINGCARD_IMAGE: _imageRuntime,
    ...baseEnvironment
  } = process.env
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const { config } = await import(${JSON.stringify(configUrl)}); console.log(JSON.stringify({ webRoot: config.webRoot, imageRuntime: config.imageRuntime }))`,
    ],
    {
      encoding: 'utf8',
      env: { ...baseEnvironment, ...environment },
    },
  )

  return {
    ...result,
    parsed: result.status === 0 ? JSON.parse(result.stdout.trim()) : undefined,
  }
}

test('positiveInteger accepts positive whole-number overrides', () => {
  assert.equal(positiveInteger('1', 20), 1)
  assert.equal(positiveInteger('1000', 20), 1000)
})

test('positiveInteger falls back for empty, fractional, zero, negative, and invalid values', () => {
  for (const value of [undefined, '', '1.5', '0', '-1', 'nope']) {
    assert.equal(positiveInteger(value, 20), 20)
  }
})

test('WEB_ROOT resolves a configured relative path to an absolute path', () => {
  const result = loadConfig({ WEB_ROOT: 'dist' })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.equal(result.parsed.webRoot, path.resolve('dist'))
})

test('DINGCARD_IMAGE enables strict image runtime only for the exact value 1', () => {
  const enabled = loadConfig({ DINGCARD_IMAGE: '1' })
  assert.equal(enabled.status, 0, `${enabled.stdout}\n${enabled.stderr}`)
  assert.equal(enabled.parsed.imageRuntime, true)

  for (const value of ['0', 'true', ' 1 ']) {
    const disabled = loadConfig({ DINGCARD_IMAGE: value })
    assert.equal(disabled.status, 0, `${disabled.stdout}\n${disabled.stderr}`)
    assert.equal(disabled.parsed.imageRuntime, false, value)
  }
})

test('production API-only configuration remains valid without image runtime or a web root', () => {
  const result = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'config-test-secret',
    WEB_ROOT: '',
  })

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.deepEqual(result.parsed, { webRoot: '', imageRuntime: false })
})

test('production refuses to start without JWT_SECRET', () => {
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
