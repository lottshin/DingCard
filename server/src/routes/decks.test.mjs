import assert from 'node:assert/strict'
import test from 'node:test'

import Fastify from 'fastify'

import { createUserAssetLock } from '../userAssetLock.js'
import deckRoutes from './decks.js'

const CONFIG = {
  uploadsPublicPath: '/uploads',
  uploadsDir: '/tmp/dingcard-deck-test-uploads',
  userQuotaBytes: 0,
  imageLeaseMs: 60_000,
}

function deckStatements(overrides = {}) {
  return {
    userImageBytes: { get: () => ({ total: 0 }) },
    insertImage: { run: () => ({ changes: 1 }) },
    createShare: () => ({ changes: 1 }),
    ...overrides,
  }
}

async function buildApp(t, {
  stmts = deckStatements(),
  config = CONFIG,
  reclaimImages = async () => ({ reclaimedBytes: 0, aborted: false }),
  userId = 'user-1',
  createShareToken = () => 'a-token',
  renderDeck = async () => ({ ok: true, pages: [] }),
  persistImageFile = async (deps, row) => {
    await deps.insertImage(row)
  },
} = {}) {
  const app = Fastify()
  app.decorate('authenticate', async (request) => {
    request.user = { sub: userId }
  })
  await app.register(deckRoutes, {
    prefix: '/api/decks',
    assetLock: createUserAssetLock(),
    config,
    stmts,
    reclaimImages,
    now: () => 1_000,
    createShareToken,
    renderDeck,
    persistImageFile,
  })
  await app.ready()
  t.after(() => app.close())
  return app
}

function documentWithPages(count) {
  return { version: 20, slides: Array.from({ length: count }, (_, index) => ({ id: `s-${index}` })) }
}

test('deck routes require their shared lock and GC hooks', async () => {
  const app = Fastify()
  app.decorate('authenticate', async () => {})
  await assert.rejects(
    app.register(deckRoutes, { reclaimImages: async () => {} }).ready(),
    { message: 'options.assetLock.run must be a function' },
  )
})

test('POST renders the document, stores every page, and creates the share', async (t) => {
  const inserted = []
  const created = []
  const app = await buildApp(t, {
    stmts: deckStatements({
      insertImage: { run: (row) => { inserted.push({ ...row }); return { changes: 1 } } },
      createShare: (row, imagePaths) => {
        created.push({ row: { ...row }, imagePaths: [...imagePaths] })
        return { changes: 1 + imagePaths.length }
      },
    }),
    renderDeck: async (document) => {
      assert.equal(document.slides.length, 2)
      return {
        ok: true,
        pages: [{ bytes: Buffer.from('page-one') }, { bytes: Buffer.from('page-two') }],
      }
    },
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: documentWithPages(2), title: '探针卡片', expiresInHours: 7 },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(inserted.length, 2)
  assert.equal(created.length, 1)
  for (const [index, row] of inserted.entries()) {
    assert.equal(row.user_id, 'user-1')
    assert.equal(row.mime, 'image/png')
    assert.equal(row.bytes, `page-${['one', 'two'][index]}`.length)
    assert.equal(row.created_at, 1_000)
    assert.equal(row.lease_expires_at, 1_000 + CONFIG.imageLeaseMs)
    assert.equal(row.path, created[0].imagePaths[index])
  }
  assert.equal(created[0].row.title, '探针卡片')
  assert.equal(created[0].row.expires_at, 1_000 + 7 * 60 * 60 * 1000)
  const body = response.json()
  assert.deepEqual(body.images, created[0].imagePaths)
  assert.deepEqual(body.share, {
    id: created[0].row.id,
    title: '探针卡片',
    url: '/share/a-token',
    createdAt: 1_000,
    expiresAt: 1_000 + 7 * 60 * 60 * 1000,
    imageCount: 2,
    views: 0,
  })
})

test('POST defaults the title and expiry and truncates a long title', async (t) => {
  const created = []
  const app = await buildApp(t, {
    stmts: deckStatements({
      createShare: (row, imagePaths) => {
        created.push({ row: { ...row }, imagePaths: [...imagePaths] })
        return { changes: 1 }
      },
    }),
    renderDeck: async () => ({ ok: true, pages: [{ bytes: Buffer.from('p') }] }),
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: documentWithPages(1), title: `x${'好'.repeat(80)}` },
  })

  assert.equal(response.statusCode, 200)
  assert.equal(created[0].row.title, `x${'好'.repeat(59)}`)
  assert.equal(created[0].row.title.length, 60)
  assert.equal(created[0].row.expires_at, 1_000 + 24 * 60 * 60 * 1000)
  assert.equal(response.json().share.title, created[0].row.title)

  const blank = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: documentWithPages(1), title: '   ' },
  })
  assert.equal(blank.statusCode, 200)
  assert.equal(blank.json().share.title, '叮卡分享')
})

