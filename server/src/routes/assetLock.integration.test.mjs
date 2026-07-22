import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import Fastify from 'fastify'

import { buildApp as buildServerApp } from '../app.js'
import { config } from '../config.js'
import { createUserAssetLock } from '../userAssetLock.js'
import draftRoutes from './drafts.js'
import imageRoutes from './images.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function authenticateAs(userId) {
  return async function authenticate(request) {
    request.user = { sub: userId }
  }
}

function draftStatements(overrides = {}) {
  return {
    listDrafts: { all: () => [] },
    draftById: { get: () => undefined },
    insertDraft: { run: () => ({ changes: 1 }) },
    updateDraft: { run: () => ({ changes: 1 }) },
    deleteDraft: { run: () => ({ changes: 1 }) },
    ...overrides,
  }
}

function imageStatements(overrides = {}) {
  return {
    imageByUserPath: { get: () => ({ id: 'image-1' }) },
    renewImageLeases: () => ({ changes: 1 }),
    userImageBytes: { get: () => ({ total: 0 }) },
    insertImage: { run: () => ({ changes: 1 }) },
    ...overrides,
  }
}

function serverStatements(overrides = {}) {
  return {
    insertUser: { run: () => ({ changes: 1 }) },
    userByName: { get: () => undefined },
    userById: { get: () => undefined },
    ...draftStatements(),
    ...imageStatements(),
    listDraftDocuments: { all: () => [] },
    listImages: { all: () => [] },
    deleteImage: { run: () => ({ changes: 1 }) },
    ...overrides,
  }
}

function jwtSignedWith(token, secret) {
  const [header, payload, signature] = token.split('.')
  if (!header || !payload || !signature) return false
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return signature === expected
}

async function buildApp({
  assetLock,
  draftsStmts,
  imagesStmts,
  now = () => 1_000,
  reclaimImages = async () => ({ reclaimedBytes: 0, aborted: false }),
}) {
  const app = Fastify()
  app.decorate('authenticate', authenticateAs('user-1'))
  await app.register(draftRoutes, {
    prefix: '/api/drafts',
    assetLock,
    stmts: draftsStmts,
    reclaimImages,
  })
  await app.register(imageRoutes, {
    prefix: '/api/images',
    assetLock,
    stmts: imagesStmts,
    config: {
      imageLeaseMs: 5_000,
      uploadsPublicPath: '/uploads',
      uploadsDir: 'C:\\tmp\\uploads',
      maxUploadBytes: 10_000,
      userQuotaBytes: 10_000,
    },
    now,
    reclaimImages,
  })
  await app.ready()
  return app
}

async function createStaticRoots(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dingcard-app-assembly-'))
  const webRoot = path.join(root, 'web')
  const uploadsDir = path.join(root, 'uploads')
  await Promise.all([mkdir(webRoot), mkdir(uploadsDir)])
  t.after(() => rm(root, { recursive: true, force: true }))
  return { webRoot, uploadsDir }
}

test('importing the app factory does not create default data or SQLite files', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'dingcard-app-import-'))
  t.after(() => rm(cwd, { recursive: true, force: true }))
  const appUrl = new URL('../app.js', import.meta.url).href
  const {
    DATA_DIR: _dataDir,
    DB_PATH: _dbPath,
    UPLOADS_DIR: _uploadsDir,
    ...baseEnvironment
  } = process.env

  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `await import(${JSON.stringify(appUrl)})`],
    {
      cwd,
      encoding: 'utf8',
      env: { ...baseEnvironment, NODE_ENV: 'development' },
    },
  )

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const entries = await readdir(cwd)
  assert.deepEqual(entries, [])
})

