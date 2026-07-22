import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import Fastify from 'fastify'

import { registerStaticSite } from './staticSite.js'

const INDEX_HTML = '<!doctype html><title>DingCard test app</title>'
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
const APP_JS = 'globalThis.__dingcardTest = true\n'

async function createWebRoot() {
  const webRoot = await mkdtemp(path.join(tmpdir(), 'dingcard-static-site-'))
  await mkdir(path.join(webRoot, 'assets'))
  await Promise.all([
    writeFile(path.join(webRoot, 'index.html'), INDEX_HTML),
    writeFile(path.join(webRoot, 'favicon.svg'), FAVICON_SVG),
    writeFile(path.join(webRoot, 'assets', 'app-hash.js'), APP_JS),
    writeFile(path.join(webRoot, '.env'), 'SECRET=must-not-be-served\n'),
  ])
  return webRoot
}

async function createStaticApp(t, webRoot, overrides = {}) {
  const app = Fastify()
  t.after(() => app.close())
  await registerStaticSite(app, {
    webRoot,
    uploadsPublicPath: '/uploads',
    required: true,
    ...overrides,
  })
  return app
}

test('serves the entry page and public files without long-lived caching', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  const rootResponse = await app.inject({ method: 'GET', url: '/' })
  assert.equal(rootResponse.statusCode, 200)
  assert.equal(rootResponse.body, INDEX_HTML)
  assert.equal(rootResponse.headers['cache-control'], 'no-cache')

  const faviconResponse = await app.inject({ method: 'GET', url: '/favicon.svg' })
  assert.equal(faviconResponse.statusCode, 200)
  assert.equal(faviconResponse.body, FAVICON_SVG)
  assert.equal(faviconResponse.headers['cache-control'], 'no-cache')
})

test('serves hashed assets with immutable one-year caching', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  const response = await app.inject({ method: 'GET', url: '/assets/app-hash.js' })

  assert.equal(response.statusCode, 200)
  assert.equal(response.body, APP_JS)
  assert.equal(response.headers['cache-control'], 'public, max-age=31536000, immutable')
})

test('falls back to index.html for GET and HEAD HTML navigation requests', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  const getResponse = await app.inject({
    method: 'GET',
    url: '/editor/work',
    headers: { accept: 'text/html,application/xhtml+xml' },
  })
  assert.equal(getResponse.statusCode, 200)
  assert.equal(getResponse.body, INDEX_HTML)
  assert.equal(getResponse.headers['cache-control'], 'no-cache')

  const headResponse = await app.inject({
    method: 'HEAD',
    url: '/editor/work',
    headers: { accept: 'text/html' },
  })
  assert.equal(headResponse.statusCode, 200)
  assert.equal(headResponse.body, '')
  assert.equal(headResponse.headers['cache-control'], 'no-cache')
})

test('does not apply the SPA fallback to API or default upload paths', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  for (const url of ['/api', '/api/', '/api/x', '/uploads', '/uploads/', '/uploads/x']) {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html' },
    })
    assert.equal(response.statusCode, 404, url)
  }
})

test('does not serve files from protected API or upload directories', async (t) => {
  const webRoot = await createWebRoot()
  await Promise.all([
    mkdir(path.join(webRoot, 'api')),
    mkdir(path.join(webRoot, 'uploads')),
    mkdir(path.join(webRoot, 'media')),
  ])
  await Promise.all([
    writeFile(path.join(webRoot, 'api', 'leak.txt'), 'api secret'),
    writeFile(path.join(webRoot, 'uploads', 'leak.txt'), 'upload secret'),
    writeFile(path.join(webRoot, 'media', 'leak.txt'), 'media secret'),
  ])
  t.after(() => rm(webRoot, { recursive: true, force: true }))

  const defaultApp = await createStaticApp(t, webRoot)
  for (const url of ['/api/leak.txt', '/uploads/leak.txt']) {
    const response = await defaultApp.inject({ method: 'GET', url })
    assert.equal(response.statusCode, 404, url)
    assert.doesNotMatch(response.body, /secret/u, url)
  }

  const customApp = await createStaticApp(t, webRoot, { uploadsPublicPath: '/media' })
  const customResponse = await customApp.inject({ method: 'GET', url: '/media/leak.txt' })
  assert.equal(customResponse.statusCode, 404)
  assert.doesNotMatch(customResponse.body, /secret/u)
})

test('uses the configured upload prefix as an exact SPA fallback boundary', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot, { uploadsPublicPath: '/media/' })

  for (const url of ['/media', '/media/', '/media/x']) {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html' },
    })
    assert.equal(response.statusCode, 404, url)
  }

  for (const url of ['/apiary', '/media-library']) {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html' },
    })
    assert.equal(response.statusCode, 200, url)
    assert.equal(response.body, INDEX_HTML, url)
  }
})

