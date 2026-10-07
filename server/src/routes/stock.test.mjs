// Stock library proxy contract: keys stay server-side, the import route only
// downloads URLs it resolved itself through the provider API, and imported
// bytes go through the same quota/persist pipeline as direct uploads.

import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import stockRoutes from './stock.js'

const USER = { sub: 'user-1' }
const OPENVERSE_ID = '12345678-1234-1234-1234-123456789012'
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const BASE_CONFIG = {
  pixabayKey: '',
  unsplashKey: '',
  pexelsKey: '',
  imageLeaseMs: 5_000,
  uploadsPublicPath: '/uploads',
  uploadsDir: '/tmp/dingcard-stock-test-uploads',
  maxUploadBytes: 1_000,
  userQuotaBytes: 1_000,
}

function authenticateAs(user) {
  return async function authenticate(request) {
    request.user = user
  }
}

function imageStatements(overrides = {}) {
  return {
    userImageBytes: { get: () => ({ total: 0 }) },
    insertImage: { run: () => ({ changes: 1 }) },
    ...overrides,
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function recordingFetch(handler) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init, calls.length - 1)
  }
  fn.calls = calls
  return fn
}

async function buildApp({
  config = BASE_CONFIG,
  stmts = imageStatements(),
  fetch: fetchStub,
  user = USER,
  persistCalls = [],
} = {}) {
  const app = Fastify()
  app.decorate('authenticate', authenticateAs(user))
  await app.register(stockRoutes, {
    prefix: '/api/stock',
    assetLock: { run: (_userId, run) => run() },
    reclaimImages: async () => {},
    config,
    stmts,
    now: () => 1_000,
    fetch: fetchStub ?? (async () => jsonResponse({})),
    searchTimeoutMs: 50,
    downloadTimeoutMs: 50,
    writeFile: async () => {},
    removeFile: async () => {},
    persistImageFile: async (_deps, row, bytes) => {
      persistCalls.push({ row, bytes })
      return row
    },
  })
  await app.ready()
  return app
}

test('stock sources degrade to openverse when no keys are configured', async () => {
  const app = await buildApp()
  const response = await app.inject({ method: 'GET', url: '/api/stock/sources' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    sources: [
      { id: 'pixabay', label: 'Pixabay', available: false },
      { id: 'unsplash', label: 'Unsplash', available: false },
      { id: 'pexels', label: 'Pexels', available: false },
      { id: 'openverse', label: 'Openverse', available: true },
    ],
    preferred: 'openverse',
  })
})

test('stock sources prefer the first configured key', async () => {
  const app = await buildApp({ config: { ...BASE_CONFIG, pixabayKey: 'pk' } })
  const response = await app.inject({ method: 'GET', url: '/api/stock/sources' })
  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.preferred, 'pixabay')
  assert.equal(body.sources.find((source) => source.id === 'pixabay').available, true)
  assert.equal(body.sources.find((source) => source.id === 'openverse').available, true)
})

test('stock search proxies openverse keyless with the cc0 license filter', async () => {
  const fetchStub = recordingFetch(() => jsonResponse({
    result_count: 42,
    results: [
      { id: 'aaaa-bbbb-cccc-dddd', thumbnail: 'https://thumb/1.jpg', width: 800, height: 600, creator: 'Ann' },
      { id: 'eeee-ffff-0000-1111', url: 'https://source/2.jpg', width: 640, height: 480 },
      { id: '', thumbnail: 'https://thumb/3.jpg' },
      { id: 'bad id!', thumbnail: 'https://thumb/4.jpg' },
    ],
  }))
  const app = await buildApp({ fetch: fetchStub })
  const response = await app.inject({ method: 'GET', url: '/api/stock/search?q=%E5%B1%B1&page=2' })
  assert.equal(response.statusCode, 200)

  const url = new URL(fetchStub.calls[0].url)
  assert.equal(url.host, 'api.openverse.org')
  assert.equal(url.pathname, '/v1/images/')
  assert.equal(url.searchParams.get('q'), '山')
  assert.equal(url.searchParams.get('license'), 'cc0,pdm')
  assert.equal(url.searchParams.get('extension'), 'jpg,png')
  assert.equal(url.searchParams.get('page'), '2')

  assert.deepEqual(response.json(), {
    source: 'openverse',
    page: 2,
    total: 42,
    results: [
      { id: 'aaaa-bbbb-cccc-dddd', thumb: 'https://thumb/1.jpg', width: 800, height: 600, author: 'Ann' },
      { id: 'eeee-ffff-0000-1111', thumb: 'https://source/2.jpg', width: 640, height: 480, author: '' },
    ],
  })
})

