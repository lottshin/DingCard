// Deck routes: render a document server-side with the same headless pipeline
// the editor's export and the MCP server use, then put the pages behind a
// share link — content in, link out, no browser needed on the caller.
//
// The caller POSTs a document JSON: a freeform document (what MCP's
// create_document_* tools produce) or a Markdown card envelope (what the
// Markdown workspace and render_markdown use; tell them apart by shape, or
// say it explicitly with `mode: 'markdown-card'` / `'freeform-slide'`).
// The server renders every page to PNG, stores them as managed uploads, and
// creates the share in one request. Rendering needs Chrome or Chromium where
// the server runs — without one the endpoint answers 503 with the reason.
// Each render drives a browser, so renders run one at a time per process.

import { randomBytes, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { config } from '../config.js'
import { requireScope } from '../tokenGuards.js'
import { stmts } from '../db.js'
import { persistImageFile } from '../imagePersistence.js'
import { expiresInHours, insertShare, shareTitle } from './shares.js'

const MAX_PAGES = 50
const PNG_MIME = 'image/png'
// A 50-page deck as JSON sits well under this; it only stops abuse.
const MAX_BODY_BYTES = 8 * 1024 * 1024

/** Which pipeline a posted document needs. */
function deckKind(document, mode) {
  if (mode === 'markdown-card') return 'markdown'
  if (mode === 'freeform-slide') return 'freeform'
  if (typeof document === 'object' && document !== null) {
    if (Array.isArray(document.slides)) return 'freeform'
    if (typeof document.source === 'string' && typeof document.platformId === 'string') return 'markdown'
  }
  return null
}

// The real pipeline (mcp/dist/render.mjs), imported on first use so tests can
// inject a double and a missing build surfaces on the first request, not boot.
async function renderDeckWithBrowser(document, kind) {
  const { renderDocument, renderMarkdownDocument } = await import('../../../mcp/dist/render.mjs')
  const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'dingcard-deck-'))
  try {
    const rendered = kind === 'markdown'
      ? await renderMarkdownDocument(document, { outputDir: tempDir })
      : await renderDocument(document, { outputDir: tempDir, format: 'png' })
    if (!rendered.ok) return rendered
    const pages = []
    for (const [index, file] of rendered.files.entries()) {
      pages.push({
        bytes: await fs.readFile(file.path),
        name: `page-${String(index + 1).padStart(2, '0')}.png`,
      })
    }
    return { ok: true, pages }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

// One browser at a time per process; a burst of requests would otherwise
// launch a browser each.
let renderTail = Promise.resolve()
function renderOneAtATime(task) {
  const run = renderTail.then(() => task(), () => task())
  renderTail = run.then(() => undefined, () => undefined)
  return run
}

export default async function deckRoutes(fastify, options = {}) {
  if (typeof options.assetLock?.run !== 'function') {
    throw new TypeError('options.assetLock.run must be a function')
  }
  if (typeof options.reclaimImages !== 'function') {
    throw new TypeError('options.reclaimImages must be a function')
  }

  const routeConfig = options.config ?? config
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const createToken = options.createShareToken ?? (() => randomBytes(16).toString('base64url'))
  const renderDeck = options.renderDeck ?? renderDeckWithBrowser
  const persist = options.persistImageFile ?? persistImageFile
  const { assetLock, reclaimImages } = options

  fastify.addHook('preHandler', fastify.authenticate)
  // API tokens are scoped; a browser session is never checked here.
  fastify.addHook('preHandler', requireScope('decks'))

  // POST /api/decks  { document, mode?, title?, expiresInHours? }  ->  { images, share }
  fastify.post('/', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    const body = request.body ?? {}
    const document = body.document
    const mode = typeof body.mode === 'string' ? body.mode : undefined
    const kind = deckKind(document, mode)
    if (kind === null) {
      return reply.code(400).send({
        error: 'document 必须是自由画布文档 JSON（v1–v20，MCP create_document_* 生成的那种）或 Markdown 卡片信封（Markdown 工作台 / render_markdown 用的那种）；不确定时用 mode 明说',
      })
    }
    if (kind === 'freeform') {
      if (!Array.isArray(document.slides)) {
        return reply.code(400).send({ error: 'mode 指定的是自由画布，但文档没有 slides 页面数组' })
      }
      if (document.slides.length === 0) {
        return reply.code(400).send({ error: '文档没有页面，渲染不出卡片' })
      }
      if (document.slides.length > MAX_PAGES) {
        return reply.code(400).send({ error: `一次最多渲染 ${MAX_PAGES} 页` })
      }
    }
    if (kind === 'markdown') {
      if (typeof document.source !== 'string') {
        return reply.code(400).send({ error: 'mode 指定的是 Markdown，但文档没有 source 文本' })
      }
      if (document.source.trim() === '') {
        return reply.code(400).send({ error: 'Markdown 文档的 source 不能为空' })
      }
    }
    const title = (typeof body.title === 'string' ? shareTitle(body.title) : null) ?? '叮卡分享'
    const hours = expiresInHours(body.expiresInHours)
    if (!hours) {
      return reply.code(400).send({ error: '有效期必须是 1–720 之间的整数小时' })
    }

    const rendered = await renderOneAtATime(() => renderDeck(document, kind))
    if (!rendered.ok) {
      return reply.code(503).send({
        error: `渲染失败：${rendered.error}`,
        code: 'DECK_RENDER_FAILED',
      })
    }
    if (rendered.pages.length === 0 || rendered.pages.length > MAX_PAGES) {
      return reply.code(503).send({
        error: '渲染没有产出 1–50 页的图片',
        code: 'DECK_RENDER_FAILED',
      })
    }

    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      await reclaimImages(userId)

      // Same storage rules as an upload: quota first, then every page.
      if (routeConfig.userQuotaBytes > 0) {
        const totalBytes = rendered.pages.reduce((sum, page) => sum + page.bytes.length, 0)
        const { total } = routeStmts.userImageBytes.get(userId)
        if (total + totalBytes > routeConfig.userQuotaBytes) {
          return reply.code(413).send({
            error: '图片存储空间已满；系统只回收租约过期且未引用图片，释放空间可能延迟',
            code: 'IMAGE_QUOTA_EXCEEDED',
          })
        }
      }

      const imagePaths = []
      for (const page of rendered.pages) {
        const id = randomUUID().replace(/-/g, '')
        const filename = `${id}.png`
        const publicPath = `${routeConfig.uploadsPublicPath}/${filename}`
        const createdAt = now()
        await persist(
          {
            writeFile: fs.writeFile,
            removeFile: fs.unlink,
            insertImage: (row) => routeStmts.insertImage.run(row),
            logger: fastify.log,
          },
          {
            id,
            user_id: userId,
            path: publicPath,
            mime: PNG_MIME,
            bytes: page.bytes.length,
            created_at: createdAt,
            lease_expires_at: createdAt + routeConfig.imageLeaseMs,
            diskPath: path.join(routeConfig.uploadsDir, filename),
          },
          page.bytes,
        )
        imagePaths.push(publicPath)
      }

      const share = await insertShare(
        { stmts: routeStmts, now, createToken },
        { userId, title, hours, imagePaths },
      )
      return { images: imagePaths, share }
    })
  })
}
