import assert from 'node:assert/strict'
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
