// Stock photo library proxy. Keys live in server env vars only; the browser
// sees source ids and normalized results. The import route resolves an id
// through the provider's own API and downloads that canonical URL itself —
// it never fetches a client-sent URL — then persists the bytes through the
// same lock/quota/persist pipeline as direct uploads.

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { config as defaultConfig } from '../config.js'
import { requireScope } from '../tokenGuards.js'
import { stmts as defaultStmts } from '../db.js'
import { persistImageFile } from '../imagePersistence.js'
import {
  STOCK_DOWNLOAD_TIMEOUT_MS,
  STOCK_SEARCH_TIMEOUT_MS,
  STOCK_SOURCE_IDS,
  StockNotFoundError,
  fetchStockJson,
  stockProviders,
} from '../stockProviders.js'

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const QUERY_MAX_CHARS = 100
const PAGE_MAX = 50
const ID_MAX_CHARS = 128

const UPSTREAM_ERROR = { error: '图库服务暂时不可用，请稍后重试', code: 'STOCK_UPSTREAM_ERROR' }
const DOWNLOAD_ERROR = { error: '图片下载失败，请稍后重试', code: 'STOCK_UPSTREAM_ERROR' }

export default async function stockRoutes(fastify, options = {}) {
  if (typeof options.assetLock?.run !== 'function') {
    throw new TypeError('options.assetLock.run must be a function')
  }
  if (typeof options.reclaimImages !== 'function') {
    throw new TypeError('options.reclaimImages must be a function')
  }

  const routeConfig = options.config ?? defaultConfig
  const routeStmts = options.stmts ?? defaultStmts
  const now = options.now ?? Date.now
  const persist = options.persistImageFile ?? persistImageFile
  const writeFile = options.writeFile ?? fs.writeFile
  const removeFile = options.removeFile ?? fs.unlink
  const fetchFn = options.fetch ?? fetch
  const searchTimeoutMs = options.searchTimeoutMs ?? STOCK_SEARCH_TIMEOUT_MS
  const downloadTimeoutMs = options.downloadTimeoutMs ?? STOCK_DOWNLOAD_TIMEOUT_MS
  const { assetLock, reclaimImages } = options

  const keys = {
    pixabay: routeConfig.pixabayKey ?? '',
    unsplash: routeConfig.unsplashKey ?? '',
    pexels: routeConfig.pexelsKey ?? '',
  }

  /** The provider for a source id, plus whether its key is in place. */
  function resolveSource(sourceId) {
    if (!STOCK_SOURCE_IDS.includes(sourceId)) return null
    const provider = stockProviders[sourceId]
    const key = provider.keyed ? keys[sourceId] : ''
    return { provider, key, available: !provider.keyed || key !== '' }
  }

  function sourceState() {
    const sources = STOCK_SOURCE_IDS.map((id) => {
      const source = resolveSource(id)
      return { id, label: source.provider.label, available: source.available }
    })
    const preferred = sources.find((source) => source.available)?.id ?? 'openverse'
    return { sources, preferred }
  }

  function clampPage(value) {
    const page = Number.parseInt(value, 10)
    if (!Number.isFinite(page)) return 1
    return Math.min(Math.max(page, 1), PAGE_MAX)
  }

  fastify.get('/sources', { preHandler: [fastify.authenticate, requireScope('images')] }, async () => {
    return sourceState()
  })

  fastify.get('/search', { preHandler: [fastify.authenticate, requireScope('images')] }, async (request, reply) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.trim() : ''
    if (q === '' || q.length > QUERY_MAX_CHARS) {
      return reply.code(400).send({
        error: `搜索词需为 1~${QUERY_MAX_CHARS} 个字符`,
        code: 'STOCK_INVALID_QUERY',
      })
    }

    const requested = typeof request.query?.source === 'string' && request.query.source !== ''
      ? request.query.source
      : sourceState().preferred
    const source = resolveSource(requested)
    if (source === null) {
      return reply.code(400).send({ error: '未知的图库源', code: 'STOCK_UNKNOWN_SOURCE' })
    }
    if (!source.available) {
      return reply.code(400).send({
        error: `图库源 ${source.provider.label} 未配置访问密钥`,
        code: 'STOCK_SOURCE_UNCONFIGURED',
      })
    }

    const page = clampPage(request.query?.page)
    let payload
    try {
      const json = await fetchStockJson(
        fetchFn,
        source.provider.searchUrl(source.key, q, page),
        { headers: source.provider.headers?.(source.key), timeoutMs: searchTimeoutMs },
      )
      payload = source.provider.parseSearch(json)
    } catch {
      return reply.code(502).send(UPSTREAM_ERROR)
    }

    return { source: requested, page, total: payload.total, results: payload.results }
  })

  fastify.post('/import', { preHandler: [fastify.authenticate, requireScope('images')] }, async (request, reply) => {
    const sourceId = typeof request.body?.source === 'string' ? request.body.source : ''
    const id = typeof request.body?.id === 'string' ? request.body.id.trim() : ''
    const source = resolveSource(sourceId)
    if (source === null) {
      return reply.code(400).send({ error: '未知的图库源', code: 'STOCK_UNKNOWN_SOURCE' })
    }
    if (!source.available) {
      return reply.code(400).send({
        error: `图库源 ${source.provider.label} 未配置访问密钥`,
        code: 'STOCK_SOURCE_UNCONFIGURED',
      })
    }
    if (id === '' || id.length > ID_MAX_CHARS || !source.provider.idPattern.test(id)) {
      return reply.code(400).send({ error: '无效的图片标识', code: 'STOCK_INVALID_ID' })
    }

    let resolved
    try {
      const json = await fetchStockJson(
        fetchFn,
        source.provider.resolveUrl(source.key, id),
        { headers: source.provider.headers?.(source.key), notFound: true, timeoutMs: searchTimeoutMs },
      )
      resolved = source.provider.parseResolve(json)
    } catch (error) {
      if (error instanceof StockNotFoundError) {
        return reply.code(404).send({ error: '图库中没有这张图片', code: 'STOCK_IMAGE_NOT_FOUND' })
      }
      return reply.code(502).send(UPSTREAM_ERROR)
    }

    let response
    try {
      response = await fetchFn(resolved.url, {
        signal: AbortSignal.timeout(downloadTimeoutMs),
      })
    } catch {
      return reply.code(502).send(DOWNLOAD_ERROR)
    }
    if (!response.ok) return reply.code(502).send(DOWNLOAD_ERROR)

    const contentType = (response.headers.get('content-type') || '')
      .split(';', 1)[0].trim().toLowerCase()
    const mime = contentType === 'image/jpg' ? 'image/jpeg' : contentType
    const ext = MIME_EXT[mime]
    if (!ext) {
      return reply.code(415).send({ error: '图库返回了不支持的图片格式', code: 'STOCK_UNSUPPORTED_TYPE' })
    }

    // The declared length lets oversized files be rejected without buffering
    // them; the actual buffer is re-checked after the download.
    const declaredBytes = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredBytes) && declaredBytes > routeConfig.maxUploadBytes) {
      return reply.code(413).send({ error: '图片过大', code: 'STOCK_IMAGE_TOO_LARGE' })
    }

    let buf
    try {
      buf = Buffer.from(await response.arrayBuffer())
    } catch {
      return reply.code(502).send(DOWNLOAD_ERROR)
    }
    if (buf.length > routeConfig.maxUploadBytes) {
      return reply.code(413).send({ error: '图片过大', code: 'STOCK_IMAGE_TOO_LARGE' })
    }

    const userId = request.user.sub
    const alt = resolved.author !== ''
      ? `${source.provider.label} · ${resolved.author}`
      : source.provider.label

    return assetLock.run(userId, async () => {
      await reclaimImages(userId)

      if (routeConfig.userQuotaBytes > 0) {
        const { total } = routeStmts.userImageBytes.get(userId)
        if (total + buf.length > routeConfig.userQuotaBytes) {
          return reply.code(413).send({
            error: '图片存储空间已满；系统只回收租约过期且未引用图片，释放空间可能延迟',
            code: 'IMAGE_QUOTA_EXCEEDED',
          })
        }
      }

      const imageId = randomUUID().replace(/-/g, '')
      const filename = `${imageId}.${ext}`
      const diskPath = path.join(routeConfig.uploadsDir, filename)
      const publicPath = `${routeConfig.uploadsPublicPath}/${filename}`
      const createdAt = now()

      await persist(
        {
          writeFile,
          removeFile,
          insertImage: (row) => routeStmts.insertImage.run(row),
          logger: fastify.log,
        },
        {
          id: imageId,
          user_id: userId,
          path: publicPath,
          mime,
          bytes: buf.length,
          created_at: createdAt,
          lease_expires_at: createdAt + routeConfig.imageLeaseMs,
          diskPath,
        },
        buf,
      )

      return { ref: `img:${imageId}`, url: publicPath, alt }
    })
  })
}
