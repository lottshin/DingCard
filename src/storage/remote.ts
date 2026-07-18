// Remote storage backend — talks to the Fastify + SQLite server over HTTP.
//
// Enabled only when VITE_API_BASE is set (see index.ts). The adapter keeps the
// UI-facing contract identical to LocalStore while adding conditional session
// invalidation, draft normalization, and managed-image lease renewal.

import type { User } from '../auth'
import { normalizeDraftForRead, normalizeDraftForWrite } from '../drafts'
import type { SaveDraftInput } from '../drafts'
import {
  collectFreeformImageSources,
  uploadInlineFreeformImages,
} from '../freeform/imageAssets'
import type { AuthStore, DraftStore, ImageStore, Storage } from './types'

const TOKEN_KEY = 'slicer.token.v1'
const invalidationListeners = new Set<() => void>()

let memoryToken: string | null = null
let tokenLoaded = false
let authGeneration = 0

export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function currentToken(): string | null {
  if (!tokenLoaded) {
    tokenLoaded = true
    try {
      const stored = localStorage.getItem(TOKEN_KEY)
      memoryToken = typeof stored === 'string' && stored !== '' ? stored : null
    } catch {
      // Keep the in-memory value when persistent storage is unavailable.
    }
  }
  return memoryToken
}

function setToken(token: string | null): void {
  memoryToken = token
  tokenLoaded = true
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // The page-level session remains usable through memoryToken.
  }
}