test('server app auth uses injected statements, JWT settings, and bcrypt cost', async (t) => {
  const { uploadsDir } = await createStaticRoots(t)
  const users = new Map()
  let insertedUser
  const fakeStmts = serverStatements({
    insertUser: {
      run(row) {
        insertedUser = row
        users.set(row.id, row)
        return { changes: 1 }
      },
    },
    userByName: {
      get(username) {
        return [...users.values()].find((row) => row.username.toLowerCase() === username.toLowerCase())
      },
    },
    userById: { get: (userId) => users.get(userId) },
  })
  const jwtSecret = 'injected-auth-secret'
  const username = `isolated-${process.pid}`
  const app = await buildServerApp({
    config: {
      ...config,
      bcryptCost: 4,
      jwtExpiry: '15m',
      jwtSecret,
      uploadsDir,
      webRoot: '',
      imageRuntime: false,
    },
    stmts: fakeStmts,
  })
  t.after(() => app.close())

  const registerResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password: 'secret' },
  })
  assert.equal(registerResponse.statusCode, 200)
  const registered = registerResponse.json()
  assert.equal(insertedUser?.username, username)
  assert.match(insertedUser?.pw_hash, /^\$2[aby]\$04\$/)
  assert.equal(jwtSignedWith(registered.token, jwtSecret), true)

  const meResponse = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { authorization: `Bearer ${registered.token}` },
  })
  assert.equal(meResponse.statusCode, 200)
  assert.deepEqual(meResponse.json(), { user: registered.user })
})

test('server entry catches and records strict image assembly failures', async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dingcard-index-failure-'))
  t.after(() => rm(dataDir, { recursive: true, force: true }))
  const indexPath = fileURLToPath(new URL('../index.js', import.meta.url))
  const result = spawnSync(process.execPath, [indexPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      DINGCARD_IMAGE: '1',
      JWT_SECRET: 'strict-startup-test-secret',
      NODE_ENV: 'production',
      WEB_ROOT: '',
    },
  })

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
  assert.match(`${result.stdout}\n${result.stderr}`, /Server startup failed/u)
  assert.match(`${result.stdout}\n${result.stderr}`, /Static site web root is required/u)
})

test('server app keeps API-only production-style assembly valid when WEB_ROOT is empty', async (t) => {
  const { uploadsDir } = await createStaticRoots(t)
  const app = await buildServerApp({
    config: { ...config, uploadsDir, webRoot: '', imageRuntime: false },
  })
  t.after(() => app.close())

  const healthResponse = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(healthResponse.statusCode, 200)
  assert.deepEqual(healthResponse.json(), { ok: true })

  const pageResponse = await app.inject({
    method: 'GET',
    url: '/editor/work',
    headers: { accept: 'text/html' },
  })
  assert.equal(pageResponse.statusCode, 404)
})

test('server app rejects image runtime startup when the web root is empty', async (t) => {
  const { uploadsDir } = await createStaticRoots(t)

  await assert.rejects(
    buildServerApp({
      config: { ...config, uploadsDir, webRoot: '', imageRuntime: true },
    }),
    { name: 'Error', message: 'Static site web root is required' },
  )
})

test('server app serves the SPA without shadowing APIs and caches uploads for 30 days', async (t) => {
  const { webRoot, uploadsDir } = await createStaticRoots(t)
  await Promise.all([
    writeFile(path.join(webRoot, 'index.html'), '<!doctype html><title>DingCard app</title>'),
    writeFile(path.join(uploadsDir, 'image.png'), 'uploaded-image'),
  ])
  const app = await buildServerApp({
    config: { ...config, uploadsDir, webRoot, imageRuntime: true },
  })
  t.after(() => app.close())

  const healthResponse = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(healthResponse.statusCode, 200)
  assert.deepEqual(healthResponse.json(), { ok: true })

  const pageResponse = await app.inject({
    method: 'GET',
    url: '/editor/work',
    headers: { accept: 'text/html' },
  })
  assert.equal(pageResponse.statusCode, 200)
  assert.match(pageResponse.body, /<title>DingCard app<\/title>/)

  const uploadResponse = await app.inject({ method: 'GET', url: '/uploads/image.png' })
  assert.equal(uploadResponse.statusCode, 200)
  assert.equal(uploadResponse.body, 'uploaded-image')
  assert.equal(uploadResponse.headers['cache-control'], 'public, max-age=2592000, immutable')

  for (const url of ['/api/missing', '/uploads/missing.png']) {
    const missingResponse = await app.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html' },
    })
    assert.equal(missingResponse.statusCode, 404, url)
    assert.doesNotMatch(missingResponse.body, /<title>DingCard app<\/title>/, url)
  }
})

