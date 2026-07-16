import assert from 'node:assert/strict'
import test from 'node:test'

import { reclaimExpiredImages } from './imageGc.js'

function image(overrides = {}) {
  return {
    id: 'image-1',
    user_id: 'user-1',
    path: '/uploads/image-1.png',
    bytes: 12,
    lease_expires_at: 100,
    ...overrides,
  }
}

function createDeps(overrides = {}) {
  return {
    listDraftDocuments: async () => [],
    listImages: async () => [],
    removeFile: async () => undefined,
    deleteImage: async () => undefined,
    uploadsDir: 'C:\\data\\uploads',
    uploadsPublicPath: '/uploads',
    ...overrides,
  }
}

test('reclaimExpiredImages preserves expired images referenced by relative or absolute URLs', async () => {
  const removed = []
  const deleted = []
  const deps = createDeps({
    listDraftDocuments: async () => [
      { document: JSON.stringify({ cover: '/uploads/image-1.png' }) },
      JSON.stringify({ src: 'https://cdn.example/uploads/image-2.webp?size=2#preview' }),
    ],
    listImages: async () => [
      image(),
      image({ id: 'image-2', path: '/uploads/image-2.webp', bytes: 20 }),
    ],
    removeFile: async (diskPath) => removed.push(diskPath),
    deleteImage: async (...args) => deleted.push(args),
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: false,
  })
  assert.deepEqual(removed, [])
  assert.deepEqual(deleted, [])
})

test('reclaimExpiredImages preserves unreferenced images with a valid lease', async () => {
  let removals = 0
  const deps = createDeps({
    listImages: async () => [image({ lease_expires_at: 101 })],
    removeFile: async () => { removals += 1 },
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: false,
  })
  assert.equal(removals, 0)
})

test('reclaimExpiredImages never processes rows owned by another user', async () => {
  let removals = 0
  let deletions = 0
  const deps = createDeps({
    listImages: async () => [image({ user_id: 'user-2' })],
    removeFile: async () => { removals += 1 },
    deleteImage: async () => { deletions += 1 },
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: false,
  })
  assert.equal(removals, 0)
  assert.equal(deletions, 0)
})

test('reclaimExpiredImages removes an expired orphan and accumulates its bytes', async () => {
  const removed = []
  const deleted = []
  const deps = createDeps({
    listImages: async () => [image({ bytes: 25 })],
    removeFile: async (diskPath) => removed.push(diskPath),
    deleteImage: async (...args) => deleted.push(args),
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 25,
    aborted: false,
  })
  assert.deepEqual(removed, ['C:\\data\\uploads\\image-1.png'])
  assert.deepEqual(deleted, [['image-1', 'user-1']])
})

test('reclaimExpiredImages aborts conservatively before mutations when any draft JSON is corrupt', async () => {
  let removals = 0
  let deletions = 0
  const deps = createDeps({
    listDraftDocuments: async () => [
      { document: JSON.stringify({ src: '/uploads/other.png' }) },
      { document: '{broken' },
    ],
    listImages: async () => [image()],
    removeFile: async () => { removals += 1 },
    deleteImage: async () => { deletions += 1 },
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: true,
  })
  assert.equal(removals, 0)
  assert.equal(deletions, 0)
})

test('reclaimExpiredImages still aborts when the logger throws for corrupt JSON', async () => {
  const deps = createDeps({
    listDraftDocuments: async () => ['{broken'],
    logger: { error: () => { throw new Error('logger failed') } },
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: true,
  })
})

test('reclaimExpiredImages deletes the row when the file is already missing', async () => {
  const deleted = []
  const deps = createDeps({
    listImages: async () => [image({ bytes: 9 })],
    removeFile: async () => {
      const error = new Error('missing')
      error.code = 'ENOENT'
      throw error
    },
    deleteImage: async (...args) => deleted.push(args),
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 9,
    aborted: false,
  })
  assert.deepEqual(deleted, [['image-1', 'user-1']])
})

test('reclaimExpiredImages retains EACCES rows and continues reclaiming later candidates', async () => {
  const deleted = []
  const errors = []
  const deps = createDeps({
    listImages: async () => [
      image({ id: 'blocked', path: '/uploads/blocked.png', bytes: 7 }),
      image({ id: 'ok', path: '/uploads/ok.png', bytes: 11 }),
    ],
    removeFile: async (diskPath) => {
      if (diskPath.endsWith('blocked.png')) {
        const error = new Error('denied')
        error.code = 'EACCES'
        throw error
      }
    },
    deleteImage: async (...args) => deleted.push(args),
    logger: { error: (...args) => errors.push(args) },
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 11,
    aborted: false,
  })
  assert.deepEqual(deleted, [['ok', 'user-1']])
  assert.equal(errors.length, 1)
})

test('reclaimExpiredImages rethrows delete failures and succeeds on an ENOENT retry', async () => {
  const databaseError = new Error('database unavailable')
  let fileExists = true
  let deleteAttempts = 0
  const deps = createDeps({
    listImages: async () => [image({ bytes: 17 })],
    removeFile: async () => {
      if (!fileExists) {
        const error = new Error('missing')
        error.code = 'ENOENT'
        throw error
      }
      fileExists = false
    },
    deleteImage: async () => {
      deleteAttempts += 1
      if (deleteAttempts === 1) throw databaseError
    },
  })

  await assert.rejects(reclaimExpiredImages(deps, 'user-1', 100), (error) => error === databaseError)
  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 17,
    aborted: false,
  })
  assert.equal(deleteAttempts, 2)
})

test('reclaimExpiredImages retains invalid managed paths and logs them', async () => {
  let removals = 0
  let deletions = 0
  const errors = []
  const deps = createDeps({
    listImages: async () => [image({ path: '/uploads/../escape.png' })],
    removeFile: async () => { removals += 1 },
    deleteImage: async () => { deletions += 1 },
    logger: { error: (...args) => errors.push(args) },
  })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: false,
  })
  assert.equal(removals, 0)
  assert.equal(deletions, 0)
  assert.equal(errors.length, 1)
})

test('reclaimExpiredImages handles empty drafts and image lists', async () => {
  const deps = createDeps({ listDraftDocuments: async () => [{ document: '{}' }] })

  assert.deepEqual(await reclaimExpiredImages(deps, 'user-1', 100), {
    reclaimedBytes: 0,
    aborted: false,
  })
})

test('reclaimExpiredImages rejects invalid calls with stable errors', async () => {
  const deps = createDeps()

  await assert.rejects(reclaimExpiredImages(deps, '', 100), {
    name: 'TypeError',
    message: 'userId must be a non-empty string',
  })
  await assert.rejects(reclaimExpiredImages(deps, 'user-1', Number.NaN), {
    name: 'TypeError',
    message: 'now must be a finite number',
  })
  await assert.rejects(reclaimExpiredImages(null, 'user-1', 100), {
    name: 'TypeError',
    message: 'deps must be an object',
  })
  await assert.rejects(reclaimExpiredImages({ ...deps, removeFile: null }, 'user-1', 100), {
    name: 'TypeError',
    message: 'deps.removeFile must be a function',
  })
  await assert.rejects(reclaimExpiredImages({ ...deps, uploadsDir: '' }, 'user-1', 100), {
    name: 'TypeError',
    message: 'deps.uploadsDir must be a non-empty string',
  })
})
