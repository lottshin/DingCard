import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import Fastify from 'fastify'

import { createDatabase } from '../db.js'
import { reclaimExpiredImages } from '../imageGc.js'
import { createUserAssetLock } from '../userAssetLock.js'
import assetRoutes from './assets.js'

const CONFIG = { uploadsPublicPath: '/uploads' }

function assetRow(overrides = {}) {
  return {
    id: 'asset-1',
    user_id: 'user-1',
    image_path: '/uploads/street.jpg',
    name: '雨夜街道',
    width: 1200,
    height: 800,
    created_at: 50,
    bytes: 2048,
    ...overrides,
  }
}

function assetStatements(overrides = {}) {
  return {
    listAssets: { all: () => [] },
    assetById: { get: () => undefined },
    insertAsset: { run: () => ({ changes: 1 }) },
    renameAsset: { run: () => ({ changes: 0 }) },
    deleteAsset: { run: () => ({ changes: 0 }) },
    imageByUserPath: { get: () => undefined },
    ...overrides,
  }
}

async function buildApp(t, {
  stmts = assetStatements(),
  reclaimImages = async () => ({ reclaimedBytes: 0, aborted: false }),
  userId = 'user-1',
} = {}) {
  const app = Fastify()
  app.decorate('authenticate', async (request) => {
    request.user = { sub: userId }
  })
  await app.register(assetRoutes, {
    prefix: '/api/assets',
    assetLock: createUserAssetLock(),
    config: CONFIG,
    stmts,
    now: () => 1_000,
    reclaimImages,
  })
  await app.ready()
  t.after(() => app.close())
  return app
}

test('asset routes require their shared lock and GC hooks', async () => {
  const app = Fastify()
  app.decorate('authenticate', async () => {})
  await assert.rejects(
    app.register(assetRoutes, { reclaimImages: async () => {} }).ready(),
    { message: 'options.assetLock.run must be a function' },
  )
})

test('GET lists only the caller\'s assets as API envelopes', async (t) => {
  let listedFor
  const app = await buildApp(t, {
    stmts: assetStatements({
      listAssets: {
        all(userId) {
          listedFor = userId
          return [assetRow(), assetRow({ id: 'asset-2', bytes: null })]
        },
      },
    }),
  })

  const response = await app.inject({ method: 'GET', url: '/api/assets' })

  assert.equal(response.statusCode, 200)
  assert.equal(listedFor, 'user-1')
  assert.deepEqual(response.json(), [
    { id: 'asset-1', name: '雨夜街道', url: '/uploads/street.jpg', width: 1200, height: 800, bytes: 2048, createdAt: 50 },
    { id: 'asset-2', name: '雨夜街道', url: '/uploads/street.jpg', width: 1200, height: 800, bytes: 0, createdAt: 50 },
  ])
})

