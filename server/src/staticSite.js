import fastifyStatic from '@fastify/static'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_UPLOADS_PUBLIC_PATH = '/uploads'
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

function readableDirectory(directoryPath) {
  try {
    if (!fs.statSync(directoryPath).isDirectory()) return false
    fs.accessSync(directoryPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

function readableFile(filePath) {
  try {
    if (!fs.statSync(filePath).isFile()) return false
    fs.accessSync(filePath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

function resolveWebRoot(webRoot, required) {
  if (webRoot == null || (typeof webRoot === 'string' && webRoot.trim() === '')) {
    if (required) throw new Error('Static site web root is required')
    return null
  }

  if (typeof webRoot !== 'string') {
    throw new TypeError('Static site web root must be a path string')
  }

  const resolvedRoot = path.resolve(webRoot)
  if (!readableDirectory(resolvedRoot)) {
    throw new Error(`Static site web root is not a readable directory: ${resolvedRoot}`)
  }

  const indexPath = path.join(resolvedRoot, 'index.html')
  if (!readableFile(indexPath)) {
    throw new Error(`Static site index is not a readable file: ${indexPath}`)
  }

  return resolvedRoot
}

function normalizePublicPath(publicPath) {
  const value = publicPath ?? DEFAULT_UPLOADS_PUBLIC_PATH
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('uploadsPublicPath must be a non-empty string')
  }

  const withLeadingSlash = value.trim().startsWith('/') ? value.trim() : `/${value.trim()}`
  return withLeadingSlash === '/' ? '/' : withLeadingSlash.replace(/\/+$/u, '')
}

function isPathAtOrBelow(pathname, prefix) {
  return prefix === '/'
    || pathname === prefix
    || pathname.startsWith(`${prefix}/`)
}

function isAssetsFile(filePath, assetsRoot) {
  const relativePath = path.relative(assetsRoot, path.resolve(filePath))
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
}

function sendDefaultNotFound(request, reply) {
  const message = `Route ${request.method}:${request.raw.url} not found`
  return reply.code(404).send({
    message,
    error: 'Not Found',
    statusCode: 404,
  })
}

export async function registerStaticSite(app, {
  webRoot,
  uploadsPublicPath = DEFAULT_UPLOADS_PUBLIC_PATH,
  required = false,
} = {}) {
  const resolvedRoot = resolveWebRoot(webRoot, required)
  if (resolvedRoot === null) return

  const normalizedUploadsPath = normalizePublicPath(uploadsPublicPath)
  const assetsRoot = path.join(resolvedRoot, 'assets')

  await app.register(fastifyStatic, {
    root: resolvedRoot,
    prefix: '/',
    cacheControl: false,
    setHeaders(response, filePath) {
      response.setHeader(
        'Cache-Control',
        isAssetsFile(filePath, assetsRoot) ? IMMUTABLE_CACHE_CONTROL : 'no-cache',
      )
    },
  })

  app.setNotFoundHandler((request, reply) => {
    const acceptsHtml = request.headers.accept?.toLowerCase().includes('text/html') === true
    const pathname = new URL(request.raw.url, 'http://localhost').pathname
    const canUseSpaFallback = (request.method === 'GET' || request.method === 'HEAD')
      && acceptsHtml
      && !isPathAtOrBelow(pathname, '/api')
      && !isPathAtOrBelow(pathname, normalizedUploadsPath)

    if (!canUseSpaFallback) return sendDefaultNotFound(request, reply)
    return reply.sendFile('index.html')
  })
}
