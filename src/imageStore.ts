// Image store — keeps big base64 data URLs OUT of the markdown source.
//
// When a user pastes a screenshot, the raw data URL can be hundreds of KB.
// Inlining that into the markdown makes the editor re-parse/re-paginate a
// gigantic string on every keystroke and slows PNG export to a crawl.
//
// Instead we stash the data URL here under a short id and put only a tiny
// reference — `img:<id>` — into the markdown. The renderer resolves the ref
// back to the real data URL at display/export time.
//
// Persisted to sessionStorage so a page reload within the session keeps the
// images. Drafts saved to localStorage embed their own referenced images (see
// drafts.ts) so they survive across sessions.

const KEY = 'slicer.images.v1'
const PREFIX = 'img:'

type Store = Record<string, string>

function load(): Store {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

let store: Store = load()

function persist() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // sessionStorage may be full (many/large images) — keep working in-memory.
  }
}

/** Store a data URL and return its short `img:<id>` reference. */
export function putImage(dataUrl: string): string {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
  store[id] = dataUrl
  persist()
  return PREFIX + id
}

/** True if `href` is one of our short references. */
export function isImageRef(href: string): boolean {
  return href.startsWith(PREFIX)
}

/** Resolve a reference (or plain URL) to a displayable src. */
export function resolveImage(href: string): string {
  if (!isImageRef(href)) return href
  return store[href.slice(PREFIX.length)] ?? ''
}

/** Register an existing ref→dataURL pair (used when loading a draft). */
export function registerImage(ref: string, dataUrl: string): void {
  if (!isImageRef(ref)) return
  store[ref.slice(PREFIX.length)] = dataUrl
  persist()
}

/** Collect the data URLs for every `img:` ref used in a markdown source. */
export function collectImages(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /!\[[^\]]*\]\((img:[a-z0-9]+)\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const ref = m[1]
    const url = resolveImage(ref)
    if (url) out[ref] = url
  }
  return out
}

/**
 * Downscale a pasted image before we store it. Screenshot tools hand us the
 * full-resolution capture (often 2000-4000px, several MB as a data URL). The
 * card content area is only ~300px wide, exported at 3x ≈ 900px, so anything
 * beyond ~1200px is wasted bytes that make BOTH the editor and the PNG export
 * slow (html-to-image has to serialize and decode the whole image per page).
 *
 * We redraw the image onto a canvas capped at `maxEdge` and re-encode it.
 * PNG is kept for images with transparency; everything else becomes JPEG at
 * high quality, which is dramatically smaller for photos/screenshots.
 */
export function downscaleDataUrl(dataUrl: string, maxEdge = 1200): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      const scale = Math.min(1, maxEdge / Math.max(width, height))
      // Already small enough — keep as-is, no re-encode.
      if (scale === 1) {
        resolve(dataUrl)
        return
      }
      const w = Math.round(width * scale)
      const h = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      // PNG data URLs may carry transparency; keep PNG for those, else JPEG.
      const isPng = dataUrl.startsWith('data:image/png')
      const out = isPng
        ? canvas.toDataURL('image/png')
        : canvas.toDataURL('image/jpeg', 0.9)
      // If PNG re-encode somehow got bigger, fall back to JPEG.
      if (isPng && out.length > dataUrl.length) {
        resolve(canvas.toDataURL('image/jpeg', 0.9))
        return
      }
      resolve(out)
    }
    img.onerror = () => resolve(dataUrl) // on any failure, keep the original
    img.src = dataUrl
  })
}
