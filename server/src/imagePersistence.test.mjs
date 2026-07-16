import assert from 'node:assert/strict'
import test from 'node:test'

import { persistImageFile } from './imagePersistence.js'

function imageRow(overrides = {}) {
  return {
    diskPath: 'C:\\data\\uploads\\image-1.png',
    id: 'image-1',
    user_id: 'user-1',
    path: '/uploads/image-1.png',
    mime: 'image/png',
    bytes: 3,
    created_at: 100,
    lease_expires_at: 200,
    ...overrides,
  }
}

function createDeps(overrides = {}) {
  return {
    writeFile: async () => undefined,
    insertImage: async () => undefined,
    removeFile: async () => undefined,
    ...overrides,
  }
}

test('persistImageFile writes bytes, inserts the database row, and returns the original row', async () => {
  const writes = []
  const inserts = []
  let cleanups = 0
  const row = imageRow()
  const bytes = Buffer.from('png')
  const deps = createDeps({
    writeFile: async (...args) => writes.push(args),
    insertImage: async (value) => inserts.push(value),
    removeFile: async () => { cleanups += 1 },
  })

  assert.equal(await persistImageFile(deps, row, bytes), row)
  assert.deepEqual(writes, [[row.diskPath, bytes]])
  assert.deepEqual(inserts, [{
    id: 'image-1',
    user_id: 'user-1',
    path: '/uploads/image-1.png',
    mime: 'image/png',
    bytes: 3,
    created_at: 100,
    lease_expires_at: 200,
  }])
  assert.equal(cleanups, 0)
})

test('persistImageFile rethrows write failures without inserting or cleaning up', async () => {
  const writeError = new Error('disk full')
  let inserts = 0
  let cleanups = 0
  const deps = createDeps({
    writeFile: async () => { throw writeError },
    insertImage: async () => { inserts += 1 },
    removeFile: async () => { cleanups += 1 },
  })

  await assert.rejects(persistImageFile(deps, imageRow(), Buffer.from('png')), (error) => error === writeError)
  assert.equal(inserts, 0)
  assert.equal(cleanups, 0)
})

test('persistImageFile removes an untracked file and rethrows the original insert failure', async () => {
  const insertError = new Error('constraint failed')
  const removed = []
  const row = imageRow()
  const deps = createDeps({
    insertImage: async () => { throw insertError },
    removeFile: async (diskPath) => removed.push(diskPath),
  })

  await assert.rejects(persistImageFile(deps, row, Buffer.from('png')), (error) => error === insertError)
  assert.deepEqual(removed, [row.diskPath])
})

test('persistImageFile logs cleanup failures without replacing the insert failure', async () => {
  const insertError = new Error('constraint failed')
  const cleanupError = new Error('permission denied')
  const logs = []
  const row = imageRow()
  const deps = createDeps({
    insertImage: async () => { throw insertError },
    removeFile: async () => { throw cleanupError },
    logger: { error: (...args) => logs.push(args) },
  })

  await assert.rejects(persistImageFile(deps, row, Buffer.from('png')), (error) => error === insertError)
  assert.deepEqual(logs, [[
    { err: cleanupError, path: row.diskPath },
    'failed to remove untracked upload',
  ]])
})

test('persistImageFile preserves the insert failure when cleanup logging also throws', async () => {
  const insertError = new Error('constraint failed')
  const deps = createDeps({
    insertImage: async () => { throw insertError },
    removeFile: async () => { throw new Error('permission denied') },
    logger: { error: () => { throw new Error('logger failed') } },
  })

  await assert.rejects(
    persistImageFile(deps, imageRow(), Buffer.from('png')),
    (error) => error === insertError,
  )
})

test('persistImageFile accepts an empty buffer with the same write and insert contract', async () => {
  const writes = []
  const row = imageRow({ bytes: 0 })
  const bytes = Buffer.alloc(0)
  const deps = createDeps({ writeFile: async (...args) => writes.push(args) })

  assert.equal(await persistImageFile(deps, row, bytes), row)
  assert.deepEqual(writes, [[row.diskPath, bytes]])
})

test('persistImageFile rejects invalid dependencies, rows, and byte values with stable errors', async () => {
  const deps = createDeps()

  await assert.rejects(persistImageFile(null, imageRow(), Buffer.alloc(0)), {
    name: 'TypeError',
    message: 'deps must be an object',
  })
  await assert.rejects(persistImageFile({ ...deps, insertImage: null }, imageRow(), Buffer.alloc(0)), {
    name: 'TypeError',
    message: 'deps.insertImage must be a function',
  })
  await assert.rejects(persistImageFile(deps, null, Buffer.alloc(0)), {
    name: 'TypeError',
    message: 'row must be an object',
  })
  await assert.rejects(persistImageFile(deps, imageRow({ diskPath: '' }), Buffer.alloc(0)), {
    name: 'TypeError',
    message: 'row.diskPath must be a non-empty string',
  })
  await assert.rejects(persistImageFile(deps, imageRow(), 'png'), {
    name: 'TypeError',
    message: 'bytes must be a Buffer or Uint8Array',
  })
})
