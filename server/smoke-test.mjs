// Standalone smoke test for the backend. Boots the server in-process, then
// drives the full auth + drafts (both modes) + rejection paths over HTTP.
//
// Run with:  node smoke-test.mjs
// Uses a throwaway temp DATA_DIR so it never touches real data.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let failures = 0
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
}

main()
  .catch((err) => {
    console.error('smoke test crashed:', err)
    failures++
  })
  .finally(async () => {
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
