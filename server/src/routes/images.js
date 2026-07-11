// Image upload route.
//
// The client downscales the image first (see src/imageStore.ts) and POSTs the
// bytes here as multipart/form-data (field `file`). We validate size + MIME,
// enforce a per-user storage quota, write the file to disk under uploadsDir with
// a random name (never the client's name — prevents path traversal), and record
// only a pointer row in SQLite. Nginx serves the file directly from disk.

import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { stmts } from '../db.js'
import { config } from '../config.js'

// Allowed image types -> file extension. Anything else is rejected.
const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export default async function imageRoutes(fastify) {
  // POST /api/images  (multipart, field `file`) -> { ref: "img:<id>", url }
  fastify.post('/', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.sub

    const part = await request.file()
    if (!part) return reply.code(400).send({ error: '缺少上传文件' })

    const ext = MIME_EXT[part.mimetype]
    if (!ext) return reply.code(415).send({ error: '仅支持 PNG / JPEG / WebP' })

    // Read the stream into a buffer, guarding the size limit as we go so a huge
    // upload can't exhaust memory. @fastify/multipart also enforces the limit,
    // but we double-check and surface a clean error.
    const buf = await part.toBuffer()
    if (buf.length > config.maxUploadBytes) {
      return reply.code(413).send({ error: '图片过大' })
    }

    // Quota: refuse if this upload would push the user over their limit.
    if (config.userQuotaBytes > 0) {
      const { total } = stmts.userImageBytes.get(userId)
      if (total + buf.length > config.userQuotaBytes) {
        return reply.code(413).send({ error: '存储空间已满，请删除部分草稿后再试' })
      }
    }

    const id = randomUUID().replace(/-/g, '')
    const filename = `${id}.${ext}`
    const diskPath = path.join(config.uploadsDir, filename)
    await fs.writeFile(diskPath, buf)

    const publicPath = `${config.uploadsPublicPath}/${filename}`
    stmts.insertImage.run({
      id,
      user_id: userId,
      path: publicPath,
      mime: part.mimetype,
      bytes: buf.length,
      created_at: Date.now(),
    })

    // ref goes into the markdown source; url is the direct <img src>.
    return { ref: `img:${id}`, url: publicPath }
  })
}
