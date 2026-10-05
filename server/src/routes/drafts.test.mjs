// Draft route coverage, focused on version history: snapshots are taken as a
// draft is updated (one per interval, newest kept), listed, read back whole,
// and restored over the current content.

import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import { createUserAssetLock } from '../userAssetLock.js'
import draftRoutes from './drafts.js'

/** In-memory drafts + versions, keyed like the SQLite statements the route uses. */
function draftStatements() {
  const drafts = new Map()
  const versions = new Map()
  return {
    drafts,
    versions,
    listDrafts: { all: (userId) => [...drafts.values()].filter((row) => row.user_id === userId) },
    draftById: { get: (id, userId) => drafts.get(id)?.user_id === userId ? drafts.get(id) : undefined },
    insertDraft: { run: (row) => { drafts.set(row.id, row); return { changes: 1 } } },
    updateDraft: { run: (row) => {
      if (!drafts.has(row.id) || drafts.get(row.id).user_id !== row.user_id) return { changes: 0 }
      drafts.set(row.id, row)
      return { changes: 1 }
    } },
    deleteDraft: { run: (id, userId) => {
      const had = drafts.get(id)?.user_id === userId
      drafts.delete(id)
      return { changes: had ? 1 : 0 }
    } },
    insertDraftVersion: { run: (row) => { versions.set(row.id, row); return { changes: 1 } } },
    listDraftVersions: { all: (draftId, userId) => [...versions.values()]
      .filter((row) => row.draft_id === draftId && row.user_id === userId)
      .sort((a, b) => b.created_at - a.created_at) },
    draftVersionById: { get: (id, draftId, userId) => {
      const row = versions.get(id)
      return row && row.draft_id === draftId && row.user_id === userId ? row : undefined
    } },
    latestDraftVersionAt: { get: (draftId, userId) => [...versions.values()]
      .filter((row) => row.draft_id === draftId && row.user_id === userId)
      .sort((a, b) => b.created_at - a.created_at)[0] },
    pruneDraftVersions: { run: (draftId, userId, _draftId2, _userId2, keep) => {
      const rows = [...versions.values()]
        .filter((row) => row.draft_id === draftId && row.user_id === userId)
        .sort((a, b) => b.created_at - a.created_at)
      for (const row of rows.slice(keep)) versions.delete(row.id)
      return { changes: 0 }
    } },
    deleteDraftVersions: { run: (draftId, userId) => {
      for (const [id, row] of versions) {
        if (row.draft_id === draftId && row.user_id === userId) versions.delete(id)
      }
    } },
  }
}

async function buildApp(t, { stmts = draftStatements(), now = (() => 1_000), userId = 'user-1' } = {}) {
  const app = Fastify()
  app.decorate('authenticate', async (request) => {
    request.user = { sub: userId }
  })
  await app.register(draftRoutes, {
    prefix: '/api/drafts',
    assetLock: createUserAssetLock(),
    stmts,
    reclaimImages: async () => ({ reclaimedBytes: 0, aborted: false }),
    now,
  })
  await app.ready()
  t.after(() => app.close())
  return { app, stmts }
}

const markdownDocument = (text) => ({ source: `# ${text}` })

test('updating a draft snapshots the previous content at most once per interval', async (t) => {
  let at = 1_000_000
  const { app, stmts } = await buildApp(t, { now: () => at })

  const created = await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { mode: 'markdown-card', document: markdownDocument('第一版') },
  })
  const draftId = created.json().id
  assert.equal(stmts.versions.size, 0, 'a new draft has no versions')

  // First update: nothing snapshotted yet, so the old content is frozen.
  at += 1_000
  const first = await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { id: draftId, mode: 'markdown-card', document: markdownDocument('第二版') },
  })
  assert.equal(first.statusCode, 200)
  assert.equal(stmts.versions.size, 1)
  const [version] = [...stmts.versions.values()]
  assert.equal(JSON.parse(version.document).source, '# 第一版')
  assert.equal(version.created_at, 1_000_000, 'the version carries the old content\'s own time')

  // Updates inside the interval do not snapshot again.
  at += 60_000
  await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { id: draftId, mode: 'markdown-card', document: markdownDocument('第三版') },
  })
  assert.equal(stmts.versions.size, 1)

  // After the interval passes, the next update snapshots again.
  at += 11 * 60_000
  await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { id: draftId, mode: 'markdown-card', document: markdownDocument('第四版') },
  })
  assert.equal(stmts.versions.size, 2)
  assert.deepEqual(
    [...stmts.versions.values()].map((row) => JSON.parse(row.document).source).sort(),
    ['# 第一版', '# 第三版'],
  )
})

