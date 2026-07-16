// Image upload and lease-retention routes. Multipart parsing and MIME/size
// validation happen before the per-user lock; every storage mutation from GC
// through quota calculation, file persistence, and SQLite insert is serialized.

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { config } from '../config.js'
import { stmts } from '../db.js'
import { persistImageFile } from '../imagePersistence.js'
import { normalizeManagedImagePath } from '../imageRefs.js'

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_RETAINED_PATHS = 500

function requestOrigin(request) {
  const host = request.headers.host
  if (typeof host !== 'string' || host.trim() === '') return null

  const forwarded = request.headers['x-forwarded-proto']
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const forwardedProtocol = typeof firstForwarded === 'string'
    ? firstForwarded.split(',', 1)[0].trim().toLowerCase()
    : ''
  const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
    ? forwardedProtocol
    : request.protocol

  try {
    return new URL(`${protocol}://${host}`).origin
  } catch {
    return null
  }
}

function retainedPaths(urls, request, uploadsPublicPath) {
  const origin = requestOrigin(request)
  const paths = new Set()

  for (const value of urls) {
    if (typeof value !== 'string') continue
    const input = value.trim()
    if (input === '' || /^data:/i.test(input)) continue

    if (/^https?:\/\//i.test(input) || input.startsWith('//')) {
      try {
        if (!origin || new URL(input, origin).origin !== origin) continue
      } catch {
        continue
      }
    } else if (!input.startsWith('/')) {
      continue
    }

    const managedPath = normalizeManagedImagePath(input, uploadsPublicPath)
    if (!managedPath) continue
    paths.add(managedPath)
    if (paths.size > MAX_RETAINED_PATHS) return null
  }

  return [...paths]
}

export default async function imageRoutes(fastify, options = {}) {
  if (typeof options.assetLock?.run !== 'function') {
    throw new TypeError('options.assetLock.run must be a function')
  }
  if (typeof options.reclaimImages !== 'function') {
    throw new TypeError('options.reclaimImages must be a function')
  }

  const routeConfig = options.config ?? config
  const routeStmts = options.stmts ?? stmts
  const now = options.now ?? Date.now
  const persist = options.persistImageFile ?? persistImageFile
  const writeFile = options.writeFile ?? fs.writeFile
  const removeFile = options.removeFile ?? fs.unlink
  const { assetLock, reclaimImages } = options

  fastify.post('/retain', { preHandler: fastify.authenticate }, async (request, reply) => {
    if (!Array.isArray(request.body?.urls)) {
      return reply.code(400).send({
        error: 'urls 必须是数组',
        code: 'INVALID_IMAGE_RETAIN_REQUEST',
      })
    }

    const managedPaths = retainedPaths(
      request.body.urls,
      request,
      routeConfig.uploadsPublicPath,
    )
    if (managedPaths === null) {
      return reply.code(400).send({
        error: `单次最多保留 ${MAX_RETAINED_PATHS} 张托管图片`,
        code: 'IMAGE_RETAIN_LIMIT_EXCEEDED',
      })
    }
    if (managedPaths.length === 0) return { retained: 0 }

    const userId = request.user.sub
    return assetLock.run(userId, async () => {
      for (const managedPath of managedPaths) {
        if (!routeStmts.imageByUserPath.get(userId, managedPath)) {
          return reply.code(409).send({
            error: '一张或多张图片无法保留',
            code: 'IMAGE_RETAIN_CONFLICT',
          })
        }
      }

      const leaseExpiresAt = now() + routeConfig.imageLeaseMs
      const result = await routeStmts.renewImageLeases(
        userId,
        managedPaths,
        leaseExpiresAt,
      )
      if (result?.ok === false || result?.changes !== managedPaths.length) {
        return reply.code(409).send({
          error: '一张或多张图片无法保留',
          code: 'IMAGE_RETAIN_CONFLICT',
        })
      }
      return { retained: managedPaths.length }
    })
  })

  fastify.post('/', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.sub
    const part = await request.file()
    if (!part) return reply.code(400).send({ error: '缺少上传文件' })

    const ext = MIME_EXT[part.mimetype]
    if (!ext) return reply.code(415).send({ error: '仅支持 PNG / JPEG / WebP' })

    const buf = await part.toBuffer()
    if (buf.length > routeConfig.maxUploadBytes || part.file.truncated) {
      return reply.code(413).send({ error: '图片过大' })
    }

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

      const id = randomUUID().replace(/-/g, '')
      const filename = `${id}.${ext}`
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
          id,
          user_id: userId,
          path: publicPath,
          mime: part.mimetype,
          bytes: buf.length,
          created_at: createdAt,
          lease_expires_at: createdAt + routeConfig.imageLeaseMs,
          diskPath,
        },
        buf,
      )

      return { ref: `img:${id}`, url: publicPath }
    })
  })
}