test('POST renders a Markdown card envelope down the Markdown pipeline', async (t) => {
  const rendered = []
  const created = []
  const app = await buildApp(t, {
    stmts: deckStatements({
      createShare: (row, imagePaths) => {
        created.push({ row: { ...row }, imagePaths: [...imagePaths] })
        return { changes: 1 }
      },
    }),
    renderDeck: async (document, kind) => {
      rendered.push({ document, kind })
      return { ok: true, pages: [{ bytes: Buffer.from('p') }, { bytes: Buffer.from('q') }] }
    },
  })

  const envelope = {
    source: '# 标题\n\n正文\n\n---\n\n第二页',
    platformId: 'rednote',
    themeId: 'light',
    fontFamily: 'sans-serif',
    radius: 18,
    profile: { nickname: '叮卡', handle: '@dingcard', location: '', avatarColor: '#333', avatarImage: null, verified: false, headerFirstPageOnly: false },
  }
  const response = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: envelope, title: 'Markdown 一步渲染' },
  })

  assert.equal(response.statusCode, 200, response.body)
  assert.equal(rendered.length, 1)
  assert.equal(rendered[0].kind, 'markdown')
  assert.equal(rendered[0].document.platformId, 'rednote')
  assert.equal(response.json().share.title, 'Markdown 一步渲染')
  assert.equal(response.json().images.length, 2)

  // A mode that contradicts the document's shape is rejected, not guessed.
  const forced = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: envelope, mode: 'freeform-slide' },
  })
  assert.equal(forced.statusCode, 400)
  assert.ok(forced.json().error.includes('mode 指定的是自由画布'))
  assert.equal(rendered.length, 1)

  // An empty source is rejected before rendering.
  const blank = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: { ...envelope, source: '   ' } },
  })
  assert.equal(blank.statusCode, 400)
  assert.ok(blank.json().error.includes('source'))
  assert.equal(rendered.length, 1)
})

test('POST rejects bad input before rendering anything', async (t) => {
  let rendered = 0
  const app = await buildApp(t, {
    renderDeck: async () => {
      rendered += 1
      return { ok: true, pages: [{ bytes: Buffer.from('p') }] }
    },
  })

  const cases = [
    [{ title: 't' }, 'document 必须是自由画布文档'],
    [{ document: 'nope' }, 'document 必须是自由画布文档'],
    [{ document: { slides: 'nope' } }, 'document 必须是自由画布文档'],
    [{ document: { slides: [] } }, '文档没有页面'],
    [{ document: documentWithPages(51) }, '一次最多渲染 50 页'],
    [{ document: documentWithPages(1), expiresInHours: 0 }, '有效期必须是 1–720 之间的整数小时'],
    [{ document: documentWithPages(1), expiresInHours: 721 }, '有效期必须是 1–720 之间的整数小时'],
    [{ document: documentWithPages(1), expiresInHours: '7' }, '有效期必须是 1–720 之间的整数小时'],
  ]
  for (const [payload, message] of cases) {
    const response = await app.inject({ method: 'POST', url: '/api/decks', payload })
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
    assert.ok(response.json().error.includes(message), response.json().error)
  }
  assert.equal(rendered, 0)
})

test('POST maps a render failure to 503 and stores nothing', async (t) => {
  const inserted = []
  const app = await buildApp(t, {
    stmts: deckStatements({ insertImage: { run: (row) => { inserted.push(row); return { changes: 1 } } } }),
    renderDeck: async () => ({ ok: false, error: '无可用浏览器：渲染需要系统安装的 Google Chrome' }),
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: documentWithPages(1) },
  })

  assert.equal(response.statusCode, 503)
  assert.equal(response.json().code, 'DECK_RENDER_FAILED')
  assert.ok(response.json().error.includes('无可用浏览器'))
  assert.equal(inserted.length, 0)
})

test('POST enforces the image quota across every page', async (t) => {
  const app = await buildApp(t, {
    config: { ...CONFIG, userQuotaBytes: 10 },
    renderDeck: async () => ({ ok: true, pages: [Buffer.from('0123456789'), Buffer.from('!')].map((bytes) => ({ bytes })) }),
  })

  const response = await app.inject({
    method: 'POST',
    url: '/api/decks',
    payload: { document: documentWithPages(1) },
  })

  assert.equal(response.statusCode, 413)
  assert.equal(response.json().code, 'IMAGE_QUOTA_EXCEEDED')
})

test('POST renders decks one at a time per process', async (t) => {
  let running = 0
  let peak = 0
  const app = await buildApp(t, {
    renderDeck: async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 30))
      running -= 1
      return { ok: true, pages: [{ bytes: Buffer.from('p') }] }
    },
  })

  const [first, second] = await Promise.all([
    app.inject({ method: 'POST', url: '/api/decks', payload: { document: documentWithPages(1) } }),
    app.inject({ method: 'POST', url: '/api/decks', payload: { document: documentWithPages(1) } }),
  ])

  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.equal(peak, 1)
})
