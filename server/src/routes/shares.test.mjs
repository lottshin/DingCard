import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import Fastify from 'fastify'

import { createDatabase } from '../db.js'
import { createUserAssetLock } from '../userAssetLock.js'
import shareRoutes from './shares.js'

const CONFIG = { uploadsPublicPath: '/uploads' }

function shareStatements(overrides = {}) {
  return {
    listShares: { all: () => [] },
    shareByToken: { get: () => undefined },
    shareImages: { all: () => [] },
    deleteShare: { run: () => ({ changes: 0 }) },
    createShare: () => ({ changes: 1 }),
    imageByUserPath: { get: () => undefined },
    ...overrides,
  }
}

async function buildApp(t, {
  stmts = shareStatements(),
  reclaimImages = async () => ({ reclaimedBytes: 0, aborted: false }),
  userId = 'user-1',
  createShareToken,
} = {}) {
  const app = Fastify()
  app.decorate('authenticate', async (request) => {
    request.user = { sub: userId }
  })
  await app.register(shareRoutes, {
    prefix: '/api/shares',
    assetLock: createUserAssetLock(),
    config: CONFIG,
    stmts,
    now: () => 1_000,
    ...(createShareToken ? { createShareToken } : {}),
    reclaimImages,
  })
  await app.ready()
  t.after(() => app.close())
  return app
}

test('share routes require their shared lock and GC hooks', async () => {
  const app = Fastify()
  app.decorate('authenticate', async () => {})
  await assert.rejects(
    app.register(shareRoutes, { reclaimImages: async () => {} }).ready(),
    { message: 'options.assetLock.run must be a function' },
  )
})

test('GET lists only the caller\'s shares as API envelopes', async (t) => {
  let listedFor
  const app = await buildApp(t, {
    stmts: shareStatements({
      listShares: {
        all(userId) {
          listedFor = userId
          return [{
            id: 'share-1',
            token: 'tok-1',
            title: '一周早餐',
            created_at: 50,
            expires_at: 500,
            image_count: 3,
          }]
        },
      },
    }),
  })

  const response = await app.inject({ method: 'GET', url: '/api/shares' })

  assert.equal(response.statusCode, 200)
  assert.equal(listedFor, 'user-1')
  assert.deepEqual(response.json(), [
    { id: 'share-1', title: '一周早餐', url: '/share/tok-1', createdAt: 50, expiresAt: 500, imageCount: 3 },
  ])
})