test('draft mutation and image retain serialize through the injected shared user asset lock', async (t) => {
  const draftEntered = deferred()
  const releaseDraft = deferred()
  const events = []

  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements({
      insertDraft: {
        async run() {
          events.push('draft-db-enter')
          draftEntered.resolve()
          await releaseDraft.promise
          events.push('draft-db-exit')
          return { changes: 1 }
        },
      },
    }),
    imagesStmts: imageStatements({
      imageByUserPath: {
        get() {
          events.push('retain-db-validate')
          return { id: 'image-1' }
        },
      },
      renewImageLeases() {
        events.push('retain-db-renew')
        return { changes: 1 }
      },
    }),
  })
  t.after(() => app.close())

  const draftRequest = app.inject({
    method: 'POST',
    url: '/api/drafts',
    payload: { mode: 'markdown-card', document: { source: '# locked' } },
  })
  await Promise.race([
    draftEntered.promise,
    draftRequest.then((response) => {
      throw new Error(`draft mutation bypassed injected statements (${response.statusCode})`)
    }),
  ])

  const retainRequest = app.inject({
    method: 'POST',
    url: '/api/images/retain',
    headers: { host: 'api.test' },
    payload: { urls: ['/uploads/image.png'] },
  })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(events, ['draft-db-enter'])

  releaseDraft.resolve()
  const [draftResponse, retainResponse] = await Promise.all([draftRequest, retainRequest])

  assert.equal(draftResponse.statusCode, 200)
  assert.equal(retainResponse.statusCode, 200)
  assert.deepEqual(retainResponse.json(), { retained: 1 })
  assert.deepEqual(events, [
    'draft-db-enter',
    'draft-db-exit',
    'retain-db-validate',
    'retain-db-renew',
  ])
})

test('retain ignores external URLs, accepts only request-origin absolute URLs, and renews unique managed paths atomically', async (t) => {
  const validations = []
  const renewals = []
  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements(),
    imagesStmts: imageStatements({
      imageByUserPath: {
        get(userId, managedPath) {
          validations.push([userId, managedPath])
          return { id: managedPath }
        },
      },
      renewImageLeases(userId, managedPaths, leaseExpiresAt) {
        renewals.push([userId, managedPaths, leaseExpiresAt])
        return { changes: managedPaths.length }
      },
    }),
  })
  t.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/api/images/retain',
    headers: { host: 'api.test' },
    payload: {
      urls: [
        '/uploads/a.png',
        '/uploads/a.png?cache=1',
        'http://api.test/uploads/b.png',
        'https://api.test/uploads/not-the-request-origin.png',
        'https://cdn.example/uploads/external.png',
        'data:image/png;base64,AAAA',
      ],
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { retained: 2 })
  assert.deepEqual(validations, [
    ['user-1', '/uploads/a.png'],
    ['user-1', '/uploads/b.png'],
  ])
  assert.deepEqual(renewals, [
    ['user-1', ['/uploads/a.png', '/uploads/b.png'], 6_000],
  ])
})

test('retain validates protocol-relative URLs against the request origin', async (t) => {
  const validations = []
  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements(),
    imagesStmts: imageStatements({
      imageByUserPath: {
        get(userId, managedPath) {
          validations.push([userId, managedPath])
          return { id: managedPath }
        },
      },
      renewImageLeases(_userId, managedPaths) {
        return { changes: managedPaths.length }
      },
    }),
  })
  t.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/api/images/retain',
    headers: { host: 'api.test' },
    payload: {
      urls: [
        '/uploads/relative.png',
        '//api.test/uploads/same-origin.png',
        '//evil.test/uploads/external.png',
      ],
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { retained: 2 })
  assert.deepEqual(validations, [
    ['user-1', '/uploads/relative.png'],
    ['user-1', '/uploads/same-origin.png'],
  ])
})

