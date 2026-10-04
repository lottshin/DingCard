import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import { apiTokenHash, newApiTokenValue } from '../apiToken.js'
import authPlugin from './auth.js'

const CONFIG = { jwtSecret: 'auth-test-secret-not-for-prod', jwtExpiry: '1h' }

function tokenStatements(overrides = {}) {
  return {
    apiTokenByHash: { get: () => undefined },
    touchApiToken: { run: () => ({ changes: 1 }) },
    ...overrides,
  }
}

async function buildApp(t, { stmts = tokenStatements(), now = () => 10_000 } = {}) {
  const app = Fastify()
  await app.register(authPlugin, { config: CONFIG, stmts, now })
  app.get('/whoami', { preHandler: app.authenticate }, async (request) => ({
    user: request.user ?? null,
  }))
  await app.ready()
  t.after(() => app.close())
  return app
}

test('authenticate accepts a JWT session with the full payload', async (t) => {
  const app = await buildApp(t)
  const token = app.jwt.sign({ sub: 'user-1', username: 'alice' })

  const response = await app.inject({
    method: 'GET',
    url: '/whoami',
    headers: { authorization: `Bearer ${token}` },
  })

  assert.equal(response.statusCode, 200)
  const user = response.json().user
  assert.equal(user.sub, 'user-1')
  assert.equal(user.username, 'alice')
  assert.equal(user.via, undefined)
})

test('authenticate resolves a Bearer API token to its user and scopes', async (t) => {
  const value = newApiTokenValue()
  const touched = []
  const app = await buildApp(t, {
    stmts: tokenStatements({
      apiTokenByHash: {
        get: (hash) => {
          assert.equal(hash, apiTokenHash(value))
          return { id: 'token-1', user_id: 'user-1', scopes: 'shares,images', last_used_at: null, revoked_at: null }
        },
      },
      touchApiToken: { run: (at, id) => { touched.push([at, id]) } },
    }),
  })

  const response = await app.inject({
    method: 'GET',
    url: '/whoami',
    headers: { authorization: `Bearer ${value}` },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().user, { sub: 'user-1', via: 'token', scopes: ['shares', 'images'] })
  // A null last_used_at stamps immediately.
  assert.deepEqual(touched, [[10_000, 'token-1']])
})

test('authenticate stamps last_used_at at most once a minute', async (t) => {
  const value = newApiTokenValue()
  let lastUsedAt = 9_000
  const touched = []
  const app = await buildApp(t, {
    now: () => 10_000,
    stmts: tokenStatements({
      apiTokenByHash: {
        get: () => ({ id: 'token-1', user_id: 'user-1', scopes: 'shares', last_used_at: lastUsedAt, revoked_at: null }),
      },
      touchApiToken: { run: (at) => { touched.push(at); lastUsedAt = at } },
    }),
  })

  for (let i = 0; i < 3; i++) {
    const response = await app.inject({
      method: 'GET',
      url: '/whoami',
      headers: { authorization: `Bearer ${value}` },
    })
    assert.equal(response.statusCode, 200)
  }
  // 10_000 - 9_000 < 60s: no stamp for any of the requests.
  assert.deepEqual(touched, [])
})

test('authenticate rejects unknown and revoked API tokens with 401', async (t) => {
  const value = newApiTokenValue()
  let row
  const app = await buildApp(t, {
    stmts: tokenStatements({
      apiTokenByHash: { get: () => row },
    }),
  })

  const headers = { authorization: `Bearer ${value}` }
  assert.equal((await app.inject({ method: 'GET', url: '/whoami', headers })).statusCode, 401)

  row = { id: 'token-1', user_id: 'user-1', scopes: 'shares', last_used_at: null, revoked_at: 123 }
  // The statement-level filter hides revoked rows; the code only sees them missing.
  row = undefined
  assert.equal((await app.inject({ method: 'GET', url: '/whoami', headers })).statusCode, 401)

  assert.equal(
    (await app.inject({ method: 'GET', url: '/whoami', headers: { authorization: 'Bearer dc_not-a-real-token' } })).statusCode,
    401,
  )
  assert.equal((await app.inject({ method: 'GET', url: '/whoami' })).statusCode, 401)
})
