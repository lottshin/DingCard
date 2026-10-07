// Stock photo providers behind the /api/stock proxy. API keys stay in server
// env vars; the browser only ever sees source ids, thumbnails and normalized
// results. Each provider resolves an id through the provider's own API, so
// the import route downloads a canonical URL it picked itself — never a URL
// handed in by the client.

export const STOCK_SEARCH_TIMEOUT_MS = 10_000
export const STOCK_DOWNLOAD_TIMEOUT_MS = 20_000

// Ids are interpolated into provider URLs after passing these patterns, which
// is what keeps the import endpoint from being aimed at arbitrary URLs.
const NUMERIC_ID = /^\d{1,19}$/
const UNSPLASH_ID = /^[A-Za-z0-9_-]{1,32}$/
const OPENVERSE_ID = /^[0-9a-fA-F-]{8,64}$/

/** Upstream call failed (network, HTTP status, or malformed payload). */
export class StockUpstreamError extends Error {
  constructor(message = '图库服务暂时不可用，请稍后重试') {
    super(message)
    this.name = 'StockUpstreamError'
  }
}

/** The provider answered, but has no image for this id. */
export class StockNotFoundError extends Error {
  constructor(message = '图库中没有这张图片') {
    super(message)
    this.name = 'StockNotFoundError'
  }
}

/**
 * Fetch JSON from a provider. `notFound` marks detail endpoints where a 404
 * means "no such image" rather than an upstream outage. The timeout is
 * injectable so tests can run with near-zero timers.
 */
export async function fetchStockJson(fetchFn, url, { headers, notFound, timeoutMs = STOCK_SEARCH_TIMEOUT_MS } = {}) {
  let response
  try {
    response = await fetchFn(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new StockUpstreamError()
  }
  if (!response.ok) {
    if (notFound && response.status === 404) throw new StockNotFoundError()
    throw new StockUpstreamError()
  }
  try {
    return await response.json()
  } catch {
    throw new StockUpstreamError()
  }
}

function toCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export const stockProviders = {
  pixabay: {
    label: 'Pixabay',
    keyed: true,
    idPattern: NUMERIC_ID,
    searchUrl(key, q, page) {
      const params = new URLSearchParams({
        key,
        q,
        image_type: 'photo',
        per_page: '24',
        page: String(page),
        safe_search: 'true',
      })
      return `https://pixabay.com/api/?${params}`
    },
    parseSearch(json) {
      const hits = Array.isArray(json?.hits) ? json.hits : []
      return {
        total: toCount(json?.total),
        results: hits.flatMap((hit) => {
          if (!hit || !NUMERIC_ID.test(String(hit.id ?? ''))) return []
          const thumb = toText(hit.webformatURL)
          if (thumb === '') return []
          return [{
            id: String(hit.id),
            thumb,
            width: toCount(hit.webformatWidth),
            height: toCount(hit.webformatHeight),
            author: toText(hit.user),
          }]
        }),
      }
    },
    resolveUrl(key, id) {
      return `https://pixabay.com/api/?${new URLSearchParams({ key, id })}`
    },
    parseResolve(json) {
      const hit = Array.isArray(json?.hits) ? json.hits[0] : undefined
      const url = toText(hit?.largeImageURL)
      if (url === '') throw new StockNotFoundError()
      return { url, author: toText(hit?.user) }
    },
  },

  unsplash: {
    label: 'Unsplash',
    keyed: true,
    idPattern: UNSPLASH_ID,
    searchUrl(key, q, page) {
      const params = new URLSearchParams({
        client_id: key,
        query: q,
        per_page: '24',
        page: String(page),
        content_filter: 'high',
      })
      return `https://api.unsplash.com/search/photos?${params}`
    },
    parseSearch(json) {
      const photos = Array.isArray(json?.results) ? json.results : []
      return {
        total: toCount(json?.total),
        results: photos.flatMap((photo) => {
          const id = toText(photo?.id)
          const thumb = toText(photo?.urls?.small)
          if (id === '' || thumb === '' || !UNSPLASH_ID.test(id)) return []
          return [{
            id,
            thumb,
            width: toCount(photo.width),
            height: toCount(photo.height),
            author: toText(photo?.user?.name),
          }]
        }),
      }
    },
    resolveUrl(key, id) {
      return `https://api.unsplash.com/photos/${encodeURIComponent(id)}?${new URLSearchParams({ client_id: key })}`
    },
    parseResolve(json) {
      const url = toText(json?.urls?.regular)
      if (url === '') throw new StockNotFoundError()
      return { url, author: toText(json?.user?.name) }
    },
  },

  pexels: {
    label: 'Pexels',
    keyed: true,
    idPattern: NUMERIC_ID,
    headers(key) {
      return { authorization: key }
    },
    searchUrl(_key, q, page) {
      const params = new URLSearchParams({ query: q, per_page: '24', page: String(page) })
      return `https://api.pexels.com/v1/search?${params}`
    },
    parseSearch(json) {
      const photos = Array.isArray(json?.photos) ? json.photos : []
      return {
        total: toCount(json?.total_results),
        results: photos.flatMap((photo) => {
          if (!photo || !NUMERIC_ID.test(String(photo.id ?? ''))) return []
          const thumb = toText(photo?.src?.medium)
          if (thumb === '') return []
          return [{
            id: String(photo.id),
            thumb,
            width: toCount(photo.width),
            height: toCount(photo.height),
            author: toText(photo.photographer),
          }]
        }),
      }
    },
    resolveUrl(_key, id) {
      return `https://api.pexels.com/v1/photos/${id}`
    },
    parseResolve(json) {
      const url = toText(json?.src?.large2x)
      if (url === '') throw new StockNotFoundError()
      return { url, author: toText(json?.photographer) }
    },
  },

  openverse: {
    label: 'Openverse',
    keyed: false,
    idPattern: OPENVERSE_ID,
    searchUrl(_key, q, page) {
      const params = new URLSearchParams({
        q,
        license: 'cc0,pdm',
        extension: 'jpg,png',
        page_size: '20',
        page: String(page),
      })
      return `https://api.openverse.org/v1/images/?${params}`
    },
    parseSearch(json) {
      const images = Array.isArray(json?.results) ? json.results : []
      return {
        total: toCount(json?.result_count),
        results: images.flatMap((image) => {
          const id = toText(image?.id)
          // The thumbnail is Openverse's own proxy; a few sources only expose
          // the original URL, which still makes a usable grid tile.
          const thumb = toText(image?.thumbnail) || toText(image?.url)
          if (id === '' || !OPENVERSE_ID.test(id) || thumb === '') return []
          return [{
            id,
            thumb,
            width: toCount(image.width),
            height: toCount(image.height),
            author: toText(image?.creator),
          }]
        }),
      }
    },
    resolveUrl(_key, id) {
      return `https://api.openverse.org/v1/images/${id}/`
    },
    parseResolve(json) {
      const url = toText(json?.url)
      if (url === '') throw new StockNotFoundError()
      return { url, author: toText(json?.creator) }
    },
  },
}

export const STOCK_SOURCE_IDS = ['pixabay', 'unsplash', 'pexels', 'openverse']
