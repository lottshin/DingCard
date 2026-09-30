// Asset library routes: list / register / rename / delete, scoped to the JWT's user.
//
// Uploading stays with POST /api/images; an asset is a named pointer at one of
// the user's managed uploads. While the asset exists, image GC keeps that
// upload alive even when no draft references it. Deleting an asset never
// breaks a draft: drafts that still use the upload keep it referenced.

import { randomUUID } from 'node:crypto'

import { config } from '../config.js'
import { stmts } from '../db.js'
import { requestManagedImagePath } from './images.js'

const NAME_MAX = 60
const DIMENSION_MAX = 20_000

// DB row (snake_case) -> frontend asset envelope.
function toAsset(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.image_path,
    width: row.width,
    height: row.height,
    bytes: Number.isFinite(row.bytes) ? row.bytes : 0,
    createdAt: row.created_at,
  }
}

function assetName(value) {
  if (typeof value !== 'string') return null
  const name = Array.from(value.replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('')
  return name === '' ? null : name
}

function dimension(value) {
  return Number.isInteger(value) && value > 0 && value <= DIMENSION_MAX ? value : null
}

export default async function assetRoutes(fastify, options = {}) {
  if (typeof options.assetLock?.run !== 'function') {
    throw new TypeError('options.assetLock.run must be a function')
  }
  if (typeof options.reclaimImages !== 'function') {
    throw new TypeError('options.reclaimImages must be a function')
  }

  const routeConfig = options.config ?? config
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const { assetLock, reclaimImages } = options

  fastify.addHook('preHandler', fastify.authenticate)

  // GET /api/assets -> Asset[]  (newest first)
  fastify.get('/', async (request) => {
    return routeStmts.listAssets.all(request.user.sub).map(toAsset)
  })

  // POST /api/assets  { url, name, width, height } -> Asset
  fastify.post('/', async (request, reply) => {
    const body = request.body ?? {}
    const name = assetName(body.name)
    if (!name) return reply.code(400).send({ error: '素材名称不能为空' })
    const width = dimension(body.width)
    const height = dimension(body.height)
    if (!width || !height) return reply.code(400).send({ error: '素材尺寸无效' })
    const imagePath = requestManagedImagePath(body.url, request, routeConfig.uploadsPublicPath)
    if (!imagePath) return reply.code(400).send({ error: '素材图片地址无效' })

    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      const image = routeStmts.imageByUserPath.get(userId, imagePath)
      if (!image) {
        return reply.code(409).send({ error: '这张图片已失效，请重新上传', code: 'ASSET_IMAGE_MISSING' })
      }
      const row = {
        id: randomUUID(),
        user_id: userId,
        image_path: imagePath,
        name,
        width,
        height,
        created_at: now(),
      }
      await routeStmts.insertAsset.run(row)
      return toAsset({ ...row, bytes: image.bytes })
    })
  })

  // PATCH /api/assets/:id  { name } -> Asset
  fastify.patch('/:id', async (request, reply) => {
    const name = assetName(request.body?.name)
    if (!name) return reply.code(400).send({ error: '素材名称不能为空' })

    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      const result = await routeStmts.renameAsset.run(name, request.params.id, userId)
      const row = result.changes === 0 ? undefined : routeStmts.assetById.get(request.params.id, userId)
      if (!row) return reply.code(404).send({ error: '素材不存在' })
      return toAsset(row)
    })
  })

  // DELETE /api/assets/:id -> { ok: true }
  fastify.delete('/:id', async (request) => {
    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      await routeStmts.deleteAsset.run(request.params.id, userId)
      try {
        await reclaimImages(userId)
      } catch (err) {
        try {
          fastify.log.error({ err, userId }, 'image GC failed after asset deletion')
        } catch {
          // The completed asset deletion remains authoritative even if logging fails.
        }
      }
      return { ok: true }
    })
  })
}
