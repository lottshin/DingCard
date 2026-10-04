// A minimal client for a deployed dingcard server: log in, upload rendered
// pages, and put a deck behind a share link. Agents hand their work to
// humans as a link (or QR code) instead of a file the human never receives.

/** A share exactly as the server's API describes it, with an absolute url. */
export interface ServerShare {
  id: string
  title: string
  url: string
  createdAt: number
  expiresAt: number
  imageCount: number
}

export interface ServerClientOptions {
  /** The deployed server's origin, e.g. https://cards.example.com */
  serverUrl: string
  /** A dingcard account; both are required before the first request. */
  username?: string
  password?: string
  fetchImpl?: typeof fetch
}

export interface DingcardServer {
  /** Upload one rendered page; returns its managed (absolute) URL. */
  uploadImage(bytes: Uint8Array, filename: string): Promise<string>
  createShare(title: string, urls: readonly string[], expiresInHours?: number): Promise<ServerShare>
  listShares(): Promise<ServerShare[]>
  /** Idempotent: revoking a share that is already gone resolves. */
  revokeShare(id: string): Promise<void>
}

interface ShareEnvelope {
  id?: unknown
  title?: unknown
  url?: unknown
  createdAt?: unknown
  expiresAt?: unknown
  imageCount?: unknown
}

async function errorText(response: Response): Promise<string> {
  let detail = ''
  try {
    const body = await response.json() as { error?: unknown }
    if (body && typeof body.error === 'string' && body.error.trim() !== '') detail = body.error
  } catch {
    // A non-JSON body carries nothing worth reporting.
  }
  return `服务器返回 ${response.status}${detail ? `：${detail}` : ''}`
}

function toShare(base: string, raw: unknown): ServerShare | null {
  if (typeof raw !== 'object' || raw === null) return null
  const envelope = raw as ShareEnvelope
  if (typeof envelope.id !== 'string') return null
  if (typeof envelope.url !== 'string' || envelope.url === '') return null
  return {
    id: envelope.id,
    title: typeof envelope.title === 'string' ? envelope.title : '',
    url: envelope.url.startsWith('http') ? envelope.url : `${base}${envelope.url}`,
    createdAt: typeof envelope.createdAt === 'number' ? envelope.createdAt : 0,
    expiresAt: typeof envelope.expiresAt === 'number' ? envelope.expiresAt : 0,
    imageCount: typeof envelope.imageCount === 'number' ? envelope.imageCount : 0,
  }
}

/** A client for the configured server, or null when no server is configured. */
export function serverClientFromEnv(env: { [key: string]: string | undefined } = process.env): DingcardServer | null {
  const serverUrl = (env.DINGCARD_SERVER_URL ?? '').trim()
  if (serverUrl === '') return null
  return createServerClient({
    serverUrl,
    username: env.DINGCARD_SERVER_USERNAME,
    password: env.DINGCARD_SERVER_PASSWORD,
  })
}

export function createServerClient(options: ServerClientOptions): DingcardServer {
  const base = options.serverUrl.trim().replace(/\/+$/, '')
  if (base === '') throw new Error('服务端地址为空')
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init))
  let token: string | null = null

  async function login(): Promise<void> {
    if (!options.username || !options.password) {
      throw new Error('未配置服务端账号：设置 DINGCARD_SERVER_USERNAME 和 DINGCARD_SERVER_PASSWORD（一个叮卡账号），重启 MCP 后再分享')
    }
    const response = await fetchImpl(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: options.username, password: options.password }),
    })
    if (!response.ok) throw new Error(`登录失败（${await errorText(response)}）：检查 DINGCARD_SERVER_USERNAME / DINGCARD_SERVER_PASSWORD`)
    const data = await response.json() as { token?: unknown } | null
    if (typeof data?.token !== 'string' || data.token === '') {
      throw new Error('登录失败：服务器没有返回令牌')
    }
    token = data.token
  }

  /** One authenticated request; a 401 logs in again and retries once. */
  async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    if (token === null) await login()
    const headers = { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` }
    const response = await fetchImpl(`${base}${path}`, { ...init, headers })
    if (response.status === 401 && retry) {
      token = null
      await login()
      return request(path, init, false)
    }
    return response
  }

  return {
    async uploadImage(bytes: Uint8Array, filename: string) {
      const form = new FormData()
      form.append('file', new Blob([bytes as BlobPart], { type: 'image/png' }), filename)
      const response = await request('/api/images', { method: 'POST', body: form })
      if (!response.ok) throw new Error(`图片上传失败（${await errorText(response)}）`)
      const data = await response.json() as { url?: unknown } | null
      if (typeof data?.url !== 'string' || data.url === '') {
        throw new Error('图片上传失败：服务器没有返回图片地址')
      }
      return data.url.startsWith('http') ? data.url : `${base}${data.url}`
    },
    async createShare(title, urls, expiresInHours) {
      const response = await request('/api/shares', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, urls, ...(expiresInHours !== undefined ? { expiresInHours } : {}) }),
      })
      if (!response.ok) throw new Error(`分享创建失败（${await errorText(response)}）`)
      const share = toShare(base, await response.json())
      if (!share) throw new Error('分享创建失败：服务器返回了无效的分享')
      return share
    },
    async listShares() {
      const response = await request('/api/shares')
      if (!response.ok) throw new Error(`分享列表读取失败（${await errorText(response)}）`)
      const raw = await response.json()
      if (!Array.isArray(raw)) throw new Error('分享列表读取失败：服务器返回了无效列表')
      return raw.map((item) => toShare(base, item)).filter((share): share is ServerShare => share !== null)
    },
    async revokeShare(id) {
      const response = await request(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE' })
      // Revoking something already revoked (or never ours) is the goal, not an error.
      if (!response.ok && response.status !== 404) {
        throw new Error(`撤销分享失败（${await errorText(response)}）`)
      }
    },
  }
}
