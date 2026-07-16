import assert from 'node:assert/strict'
import test from 'node:test'

import { createUserAssetLock } from './userAssetLock.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('createUserAssetLock runs tasks for the same user strictly in sequence', async () => {
  const lock = createUserAssetLock()
  const gate = deferred()
  const events = []

  const first = lock.run('user-1', async () => {
    events.push('first:start')
    await gate.promise
    events.push('first:end')
  })
  const second = lock.run('user-1', async () => {
    events.push('second:start')
  })

  await Promise.resolve()
  assert.deepEqual(events, ['first:start'])
  gate.resolve()
  await Promise.all([first, second])
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start'])
})

test('createUserAssetLock allows tasks for different users to overlap', async () => {
  const lock = createUserAssetLock()
  const gate = deferred()
  const events = []

  const first = lock.run('user-1', async () => {
    events.push('user-1:start')
    await gate.promise
  })
  const second = lock.run('user-2', async () => {
    events.push('user-2:start')
  })

  await second
  assert.deepEqual(events, ['user-1:start', 'user-2:start'])
  gate.resolve()
  await first
})

test('createUserAssetLock continues a user queue after a rejected task', async () => {
  const lock = createUserAssetLock()
  const events = []

  const failed = lock.run('user-1', async () => {
    events.push('failed')
    throw new Error('boom')
  })
  const continued = lock.run('user-1', async () => {
    events.push('continued')
    return 'ok'
  })

  await assert.rejects(failed, /boom/)
  assert.equal(await continued, 'ok')
  assert.deepEqual(events, ['failed', 'continued'])
})

test('createUserAssetLock removes completed user queues', async () => {
  const lock = createUserAssetLock()

  assert.equal(await lock.run('user-1', async () => 'first'), 'first')
  assert.equal(lock.size, 0)
  assert.equal(await lock.run('user-1', async () => 'again'), 'again')
  assert.equal(lock.size, 0)
})

test('createUserAssetLock rejects invalid calls without retaining a user queue', async () => {
  const lock = createUserAssetLock()

  await assert.rejects(
    lock.run('', async () => undefined),
    { name: 'TypeError', message: 'userId must be a non-empty string' },
  )
  await assert.rejects(
    lock.run('user-1', null),
    { name: 'TypeError', message: 'task must be a function' },
  )
  assert.equal(lock.size, 0)
})
