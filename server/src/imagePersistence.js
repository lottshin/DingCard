const silentLogger = { error() {} }

function logCleanupFailure(logger, cleanupError, diskPath) {
  try {
    logger.error(
      { err: cleanupError, path: diskPath },
      'failed to remove untracked upload',
    )
  } catch {
    // The insert failure remains the authoritative error.
  }
}

function requireFunction(deps, name) {
  if (typeof deps[name] !== 'function') {
    throw new TypeError(`deps.${name} must be a function`)
  }
}

function validateInputs(deps, row, bytes) {
  if (deps === null || typeof deps !== 'object' || Array.isArray(deps)) {
    throw new TypeError('deps must be an object')
  }
  for (const name of ['writeFile', 'insertImage', 'removeFile']) {
    requireFunction(deps, name)
  }
  if (deps.logger !== undefined && typeof deps.logger?.error !== 'function') {
    throw new TypeError('deps.logger.error must be a function')
  }
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new TypeError('row must be an object')
  }
  if (typeof row.diskPath !== 'string' || row.diskPath.trim() === '') {
    throw new TypeError('row.diskPath must be a non-empty string')
  }
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError('bytes must be a Buffer or Uint8Array')
  }
}

export async function persistImageFile(deps, row, bytes) {
  validateInputs(deps, row, bytes)
  const logger = deps.logger ?? silentLogger
  const { diskPath, ...imageRow } = row

  await deps.writeFile(diskPath, bytes)

  try {
    await deps.insertImage(imageRow)
  } catch (insertError) {
    try {
      await deps.removeFile(diskPath)
    } catch (cleanupError) {
      logCleanupFailure(logger, cleanupError, diskPath)
    }
    throw insertError
  }

  return row
}