test('retain uses the first forwarded protocol to reconstruct the public request origin', async (t) => {
  const validations = []
  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements(),
    imagesStmts: imageStatements({
      imageByUserPath: {
        get(userId, managedPath) {
          validations.push([userId, managedPath])
          return { id: managedPath }
        },
      },
      renewImageLeases(_userId, managedPaths) {
        return { changes: managedPaths.length }
      },
    }),
  })
  t.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/api/images/retain',
    headers: {
      host: 'api.test',
      'x-forwarded-proto': 'https, http',
    },
    payload: {
      urls: [
        'https://api.test/uploads/secure.png',
        'http://api.test/uploads/wrong.png',
      ],
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { retained: 1 })
  assert.deepEqual(validations, [['user-1', '/uploads/secure.png']])
})

test('retain preserves a non-default port from the request Host authority', async (t) => {
  const validations = []
  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements(),
    imagesStmts: imageStatements({
      imageByUserPath: {
        get(userId, managedPath) {
          validations.push([userId, managedPath])
          return { id: managedPath }
        },
      },
      renewImageLeases(_userId, managedPaths) {
        return { changes: managedPaths.length }
      },
    }),
  })
  t.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/api/images/retain',
    headers: { host: 'api.test:8080' },
    payload: {
      urls: [
        'http://api.test:8080/uploads/public-port.png',
        'http://api.test/uploads/default-port.png',
      ],
    },
  })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { retained: 1 })
  assert.deepEqual(validations, [['user-1', '/uploads/public-port.png']])
})

test('retain returns 409 without renewing any path when ownership validation fails', async (t) => {
  let renewals = 0
  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements(),
    imagesStmts: imageStatements({
      imageByUserPath: {
        get(_userId, managedPath) {
          return managedPath.endsWith('/owned.png') ? { id: 'owned' } : undefined
        },
      },
      renewImageLeases() {
        renewals += 1
        return { changes: 2 }
      },
    }),
  })
  t.after(() => app.close())

  const response = await app.inject({
    method: 'POST',
    url: '/api/images/retain',
    headers: { host: 'api.test' },
    payload: { urls: ['/uploads/owned.png', '/uploads/missing.png'] },
  })

  assert.equal(response.statusCode, 409)
  assert.equal(response.json().code, 'IMAGE_RETAIN_CONFLICT')
  assert.equal(renewals, 0)
})

test('draft delete stays idempotently successful after a post-delete GC failure', async (t) => {
  let deletes = 0
  let gcAttempts = 0
  const app = await buildApp({
    assetLock: createUserAssetLock(),
    draftsStmts: draftStatements({
      deleteDraft: {
        run() {
          deletes += 1
          return { changes: 1 }
        },
      },
    }),
    imagesStmts: imageStatements(),
    async reclaimImages() {
      gcAttempts += 1
      throw new Error('simulated GC failure after delete')
    },
  })
  t.after(() => app.close())

  const response = await app.inject({ method: 'DELETE', url: '/api/drafts/missing-is-fine' })

  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.equal(deletes, 1)
  assert.equal(gcAttempts, 1)
})

test('route plugins reject a missing or misnamed assetLock option', async () => {
  for (const routes of [draftRoutes, imageRoutes]) {
    const app = Fastify()
    app.decorate('authenticate', authenticateAs('user-1'))
    app.register(routes, { lock: createUserAssetLock() })
    await assert.rejects(app.ready(), {
      name: 'TypeError',
      message: 'options.assetLock.run must be a function',
    })
    await app.close()
  }
})
