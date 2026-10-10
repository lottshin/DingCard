import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX,
  SHAPE_POLYGONS,
  STAR_INNER_RATIO_DEFAULT,
  bubbleClipPath,
  bubbleHandlePosition,
  bubbleCornerRadius,
  bubbleTailGeometry,
  cornerHandlePosition,
  rectCornerRadii,
  shapeHandlePosition,
  shapeOutlinePath,
  shapeParamFromPointer,
  shapeParamOf,
  starClipPath,
} from '../shapeGeometry'
import { STAR_INNER_RATIO_MAX, STAR_INNER_RATIO_MIN, BUBBLE_TAIL_X_MAX, BUBBLE_TAIL_X_MIN } from '../appearance'

describe('star clip path', () => {
  it('renders ten vertices alternating outer and inner radii', () => {
    const path = starClipPath(0.4)
    expect(path.startsWith('polygon(')).toBe(true)
    const points = path.slice('polygon('.length, -1).split(', ')
    expect(points).toHaveLength(10)
    // The first vertex sits at the top centre; the second is the first inner one.
    expect(points[0]).toBe('50.00% 0.00%')
    const [x, y] = points[1].split(' ').map((value) => Number.parseFloat(value))
    expect(x).toBeCloseTo(50 + 0.4 * 50 * Math.cos(-54 * Math.PI / 180), 1)
    expect(y).toBeCloseTo(50 + 0.4 * 50 * Math.sin(-54 * Math.PI / 180), 1)
  })

  it('clamps the ratio into its valid range', () => {
    const loose = starClipPath(0.01)
    expect(loose).toBe(starClipPath(STAR_INNER_RATIO_MIN))
    const tight = starClipPath(2)
    expect(tight).toBe(starClipPath(STAR_INNER_RATIO_MAX))
  })
})

describe('bubble clip path', () => {
  const pointsOf = (path: string) => path.slice('polygon('.length, -1).split(', ')
    .map((point) => point.split(' ').map((value) => Number.parseFloat(value)))

  it('keeps the tail inside the bottom edge and the corners rounded', () => {
    const path = bubbleClipPath(400, 300, 0.5)
    expect(path.startsWith('polygon(')).toBe(true)
    const points = pointsOf(path)
    const radius = bubbleCornerRadius(400, 300)
    const { halfWidth, depth } = bubbleTailGeometry(400, 300)
    // Three 6-point corner arcs, then the tail base right, tip, base left:
    // the body ends a tail's depth above the bottom, the tip touches it.
    const tailRight = points[points.length - 9]
    expect(tailRight[0]).toBeCloseTo(200 + halfWidth, 1)
    expect(tailRight[1]).toBeCloseTo(300 - depth, 1)
    const tip = points[points.length - 8]
    expect(tip[0]).toBeCloseTo(200, 1)
    expect(tip[1]).toBeCloseTo(300, 1)
    const tailLeft = points[points.length - 7]
    expect(tailLeft[0]).toBeCloseTo(200 - halfWidth, 1)
    // The top-left arc starts on the left edge below the corner radius.
    expect(points[0][0]).toBeCloseTo(0, 1)
    expect(points[0][1]).toBeCloseTo(radius, 1)
    // Nothing reaches outside the box.
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(-0.01)
      expect(x).toBeLessThanOrEqual(400.01)
      expect(y).toBeGreaterThanOrEqual(-0.01)
      expect(y).toBeLessThanOrEqual(300.01)
    }
  })

  it('rounds the top-right corner inside its own corner square', () => {
    // The arc once swept the long way round and bit a notch out of the corner.
    const points = pointsOf(bubbleClipPath(400, 300, 0.5))
    const radius = bubbleCornerRadius(400, 300)
    for (const [x, y] of points.slice(6, 12)) {
      expect(x).toBeGreaterThanOrEqual(400 - radius - 0.01)
      expect(y).toBeLessThanOrEqual(radius + 0.01)
    }
  })

  it('clamps the tail position into its valid range', () => {
    expect(bubbleClipPath(400, 300, -1)).toBe(bubbleClipPath(400, 300, BUBBLE_TAIL_X_MIN))
    expect(bubbleClipPath(400, 300, 9)).toBe(bubbleClipPath(400, 300, BUBBLE_TAIL_X_MAX))
  })
})

