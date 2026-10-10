// Parametric shape geometry: clip-path polygons and parameter-handle
// positions for the shapes whose look depends on more than their box.
// Pure functions of the shape kind, its box and its parameters — the scene
// view, the selection overlay and the tests all compute with the same code.
//
// Stars render as a 10-vertex polygon (5 outer at the box edge, 5 inner at
// `starInnerRatio` of the outer radius, starting at the top) in percent of
// the box, so a non-square box stretches the star exactly like the fixed CSS
// shapes stretch. Bubbles render as a rounded body with a tail at
// `bubbleTailX` reaching the bottom edge, all inside the box; the rounded
// corners are sampled arcs, which stays smooth at card sizes while keeping one
// simple polygon. `shapeOutlinePath` traces every shape's clip as SVG path
// data, so strokes and dashes follow the outline the fill is cut to.

import type { CornerRadii, FreeformShapeElement } from './types'
import { STAR_INNER_RATIO_MIN, STAR_INNER_RATIO_MAX, BUBBLE_TAIL_X_MIN, BUBBLE_TAIL_X_MAX } from './appearance'

/** The shape a parameter handle edits, and where the handle sits (local px). */
export type ShapeParam = 'cornerRadius' | 'starInnerRatio' | 'bubbleTailX'

export interface ShapeParamHandle {
  param: ShapeParam
  x: number
  y: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** A star's ten vertices in percent of the box, outer and inner by turns from the top. */
export function starPoints(innerRatio: number): Array<[number, number]> {
  const ratio = clamp(innerRatio, STAR_INNER_RATIO_MIN, STAR_INNER_RATIO_MAX)
  const points: Array<[number, number]> = []
  for (let index = 0; index < 10; index += 1) {
    const outer = index % 2 === 0
    const radius = outer ? 0.5 : ratio * 0.5
    const angle = (-90 + index * 36) * Math.PI / 180
    // Rounded as the clip-path writes them, so the outline traces the clip exactly.
    points.push([
      Number((50 + radius * 100 * Math.cos(angle)).toFixed(2)),
      Number((50 + radius * 100 * Math.sin(angle)).toFixed(2)),
    ])
  }
  return points
}

/** A star polygon as a clip-path value, in percent of the box. */
export function starClipPath(innerRatio: number): string {
  return `polygon(${starPoints(innerRatio).map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(', ')})`
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

/**
 * Where a bubble's tail sits: the body's bottom (`body`), its corner radius,
 * the tail's half width at the base and its centre x. The base stays on the
 * straight part of the body's bottom edge.
 */
export function bubbleTail(width: number, height: number, tailX: number): { body: number; radius: number; half: number; tail: number } {
  const { halfWidth, depth } = bubbleTailGeometry(width, height)
  const body = Math.max(1, height - depth)
  const radius = Math.min(bubbleCornerRadius(width, height), width / 2, body / 2)
  const half = Math.min(halfWidth, Math.max(0, (width - 2 * radius) / 2))
  const tail = clamp(clamp(tailX, BUBBLE_TAIL_X_MIN, BUBBLE_TAIL_X_MAX) * width, radius + half, width - radius - half)
  return { body, radius, half, tail }
}

/**
 * A speech bubble's outline in px of the box: a rounded body over the top of
 * the box and a tail at `tailX` reaching down to the bottom edge. The tail
 * stays inside the box, where the element paints and is picked. Three corner
 * arcs, the tail (base right, tip, base left), then the last arc.
 */
export function bubblePoints(width: number, height: number, tailX: number): Array<[number, number]> {
  const { body, radius: r, half, tail } = bubbleTail(width, height, tailX)
  // Corner arcs sampled from the tangent points; 5 samples per corner keeps
  // the outline smooth while staying a plain polygon.
  const corner = (cx: number, cy: number, from: number): Array<[number, number]> => {
    const points: Array<[number, number]> = []
    const steps = 5
    for (let index = 0; index <= steps; index += 1) {
      const angle = from + (Math.PI / 2) * (index / steps)
      points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
    }
    return points
  }
  return [
    ...corner(r, r, Math.PI),                        // top-left
    ...corner(width - r, r, Math.PI * 1.5),          // top-right
    ...corner(width - r, body - r, 0),               // bottom-right
    [tail + half, body],
    [tail, height],                                  // the tail's tip
    [tail - half, body],
    ...corner(r, body - r, Math.PI * 0.5),           // bottom-left
  ]
}

/** A speech bubble as a clip-path value, in px of the box. */
export function bubbleClipPath(width: number, height: number, tailX: number): string {
  return `polygon(${bubblePoints(width, height, tailX).map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(', ')})`
}

/**
 * The fixed shapes' outlines in percent of the box, exactly as the
 * stylesheet's `.shape-*` clip-paths cut them (a test holds the two together).
 */
export const SHAPE_POLYGONS: Record<'triangle' | 'star' | 'hexagon' | 'diamond' | 'pentagon' | 'heart', ReadonlyArray<readonly [number, number]>> = {
  triangle: [[50, 0], [100, 100], [0, 100]],
  star: [[50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]],
  hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]],
  diamond: [[50, 0], [100, 50], [50, 100], [0, 50]],
  pentagon: [[50, 0], [100, 38], [81, 100], [19, 100], [0, 38]],
  heart: [
    [50, 92], [38.46, 82.68], [28.44, 73.87], [19.93, 64.6], [12.7, 55.4],
    [7.2, 46.14], [3.9, 36.9], [2.9, 27.71], [4.9, 18.82], [9.3, 11.1],
    [15.9, 6.06], [24.1, 3.76], [32.8, 4.04], [41.4, 6.81], [50, 11.9],
    [58.6, 6.81], [67.2, 4.04], [75.9, 3.76], [84.1, 6.06], [90.7, 11.1],
    [95.1, 18.82], [97.1, 27.71], [96.1, 36.9], [92.8, 46.14], [87.3, 55.4],
    [80.07, 64.6], [71.56, 73.87], [61.54, 82.68],
  ],
}