test('POST creates a share from owned same-origin uploads', async (t) => {
  const created = []
  const checkedPaths = []
  const app = await buildApp(t, {
    stmts: shareStatements({
      imageByUserPath: { get: (userId, imagePath) => {
        checkedPaths.push([userId, imagePath])
        return { id: 'image-1' }
      } },
      createShare: (row, imagePaths) => {
        created.push({ row: { ...row }, imagePaths: [...imagePaths] })
        return { changes: 1 + imagePaths.length }
      },
    }),
    createShareToken: () => 'a-token',
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/shares',
    payload: {
      title: '  一周  早餐 ',
      urls: ['/uploads/page-1.png', 'http://host.example/uploads/page-2.jpg'],
      expiresInDays: 7,
    },
    headers: { host: 'host.example' },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(checkedPaths, [
    ['user-1', '/uploads/page-1.png'],
    ['user-1', '/uploads/page-2.jpg'],
  ])
  assert.equal(created.length, 1)
  assert.equal(created[0].row.token, 'a-token')
  assert.equal(created[0].row.title, '一周 早餐')
  assert.equal(created[0].row.expires_at, 1_000 + 7 * 24 * 60 * 60 * 1000)
  assert.deepEqual(created[0].imagePaths, ['/uploads/page-1.png', '/uploads/page-2.jpg'])
  assert.deepEqual(response.json(), {
    id: created[0].row.id,
    title: '一周 早餐',
    url: '/share/a-token',
    createdAt: 1_000,
    expiresAt: 1_000 + 7 * 24 * 60 * 60 * 1000,
    imageCount: 2,
  })
})

test('POST defaults the expiry to 30 days and rejects bad input', async (t) => {
  const created = []
  const app = await buildApp(t, {
    stmts: shareStatements({
      imageByUserPath: { get: () => ({ id: 'image-1' }) },
      createShare: (row, imagePaths) => {
        created.push({ row: { ...row }, imagePaths })
        return { changes: 1 }
      },
    }),
    createShareToken: () => 'b-token',
  })

  const ok = await app.inject({
    method: 'POST',
    url: '/api/shares',
    payload: { title: '早餐', urls: ['/uploads/page-1.png'] },
  })
  assert.equal(ok.statusCode, 200)
  assert.equal(created[0].row.expires_at, 1_000 + 30 * 24 * 60 * 60 * 1000)

  const badTitle = await app.inject({
    method: 'POST', url: '/api/shares', payload: { title: '  ', urls: ['/uploads/a.png'] },
  })
  assert.equal(badTitle.statusCode, 400)

  const badDays = await app.inject({
    method: 'POST', url: '/api/shares',
    payload: { title: '早餐', urls: ['/uploads/a.png'], expiresInDays: 0 },
  })
  assert.equal(badDays.statusCode, 400)

  const noUrls = await app.inject({
    method: 'POST', url: '/api/shares', payload: { title: '早餐', urls: [] },
  })
  assert.equal(noUrls.statusCode, 400)

  const badUrl = await app.inject({
    method: 'POST', url: '/api/shares', payload: { title: '早餐', urls: ['https://else.where/x.png'] },
  })
  assert.equal(badUrl.statusCode, 400)

  const tooMany = await app.inject({
    method: 'POST',
    url: '/api/shares',
    payload: { title: '早餐', urls: Array.from({ length: 51 }, (_, i) => `/uploads/p-${i}.png`) },
  })
  assert.equal(tooMany.statusCode, 400)
  assert.equal(tooMany.json().code, 'SHARE_IMAGE_LIMIT_EXCEEDED')
})

test('POST refuses images the caller does not own', async (t) => {
  let created = 0
  const app = await buildApp(t, {
    stmts: shareStatements({
      imageByUserPath: { get: () => undefined },
      createShare: { run: () => {
        created += 1
        return { changes: 1 }
      } },
    }),
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/shares',
    payload: { title: '早餐', urls: ['/uploads/gone.png'] },
  })

  assert.equal(response.statusCode, 409)
  assert.equal(response.json().code, 'SHARE_IMAGE_MISSING')
  assert.equal(created, 0)
})

test('POST retries a token collision with a fresh token', async (t) => {
  const tokens = ['same', 'fresh']
  let attempts = 0
  let created = 0
  const app = await buildApp(t, {
    stmts: shareStatements({
      imageByUserPath: { get: () => ({ id: 'image-1' }) },
      createShare: (row) => {
        attempts += 1
        if (row.token === 'same') {
          const err = new Error('UNIQUE constraint failed: shares.token')
          err.code = 'SQLITE_CONSTRAINT_UNIQUE'
          throw err
        }
        created += 1
        return { changes: 1 }
      },
    }),
    createShareToken: () => tokens.shift(),
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/shares',
    payload: { title: '早餐', urls: ['/uploads/page-1.png'] },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.json().url, '/share/fresh')
  assert.equal(attempts, 2)
  assert.equal(created, 1)
})

test('DELETE revokes the caller\'s share and collects its images', async (t) => {
  let revokedFor
  let reclaimed
  const app = await buildApp(t, {
    stmts: shareStatements({
      deleteShare: { run: (id, userId) => {
        revokedFor = [id, userId]
        return { changes: 1 }
      } },
    }),
    reclaimImages: async (userId) => {
      reclaimed = userId
      return { reclaimedBytes: 0, aborted: false }
    },
  })

  const response = await app.inject({ method: 'DELETE', url: '/api/shares/share-1' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(revokedFor, ['share-1', 'user-1'])
  assert.equal(reclaimed, 'user-1')
  assert.deepEqual(response.json(), { ok: true })
})

test('DELETE answers 404 for another user\'s share and survives GC failure', async (t) => {
  const app = await buildApp(t, {
    stmts: shareStatements({
      deleteShare: { run: () => ({ changes: 0 }) },
    }),
    reclaimImages: async () => {
      throw new Error('gc down')
    },
  })

  const missing = await app.inject({ method: 'DELETE', url: '/api/shares/share-1' })
  assert.equal(missing.statusCode, 404)

  const app2 = await buildApp(t, {
    stmts: shareStatements({
      deleteShare: { run: () => ({ changes: 1 }) },
    }),
    reclaimImages: async () => {
      throw new Error('gc down')
    },
  })
  const revoked = await app2.inject({ method: 'DELETE', url: '/api/shares/share-1' })
  assert.equal(revoked.statusCode, 200)
  assert.deepEqual(revoked.json(), { ok: true })
})

test('SQLite shares keep a revocable reference to their pages', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dingcard-shares-'))
  const { db, stmts } = createDatabase({
    dbPath: path.join(root, 'data', 'data.db'),
    uploadsDir: path.join(root, 'uploads'),
    imageLeaseMs: 10,
  })
  t.after(async () => {
    db.close()
    await rm(root, { recursive: true, force: true })
  })

  stmts.insertUser.run({ id: 'user-1', username: 'share-owner', pw_hash: 'x', created_at: 1 })
  for (const name of ['page-1.png', 'page-2.png']) {
    stmts.insertImage.run({
      id: name,
      user_id: 'user-1',
      path: `/uploads/${name}`,
      mime: 'image/png',
      bytes: 64,
      created_at: 1,
      lease_expires_at: 11,
    })
  }

  stmts.createShare(
    { id: 'share-1', user_id: 'user-1', token: 'tok-1', title: '早餐', created_at: 100, expires_at: 200 },
    ['/uploads/page-1.png', '/uploads/page-2.png'],
  )
  // A second share referencing the same page: revoking one keeps the page.
  stmts.createShare(
    { id: 'share-2', user_id: 'user-1', token: 'tok-2', title: '早餐二', created_at: 110, expires_at: 210 },
    ['/uploads/page-2.png'],
  )

  const share = stmts.shareByToken.get('tok-1')
  assert.equal(share.id, 'share-1')
  assert.deepEqual(
    stmts.shareImages.all('share-1').map((row) => row.image_path),
    ['/uploads/page-1.png', '/uploads/page-2.png'],
  )
  assert.deepEqual(
    stmts.listShares.all('user-1').map((row) => [row.id, row.image_count]),
    [['share-2', 1], ['share-1', 2]],
  )
  assert.deepEqual(
    new Set(stmts.listSharePaths.all('user-1').map((row) => row.image_path)),
    new Set(['/uploads/page-1.png', '/uploads/page-2.png']),
  )

  // Revoking cascades the image rows away with the share.
  assert.equal(stmts.deleteShare.run('share-1', 'user-2').changes, 0)
  assert.equal(stmts.deleteShare.run('share-1', 'user-1').changes, 1)
  assert.equal(stmts.shareByToken.get('tok-1'), undefined)
  assert.deepEqual(stmts.listSharePaths.all('user-1').map((row) => row.image_path), ['/uploads/page-2.png'])
})
