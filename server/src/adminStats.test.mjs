import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import { adminStats, registerAdmin } from './adminStats.js'

function countStatements(overrides = {}) {
  return {
    countUsers: { get: () => ({ n: 3 }) },
    countDraftsByMode: { all: () => [{ mode: 'freeform-slide', n: 5 }, { mode: 'markdown-card', n: 2 }] },
    countImages: { get: () => ({ n: 20, bytes: 12_345_678 }) },
    countAssets: { get: () => ({ n: 7 }) },
    countShares: { get: (at) => ({ n: 4, active: at >= 2_000 ? 1 : 4 }) },
    countApiTokens: { get: () => ({ n: 1 }) },
    ...overrides,
  }
}

async function buildApp(t, { adminToken = 'admin-secret', stmts = countStatements(), now = () => 1_000 } = {}) {
  const app = Fastify()
  registerAdmin(app, { adminToken, stmts, now })
  await app.ready()
  t.after(() => app.close())
  return app
}

test('without a token neither route exists', async (t) => {
  const app = Fastify()
  registerAdmin(app, { adminToken: '   ' })
  await app.ready()
  t.after(() => app.close())

  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/stats' })).statusCode, 404)
  assert.equal((await app.inject({ method: 'GET', url: '/admin' })).statusCode, 404)
})

test('the stats answer only the right token, in constant-time comparison', async (t) => {
  const app = await buildApp(t)

  const missing = await app.inject({ method: 'GET', url: '/api/admin/stats' })
  assert.equal(missing.statusCode, 401)
  const wrong = await app.inject({
    method: 'GET',
    url: '/api/admin/stats',
    headers: { authorization: 'Bearer nope' },
  })
  assert.equal(wrong.statusCode, 401)
  assert.equal(JSON.parse(wrong.body).error, '管理员令牌不对')

  const right = await app.inject({
    method: 'GET',
    url: '/api/admin/stats',
    headers: { authorization: 'Bearer admin-secret' },
  })
  assert.equal(right.statusCode, 200)
  assert.deepEqual(JSON.parse(right.body), {
    ok: true,
    serverTime: 1_000,
    stats: {
      users: 3,
      drafts: { 'freeform-slide': 5, 'markdown-card': 2 },
      images: { count: 20, bytes: 12_345_678 },
      assets: 7,
      shares: { total: 4, active: 4 },
      apiTokens: 1,
    },
  })
})

test('active shares are the ones not yet expired', async (t) => {
  const app = await buildApp(t, { now: () => 3_000 })
  const response = await app.inject({
    method: 'GET',
    url: '/api/admin/stats',
    headers: { authorization: 'Bearer admin-secret' },
  })
  assert.equal(JSON.parse(response.body).stats.shares.active, 1)
})

test('the dashboard page is a self-contained noindex form', async (t) => {
  const app = await buildApp(t)
  const response = await app.inject({ method: 'GET', url: '/admin' })

  assert.equal(response.statusCode, 200)
  assert.match(response.headers['content-type'], /text\/html/)
  assert.equal(response.headers['x-robots-tag'], 'noindex')
  const body = response.body
  assert.ok(body.includes('叮卡实例总览'))
  assert.ok(body.includes('DINGCARD_ADMIN_TOKEN'))
  assert.ok(body.includes('id="admin-form"'))
  assert.ok(body.includes('<meta name="robots" content="noindex">'))
  // The token travels only in the request the page itself makes.
  assert.ok(!body.includes('admin-secret'))
})

test('adminStats reads every count from the statements it is given', () => {
  assert.deepEqual(adminStats({ stmts: countStatements(), now: () => 1_000 }), {
    users: 3,
    drafts: { 'freeform-slide': 5, 'markdown-card': 2 },
    images: { count: 20, bytes: 12_345_678 },
    assets: 7,
    shares: { total: 4, active: 4 },
    apiTokens: 1,
  })
})