test('stock search proxies pixabay with the server-side key and clamps pages', async () => {
  const fetchStub = recordingFetch(() => jsonResponse({
    total: 7,
    hits: [
      { id: 195893, webformatURL: 'https://cdn/p.jpg', webformatWidth: 640, webformatHeight: 426, user: 'bob' },
      { id: 'not-numeric', webformatURL: 'https://cdn/p2.jpg' },
    ],
  }))
  const app = await buildApp({ config: { ...BASE_CONFIG, pixabayKey: 'pk' }, fetch: fetchStub })
  const response = await app.inject({ method: 'GET', url: '/api/stock/search?q=forest&source=pixabay&page=999' })
  assert.equal(response.statusCode, 200)

  const url = new URL(fetchStub.calls[0].url)
  assert.equal(url.host, 'pixabay.com')
  assert.equal(url.searchParams.get('key'), 'pk')
  assert.equal(url.searchParams.get('q'), 'forest')
  assert.equal(url.searchParams.get('page'), '50')

  const body = response.json()
  assert.equal(body.source, 'pixabay')
  assert.deepEqual(body.results, [
    { id: '195893', thumb: 'https://cdn/p.jpg', width: 640, height: 426, author: 'bob' },
  ])
})

test('stock search sends the pexels key as an authorization header', async () => {
  const fetchStub = recordingFetch(() => jsonResponse({
    total_results: 1,
    photos: [
      { id: 123, src: { medium: 'https://p/1.jpg' }, width: 1000, height: 700, photographer: 'Cara' },
    ],
  }))
  const app = await buildApp({ config: { ...BASE_CONFIG, pexelsKey: 'px' }, fetch: fetchStub })
  const response = await app.inject({ method: 'GET', url: '/api/stock/search?q=sea&source=pexels' })
  assert.equal(response.statusCode, 200)

  assert.equal(new URL(fetchStub.calls[0].url).host, 'api.pexels.com')
  assert.equal(fetchStub.calls[0].init.headers.authorization, 'px')
  assert.deepEqual(response.json().results, [
    { id: '123', thumb: 'https://p/1.jpg', width: 1000, height: 700, author: 'Cara' },
  ])
})

test('stock search falls back to the preferred source when source is omitted', async () => {
  const fetchStub = recordingFetch(() => jsonResponse({ total: 0, hits: [] }))
  const app = await buildApp({ config: { ...BASE_CONFIG, pixabayKey: 'pk' }, fetch: fetchStub })
  const response = await app.inject({ method: 'GET', url: '/api/stock/search?q=x' })
  assert.equal(response.statusCode, 200)
  assert.equal(new URL(fetchStub.calls[0].url).host, 'pixabay.com')
  assert.equal(response.json().source, 'pixabay')
})

test('stock search rejects unknown sources, unconfigured sources, and bad queries', async () => {
  const app = await buildApp()

  const unknown = await app.inject({ method: 'GET', url: '/api/stock/search?q=x&source=elsewhere' })
  assert.equal(unknown.statusCode, 400)
  assert.equal(unknown.json().code, 'STOCK_UNKNOWN_SOURCE')

  const unconfigured = await app.inject({ method: 'GET', url: '/api/stock/search?q=x&source=pixabay' })
  assert.equal(unconfigured.statusCode, 400)
  assert.equal(unconfigured.json().code, 'STOCK_SOURCE_UNCONFIGURED')

  const missing = await app.inject({ method: 'GET', url: '/api/stock/search' })
  assert.equal(missing.statusCode, 400)
  assert.equal(missing.json().code, 'STOCK_INVALID_QUERY')

  const tooLong = await app.inject({ method: 'GET', url: `/api/stock/search?q=${'a'.repeat(101)}` })
  assert.equal(tooLong.statusCode, 400)
  assert.equal(tooLong.json().code, 'STOCK_INVALID_QUERY')
})

