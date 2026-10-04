import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import { registerSharePage } from './sharePage.js'

function sharePageStatements(overrides = {}) {
  return {
    shareByToken: { get: () => undefined },
    shareImages: { all: () => [] },
    ...overrides,
  }
}

async function buildApp(t, { stmts = sharePageStatements(), now = () => 1_000 } = {}) {
  const app = Fastify()
  registerSharePage(app, { stmts, now })
  await app.ready()
  t.after(() => app.close())
  return app
}

test('an active share renders its pages in order with noindex headers', async (t) => {
  const app = await buildApp(t, {
    stmts: sharePageStatements({
      shareByToken: { get: () => ({
        id: 'share-1',
        token: 'tok',
        title: '一周早餐 <小结>',
        expires_at: 2_000,
      }) },
      shareImages: { all: () => [
        { image_path: '/uploads/page-1.png' },
        { image_path: '/uploads/page-2.png' },
      ] },
    }),
  })

  const response = await app.inject({ method: 'GET', url: '/share/tok' })

  assert.equal(response.statusCode, 200)
  assert.match(response.headers['content-type'], /text\/html/)
  assert.equal(response.headers['x-robots-tag'], 'noindex')
  const body = response.body
  assert.ok(body.includes('一周早餐 &lt;小结&gt;'))
  assert.ok(body.includes('<img src="/uploads/page-1.png"'))
  assert.ok(body.includes('<img src="/uploads/page-2.png"'))
  assert.ok(body.includes('长按图片保存到相册'))
  assert.ok(body.includes('<meta name="viewport"'))
  assert.ok(body.includes('<meta name="robots" content="noindex">'))
})

test('an expired share answers 410 and an unknown one 404', async (t) => {
  const expired = await buildApp(t, {
    stmts: sharePageStatements({
      shareByToken: { get: () => ({
        id: 'share-1', token: 'tok', title: '早餐', expires_at: 1_000,
      }) },
    }),
  })
  const gone = await expired.inject({ method: 'GET', url: '/share/tok' })
  assert.equal(gone.statusCode, 410)
  assert.ok(gone.body.includes('分享已过期'))

  const fresh = await buildApp(t)
  const missing = await fresh.inject({ method: 'GET', url: '/share/nope' })
  assert.equal(missing.statusCode, 404)
  assert.ok(missing.body.includes('分享不存在'))

  // A revoked share is just a missing row; the page must not distinguish it.
  const long = await fresh.inject({ method: 'GET', url: `/${'a'.repeat(80)}` })
  assert.equal(long.statusCode, 404)
})

test('a share whose images vanished answers 404 rather than an empty page', async (t) => {
  const app = await buildApp(t, {
    stmts: sharePageStatements({
      shareByToken: { get: () => ({
        id: 'share-1', token: 'tok', title: '早餐', expires_at: 2_000,
      }) },
      shareImages: { all: () => [] },
    }),
  })

  const response = await app.inject({ method: 'GET', url: '/share/tok' })
  assert.equal(response.statusCode, 404)
})
