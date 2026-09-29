// 文字盒自动增高（grow-only）：文字内容高于（宽于）盒子时把盒子长到内容
// 实际需要的大小，替代此前「溢出部分被静默裁掉」的行为。只增不减——手工
// 调大的盒子保持不变，删字也不会把盒子缩回去。

import { walkScene } from './sceneTree'
import type { FreeformSceneNode } from './types'

export interface TextAutoSizeUpdate {
  path: readonly string[]
  /** Growth axis: horizontal text grows down, vertical text grows leftward. */
  dimension: 'width' | 'height'
  /** Needed box size in the node's local px, rounded up. */
  size: number
}

/**
 * Compare each text node's current box against a measured content extent and
 * produce grow-only geometry updates. `measure` receives the node id plus its
 * writing direction and returns the content extent along the growth axis in
 * local layout px (scrollHeight for horizontal text, scrollWidth for
 * vertical), or null when the node is not measurable right now.
 */
export function collectTextAutoSize(
  nodes: readonly FreeformSceneNode[],
  measure: (id: string, vertical: boolean) => number | null,
): TextAutoSizeUpdate[] {
  const updates: TextAutoSizeUpdate[] = []
  walkScene(nodes, (node, path) => {
    if (node.type !== 'text') return
    const vertical = node.vertical === true
    const needed = measure(node.id, vertical)
    if (needed === null || !Number.isFinite(needed) || needed <= 0) return
    const size = Math.ceil(needed)
    if (vertical) {
      if (size > node.width) updates.push({ path, size, dimension: 'width' })
    } else if (size > node.height) {
      updates.push({ path, size, dimension: 'height' })
    }
  })
  return updates
}
