// Standalone smoke test for the backend. Boots the server in-process, then
// drives the full auth + drafts (both modes) + rejection paths over HTTP.
//
// Run with:  node smoke-test.mjs
// Uses a throwaway temp DATA_DIR so it never touches real data.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = mkdtempSync(path.join(tmpdir(), 'dinka-smoke-'))
const PORT = 3999
const base = `http://127.0.0.1:${PORT}`

const server = spawn(process.execPath, ['src/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    JWT_SECRET: 'smoke-test-secret-not-for-prod',
    DATA_DIR: dataDir,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    IMAGE_LEASE_MS: '60000',
    USER_QUOTA_BYTES: '1024',
    MAX_UPLOAD_BYTES: '1024',
    AUTH_RATE_LIMIT_MAX: '12',
    RATE_LIMIT_MAX: '300',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let failures = 0
let directDb
function check(name, cond, detail) {
  const mark = cond ? '✓' : '✗'
  if (!cond) failures++
  console.log(`  ${mark} ${name}${cond ? '' : '  <-- ' + JSON.stringify(detail)}`)
}

async function waitForHealth() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('server did not become healthy')
}

async function main() {
  await waitForHealth()

  // --- register ---
  let r = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'secret' }),
  })
  let body = await r.json()
  check('register returns user + token', r.ok && body.token && body.user?.id, body)
  const token = body.token
  const auth = { authorization: `Bearer ${token}` }

  // --- me ---
  r = await fetch(`${base}/api/auth/me`, { headers: auth })
  body = await r.json()
  check('me returns the user', r.ok && body.user?.username === 'alice', body)

  // --- dup register 409 ---
  r = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'secret' }),
  })
  check('duplicate register -> 409', r.status === 409, r.status)

  // --- login ---
  r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'secret' }),
  })
  check('login ok', r.ok, r.status)

  // --- wrong password ---
  r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'nope' }),
  })
  check('wrong password -> 401', r.status === 401, r.status)

  // --- save markdown-card draft ---
  const mdEnvelope = {
    mode: 'markdown-card',
    schemaVersion: 2,
    document: {
      source: '# 我的标题\n正文段落',
      platformId: 'weibo',
      themeId: 'light',
      fontFamily: 'PingFang SC',
      profile: { nickname: 'Shinve', verified: true },
      radius: 18,
      images: {},
    },
  }
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(mdEnvelope),
  })
  const mdDraft = await r.json()
  check(
    'save markdown draft (title derived from H1)',
    r.ok && mdDraft.mode === 'markdown-card' && mdDraft.title === '我的标题' && mdDraft.document.source.includes('正文'),
    mdDraft,
  )

  // --- save freeform-slide draft ---
  const ffEnvelope = {
    mode: 'freeform-slide',
    schemaVersion: 2,
    document: {
      documentVersion: 1,
      activeSlideId: 's1',
      slides: [
        {
          id: 's1',
          name: '封面页',
          width: 1080,
          height: 1440,
          background: { type: 'solid', color: '#ffffff' },
          elements: [
            { id: 'e1', type: 'text', x: 10, y: 10, width: 200, height: 40, rotation: 0, text: 'Hi' },
          ],
        },
      ],
    },
  }
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify(ffEnvelope),
  })
  const ffDraft = await r.json()
  check(
    'save freeform draft (title from first slide name)',
    r.ok && ffDraft.mode === 'freeform-slide' && ffDraft.title === '封面页' && ffDraft.document.slides.length === 1,
    ffDraft,
  )

  // --- list returns both, newest first ---
  r = await fetch(`${base}/api/drafts`, { headers: auth })
  const list = await r.json()
  check('list returns both drafts', r.ok && list.length === 2, list)
  check('list is newest-first (freeform saved last)', list[0].id === ffDraft.id, list.map((d) => d.mode))

  // --- update existing draft (same id) does not create a new one ---
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ ...mdEnvelope, id: mdDraft.id, title: '改过的标题' }),
  })
  const updated = await r.json()
  r = await fetch(`${base}/api/drafts`, { headers: auth })
  const list2 = await r.json()
  check('update keeps count at 2 + new title', list2.length === 2 && updated.title === '改过的标题', {
    count: list2.length,
    title: updated.title,
  })

  // --- unknown mode -> 400 ---
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({ mode: 'bogus', document: {} }),
  })
  check('unknown mode -> 400', r.status === 400, r.status)

  // --- drafts without token -> 401 ---
  r = await fetch(`${base}/api/drafts`)
  check('drafts without token -> 401', r.status === 401, r.status)

  // --- delete ---
  r = await fetch(`${base}/api/drafts/${ffDraft.id}`, { method: 'DELETE', headers: auth })
  check('delete ok', r.ok, r.status)
  r = await fetch(`${base}/api/drafts`, { headers: auth })
  const list3 = await r.json()
  check('after delete count is 1', list3.length === 1, list3.length)

  // --- cross-user isolation: bob can't see alice's drafts ---
  r = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'secret' }),
  })
  const bob = await r.json()
  const bobAuth = { authorization: `Bearer ${bob.token}` }
  r = await fetch(`${base}/api/drafts`, { headers: bobAuth })
  const bobList = await r.json()
  check('new user sees no drafts (isolation)', r.ok && bobList.length === 0, bobList)

  // --- cross-user updates are rejected and cannot clobber the owner ---
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bobAuth },
    body: JSON.stringify({ ...mdEnvelope, id: mdDraft.id, title: 'Bob must not overwrite Alice' }),
  })
  check("bob updating alice's draft -> 404", r.status === 404, r.status)

  r = await fetch(`${base}/api/drafts/${mdDraft.id}`, { headers: auth })
  const aliceDraftAfterBob = await r.json()
  check(
    "bob's rejected update leaves alice's title unchanged",
    r.ok && aliceDraftAfterBob.title === updated.title,
    aliceDraftAfterBob,
  )

  // --- supplied draft ids must be non-empty strings ---
  for (const invalidId of ['', '   ', 42, {}]) {
    r = await fetch(`${base}/api/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...bobAuth },
      body: JSON.stringify({ ...mdEnvelope, id: invalidId }),
    })
    check(`invalid draft id ${JSON.stringify(invalidId)} -> 400`, r.status === 400, r.status)
  }

  // --- a valid but missing id is an update miss, not an insert ---
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bobAuth },
    body: JSON.stringify({
      ...mdEnvelope,
      id: '00000000-0000-4000-8000-000000000000',
      title: 'Must not be inserted',
    }),
  })
  check('bob updating a missing draft -> 404', r.status === 404, r.status)

  r = await fetch(`${base}/api/drafts`, { headers: bobAuth })
  const bobListAfterRejectedUpdates = await r.json()
  check(
    'rejected updates leave bob draft list empty',
    r.ok && bobListAfterRejectedUpdates.length === 0,
    bobListAfterRejectedUpdates,
  )

  directDb = new Database(path.join(dataDir, 'data.db'))
  const alicePasswordHash = directDb
    .prepare('SELECT pw_hash FROM users WHERE username = ?')
    .pluck()
    .get('alice')
  check(
    'registered password is stored as a bcrypt hash',
    typeof alicePasswordHash === 'string'
      && /^\$2[aby]\$\d{2}\$/.test(alicePasswordHash)
      && alicePasswordHash !== 'secret',
    alicePasswordHash,
  )

  // --- leased image lifecycle: upload, static GET, retain, ownership isolation ---
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  )
  const invalidMime = await uploadImage(auth, Buffer.from('not an image'), 'note.txt', 'text/plain')
  check('non-image MIME upload -> 415', invalidMime.response.status === 415, invalidMime.body)

  const oversized = await uploadImage(auth, Buffer.alloc(1025, 1), 'oversized.png')
  check('single image over MAX_UPLOAD_BYTES -> 413', oversized.response.status === 413, oversized.body)

  let uploaded = await uploadImage(auth, tinyPng, '../../client-name.png')
  check('small PNG upload succeeds', uploaded.response.status === 200 && uploaded.body?.url, uploaded.body)
  const aliceImage = uploaded.body
  const aliceImageId = aliceImage.ref?.slice('img:'.length)
  const aliceImageFilename = path.basename(new URL(aliceImage.url, base).pathname)
  check(
    'upload uses a randomized server filename instead of the client path',
    /^[0-9a-f]{32}\.png$/.test(aliceImageFilename)
      && !aliceImageFilename.includes('client-name'),
    aliceImageFilename,
  )
  const aliceImageDiskPath = path.join(
    dataDir,
    'uploads',
    path.basename(new URL(aliceImage.url, base).pathname),
  )

  r = await fetch(`${base}${aliceImage.url}`)
  check('uploaded image URL is served by Fastify', r.status === 200, r.status)

  r = await fetch(`${base}/api/images/retain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({
      urls: [aliceImage.url, `${base}${aliceImage.url}`, 'https://cdn.example/external.png'],
    }),
  })
  body = await r.json()
  check('owner retain accepts relative/absolute and ignores external URLs', r.ok && body.retained === 1, body)
  const leaseAfterAliceRetain = directDb
    .prepare('SELECT lease_expires_at FROM images WHERE id = ?')
    .pluck()
    .get(aliceImageId)

  r = await fetch(`${base}/api/images/retain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...bobAuth },
    body: JSON.stringify({ urls: [`${base}${aliceImage.url}`] }),
  })
  check("bob retaining alice's image -> 409", r.status === 409, r.status)
  const leaseAfterBobRetain = directDb
    .prepare('SELECT lease_expires_at FROM images WHERE id = ?')
    .pluck()
    .get(aliceImageId)
  check(
    "bob's rejected retain does not partially renew alice's lease",
    leaseAfterBobRetain === leaseAfterAliceRetain,
    { leaseAfterAliceRetain, leaseAfterBobRetain },
  )

  // --- an expired image referenced by an absolute draft URL survives upload GC ---
  r = await fetch(`${base}/api/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: JSON.stringify({
      mode: 'markdown-card',
      document: {
        source: '# leased image',
        images: { hero: `${base}${aliceImage.url}` },
      },
    }),
  })
  const imageDraft = await r.json()
  check('draft with absolute managed image URL saves', r.ok && imageDraft.id, imageDraft)

  directDb
    .prepare('UPDATE images SET lease_expires_at = ? WHERE id = ?')
    .run(Date.now() - 1, aliceImageId)
  uploaded = await uploadImage(auth, tinyPng, 'gc-trigger.png')
  check('next upload succeeds after running GC', uploaded.response.status === 200, uploaded.body)
  check(
    'expired image referenced by an absolute draft URL survives GC',
    existsSync(aliceImageDiskPath)
      && directDb.prepare('SELECT COUNT(*) FROM images WHERE id = ?').pluck().get(aliceImageId) === 1,
    aliceImageDiskPath,
  )

  // --- deleting the final reference triggers GC inside the same user lock ---
  r = await fetch(`${base}/api/drafts/${imageDraft.id}`, { method: 'DELETE', headers: auth })
  body = await r.json()
  check('deleting image draft remains idempotent', r.ok && body.ok === true, body)
  check(
    'expired orphan is removed from SQLite and disk after draft deletion',
    !existsSync(aliceImageDiskPath)
      && directDb.prepare('SELECT COUNT(*) FROM images WHERE id = ?').pluck().get(aliceImageId) === 0,
    aliceImageDiskPath,
  )

  // --- same-user concurrent uploads cannot both pass a stale quota check ---
  r = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'charlie', password: 'secret' }),
  })
  const charlie = await r.json()
  const charlieAuth = { authorization: `Bearer ${charlie.token}` }
  const concurrentUploads = await Promise.all([
    uploadImage(charlieAuth, Buffer.alloc(700, 1), 'one.png'),
    uploadImage(charlieAuth, Buffer.alloc(700, 2), 'two.png'),
  ])
  const concurrentStatuses = concurrentUploads.map(({ response }) => response.status).sort()
  check(
    'two concurrent ~700B uploads under a 1024B quota yield exactly one 200 and one 413',
    JSON.stringify(concurrentStatuses) === JSON.stringify([200, 413]),
    concurrentStatuses,
  )

  r = await fetch(`${base}${uploaded.body.url}`)
  check('alice existing small-image flow still serves the surviving upload', r.status === 200, r.status)

  let registerRateLimited = false
  let registerRateLimitDetail = null
  for (let i = 0; i < 12; i++) {
    r = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `rate-limit-${i}`, password: 'secret' }),
    })
    if (r.status === 429) {
      const limit = r.headers.get('x-ratelimit-limit')
      registerRateLimited = limit === '12'
      registerRateLimitDetail = { status: r.status, limit }
      break
    }
  }
  check('registration route is rate limited by the auth limit -> 429', registerRateLimited, registerRateLimitDetail ?? r.status)
}

async function uploadImage(auth, bytes, filename = 'image.png', mime = 'image/png') {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), filename)
  const response = await fetch(`${base}/api/images`, {
    method: 'POST',
    headers: auth,
    body: form,
  })
  let body
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { response, body }
}

main()
  .catch((err) => {
    console.error('smoke test crashed:', err)
    failures++
  })
  .finally(async () => {
    directDb?.close()
    // Wait for the server process to fully exit before removing the temp dir.
    // On Windows the SQLite file handle lingers briefly after kill(), so an
    // immediate rmSync throws EPERM/EBUSY. Await 'exit', then retry the delete.
    await new Promise((resolve) => {
      server.once('exit', resolve)
      server.kill()
      setTimeout(resolve, 2000) // safety net if 'exit' never fires
    })
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(dataDir, { recursive: true, force: true })
        break
      } catch {
        await new Promise((r) => setTimeout(r, 100))
      }
    }
    console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
    process.exit(failures === 0 ? 0 : 1)
  })
