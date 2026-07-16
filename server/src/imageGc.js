import path from 'node:path'

import {
  collectManagedImagePaths,
  normalizeManagedImagePath,
} from './imageRefs.js'

const silentLogger = { error() {} }
const MANAGED_URL_BASE = 'http://managed.local'

function logError(logger, details, message) {
  try {
    logger.error(details, message)
  } catch {
    // Garbage collection must not fail because observability failed.
  }
}

function requireFunction(deps, name) {
  if (typeof deps[name] !== 'function') {
    throw new TypeError(`deps.${name} must be a function`)
  }
}

function validateInputs(deps, userId, now) {
  if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) {
    throw new TypeError('deps must be an object')
  }
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new TypeError('userId must be a non-empty string')
  }
  if (!Number.isFinite(now)) {
    throw new TypeError('now must be a finite number')
  }

  for (const name of ['listDraftDocuments', 'listImages', 'removeFile', 'deleteImage']) {
    requireFunction(deps, name)
  }
  for (const name of ['uploadsDir', 'uploadsPublicPath']) {
    if (typeof deps[name] !== 'string' || deps[name].trim() === '') {
      throw new TypeError(`deps.${name} must be a non-empty string`)
    }
  }
  if (deps.logger !== undefined && typeof deps.logger?.error !== 'function') {
    throw new TypeError('deps.logger.error must be a function')
  }
}

function documentJson(value) {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && typeof value.document === 'string') {
    return value.document
  }
  throw new TypeError('draft document must be a JSON string')
}

function managedRoot(uploadsPublicPath) {
  try {
    const pathname = new URL(uploadsPublicPath, MANAGED_URL_BASE).pathname
    const normalized = pathname.replace(/\/+$/, '')
    return normalized === '' ? '/' : normalized
  } catch {
    return null
  }
}

function diskPathFor(rowPath, uploadsDir, uploadsPublicPath) {
  const pathname = normalizeManagedImagePath(rowPath, uploadsPublicPath)
  const root = managedRoot(uploadsPublicPath)
  if (!pathname || !root) return null

  const filename = path.posix.basename(pathname)
  const expectedPath = root === '/' ? `/${filename}` : `${root}/${filename}`
  if (filename === '' || filename === '.' || filename === '..' || pathname !== expectedPath) {
    return null
  }

  const resolvedDir = path.resolve(uploadsDir)
  const diskPath = path.resolve(resolvedDir, filename)
  return path.dirname(diskPath) === resolvedDir ? diskPath : null
}

export async function reclaimExpiredImages(deps, userId, now) {
  validateInputs(deps, userId, now)
  const logger = deps.logger ?? silentLogger
  const draftRows = await deps.listDraftDocuments(userId)

  let documents
  try {
    documents = draftRows.map((row) => JSON.parse(documentJson(row)))
  } catch (err) {
    logError(logger, { err, userId }, 'failed to parse drafts during image reclamation')
    return { reclaimedBytes: 0, aborted: true }
  }

  const referencedPaths = new Set()
  for (const document of documents) {
    for (const pathname of collectManagedImagePaths(document, deps.uploadsPublicPath)) {
      referencedPaths.add(pathname)
    }
  }

  const images = await deps.listImages(userId)
  let reclaimedBytes = 0

  for (const row of images) {
    if (row?.user_id !== userId) continue

    const managedPath = normalizeManagedImagePath(row.path, deps.uploadsPublicPath)
    if (managedPath && referencedPaths.has(managedPath)) continue
    if (!Number.isFinite(row.lease_expires_at) || row.lease_expires_at > now) continue

    const diskPath = diskPathFor(row.path, deps.uploadsDir, deps.uploadsPublicPath)
    if (!diskPath) {
      logError(logger, { path: row.path, imageId: row.id }, 'invalid managed image path')
      continue
    }

    try {
      await deps.removeFile(diskPath)
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        logError(
          logger,
          { err, path: diskPath, imageId: row.id },
          'failed to remove expired image',
        )
        continue
      }
    }

    await deps.deleteImage(row.id, userId)
    reclaimedBytes += Number.isFinite(row.bytes) && row.bytes > 0 ? row.bytes : 0
  }

  return { reclaimedBytes, aborted: false }
}
