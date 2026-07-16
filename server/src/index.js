// 叮卡 backend entry.
//
// Fastify server exposing /api/* (auth, drafts, images). In production it sits
// behind Nginx which terminates TLS, serves the SPA and /uploads/* statically,
// and reverse-proxies /api/* here (see docs/backend-plan.md §6).

import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import fs from 'node:fs/promises'
import { config } from './config.js'
import { stmts } from './db.js'
import { reclaimExpiredImages } from './imageGc.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import draftRoutes from './routes/drafts.js'
import imageRoutes from './routes/images.js'
import { createUserAssetLock } from './userAssetLock.js'

const app = Fastify({
  logger: config.dev
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : true,
  bodyLimit: config.maxUploadBytes,
})

const assetLock = createUserAssetLock()
const reclaimImages = (userId) => reclaimExpiredImages(
  {
    listDraftDocuments: (ownerId) => stmts.listDraftDocuments.all(ownerId),
    listImages: (ownerId) => stmts.listImages.all(ownerId),
    removeFile: fs.unlink,
    deleteImage: (imageId, ownerId) => stmts.deleteImage.run(imageId, ownerId),
    uploadsDir: config.uploadsDir,
    uploadsPublicPath: config.uploadsPublicPath,
    logger: app.log,
  },
  userId,
  Date.now(),
)

// CORS only when explicitly configured (same-origin prod deploy needs none).
if (config.corsOrigins.length > 0) {
  await app.register(cors, { origin: config.corsOrigins, credentials: true })
}

await app.register(multipart, {
  limits: { fileSize: config.maxUploadBytes, files: 1 },
})

// Basic global rate limit; auth routes get a tighter cap below.
await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: '1 minute' })

await app.register(authPlugin)

// Always expose uploads for direct backend development/integration access.
// Production Nginx still serves this prefix first, bypassing Fastify normally.
await app.register(fastifyStatic, {
  root: config.uploadsDir,
  prefix: `${config.uploadsPublicPath}/`,
  decorateReply: false,
})

// Health check for uptime probes / systemd.
app.get('/api/health', async () => ({ ok: true }))

// Auth routes get a tighter rate limit (anti brute-force / anti sign-up spam).
await app.register(
  async (scoped) => {
    await scoped.register(rateLimit, { max: config.authRateLimitMax, timeWindow: '1 minute' })
    await scoped.register(authRoutes, { prefix: '/api/auth' })
  },
)

await app.register(draftRoutes, { prefix: '/api/drafts', assetLock, reclaimImages })
await app.register(imageRoutes, { prefix: '/api/images', assetLock, reclaimImages })

try {
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
