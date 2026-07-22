// Fastify application assembly, kept separate from process startup so tests and
// other runtimes can construct the complete server without opening a port.

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import fs from 'node:fs/promises'

import { config as defaultConfig } from './config.js'
import { createDatabase } from './db.js'
import { reclaimExpiredImages } from './imageGc.js'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import draftRoutes from './routes/drafts.js'
import imageRoutes from './routes/images.js'
import { registerStaticSite } from './staticSite.js'
import { createUserAssetLock } from './userAssetLock.js'

export async function buildApp({
  config: appConfig = defaultConfig,
  stmts: injectedStmts,
} = {}) {
  const app = Fastify({
    logger: appConfig.dev
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : true,
    bodyLimit: appConfig.maxUploadBytes,
  })

  let ownedDb
  let appStmts = injectedStmts

  try {
    if (appStmts === undefined) {
      const database = createDatabase(appConfig)
      ownedDb = database.db
      appStmts = database.stmts
      app.addHook('onClose', async () => {
        ownedDb.close()
      })
    }

    const assetLock = createUserAssetLock()
    const reclaimImages = (userId) => reclaimExpiredImages(
      {
        listDraftDocuments: (ownerId) => appStmts.listDraftDocuments.all(ownerId),
        listImages: (ownerId) => appStmts.listImages.all(ownerId),
        removeFile: fs.unlink,
        deleteImage: (imageId, ownerId) => appStmts.deleteImage.run(imageId, ownerId),
        uploadsDir: appConfig.uploadsDir,
        uploadsPublicPath: appConfig.uploadsPublicPath,
        logger: app.log,
      },
      userId,
      Date.now(),
    )

    if (appConfig.corsOrigins.length > 0) {
      await app.register(cors, { origin: appConfig.corsOrigins, credentials: true })
    }

    await app.register(multipart, {
      limits: { fileSize: appConfig.maxUploadBytes, files: 1 },
    })
    // Basic global rate limit; auth routes get a tighter cap below.
    await app.register(rateLimit, { max: appConfig.rateLimitMax, timeWindow: '1 minute' })
    await app.register(authPlugin, { config: appConfig })

    // Upload URLs use randomized immutable filenames.
    await app.register(fastifyStatic, {
      root: appConfig.uploadsDir,
      prefix: `${appConfig.uploadsPublicPath}/`,
      decorateReply: false,
      maxAge: '30d',
      immutable: true,
    })

    app.get('/api/health', async () => ({ ok: true }))

    await app.register(
      async (scoped) => {
        await scoped.register(rateLimit, { max: appConfig.authRateLimitMax, timeWindow: '1 minute' })
        await scoped.register(authRoutes, {
          prefix: '/api/auth',
          config: appConfig,
          stmts: appStmts,
        })
      },
    )

    await app.register(draftRoutes, {
      prefix: '/api/drafts',
      assetLock,
      stmts: appStmts,
      reclaimImages,
    })
    await app.register(imageRoutes, {
      prefix: '/api/images',
      assetLock,
      config: appConfig,
      stmts: appStmts,
      reclaimImages,
    })

    await registerStaticSite(app, {
      webRoot: appConfig.webRoot,
      uploadsPublicPath: appConfig.uploadsPublicPath,
      required: appConfig.imageRuntime,
    })

    return app
  } catch (error) {
    try {
      await app.close()
    } catch (closeError) {
      app.log.error({ err: closeError }, 'failed to close app after assembly error')
    }
    throw error
  }
}