test('normalizes encoded and repeated-leading-slash protected paths before SPA fallback', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  for (const url of ['/api%2Fx', '/uploads%2Fx', '//api/x']) {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html' },
    })
    assert.equal(response.statusCode, 404, url)
  }
})

test('leaves malformed encoded paths to Fastify bad-URL handling', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  const response = await app.inject({
    method: 'GET',
    url: '/editor/%E0%A4%A',
    headers: { accept: 'text/html' },
  })

  assert.equal(response.statusCode, 400)
  assert.equal(response.json().code, 'FST_ERR_BAD_URL')
  assert.notEqual(response.body, INDEX_HTML)
})

test('does not expose dotfiles from the web root', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  const response = await app.inject({ method: 'GET', url: '/.env' })

  assert.notEqual(response.statusCode, 200)
  assert.doesNotMatch(response.body, /SECRET=must-not-be-served/u)
})

test('returns a finite 404 or 500 when the fallback index disappears at runtime', () => {
  const staticSiteUrl = new URL('./staticSite.js', import.meta.url).href
  const script = `
    import Fastify from 'fastify'
    import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
    import { tmpdir } from 'node:os'
    import path from 'node:path'
    import { registerStaticSite } from ${JSON.stringify(staticSiteUrl)}

    const webRoot = await mkdtemp(path.join(tmpdir(), 'dingcard-static-runtime-index-'))
    const app = Fastify()
    try {
      await mkdir(path.join(webRoot, 'assets'))
      await writeFile(path.join(webRoot, 'index.html'), '<title>runtime test</title>')
      await registerStaticSite(app, { webRoot, required: true })
      await rm(path.join(webRoot, 'index.html'))
      const response = await app.inject({
        method: 'GET',
        url: '/editor/work',
        headers: { accept: 'text/html' },
      })
      if (![404, 500].includes(response.statusCode)) {
        throw new Error('unexpected status ' + response.statusCode)
      }
    } finally {
      await app.close()
      await rm(webRoot, { recursive: true, force: true })
    }
  `

  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', script],
    { encoding: 'utf8', timeout: 2_000 },
  )

  assert.notEqual(result.error?.code, 'ETIMEDOUT', 'request must not recurse through notFound')
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})

test('keeps non-navigation requests as 404 responses', async (t) => {
  const webRoot = await createWebRoot()
  t.after(() => rm(webRoot, { recursive: true, force: true }))
  const app = await createStaticApp(t, webRoot)

  const requests = [
    { method: 'POST', url: '/editor/work', headers: { accept: 'text/html' } },
    { method: 'GET', url: '/editor/work', headers: { accept: 'application/json' } },
    { method: 'GET', url: '/editor/work' },
  ]

  for (const request of requests) {
    const response = await app.inject(request)
    assert.equal(response.statusCode, 404, `${request.method} ${request.headers?.accept ?? 'no Accept'}`)
  }
})

test('required static sites reject empty roots with a stable error', async () => {
  for (const webRoot of [undefined, null, '', '   ']) {
    const app = Fastify()
    await assert.rejects(
      registerStaticSite(app, { webRoot, required: true }),
      { name: 'Error', message: 'Static site web root is required' },
    )
    await app.close()
  }
})

test('required static sites reject missing and non-directory roots with a stable error', async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), 'dingcard-static-validation-'))
  t.after(() => rm(parent, { recursive: true, force: true }))
  const missingRoot = path.join(parent, 'missing')
  const fileRoot = path.join(parent, 'root.txt')
  await writeFile(fileRoot, 'not a directory')

  for (const webRoot of [missingRoot, fileRoot]) {
    const app = Fastify()
    await assert.rejects(
      registerStaticSite(app, { webRoot, required: true }),
      {
        name: 'Error',
        message: `Static site web root is not a readable directory: ${path.resolve(webRoot)}`,
      },
    )
    await app.close()
  }
})

test('required static sites reject missing and non-file indexes with a stable error', async (t) => {
  const missingIndexRoot = await mkdtemp(path.join(tmpdir(), 'dingcard-static-missing-index-'))
  const directoryIndexRoot = await mkdtemp(path.join(tmpdir(), 'dingcard-static-directory-index-'))
  await mkdir(path.join(directoryIndexRoot, 'index.html'))
  t.after(() => Promise.all([
    rm(missingIndexRoot, { recursive: true, force: true }),
    rm(directoryIndexRoot, { recursive: true, force: true }),
  ]))

  for (const webRoot of [missingIndexRoot, directoryIndexRoot]) {
    const app = Fastify()
    await assert.rejects(
      registerStaticSite(app, { webRoot, required: true }),
      {
        name: 'Error',
        message: `Static site index is not a readable file: ${path.join(path.resolve(webRoot), 'index.html')}`,
      },
    )
    await app.close()
  }
})

test('an optional empty root leaves an API-only Fastify app usable', async (t) => {
  const app = Fastify()
  t.after(() => app.close())
  app.get('/api/health', async () => ({ ok: true }))

  await registerStaticSite(app, { webRoot: '', required: false })

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
