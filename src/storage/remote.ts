// Remote storage backend — talks to the Fastify + SQLite server over HTTP.
//
// Enabled only when VITE_API_BASE is set (see index.ts). Gives real accounts,
// cross-device sync and server-side image storage. The JWT is kept in
// localStorage and sent as `Authorization: Bearer <token>` on every request.

import type { AuthStore, DraftStore, ImageStore, Storage } from './types'
import type { Draft } from '../drafts'
import type { User } from '../auth'

const TOKEN_KEY = 'slicer.token.v1'

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable (private mode) — token lives only for this page load
  }
}

export function createRemoteStore(apiBase: string): Storage {
  // Normalise: no trailing slash, so `${base}/api/...` is always well-formed.
  const base = apiBase.replace(/\/+$/, '')

  /**
   * Fetch a JSON endpoint with the auth header attached. Throws Error(message)
   * on non-2xx, using the server's `{ error }` body when present so the existing
   * UI (AuthModal etc.) can surface it verbatim.
   */
  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = getToken()
    const headers = new Headers(init.headers)
    if (token) headers.set('authorization', `Bearer ${token}`)
    // Only set JSON content-type when we're sending a plain body (not FormData).
    if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const res = await fetch(`${base}${path}`, { ...init, headers })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null

    if (!res.ok) {
      const message = (data && data.error) || `请求失败（${res.status}）`
      throw new Error(message)
    }
    return data as T
  }

  const auth: AuthStore = {
    async register(username, password) {
      const { user, token } = await api<{ user: User; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setToken(token)
      return user
    },
    async login(username, password) {
      const { user, token } = await api<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      setToken(token)
      return user
    },
    async logout() {
      setToken(null)
    },
    async current() {
      if (!getToken()) return null
      try {
        const { user } = await api<{ user: User }>('/api/auth/me')
        return user
      } catch {
        // token expired / invalid — drop it and report signed-out
        setToken(null)
        return null
      }
    },
  }

  const drafts: DraftStore = {
    // userId is implied by the JWT server-side; the param is kept for interface
    // parity with the local store but not sent.
    async list() {
      return api<Draft[]>('/api/drafts')
    },
    async save(_userId, data) {
      return api<Draft>('/api/drafts', { method: 'POST', body: JSON.stringify(data) })
    },
    async remove(_userId, id) {
      await api<{ ok: true }>(`/api/drafts/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
  }

  const images: ImageStore = {
    // Upload the (already-downscaled) image; the server returns a real
    // `/uploads/x` URL which we embed directly in the document. Because the URL
    // is absolute-to-the-server, prefix it with the API base so <img src> works
    // even when the SPA is served from a different origin.
    async put(dataUrl) {
      const blob = await (await fetch(dataUrl)).blob()
      const form = new FormData()
      form.append('file', blob)
      const { url } = await api<{ ref: string; url: string }>('/api/images', {
        method: 'POST',
        body: form,
      })
      return url.startsWith('http') ? url : `${base}${url}`
    },
    // Remote images are embedded as real URLs, so resolve/isRef/register/collect
    // are effectively no-ops: a real URL passes through untouched, and there are
    // no `img:` refs to track or embed.
    resolve: (href) => href,
    isRef: () => false,
    register: () => {},
    collect: () => ({}),
  }

  return { auth, drafts, images, remote: true }
}