test('POST registers a same-origin upload the caller owns', async (t) => {
  let inserted
  let lookedUp
  const app = await buildApp(t, {
    stmts: assetStatements({
      imageByUserPath: {
        get(userId, imagePath) {
          lookedUp = [userId, imagePath]
          return { id: 'image-1', bytes: 4096 }
        },
      },
      insertAsset: {
        run(row) {
          inserted = row
          return { changes: 1 }
        },
      },
    }),
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/assets',
    headers: { host: 'api.example' },
    payload: { url: 'http://api.example/uploads/street.jpg?v=1', name: '  雨夜\n街道 ', width: 1200, height: 800 },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(lookedUp, ['user-1', '/uploads/street.jpg'])
  assert.equal(inserted.user_id, 'user-1')
  assert.equal(inserted.image_path, '/uploads/street.jpg')
  assert.equal(inserted.name, '雨夜 街道')
  assert.equal(inserted.created_at, 1_000)
  assert.deepEqual(response.json(), {
    id: inserted.id,
    name: '雨夜 街道',
    url: '/uploads/street.jpg',
    width: 1200,
    height: 800,
    bytes: 4096,
    createdAt: 1_000,
  })
})

test('POST rejects invalid names, sizes, foreign URLs, and uploads the caller does not own', async (t) => {
  let insertions = 0
  const app = await buildApp(t, {
    stmts: assetStatements({
      imageByUserPath: { get: (_userId, imagePath) => (imagePath === '/uploads/mine.png' ? { bytes: 1 } : undefined) },
      insertAsset: { run: () => { insertions += 1; return { changes: 1 } } },
    }),
  })
  const valid = { url: '/uploads/mine.png', name: '图', width: 10, height: 10 }
  const post = (payload) => app.inject({ method: 'POST', url: '/api/assets', headers: { host: 'api.example' }, payload })

  for (const [payload, status, error] of [
    [{ ...valid, name: '   ' }, 400, '素材名称不能为空'],
    [{ ...valid, width: 0 }, 400, '素材尺寸无效'],
    [{ ...valid, height: 1.5 }, 400, '素材尺寸无效'],
    [{ ...valid, width: 20_001 }, 400, '素材尺寸无效'],
    [{ ...valid, url: 'https://evil.example/uploads/mine.png' }, 400, '素材图片地址无效'],
    [{ ...valid, url: '/elsewhere/mine.png' }, 400, '素材图片地址无效'],
    [{ ...valid, url: 'data:image/png;base64,AAAA' }, 400, '素材图片地址无效'],
    [{ ...valid, url: '/uploads/theirs.png' }, 409, '这张图片已失效，请重新上传'],
  ]) {
    const response = await post(payload)
    assert.equal(response.statusCode, status, JSON.stringify(payload))
    assert.equal(response.json().error, error)
  }
  assert.equal(insertions, 0)
  assert.equal((await post(valid)).statusCode, 200)
  assert.equal(insertions, 1)
})

test('PATCH renames only an existing asset of the caller', async (t) => {
  const renames = []
  const app = await buildApp(t, {
    stmts: assetStatements({
      renameAsset: {
        run(name, id, userId) {
          renames.push([name, id, userId])
          return { changes: id === 'asset-1' ? 1 : 0 }
        },
      },
      assetById: { get: (id) => (id === 'asset-1' ? assetRow({ name: renames.at(-1)?.[0] }) : undefined) },
    }),
  })

  const renamed = await app.inject({ method: 'PATCH', url: '/api/assets/asset-1', payload: { name: ' 封面 ' } })
  assert.equal(renamed.statusCode, 200)
  assert.equal(renamed.json().name, '封面')

  const missing = await app.inject({ method: 'PATCH', url: '/api/assets/other', payload: { name: '封面' } })
  assert.equal(missing.statusCode, 404)

  const blank = await app.inject({ method: 'PATCH', url: '/api/assets/asset-1', payload: { name: ' ' } })
  assert.equal(blank.statusCode, 400)
  assert.deepEqual(renames, [['封面', 'asset-1', 'user-1'], ['封面', 'other', 'user-1']])
})

test('DELETE removes the asset, then reclaims images, even when GC fails', async (t) => {
  const events = []
  const app = await buildApp(t, {
    stmts: assetStatements({
      deleteAsset: {
        run(id, userId) {
          events.push(['delete', id, userId])
          return { changes: 1 }
        },
      },
    }),
    reclaimImages: async (userId) => {
      events.push(['reclaim', userId])
      throw new Error('disk offline')
    },
  })

  const response = await app.inject({ method: 'DELETE', url: '/api/assets/asset-1' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.deepEqual(events, [['delete', 'asset-1', 'user-1'], ['reclaim', 'user-1']])
})

test('SQLite assets keep an expired, undrafted upload alive until the asset is deleted', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dingcard-assets-'))
  const { db, stmts } = createDatabase({
    dbPath: path.join(root, 'data', 'data.db'),
    uploadsDir: path.join(root, 'uploads'),
    imageLeaseMs: 10,
  })
  t.after(async () => {
    db.close()
    await rm(root, { recursive: true, force: true })
  })

  stmts.insertUser.run({ id: 'user-1', username: 'asset-owner', pw_hash: 'x', created_at: 1 })
  stmts.insertImage.run({
    id: 'image-1',
    user_id: 'user-1',
    path: '/uploads/image-1.png',
    mime: 'image/png',
    bytes: 64,
    created_at: 1,
    lease_expires_at: 11,
  })
  stmts.insertAsset.run(assetRow({ id: 'asset-1', image_path: '/uploads/image-1.png', bytes: undefined }))

  assert.deepEqual(stmts.listAssets.all('user-1').map((row) => [row.id, row.bytes]), [['asset-1', 64]])
  assert.equal(stmts.listAssets.all('user-2').length, 0)
  assert.equal(stmts.renameAsset.run('新名字', 'asset-1', 'user-2').changes, 0)
  assert.equal(stmts.renameAsset.run('新名字', 'asset-1', 'user-1').changes, 1)
  assert.equal(stmts.assetById.get('asset-1', 'user-1').name, '新名字')

  const removedFiles = []
  const reclaim = () => reclaimExpiredImages({
    listDraftDocuments: (userId) => stmts.listDraftDocuments.all(userId),
    listAssetPaths: (userId) => stmts.listAssetPaths.all(userId),
    listImages: (userId) => stmts.listImages.all(userId),
    removeFile: async (diskPath) => removedFiles.push(path.basename(diskPath)),
    deleteImage: (imageId, userId) => stmts.deleteImage.run(imageId, userId),
    uploadsDir: path.join(root, 'uploads'),
    uploadsPublicPath: '/uploads',
  }, 'user-1', 1_000)

  assert.deepEqual(await reclaim(), { reclaimedBytes: 0, aborted: false })
  assert.equal(stmts.listImages.all('user-1').length, 1)

  stmts.deleteAsset.run('asset-1', 'user-1')
  assert.deepEqual(await reclaim(), { reclaimedBytes: 64, aborted: false })
  assert.deepEqual(removedFiles, ['image-1.png'])
  assert.equal(stmts.listImages.all('user-1').length, 0)
})
