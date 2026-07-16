const MANAGED_URL_BASE = 'http://managed.local'

function normalizeUploadsPath(uploadsPublicPath) {
  if (typeof uploadsPublicPath !== 'string' || uploadsPublicPath.trim() === '') {
    return null
  }

  try {
    const pathname = new URL(uploadsPublicPath, MANAGED_URL_BASE).pathname
    const normalized = pathname.replace(/\/+$/, '')
    return normalized === '' ? '/' : normalized
  } catch {
    return null
  }
}

export function normalizeManagedImagePath(value, uploadsPublicPath) {
  if (typeof value !== 'string') return null

  const input = value.trim()
  if (!input.startsWith('/') && !/^https?:\/\//i.test(input)) return null

  const managedRoot = normalizeUploadsPath(uploadsPublicPath)
  if (!managedRoot) return null

  try {
    const url = new URL(input, MANAGED_URL_BASE)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

    const managedPrefix = managedRoot === '/' ? '/' : `${managedRoot}/`
    return url.pathname.startsWith(managedPrefix) && url.pathname !== managedRoot
      ? url.pathname
      : null
  } catch {
    return null
  }
}

export function collectManagedImagePaths(value, uploadsPublicPath) {
  const paths = new Set()
  const seen = new WeakSet()
  const pending = [value]

  while (pending.length > 0) {
    const current = pending.pop()
    const path = normalizeManagedImagePath(current, uploadsPublicPath)
    if (path) {
      paths.add(path)
      continue
    }

    if (current === null || typeof current !== 'object' || seen.has(current)) {
      continue
    }

    seen.add(current)
    const children = Object.values(current)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index])
    }
  }

  return [...paths]
}
