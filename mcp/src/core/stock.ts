// Search the online stock photo library for the agent: through the deployed
// server's proxy when one is configured (its keys stay server-side, and
// chosen photos import server-side into a stable URL), or straight to
// keyless Openverse otherwise (CC0 only, so anything made with the results is
// safe to publish).

import type { DingcardServer } from './serverClient'

export interface StockImageHit {
  id: string
  /** The preview URL; with no better one it still works in an image field. */
  thumb: string
  /** The full-size image URL, when the source exposes one. */
  url?: string
  width: number
  height: number
  author: string
  /** e.g. cc0 — only Openverse states one. */
  license?: string
}

export type StockSearch =
  | { ok: true; server: boolean; source: string; page: number; total: number; hits: StockImageHit[] }
  | { ok: false; error: string }

/** How long a search waits on the upstream library before giving up. */
const SEARCH_TIMEOUT_MS = 15000
const OPENVERSE_PAGE_SIZE = 12
const QUERY_MAX_CHARS = 64

function cleanQuery(query: unknown): string | null {
  if (typeof query !== 'string') return null
  const trimmed = query.trim()
  if (trimmed.length === 0 || trimmed.length > QUERY_MAX_CHARS) return null
  return trimmed
}

function fetchWithTimeout(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Response> {
  return fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
}

/** The server proxy's normalized hit, as src/storage's StockHit shape. */
interface ServerHit {
  id?: unknown
  thumb?: unknown
  width?: unknown
  height?: unknown
  author?: unknown
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Search the stock library for `query`. With a `server`, its proxy answers
 * (the source's API key never leaves the server); without one, Openverse
 * answers directly with CC0 photos whose `url` is ready to use.
 */
export async function searchStockImages(
  query: unknown,
  options: {
    page?: unknown
    source?: unknown
    server: DingcardServer | null
    fetchImpl?: typeof fetch
  },
): Promise<StockSearch> {
  const cleaned = cleanQuery(query)
  if (cleaned === null) {
    return { ok: false, error: `搜索词需为 1–${QUERY_MAX_CHARS} 个字符` }
  }
  const page = typeof options.page === 'number' && Number.isInteger(options.page)
    && options.page >= 1 && options.page <= 50 ? options.page : 1
  const source = typeof options.source === 'string' && options.source.trim() !== ''
    ? options.source.trim()
    : undefined

  if (options.server) {
    try {
      const params = new URLSearchParams({ q: cleaned, page: String(page) })
      if (source !== undefined) params.set('source', source)
      const raw = await options.server.apiGet(`/api/stock/search?${params.toString()}`) as {
        source?: unknown
        page?: unknown
        total?: unknown
        results?: unknown
      }
      const hits: StockImageHit[] = Array.isArray(raw.results)
        ? (raw.results as ServerHit[]).flatMap((hit) => {
          if (typeof hit?.id !== 'string' || hit.id === '' || typeof hit.thumb !== 'string' || hit.thumb === '') return []
          return [{
            id: hit.id,
            thumb: hit.thumb,
            width: numberOrZero(hit.width),
            height: numberOrZero(hit.height),
            author: typeof hit.author === 'string' ? hit.author : '',
          }]
        })
        : []
      return {
        ok: true,
        server: true,
        source: typeof raw.source === 'string' ? raw.source : (source ?? ''),
        page: numberOrZero(raw.page) || page,
        total: numberOrZero(raw.total),
        hits,
      }
    } catch (error) {
      return { ok: false, error: `服务端图库搜索失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }

  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const params = new URLSearchParams({
    q: cleaned,
    page: String(page),
    page_size: String(OPENVERSE_PAGE_SIZE),
    license: 'cc0',
  })
  try {
    const response = await fetchWithTimeout(`https://api.openverse.org/v1/images/?${params.toString()}`, fetchImpl, SEARCH_TIMEOUT_MS)
    if (!response.ok) {
      return { ok: false, error: `Openverse 搜索失败（HTTP ${response.status}）：稍后再试，或配置 DINGCARD_SERVER_URL 走服务端图库` }
    }
    const data = await response.json() as {
      result_count?: unknown
      results?: Array<Record<string, unknown>>
    }
    const hits: StockImageHit[] = Array.isArray(data.results)
      ? data.results.flatMap((entry) => {
        if (typeof entry.id !== 'string' || entry.id === '' || typeof entry.thumbnail !== 'string' || entry.thumbnail === '') return []
        return [{
          id: entry.id,
          thumb: entry.thumbnail,
          ...(typeof entry.url === 'string' && entry.url !== '' ? { url: entry.url } : {}),
          width: numberOrZero(entry.width),
          height: numberOrZero(entry.height),
          author: typeof entry.creator === 'string' ? entry.creator : '',
          ...(typeof entry.license === 'string' ? { license: entry.license } : {}),
        }]
      })
      : []
    return {
      ok: true,
      server: false,
      source: 'openverse',
      page,
      total: numberOrZero(data.result_count),
      hits,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { ok: false, error: 'Openverse 搜索超时：稍后再试，或配置 DINGCARD_SERVER_URL 走服务端图库' }
    }
    return { ok: false, error: `Openverse 搜索失败：${error instanceof Error ? error.message : String(error)}` }
  }
}

export type StockImport =
  | { ok: true; url: string; alt: string }
  | { ok: false; error: string }

/**
 * Download a chosen photo through the server into the account's uploads, so
 * the card carries a stable URL of the full-size image instead of a preview.
 */
export async function importStockImage(
  source: unknown,
  id: unknown,
  options: { server: DingcardServer | null },
): Promise<StockImport> {
  if (!options.server) {
    return { ok: false, error: '转存图片需要部署的服务端：设置 DINGCARD_SERVER_URL（和账号）后重启 MCP。没配置时直接用搜索结果里的 url 即可' }
  }
  if (typeof source !== 'string' || source.trim() === '' || typeof id !== 'string' || id.trim() === '') {
    return { ok: false, error: 'source 和 id 都要给（来自 search_images 的结果）' }
  }
  try {
    const raw = await options.server.apiPost('/api/stock/import', { source, id }) as {
      url?: unknown
      alt?: unknown
    }
    if (typeof raw?.url !== 'string' || raw.url === '') {
      return { ok: false, error: '转存失败：服务器没有返回图片地址' }
    }
    return { ok: true, url: raw.url, alt: typeof raw.alt === 'string' ? raw.alt : '' }
  } catch (error) {
    return { ok: false, error: `转存图片失败：${error instanceof Error ? error.message : String(error)}` }
  }
}