/** The radius a rect draws with when it names none (the stylesheet's own). */
export const RECT_CORNER_RADIUS_DEFAULT = 16

/**
 * A rect's corner radii as CSS draws them: each corner's own (v42) or the
 * shared radius (16 when unset), all scaled down together when two corners
 * would overlap along a side (CSS Backgrounds §5.5).
 */
export function rectCornerRadii(
  width: number,
  height: number,
  params: Pick<FreeformShapeElement, 'cornerRadius' | 'cornerRadii'>,
): CornerRadii {
  const uniform = Math.max(0, params.cornerRadius ?? RECT_CORNER_RADIUS_DEFAULT)
  const radii = params.cornerRadii ?? { topLeft: uniform, topRight: uniform, bottomRight: uniform, bottomLeft: uniform }
  const fit = (length: number, a: number, b: number) => (a + b > 0 ? length / (a + b) : Infinity)
  const factor = Math.min(
    1,
    fit(width, radii.topLeft, radii.topRight),
    fit(width, radii.bottomLeft, radii.bottomRight),
    fit(height, radii.topLeft, radii.bottomLeft),
    fit(height, radii.topRight, radii.bottomRight),
  )
  return {
    topLeft: radii.topLeft * factor,
    topRight: radii.topRight * factor,
    bottomRight: radii.bottomRight * factor,
    bottomLeft: radii.bottomLeft * factor,
  }
}

const num = (value: number) => String(Math.round(value * 1000) / 1000)

function polygonPath(points: ReadonlyArray<readonly [number, number]>): string {
  return `${points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${num(x)} ${num(y)}`).join(' ')} Z`
}

function percentPoints(points: ReadonlyArray<readonly [number, number]>, width: number, height: number): Array<[number, number]> {
  return points.map(([x, y]) => [(x / 100) * width, (y / 100) * height])
}

/**
 * Any shape's outline as SVG path data in px of its box — the same outline
 * its fill is clipped to (stylesheet polygon, inline star or bubble polygon,
 * CSS corner radii, or the ellipse), so a stroke drawn on it follows the shape.
 */
export function shapeOutlinePath(
  params: Pick<FreeformShapeElement, 'shape' | 'cornerRadius' | 'cornerRadii' | 'starInnerRatio' | 'bubbleTailX'>,
  width: number,
  height: number,
): string {
  if (params.shape === 'rect') {
    const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = rectCornerRadii(width, height, params)
    return [
      `M ${num(tl)} 0`,
      `L ${num(width - tr)} 0`,
      `A ${num(tr)} ${num(tr)} 0 0 1 ${num(width)} ${num(tr)}`,
      `L ${num(width)} ${num(height - br)}`,
      `A ${num(br)} ${num(br)} 0 0 1 ${num(width - br)} ${num(height)}`,
      `L ${num(bl)} ${num(height)}`,
      `A ${num(bl)} ${num(bl)} 0 0 1 0 ${num(height - bl)}`,
      `L 0 ${num(tl)}`,
      `A ${num(tl)} ${num(tl)} 0 0 1 ${num(tl)} 0`,
      'Z',
    ].join(' ')
  }
  if (params.shape === 'ellipse') {
    const rx = num(width / 2)
    const ry = num(height / 2)
    return `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${num(width)} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`
  }
  if (params.shape === 'bubble') return polygonPath(bubblePoints(width, height, params.bubbleTailX ?? 0.5))
  if (params.shape === 'star' && params.starInnerRatio !== undefined) {
    return polygonPath(percentPoints(starPoints(params.starInnerRatio), width, height))
  }
  return polygonPath(percentPoints(SHAPE_POLYGONS[params.shape], width, height))
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

/**
 * Where the bubble-tail dot rides on screen: on the tail, but at least the
 * resize handles' clearance (24 viewport px) above the bottom edge, so the
 * bottom-edge resize handle never sits on top of it; never above the middle.
 */
export function bubbleHandlePosition(
  width: number,
  height: number,
  tailX: number,
  renderScale: number,
): { x: number; y: number } {
  const { body, tail } = bubbleTail(width, height, tailX)
  const reach = SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX / Math.max(renderScale, 0.01)
  return { x: tail, y: Math.max(height / 2, Math.min((body + height) / 2, height - reach)) }
}

/** Where a shape's parameter handle sits, in the node's local px box. */
export function shapeHandlePosition(
  shape: FreeformShapeElement['shape'],
  width: number,
  height: number,
  params: Pick<FreeformShapeElement, 'cornerRadius' | 'starInnerRatio' | 'bubbleTailX'> & Partial<Pick<FreeformShapeElement, 'cornerRadii'>>,
): { x: number; y: number } | null {
  const param = shapeParamOf(shape)
  if (!param) return null
  if (param === 'cornerRadius') {
    // The top-left corner as drawn, split corners (v42) included.
    const radius = clamp(rectCornerRadii(width, height, params).topLeft, 0, Math.min(width, height) / 2)
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
  // On the tail itself, halfway down from the body to the tip.
  const { body, tail } = bubbleTail(width, height, params.bubbleTailX ?? 0.5)
  return { x: tail, y: (body + height) / 2 }
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