test('stock search maps upstream failures to 502', async () => {
  const app = await buildApp({ fetch: async () => jsonResponse({}, 500) })
  const response = await app.inject({ method: 'GET', url: '/api/stock/search?q=x' })
  assert.equal(response.statusCode, 502)
  assert.equal(response.json().code, 'STOCK_UPSTREAM_ERROR')
})

test('stock import resolves the id server-side and persists through the upload pipeline', async () => {
  const persistCalls = []
  const fetchStub = recordingFetch((url) => {
    if (url.startsWith('https://api.unsplash.com/photos/')) {
      return jsonResponse({ urls: { regular: 'https://images.unsplash.com/photo-1?w=1080' }, user: { name: 'Ann' } })
    }
    return new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })
  })
  const app = await buildApp({ config: { ...BASE_CONFIG, unsplashKey: 'uk' }, fetch: fetchStub, persistCalls })

  const response = await app.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'unsplash', id: 'abc-123' },
  })
  assert.equal(response.statusCode, 200)

  const body = response.json()
  assert.match(body.ref, /^img:[0-9a-f]{32}$/)
  assert.equal(body.url, `/uploads/${body.ref.slice(4)}.png`)
  assert.equal(body.alt, 'Unsplash · Ann')

  assert.equal(fetchStub.calls.length, 2)
  const detail = new URL(fetchStub.calls[0].url)
  assert.equal(detail.host, 'api.unsplash.com')
  assert.equal(detail.pathname, '/photos/abc-123')
  assert.equal(detail.searchParams.get('client_id'), 'uk')
  assert.equal(fetchStub.calls[1].url, 'https://images.unsplash.com/photo-1?w=1080')

  assert.equal(persistCalls.length, 1)
  assert.equal(persistCalls[0].row.user_id, 'user-1')
  assert.equal(persistCalls[0].row.path, body.url)
  assert.equal(persistCalls[0].row.mime, 'image/png')
  assert.equal(persistCalls[0].row.bytes, PNG_BYTES.length)
  assert.equal(persistCalls[0].row.created_at, 1_000)
  assert.equal(persistCalls[0].row.lease_expires_at, 1_000 + BASE_CONFIG.imageLeaseMs)
  assert.deepEqual(persistCalls[0].bytes, Buffer.from(PNG_BYTES))
})

test('stock import normalizes image/jpg and keeps the pexels key in headers only', async () => {
  const persistCalls = []
  const fetchStub = recordingFetch((url) => {
    if (url.startsWith('https://api.pexels.com/v1/photos/')) {
      return jsonResponse({ src: { large2x: 'https://images.pexels.com/x.jpg' }, photographer: 'Cara' })
    }
    return new Response(PNG_BYTES, { headers: { 'content-type': 'image/jpg' } })
  })
  const app = await buildApp({ config: { ...BASE_CONFIG, pexelsKey: 'px' }, fetch: fetchStub, persistCalls })

  const response = await app.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'pexels', id: '4567' },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().alt, 'Pexels · Cara')
  assert.equal(persistCalls[0].row.mime, 'image/jpeg')
  assert.ok(persistCalls[0].row.path.endsWith('.jpg'))
  assert.equal(fetchStub.calls[0].init.headers.authorization, 'px')
})

test('stock import refuses client-sent URLs as ids', async () => {
  let called = false
  const fetchStub = async () => {
    called = true
    return jsonResponse({})
  }
  const app = await buildApp({ fetch: fetchStub })
  const response = await app.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: 'https://evil.example/x' },
  })
  assert.equal(response.statusCode, 400)
  assert.equal(response.json().code, 'STOCK_INVALID_ID')
  assert.equal(called, false)
})