function invalidateToken(requestToken: string | null): void {
  if (!requestToken || currentToken() !== requestToken) return
  setToken(null)
  for (const listener of [...invalidationListeners]) {
    try {
      listener()
    } catch {
      // One UI subscriber must not replace the request error or block others.
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  )
}

function normalizeSaveInput(data: SaveDraftInput): SaveDraftInput {
  const normalized = normalizeDraftForWrite(data)
  if (!normalized) throw new ApiError('远程草稿内容无效', null)
  return normalized
}

interface ApiRequestInit extends RequestInit {
  authenticated?: boolean
}

interface ApiResponse<T> {
  data: T
  status: number
}

export function createRemoteStore(apiBase: string): Storage {
  const base = apiBase.replace(/\/+$/, '')

  async function api<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResponse<T>> {
    const { authenticated = true, ...requestInit } = init
    const requestToken = authenticated ? currentToken() : null
    const headers = new Headers(requestInit.headers)
    if (requestToken) headers.set('authorization', `Bearer ${requestToken}`)
    if (
      requestInit.body &&
      !(requestInit.body instanceof FormData) &&
      !headers.has('content-type')
    ) {
      headers.set('content-type', 'application/json')
    }

    let response: Response
    try {
      response = await fetch(`${base}${path}`, { ...requestInit, headers })
    } catch {
      throw new ApiError('网络请求失败，请检查网络后重试', null)
    }

    if (response.status === 401) invalidateToken(requestToken)

    let text: string
    try {
      text = await response.text()
    } catch {
      throw new ApiError('服务器返回了无效响应', response.status)
    }

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new ApiError('服务器返回了无效响应', response.status)
    }

    if (!response.ok) {
      const message = isRecord(data) && typeof data.error === 'string'
        ? data.error
        : `请求失败（${response.status}）`
      throw new ApiError(message, response.status)
    }

    return { data: data as T, status: response.status }
  }

  const auth: AuthStore = {
    async register(username, password) {
      const generation = ++authGeneration
      const { data, status } = await api<unknown>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        authenticated: false,
      })
      if (generation !== authGeneration) {
        throw new ApiError('认证请求已失效', null)
      }
      if (
        !isRecord(data) ||
        !isUser(data.user) ||
        typeof data.token !== 'string' ||
        data.token === ''
      ) {
        throw new ApiError('服务器返回了无效响应', status)
      }
      setToken(data.token)
      return data.user
    },
    async login(username, password) {
      const generation = ++authGeneration
      const { data, status } = await api<unknown>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        authenticated: false,
      })
      if (generation !== authGeneration) {
        throw new ApiError('认证请求已失效', null)
      }
      if (
        !isRecord(data) ||
        !isUser(data.user) ||
        typeof data.token !== 'string' ||
        data.token === ''
      ) {
        throw new ApiError('服务器返回了无效响应', status)
      }
      setToken(data.token)
      return data.user
    },
    async logout() {
      authGeneration += 1
      setToken(null)
    },
    async current() {
      let requestToken = currentToken()
      while (requestToken) {
        try {
          const { data, status } = await api<unknown>('/api/auth/me')
          const latestToken = currentToken()
          if (latestToken !== requestToken) {
            requestToken = latestToken
            continue
          }
          if (!isRecord(data) || !isUser(data.user)) {
            throw new ApiError('服务器返回了无效响应', status)
          }
          return data.user
        } catch (error) {
          const latestToken = currentToken()
          if (latestToken !== requestToken) {
            requestToken = latestToken
            continue
          }
          if (error instanceof ApiError && error.status === 401) return null
          throw error
        }
      }
      return null
    },
    onInvalidated(listener) {
      invalidationListeners.add(listener)
      return () => invalidationListeners.delete(listener)
    },
  }

  const apiOrigin = (() => {
    try {
      if (/^https?:\/\//i.test(base)) return new URL(base).origin
      if (typeof location !== 'undefined' && location.origin) return location.origin
    } catch {
      // Invalid bases will fail normally when fetch is attempted.
    }
    return null
  })()

  function sameOriginRetainCandidates(hrefs: readonly string[]): string[] {
    const unique = new Map<string, string>()
    const fallbackOrigin = apiOrigin ?? 'http://local.invalid'

    for (const value of hrefs) {
      if (typeof value !== 'string') continue
      const href = value.trim()
      if (href === '' || /^data:/i.test(href) || href.startsWith('img:')) continue

      let parsed: URL
      try {
        if (href.startsWith('/') && !href.startsWith('//')) {
          parsed = new URL(href, fallbackOrigin)
        } else if (href.startsWith('//')) {
          if (!apiOrigin) continue
          parsed = new URL(href, apiOrigin)
          if (parsed.origin !== apiOrigin) continue
        } else if (/^https?:\/\//i.test(href)) {
          if (!apiOrigin) continue
          parsed = new URL(href)
          if (parsed.origin !== apiOrigin) continue
        } else {
          continue
        }
      } catch {
        continue
      }

      if (parsed.pathname === '/') continue
      if (!unique.has(parsed.pathname)) unique.set(parsed.pathname, href)
    }

    return [...unique.values()]
  }

  function publicImageUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('//')) {
      return apiOrigin ? new URL(url, apiOrigin).href : url
    }
    if (url.startsWith('/') && /^https?:\/\//i.test(base)) {
      return new URL(url, base).href
    }
    return url.startsWith('/') ? url : `${base}/${url.replace(/^\/+/, '')}`
  }

  const images: ImageStore = {
    async put(dataUrl) {
      const blob = await (await fetch(dataUrl)).blob()
      const form = new FormData()
      form.append('file', blob)
      const { data, status } = await api<unknown>('/api/images', {
        method: 'POST',
        body: form,
      })
      if (!isRecord(data) || typeof data.url !== 'string' || data.url.trim() === '') {
        throw new ApiError('服务器返回了无效图片地址', status)
      }
      return publicImageUrl(data.url)
    },
    resolve: (href) => href,
    isRef: () => false,
    register: () => {},
    collect: () => ({}),
    async retain(hrefs) {
      const urls = sameOriginRetainCandidates(hrefs)
      if (urls.length === 0) return
      await api('/api/images/retain', {
        method: 'POST',
        body: JSON.stringify({ urls }),
      })
    },
  }

  const drafts: DraftStore = {
    async list() {
      const { data, status } = await api<unknown>('/api/drafts')
      if (!Array.isArray(data)) {
        throw new ApiError('服务器返回了无效草稿列表', status)
      }
      return data
        .map(normalizeDraftForRead)
        .filter((draft): draft is NonNullable<typeof draft> => draft !== null)
    },
    async save(_userId, data) {
      const validated = normalizeSaveInput(data)
      let prepared: SaveDraftInput = validated
      if (validated.mode === 'freeform-slide') {
        await images.retain(collectFreeformImageSources(validated.document))
        const document = await uploadInlineFreeformImages(validated.document, (dataUrl) => (
          images.put(dataUrl)
        ))
        await images.retain(collectFreeformImageSources(document))
        prepared = { ...validated, document }
      }

      const { data: raw, status } = await api<unknown>('/api/drafts', {
        method: 'POST',
        body: JSON.stringify(prepared),
      })
      const normalized = normalizeDraftForRead(raw)
      if (!normalized) throw new ApiError('服务器返回了无效草稿', status)
      return normalized
    },
    async remove(_userId, id) {
      await api(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }

  return { auth, drafts, images, remote: true }
}
