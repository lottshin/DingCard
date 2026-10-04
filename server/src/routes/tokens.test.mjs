import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import { apiTokenHash } from '../apiToken.js'
import { requireScope, sessionOnly } from '../tokenGuards.js'
import tokenRoutes from './tokens.js'

function tokenStatements(overrides = {}) {
  return {
    listApiTokens: { all: () => [] },
    insertApiToken: { run: () => ({ changes: 1 }) },
    revokeApiToken: { run: () => ({ changes: 0 }) },
    ...overrides,
  }
}

async function buildApp(t, {
  stmts = tokenStatements(),
  userId = 'user-1',
  via = undefined,
  createApiTokenValue,
} = {}) {
  const app = Fastify()
  app.decorate('authenticate', async (request) => {
    request.user = via === 'token'
      ? { sub: userId, via: 'token', scopes: ['shares'] }
      : { sub: userId }
  })
  await app.register(tokenRoutes, {
    prefix: '/api/tokens',
    stmts,
    now: () => 1_000,
    ...(createApiTokenValue ? { createApiTokenValue } : {}),
  })
  await app.ready()
  t.after(() => app.close())
  return app
}

test('POST mints a token shown exactly once, storing only its hash', async (t) => {
  const inserted = []
  const app = await buildApp(t, {
    stmts: tokenStatements({
      insertApiToken: { run: (row) => { inserted.push({ ...row }); return { changes: 1 } } },
    }),
    createApiTokenValue: () => 'dc_test-token-value',
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/tokens',
    payload: { name: '  我的 智能体 ', scopes: ['shares', 'images', 'shares'] },
  })

  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.token, 'dc_test-token-value')
  assert.equal(body.name, '我的 智能体')
  assert.deepEqual(body.scopes, ['shares', 'images'])
  assert.equal(body.createdAt, 1_000)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].user_id, 'user-1')
  assert.equal(inserted[0].token_hash, apiTokenHash('dc_test-token-value'))
  assert.equal(inserted[0].scopes, 'shares,images')
  assert.equal(body.id, inserted[0].id)
})

test('POST retries a value collision with a fresh one', async (t) => {
  let calls = 0
  const values = ['dc_first', 'dc_second']
  const app = await buildApp(t, {
    stmts: tokenStatements({
      insertApiToken: {
        run: (row) => {
          calls += 1
          if (calls === 1) {
            const err = new Error('UNIQUE constraint failed')
            err.code = 'SQLITE_CONSTRAINT_UNIQUE'
            throw err
          }
          assert.equal(row.token_hash, apiTokenHash('dc_second'))
          return { changes: 1 }
        },
      },
    }),
    createApiTokenValue: () => values[calls],
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/tokens',
    payload: { name: '重试', scopes: ['decks'] },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().token, 'dc_second')
  assert.equal(calls, 2)
})

test('POST rejects a bad name or scopes and enforces the token ceiling', async (t) => {
  const app = await buildApp(t)
  const cases = [
    [{ scopes: ['shares'] }, '令牌名称不能为空'],
    [{ name: '   ', scopes: ['shares'] }, '令牌名称不能为空'],
    [{ name: 'x' }, 'scopes'],
    [{ name: 'x', scopes: [] }, 'scopes'],
    [{ name: 'x', scopes: 'shares' }, 'scopes'],
    [{ name: 'x', scopes: ['admin'] }, 'scopes'],
  ]
  for (const [payload, message] of cases) {
    const response = await app.inject({ method: 'POST', url: '/api/tokens', payload })
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
    assert.ok(response.json().error.includes(message), response.json().error)
  }

  const full = await buildApp(t, {
    stmts: tokenStatements({ listApiTokens: { all: () => Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}` })) } }),
  })
  const limited = await full.inject({
    method: 'POST',
    url: '/api/tokens',
    payload: { name: '第十一个', scopes: ['shares'] },
  })
  assert.equal(limited.statusCode, 409)
  assert.equal(limited.json().code, 'TOKEN_LIMIT_EXCEEDED')
})

test('GET lists the caller\'s tokens as envelopes without values', async (t) => {
  const app = await buildApp(t, {
    stmts: tokenStatements({
      listApiTokens: {
        all: (userId) => {
          assert.equal(userId, 'user-1')
          return [{
            id: 'token-1',
            name: '智能体',
            scopes: 'shares,images',
            created_at: 50,
            last_used_at: 900,
          }]
        },
      },
    }),
  })

  const response = await app.inject({ method: 'GET', url: '/api/tokens' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), [
    { id: 'token-1', name: '智能体', scopes: ['shares', 'images'], createdAt: 50, lastUsedAt: 900 },
  ])
})

test('DELETE revokes the caller\'s token and 404s anyone else\'s', async (t) => {
  const revoked = []
  const app = await buildApp(t, {
    stmts: tokenStatements({
      revokeApiToken: { run: (at, id, userId) => { revoked.push([at, id, userId]); return { changes: 1 } } },
    }),
  })

  const response = await app.inject({ method: 'DELETE', url: '/api/tokens/token-1' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.deepEqual(revoked, [[1_000, 'token-1', 'user-1']])

  const missing = await buildApp(t)
  const gone = await missing.inject({ method: 'DELETE', url: '/api/tokens/token-1' })
  assert.equal(gone.statusCode, 404)
})

test('an API token cannot manage tokens', async (t) => {
  const app = await buildApp(t, { via: 'token' })

  for (const [method, url] of [['POST', '/api/tokens'], ['GET', '/api/tokens'], ['DELETE', '/api/tokens/token-1']]) {
    const response = await app.inject({ method, url, payload: { name: 'x', scopes: ['shares'] } })
    assert.equal(response.statusCode, 403, `${method} ${url}`)
    assert.equal(response.json().code, 'TOKEN_MANAGEMENT_DENIED')
  }
})

test('requireScope admits matching tokens and every browser session', async (t) => {
  const app = Fastify()
  t.after(() => app.close())
  app.addHook('preHandler', async (request) => {
    request.user = app.__user
  })
  app.addHook('preHandler', requireScope('shares'))
  app.get('/', async () => ({ ok: true }))
  await app.ready()

  app.__user = { sub: 'user-1', via: 'token', scopes: ['shares', 'images'] }
  assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 200)

  app.__user = { sub: 'user-1', username: 'alice' }
  assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 200)

  app.__user = { sub: 'user-1', via: 'token', scopes: ['images'] }
  const denied = await app.inject({ method: 'GET', url: '/' })
  assert.equal(denied.statusCode, 403)
  assert.equal(denied.json().code, 'TOKEN_SCOPE_DENIED')
})

test('sessionOnly rejects token auth and admits browser sessions', async (t) => {
  const app = Fastify()
  t.after(() => app.close())
  app.addHook('preHandler', async (request) => {
    request.user = app.__user
  })
  app.addHook('preHandler', sessionOnly)
  app.get('/', async () => ({ ok: true }))
  await app.ready()

  app.__user = { sub: 'user-1', username: 'alice' }
  assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 200)

  app.__user = { sub: 'user-1', via: 'token', scopes: ['shares'] }
  assert.equal((await app.inject({ method: 'GET', url: '/' })).statusCode, 403)
})
