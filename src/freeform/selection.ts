import type { FreeformElement, FreeformSlide } from './types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Bounds {
  left: number
  top: number
  right: number
  bottom: number
}

export function getElementsInMarquee(elements: FreeformElement[], rect: Rect): string[] {
  const marquee = normalizeRect(rect)

  return elements.filter((element) => intersects(elementBounds(element), marquee)).map((element) => element.id)
}

export function moveElementsWithinSlide(
  slide: FreeformSlide,
  elements: FreeformElement[],
  selectedIds: string[],
  dx: number,
  dy: number,
): Array<{ elementId: string; patch: Pick<FreeformElement, 'x' | 'y'> }> {
  const selectedIdSet = new Set(selectedIds)
  const selectedElements = elements.filter((element) => selectedIdSet.has(element.id))
  const groupBounds = getGroupBounds(selectedElements)

  if (!groupBounds) {
    return []
  }

  const clampedDx = clampDelta(dx, -groupBounds.left, slide.width - groupBounds.right)
  const clampedDy = clampDelta(dy, -groupBounds.top, slide.height - groupBounds.bottom)

  return selectedElements.map((element) => ({
    elementId: element.id,
    patch: {
      x: element.x + clampedDx,
      y: element.y + clampedDy,
    },
  }))
}

function normalizeRect(rect: Rect): Bounds {
  const left = Math.min(rect.x, rect.x + rect.width)
  const right = Math.max(rect.x, rect.x + rect.width)
  const top = Math.min(rect.y, rect.y + rect.height)
  const bottom = Math.max(rect.y, rect.y + rect.height)

  return { left, top, right, bottom }
}

function elementBounds(element: FreeformElement): Bounds {
  return {
    left: element.x,
    top: element.y,
    right: element.x + element.width,
    bottom: element.y + element.height,
  }
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function getGroupBounds(elements: FreeformElement[]): Bounds | undefined {
  if (elements.length === 0) {
    return undefined
  }

  return elements.reduce<Bounds>(
    (bounds, element) => {
      const current = elementBounds(element)

      return {
        left: Math.min(bounds.left, current.left),
        top: Math.min(bounds.top, current.top),
        right: Math.max(bounds.right, current.right),
        bottom: Math.max(bounds.bottom, current.bottom),
      }
    },
    elementBounds(elements[0]),
  )
}

function clampDelta(delta: number, min: number, max: number): number {
  if (min > max) {
    return 0
  }

  return Math.min(Math.max(delta, min), max)
}
