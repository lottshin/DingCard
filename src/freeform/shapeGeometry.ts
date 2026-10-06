// Parametric shape geometry: clip-path polygons and parameter-handle
// positions for the shapes whose look depends on more than their box.
// Pure functions of the shape kind, its box and its parameters — the scene
// view, the selection overlay and the tests all compute with the same code.
//
// Stars render as a 10-vertex polygon (5 outer at the box edge, 5 inner at
// `starInnerRatio` of the outer radius, starting at the top) in percent of
// the box, so a non-square box stretches the star exactly like the fixed CSS
// shapes stretch. Bubbles render as a rounded rectangle with a tail at
// `bubbleTailX` along the bottom edge; the rounded corners are sampled arcs,
// which stays smooth at card sizes while keeping one simple polygon.

import type { FreeformShapeElement } from './types'
import { STAR_INNER_RATIO_MIN, STAR_INNER_RATIO_MAX, BUBBLE_TAIL_X_MIN, BUBBLE_TAIL_X_MAX } from './appearance'

/** The shape a parameter handle edits, and where the handle sits (local px). */
export type ShapeParam = 'cornerRadius' | 'starInnerRatio' | 'bubbleTailX'

export interface ShapeParamHandle {
  param: ShapeParam
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** A star polygon as a clip-path value, in percent of the box. */
export function starClipPath(innerRatio: number): string {
  const ratio = clamp(innerRatio, STAR_INNER_RATIO_MIN, STAR_INNER_RATIO_MAX)
  const points: string[] = []
  for (let index = 0; index < 10; index += 1) {
    const outer = index % 2 === 0
    const radius = outer ? 0.5 : ratio * 0.5
    const angle = (-90 + index * 36) * Math.PI / 180
    points.push(`${(50 + radius * 100 * Math.cos(angle)).toFixed(2)}% ${(50 + radius * 100 * Math.sin(angle)).toFixed(2)}%`)
  }
  return `polygon(${points.join(', ')})`
}

/** The default star look (no `starInnerRatio`) matches the stylesheet's shape. */
export const STAR_INNER_RATIO_DEFAULT = 0.38

/** Bubble corner radius in px for a box side, kept smooth at card sizes. */
export function bubbleCornerRadius(width: number, height: number): number {
  return clamp(Math.min(width, height) * 0.16, 10, 48)
}

/** Bubble tail sizes in px for a box side. */
export function bubbleTailGeometry(width: number, height: number): { halfWidth: number; depth: number } {
  const minSide = Math.max(1, Math.min(width, height))
  return { halfWidth: clamp(minSide * 0.13, 12, 56), depth: clamp(minSide * 0.16, 14, 64) }
}

/** A speech bubble as a clip-path value, in px of the box. */
export function bubbleClipPath(width: number, height: number, tailX: number): string {
  const radius = bubbleCornerRadius(width, height)
  const { halfWidth, depth } = bubbleTailGeometry(width, height)
  const tail = clamp(tailX, BUBBLE_TAIL_X_MIN, BUBBLE_TAIL_X_MAX) * width
  // Corner arcs sampled from the tangent points; 5 samples per corner keeps
  // the polygon smooth while staying a plain polygon() clip.
  const corner = (cx: number, cy: number, from: number, to: number) => {
    const points: string[] = []
    const steps = 5
    for (let index = 0; index <= steps; index += 1) {
      const angle = from + (to - from) * (index / steps)
      points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)}px ${(cy + radius * Math.sin(angle)).toFixed(2)}px`)
    }
    return points
  }
  const r = radius
  const points: string[] = [
    ...corner(r, r, Math.PI, Math.PI * 1.5),                    // top-left
    ...corner(width - r, r, Math.PI * 1.5, 0),                  // top-right
    ...corner(width - r, height - r, 0, Math.PI * 0.5),         // bottom-right
    `${(tail + halfWidth).toFixed(2)}px ${height.toFixed(2)}px`,
    `${tail.toFixed(2)}px ${(height + depth).toFixed(2)}px`,     // the tail
    `${(tail - halfWidth).toFixed(2)}px ${height.toFixed(2)}px`,
    ...corner(r, height - r, Math.PI * 0.5, Math.PI),           // bottom-left
  ]
  return `polygon(${points.join(', ')})`
}

/** Which parameter a shape exposes on the canvas, if any. */
export function shapeParamOf(shape: FreeformShapeElement['shape']): ShapeParam | null {
  if (shape === 'rect') return 'cornerRadius'
  if (shape === 'star') return 'starInnerRatio'
  if (shape === 'bubble') return 'bubbleTailX'
  return null
}

/** Viewport px a param handle centre keeps from the corner resize handles:
 *  the resize half (11) plus the param half (10) plus a gap, per axis. */
export const SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX = 24

/**
 * Where the corner-radius dot rides: on the outline, where the arc meets the
 * top edge. A small radius parks it just past the corner resize handle's
 * reach (24 viewport px), never into the top edge handle's own reach.
 */
export function cornerHandlePosition(
  radius: number,
  width: number,
  height: number,
  renderScale: number,
): { x: number; y: number } {
  const half = Math.min(width, height) / 2
  const clamped = Math.max(Math.min(radius, half), 0)
  const reach = SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX / Math.max(renderScale, 0.01)
  const parked = Math.min(reach, Math.max(width / 2 - reach, width * 0.1))
  return { x: Math.max(clamped, parked), y: 0 }
}

/** Where a shape's parameter handle sits, in the node's local px box. */
export function shapeHandlePosition(
  shape: FreeformShapeElement['shape'],
  width: number,
  height: number,
  params: Pick<FreeformShapeElement, 'cornerRadius' | 'starInnerRatio' | 'bubbleTailX'>,
): { x: number; y: number } | null {
  const param = shapeParamOf(shape)
  if (!param) return null
  if (param === 'cornerRadius') {
    const radius = clamp(params.cornerRadius ?? 16, 0, Math.min(width, height) / 2)
    return { x: radius, y: radius }
  }
  if (param === 'starInnerRatio') {
    const ratio = params.starInnerRatio ?? STAR_INNER_RATIO_DEFAULT
    const angle = (-90 + 36) * Math.PI / 180
    return {
      x: width * (0.5 + ratio * 0.5 * Math.cos(angle)),
      y: height * (0.5 + ratio * 0.5 * Math.sin(angle)),
    }
  }
  const { depth } = bubbleTailGeometry(width, height)
  return { x: clamp(params.bubbleTailX ?? 0.5, BUBBLE_TAIL_X_MIN, BUBBLE_TAIL_X_MAX) * width, y: height + depth * 0.6 }
}

/** The parameter value a handle drag points at, from local px coordinates. */
export function shapeParamFromPointer(
  param: ShapeParam,
  local: { x: number; y: number },
  width: number,
  height: number,
): number {
  if (param === 'cornerRadius') {
    return clamp(local.x, 0, Math.min(width, height) / 2)
  }
  if (param === 'starInnerRatio') {
    const distance = Math.hypot((local.x - width / 2) / width, (local.y - height / 2) / height)
    return clamp(distance * 2, STAR_INNER_RATIO_MIN, STAR_INNER_RATIO_MAX)
  }
  return clamp(local.x / Math.max(1, width), BUBBLE_TAIL_X_MIN, BUBBLE_TAIL_X_MAX)
}