test('versions are listed as metadata and read back whole', async (t) => {
  let at = 1_000_000
  const { app, stmts } = await buildApp(t, { now: () => at })
  const created = await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { mode: 'markdown-card', document: markdownDocument('起点') },
  })
  const draftId = created.json().id
  at += 20 * 60_000
  await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { id: draftId, mode: 'markdown-card', title: '有名字了', document: markdownDocument('第二版') },
  })

  const list = await app.inject({ method: 'GET', url: `/api/drafts/${draftId}/versions` })
  assert.equal(list.statusCode, 200)
  const [entry] = list.json()
  assert.equal(entry.title, '起点')
  assert.equal(entry.mode, 'markdown-card')
  assert.ok(!('document' in entry), 'the list stays metadata-only')

  const whole = await app.inject({ method: 'GET', url: `/api/drafts/${draftId}/versions/${entry.id}` })
  assert.equal(whole.statusCode, 200)
  assert.deepEqual(whole.json().document, markdownDocument('起点'))
  assert.equal(whole.json().createdAt, entry.createdAt)

  // Unknown draft or version answers 404, without leaking anything.
  assert.equal((await app.inject({ method: 'GET', url: `/api/drafts/none/versions` })).statusCode, 404)
  assert.equal((await app.inject({ method: 'GET', url: `/api/drafts/${draftId}/versions/none` })).statusCode, 404)
})

test('restore writes a version back as the current draft', async (t) => {
  let at = 1_000_000
  const { app, stmts } = await buildApp(t, { now: () => at })
  const created = await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { mode: 'markdown-card', document: markdownDocument('好的版本') },
  })
  const draftId = created.json().id
  at += 20 * 60_000
  await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { id: draftId, mode: 'markdown-card', document: markdownDocument('改坏了') },
  })
  const versionId = [...stmts.versions.values()][0].id

  at += 20 * 60_000
  const restored = await app.inject({
    method: 'POST', url: `/api/drafts/${draftId}/versions/${versionId}/restore`,
  })
  assert.equal(restored.statusCode, 200)
  assert.deepEqual(restored.json().document, markdownDocument('好的版本'))
  assert.equal(restored.json().id, draftId)

  // The overwritten content became a version too.
  assert.equal(stmts.versions.size, 2)
  assert.deepEqual(
    [...stmts.versions.values()].map((row) => JSON.parse(row.document).source).sort(),
    ['# 好的版本', '# 改坏了'],
  )

  // A missing version answers 404.
  assert.equal((await app.inject({
    method: 'POST', url: `/api/drafts/${draftId}/versions/none/restore`,
  })).statusCode, 404)
})

test('deleting a draft removes its versions', async (t) => {
  let at = 1_000_000
  const { app, stmts } = await buildApp(t, { now: () => at })
  const created = await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { mode: 'markdown-card', document: markdownDocument('起点') },
  })
  const draftId = created.json().id
  at += 20 * 60_000
  await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { id: draftId, mode: 'markdown-card', document: markdownDocument('第二版') },
  })
  assert.equal(stmts.versions.size, 1)

  const removed = await app.inject({ method: 'DELETE', url: `/api/drafts/${draftId}` })
  assert.equal(removed.statusCode, 200)
  assert.equal(stmts.versions.size, 0)
})

test('only the newest versions are kept', async (t) => {
  let at = 1_000_000
  const { app, stmts } = await buildApp(t, { now: () => at })
  const created = await app.inject({
    method: 'POST', url: '/api/drafts',
    payload: { mode: 'markdown-card', document: markdownDocument('v0') },
  })
  const draftId = created.json().id
  // Each update is a full interval apart, so every one snapshots.
  for (let step = 1; step <= 35; step++) {
    at += 11 * 60_000
    await app.inject({
      method: 'POST', url: '/api/drafts',
      payload: { id: draftId, mode: 'markdown-card', document: markdownDocument(`v${step}`) },
    })
  }
  assert.equal(stmts.versions.size, 30, 'the newest 30 survive')
  const oldest = Math.min(...[...stmts.versions.values()].map((row) => row.created_at))
  // v5's content time is the 6th snapshot; v1..v4 were pruned.
  const sources = [...stmts.versions.values()].map((row) => JSON.parse(row.document).source)
  assert.ok(!sources.includes('# v1'))
  assert.ok(!sources.includes('# v4'))
  assert.ok(sources.includes('# v5'))
  assert.ok(sources.includes('# v34'))
  void oldest
})
