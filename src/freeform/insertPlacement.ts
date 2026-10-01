import { sceneNodeBoundsInParent } from './sceneTransform'
import type { FreeformElement, FreeformSceneNode } from './types'

/** Each new element steps this share of the page's shorter side away from one already in its spot. */
const STEP_RATIO = 0.03
const MIN_STEP = 16
const MAX_STEPS = 12

/**
 * Where a newly inserted page element goes. It arrives centred; when an
 * element already sits on that spot it steps down and to the right, one step
 * per element already there, so a run of inserts fans out instead of stacking
 * exactly. Off the page's lower right it steps up and to the left instead.
 */
export function staggerNewElement<T extends FreeformElement>(
  element: T,
  siblings: readonly FreeformSceneNode[],
  area: { width: number; height: number },
): T {
  const step = Math.max(MIN_STEP, Math.round(Math.min(area.width, area.height) * STEP_RATIO))
  const centres = siblings.flatMap((node) => {
    const box = sceneNodeBoundsInParent(node)
    return box ? [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] : []
  })
  const taken = (x: number, y: number) => {
    const cx = x + element.width / 2
    const cy = y + element.height / 2
    return centres.some((centre) => Math.abs(centre.x - cx) < step / 2 && Math.abs(centre.y - cy) < step / 2)
  }
  const fits = (x: number, y: number) => (
    x >= 0 && y >= 0 && x + element.width <= area.width && y + element.height <= area.height
  )

  if (!taken(element.x, element.y)) return element
  for (const direction of [1, -1]) {
    for (let index = 1; index <= MAX_STEPS; index += 1) {
      const x = element.x + direction * index * step
      const y = element.y + direction * index * step
      if (!fits(x, y)) break
      if (!taken(x, y)) return { ...element, x: Math.round(x), y: Math.round(y) }
    }
  }
  return element
}