describe('shape parameter mapping', () => {
  it('exposes one parameter each for rect, star, and bubble only', () => {
    expect(shapeParamOf('rect')).toBe('cornerRadius')
    expect(shapeParamOf('star')).toBe('starInnerRatio')
    expect(shapeParamOf('bubble')).toBe('bubbleTailX')
    for (const shape of ['ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'heart'] as const) {
      expect(shapeParamOf(shape)).toBeNull()
    }
  })

  it('places the corner handle on the radius arc and reads the radius back', () => {
    const handle = shapeHandlePosition('rect', 300, 200, { cornerRadius: 40 })
    expect(handle).toEqual({ x: 40, y: 40 })
    expect(shapeParamFromPointer('cornerRadius', { x: 66, y: 10 }, 300, 200)).toBe(66)
    // The radius never crosses half of the shorter side.
    expect(shapeParamFromPointer('cornerRadius', { x: 400, y: 0 }, 300, 200)).toBe(100)
  })

  it('rides the outline at the arc edge, parking past the corner resize handle', () => {
    // A deep radius rides the outline where the arc meets the top edge.
    expect(cornerHandlePosition(120, 360, 240, 0.5)).toEqual({ x: 120, y: 0 })
    // A small radius parks along the same edge at the viewport clearance.
    expect(cornerHandlePosition(16, 360, 240, 0.5)).toEqual({
      x: SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX / 0.5,
      y: 0,
    })
    // A zoomed-out park stays clear of the top edge handle's reach too.
    expect(cornerHandlePosition(16, 360, 240, 0.25)).toEqual({ x: 84, y: 0 })
    expect(cornerHandlePosition(16, 120, 100, 0.725).x).toBeCloseTo(26.9, 1)
    expect(cornerHandlePosition(16, 120, 100, 0.725).y).toBe(0)
    expect(26.9 + 10 / 0.725).toBeLessThan(50)
    // A tiny box keeps the dot on its own edge half.
    expect(cornerHandlePosition(8, 40, 30, 0.5)).toEqual({ x: 8, y: 0 })
  })

  it('places the star handle on the first inner vertex and reads the ratio back', () => {
    const handle = shapeHandlePosition('star', 200, 200, { starInnerRatio: 0.5 })
    expect(handle!.x).toBeCloseTo(200 * (0.5 + 0.5 * 0.5 * Math.cos(-54 * Math.PI / 180)), 4)
    expect(handle!.y).toBeCloseTo(200 * (0.5 + 0.5 * 0.5 * Math.sin(-54 * Math.PI / 180)), 4)
    // Pointing at the centre flattens to the minimum; past the outer vertex
    // fills out to the maximum; halfway up the edge reads an exact ratio.
    expect(shapeParamFromPointer('starInnerRatio', { x: 100, y: 100 }, 200, 200)).toBe(STAR_INNER_RATIO_MIN)
    expect(shapeParamFromPointer('starInnerRatio', { x: 100, y: 0 }, 200, 200)).toBe(STAR_INNER_RATIO_MAX)
    expect(shapeParamFromPointer('starInnerRatio', { x: 100, y: 50 }, 200, 200)).toBeCloseTo(0.5, 5)
  })

  it('uses the default star look and tail position when the parameters are absent', () => {
    const handle = shapeHandlePosition('star', 200, 200, {})
    expect(handle!.x).toBeCloseTo(200 * (0.5 + STAR_INNER_RATIO_DEFAULT * 0.5 * Math.cos(-54 * Math.PI / 180)), 4)
    const tail = shapeHandlePosition('bubble', 200, 100, {})
    expect(tail!.x).toBeCloseTo(100, 4)
    // On the tail, between the body's bottom and the box's bottom edge.
    const { depth } = bubbleTailGeometry(200, 100)
    expect(tail!.y).toBeCloseTo(100 - depth / 2, 4)
  })

  it('keeps the bubble tail dot clear of the bottom-edge resize handle on screen', () => {
    const { depth } = bubbleTailGeometry(360, 240)
    // Zoomed in, the dot sits halfway down the tail.
    expect(bubbleHandlePosition(360, 240, 0.5, 2)).toEqual({ x: 180, y: 240 - depth / 2 })
    // Zoomed out, it climbs to 24 viewport px above the bottom edge…
    expect(bubbleHandlePosition(360, 240, 0.5, 0.5)).toEqual({ x: 180, y: 240 - 48 })
    // …but never above the middle of the box.
    expect(bubbleHandlePosition(360, 240, 0.5, 0.1).y).toBe(120)
  })

  it('places the bubble tail handle under the tail and reads the position back', () => {
    const handle = shapeHandlePosition('bubble', 400, 300, { bubbleTailX: 0.25 })
    expect(handle!.x).toBeCloseTo(100, 4)
    expect(shapeParamFromPointer('bubbleTailX', { x: 260, y: 400 }, 400, 300)).toBeCloseTo(0.65, 5)
    expect(shapeParamFromPointer('bubbleTailX', { x: -40, y: 0 }, 400, 300)).toBe(BUBBLE_TAIL_X_MIN)
    expect(shapeParamFromPointer('bubbleTailX', { x: 900, y: 0 }, 400, 300)).toBe(BUBBLE_TAIL_X_MAX)
  })
})

describe('shape outlines', () => {
  it('trace the stylesheet clip-paths of the fixed shapes exactly', () => {
    const css = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8')
    for (const [shape, points] of Object.entries(SHAPE_POLYGONS)) {
      const rule = new RegExp(`\\.shape-${shape} \\{\\s*clip-path: polygon\\(([^)]*)\\)`).exec(css)
      expect(rule, shape).not.toBeNull()
      const parsed = rule![1].split(',').map((pair) => pair.trim().split(/\s+/).map((value) => Number.parseFloat(value)))
      expect(parsed, shape).toEqual(points.map(([x, y]) => [x, y]))
    }
  })

  it('give a rect the corners CSS draws: the default 16, scaled down together when they overlap', () => {
    expect(rectCornerRadii(300, 200, {})).toEqual({ topLeft: 16, topRight: 16, bottomRight: 16, bottomLeft: 16 })
    expect(rectCornerRadii(300, 200, { cornerRadius: 999 })).toEqual({ topLeft: 100, topRight: 100, bottomRight: 100, bottomLeft: 100 })
    const scaled = rectCornerRadii(300, 200, { cornerRadii: { topLeft: 180, topRight: 180, bottomRight: 20, bottomLeft: 20 } })
    expect(scaled.topLeft).toBeCloseTo(150, 6)
    expect(scaled.topRight).toBeCloseTo(150, 6)
    expect(scaled.bottomRight).toBeCloseTo(50 / 3, 6)
    expect(rectCornerRadii(300, 200, { cornerRadius: 40, cornerRadii: { topLeft: 0, topRight: 60, bottomRight: 0, bottomLeft: 60 } }))
      .toEqual({ topLeft: 0, topRight: 60, bottomRight: 0, bottomLeft: 60 })
  })

  it('draw an ellipse as an ellipse and polygons in box pixels', () => {
    expect(shapeOutlinePath({ shape: 'ellipse' }, 300, 200)).toBe('M 0 100 A 150 100 0 1 0 300 100 A 150 100 0 1 0 0 100 Z')
    expect(shapeOutlinePath({ shape: 'triangle' }, 300, 200)).toBe('M 150 0 L 300 200 L 0 200 Z')
    expect(shapeOutlinePath({ shape: 'rect', cornerRadius: 0 }, 300, 200)).toBe(
      'M 0 0 L 300 0 A 0 0 0 0 1 300 0 L 300 200 A 0 0 0 0 1 300 200 L 0 200 A 0 0 0 0 1 0 200 L 0 0 A 0 0 0 0 1 0 0 Z',
    )
    // A star with its own ratio follows its inline polygon, not the default.
    expect(shapeOutlinePath({ shape: 'star', starInnerRatio: 0.5 }, 100, 100))
      .not.toBe(shapeOutlinePath({ shape: 'star' }, 100, 100))
    expect(shapeOutlinePath({ shape: 'star' }, 100, 100).startsWith('M 50 0 L 61 35')).toBe(true)
  })
})
