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
import { config } from './config.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import draftRoutes from './routes/drafts.js'
import imageRoutes from './routes/images.js'

const app = Fastify({
  logger: config.dev
    ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : true,
  bodyLimit: config.maxUploadBytes,
})

// CORS only when explicitly configured (same-origin prod deploy needs none).
if (config.corsOrigins.length > 0) {
  await app.register(cors, { origin: config.corsOrigins, credentials: true })
}

await app.register(multipart, {
  limits: { fileSize: config.maxUploadBytes, files: 1 },
})

// Basic global rate limit; auth routes get a tighter cap below.
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

await app.register(authPlugin)

// In dev, serve uploaded images ourselves so the app works without Nginx.
// In prod, Nginx serves /uploads/* directly and this is skipped.
if (config.dev) {
  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: `${config.uploadsPublicPath}/`,
    decorateReply: false,
  })
}

// Health check for uptime probes / systemd.
app.get('/api/health', async () => ({ ok: true }))

// Auth routes get a tighter rate limit (anti brute-force / anti sign-up spam).
await app.register(
  async (scoped) => {
    await scoped.register(rateLimit, { max: 20, timeWindow: '1 minute' })
    await scoped.register(authRoutes, { prefix: '/api/auth' })
  },
)

await app.register(draftRoutes, { prefix: '/api/drafts' })
await app.register(imageRoutes, { prefix: '/api/images' })

try {
  await app.listen({ host: config.host, port: config.port })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
