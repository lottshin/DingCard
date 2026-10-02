// A long image: every page of a deck stacked top to bottom in one picture,
// each centred on the widest page's width. The caller renders the pages one
// at a time and draws each in as soon as it is ready, so only one page's
// pixels are held besides the long picture itself.

/** The longest side a canvas can have in the browsers we support. */
export const MAX_CANVAS_SIDE = 32_000
/** Below this the pages are too small to read: export them one by one instead. */
export const MIN_LONG_IMAGE_SCALE = 0.5

export interface PageSize {
  width: number
  height: number
}

/**
 * The pixel ratio for a long image of these pages: the one asked for, or less
 * so the picture fits a canvas; null when even MIN_LONG_IMAGE_SCALE won't.
 */
export function longImageScale(pages: readonly PageSize[], requested: number): number | null {
  const width = Math.max(0, ...pages.map((page) => page.width))
  const height = pages.reduce((sum, page) => sum + page.height, 0)
  if (width === 0 || height === 0) return null
  const fit = Math.min(requested, MAX_CANVAS_SIDE / height, MAX_CANVAS_SIDE / width)
  if (fit >= requested) return requested
  // Round down to a hundredth so the edge never rounds past the limit.
  const scale = Math.floor(fit * 100) / 100
  return scale >= MIN_LONG_IMAGE_SCALE ? scale : null
}

/** Where each page sits in the long image at `scale`: centred across, one under another. */
export function longImageLayout(pages: readonly PageSize[], scale: number): {
  width: number
  height: number
  places: Array<{ x: number; y: number; width: number; height: number }>
} {
  const width = Math.round(Math.max(...pages.map((page) => page.width)) * scale)
  let y = 0
  const places = pages.map((page) => {
    const place = {
      x: Math.round((width - page.width * scale) / 2),
      y,
      width: Math.round(page.width * scale),
      height: Math.round(page.height * scale),
    }
    y += place.height
    return place
  })
  return { width, height: y, places }
}

/**
 * A canvas to draw the pages into, in order. `background` fills it first
 * (JPEG has no transparency); without it the gaps beside narrower pages stay
 * clear.
 */
export function createLongImage(pages: readonly PageSize[], scale: number, background?: string): {
  canvas: HTMLCanvasElement
  draw: (index: number, page: CanvasImageSource) => void
} {
  const layout = longImageLayout(pages, scale)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('long image canvas unavailable')
  if (background) {
    context.fillStyle = background
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  return {
    canvas,
    draw: (index, page) => {
      const place = layout.places[index]
      context.drawImage(page, place.x, place.y, place.width, place.height)
    },
  }
}
