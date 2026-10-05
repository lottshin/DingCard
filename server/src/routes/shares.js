// Share routes: create / list / revoke, scoped to the JWT's user.
//
// A share is an unguessable link that shows a deck's exported pages. The pages
// are the user's managed uploads (POST /api/images first, then reference the
// returned URLs here, exactly like library assets). While the share row exists,
// image GC keeps its uploads alive; revoking deletes the row so a later GC can
// reclaim the pages once their leases lapse. Expiry only closes the public
// page — the images stay referenced until the share is revoked.

import { randomBytes, randomUUID } from 'node:crypto'

import { config } from '../config.js'
import { requireScope } from '../tokenGuards.js'
import { stmts } from '../db.js'
import { requestManagedImagePath } from './images.js'

const NAME_MAX = 60
const MAX_IMAGES = 50
const DEFAULT_EXPIRES_IN_HOURS = 24
// A month of hours: the longest a link may stay open.
const EXPIRES_MAX_HOURS = 24 * 30

// DB row (snake_case) -> API envelope. `url` is the public share page path.
function toShare(row) {
  return {
    id: row.id,
    title: row.title,
    url: `/share/${row.token}`,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    imageCount: Number.isFinite(row.image_count) ? row.image_count : 0,
    // One per successful public page render; a fresh share starts at zero.
    views: Number.isFinite(row.views) ? row.views : 0,
  }
}

export function shareTitle(value) {
  if (typeof value !== 'string') return null
  const title = Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('')
  return title === '' ? null : title
}

export function expiresInHours(value) {
  if (value === undefined || value === null) return DEFAULT_EXPIRES_IN_HOURS
  if (!Number.isInteger(value) || value < 1 || value > EXPIRES_MAX_HOURS) return null
  return value
}

function shareToken() {
  // 128 bits of randomness, URL-safe: guessing is not a practical attack.
  return randomBytes(16).toString('base64url')
}

/** Insert the share row (retrying a token collision) and return its envelope. */
export async function insertShare(
  { stmts: routeStmts, now, createToken },
  { userId, title, hours, imagePaths },
) {
  const createdAt = now()
  const row = {
    id: randomUUID(),
    user_id: userId,
    token: '',
    title,
    created_at: createdAt,
    expires_at: createdAt + hours * 60 * 60 * 1000,
  }
  // A token collision fails the UNIQUE constraint; retry with a fresh one.
  for (let attempt = 0; ; attempt++) {
    row.token = createToken()
    try {
      await routeStmts.createShare(row, imagePaths)
      break
    } catch (err) {
      if (attempt >= 2 || !String(err?.code || '').includes('CONSTRAINT')) throw err
    }
  }
  return toShare({ ...row, image_count: imagePaths.length })
}

export default async function shareRoutes(fastify, options = {}) {
  if (typeof options.assetLock?.run !== 'function') {
    throw new TypeError('options.assetLock.run must be a function')
  }
  if (typeof options.reclaimImages !== 'function') {
    throw new TypeError('options.reclaimImages must be a function')
  }

  const routeConfig = options.config ?? config
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const createToken = options.createShareToken ?? shareToken
  const { assetLock, reclaimImages } = options

  fastify.addHook('preHandler', fastify.authenticate)
  // API tokens are scoped; a browser session is never checked here.
  fastify.addHook('preHandler', requireScope('shares'))

  // GET /api/shares -> Share[]  (newest first)
  fastify.get('/', async (request) => {
    return routeStmts.listShares.all(request.user.sub).map(toShare)
  })

  // POST /api/shares  { urls, title, expiresInHours? } -> Share
  fastify.post('/', async (request, reply) => {
    const body = request.body ?? {}
    const title = shareTitle(body.title)
    if (!title) return reply.code(400).send({ error: '分享名称不能为空' })
    const hours = expiresInHours(body.expiresInHours)
    if (!hours) {
      return reply.code(400).send({ error: '有效期必须是 1–720 之间的整数小时' })
    }
    if (!Array.isArray(body.urls) || body.urls.length === 0) {
      return reply.code(400).send({ error: 'urls 必须是至少一张图片的数组' })
    }
    if (body.urls.length > MAX_IMAGES) {
      return reply.code(400).send({
        error: `一次最多分享 ${MAX_IMAGES} 张图片`,
        code: 'SHARE_IMAGE_LIMIT_EXCEEDED',
      })
    }

    const imagePaths = []
    for (const value of body.urls) {
      const imagePath = requestManagedImagePath(value, request, routeConfig.uploadsPublicPath)
      if (!imagePath) return reply.code(400).send({ error: '分享图片地址无效' })
      imagePaths.push(imagePath)
    }

    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      for (const imagePath of imagePaths) {
        if (!routeStmts.imageByUserPath.get(userId, imagePath)) {
          return reply.code(409).send({
            error: '一张或多张分享图片已失效，请重新导出',
            code: 'SHARE_IMAGE_MISSING',
          })
        }
      }

      return insertShare(
        { stmts: routeStmts, now, createToken },
        { userId, title, hours, imagePaths },
      )
    })
  })

  // DELETE /api/shares/:id -> { ok: true }; the public page answers 404 after.
  fastify.delete('/:id', async (request, reply) => {
    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      const result = await routeStmts.deleteShare.run(request.params.id, userId)
      if (result.changes === 0) return reply.code(404).send({ error: '分享不存在' })
      try {
        await reclaimImages(userId)
      } catch (err) {
        try {
          fastify.log.error({ err, userId }, 'image GC failed after share revocation')
        } catch {
          // The completed revocation remains authoritative even if logging fails.
        }
      }
      return { ok: true }
    })
  })
}