test('stock import reports missing images and upstream failures distinctly', async () => {
  const notFoundApp = await buildApp({ fetch: async () => jsonResponse({}, 404) })
  const notFound = await notFoundApp.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: OPENVERSE_ID },
  })
  assert.equal(notFound.statusCode, 404)
  assert.equal(notFound.json().code, 'STOCK_IMAGE_NOT_FOUND')

  const upstreamApp = await buildApp({ fetch: async () => jsonResponse({}, 500) })
  const upstream = await upstreamApp.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: OPENVERSE_ID },
  })
  assert.equal(upstream.statusCode, 502)
  assert.equal(upstream.json().code, 'STOCK_UPSTREAM_ERROR')
})

test('stock import rejects unsupported content types', async () => {
  const fetchStub = recordingFetch((url) => {
    if (url.includes('/v1/images/')) return jsonResponse({ url: 'https://source/x.svg', creator: 'Ann' })
    return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })
  })
  const app = await buildApp({ fetch: fetchStub })
  const response = await app.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: OPENVERSE_ID },
  })
  assert.equal(response.statusCode, 415)
  assert.equal(response.json().code, 'STOCK_UNSUPPORTED_TYPE')
})

test('stock import rejects oversized downloads by declared and actual size', async () => {
  const big = new Uint8Array(BASE_CONFIG.maxUploadBytes + 1)

  const declaredApp = await buildApp({
    fetch: recordingFetch((url) => {
      if (url.includes('/v1/images/')) return jsonResponse({ url: 'https://source/big.png' })
      return new Response(big, {
        headers: { 'content-type': 'image/png', 'content-length': String(big.length) },
      })
    }),
  })
  const declared = await declaredApp.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: OPENVERSE_ID },
  })
  assert.equal(declared.statusCode, 413)
  assert.equal(declared.json().code, 'STOCK_IMAGE_TOO_LARGE')

  const bufferedApp = await buildApp({
    fetch: recordingFetch((url) => {
      if (url.includes('/v1/images/')) return jsonResponse({ url: 'https://source/big.png' })
      return new Response(big, { headers: { 'content-type': 'image/png' } })
    }),
  })
  const buffered = await bufferedApp.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: OPENVERSE_ID },
  })
  assert.equal(buffered.statusCode, 413)
  assert.equal(buffered.json().code, 'STOCK_IMAGE_TOO_LARGE')
})

test('stock import respects the user quota under the asset lock', async () => {
  const persistCalls = []
  const stmts = imageStatements({
    userImageBytes: { get: () => ({ total: BASE_CONFIG.userQuotaBytes - PNG_BYTES.length + 1 }) },
  })
  const fetchStub = recordingFetch((url) => {
    if (url.includes('/v1/images/')) return jsonResponse({ url: 'https://source/x.png' })
    return new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' } })
  })
  const app = await buildApp({ stmts, fetch: fetchStub, persistCalls })

  const response = await app.inject({
    method: 'POST',
    url: '/api/stock/import',
    payload: { source: 'openverse', id: OPENVERSE_ID },
  })
  assert.equal(response.statusCode, 413)
  assert.equal(response.json().code, 'IMAGE_QUOTA_EXCEEDED')
  assert.equal(persistCalls.length, 0)
})

test('stock routes stay behind the images scope for API tokens', async () => {
  const tokenUser = { sub: 'user-2', via: 'token', scopes: ['drafts'] }
  const app = await buildApp({ user: tokenUser })
  for (const request of [
    { method: 'GET', url: '/api/stock/sources' },
    { method: 'GET', url: '/api/stock/search?q=x' },
    { method: 'POST', url: '/api/stock/import', payload: { source: 'openverse', id: OPENVERSE_ID } },
  ]) {
    const response = await app.inject(request)
    assert.equal(response.statusCode, 403)
    assert.equal(response.json().code, 'TOKEN_SCOPE_DENIED')
  }

  const scopedApp = await buildApp({ user: { sub: 'user-2', via: 'token', scopes: ['images'] } })
  const allowed = await scopedApp.inject({ method: 'GET', url: '/api/stock/sources' })
  assert.equal(allowed.statusCode, 200)
})

test('stock routes require the asset lock and reclaim hook', async () => {
  const app = Fastify()
  app.decorate('authenticate', authenticateAs(USER))
  app.register(stockRoutes, { prefix: '/api/stock', config: BASE_CONFIG, stmts: imageStatements() })
  await assert.rejects(() => app.ready(), /assetLock\.run must be a function/)
})
