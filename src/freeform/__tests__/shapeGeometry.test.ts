import { describe, expect, it } from 'vitest'
import {
  SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX,
  STAR_INNER_RATIO_DEFAULT,
  bubbleClipPath,
  bubbleCornerRadius,
  bubbleTailGeometry,
  cornerHandlePosition,
  shapeHandlePosition,
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
  it('keeps the tail inside the bottom edge and the corners rounded', () => {
    const path = bubbleClipPath(400, 300, 0.5)
    expect(path.startsWith('polygon(')).toBe(true)
    const points = path.slice('polygon('.length, -1).split(', ').map((point) => point.split(' ').map((value) => Number.parseFloat(value)))
    const radius = bubbleCornerRadius(400, 300)
    const { halfWidth, depth } = bubbleTailGeometry(400, 300)
    // Three 6-point corner arcs, then the tail base right, tip, base left.
    const tailRight = points[points.length - 9]
    expect(tailRight[0]).toBeCloseTo(200 + halfWidth, 1)
    expect(tailRight[1]).toBeCloseTo(300, 1)
    const tip = points[points.length - 8]
    expect(tip[0]).toBeCloseTo(200, 1)
    expect(tip[1]).toBeCloseTo(300 + depth, 1)
    const tailLeft = points[points.length - 7]
    expect(tailLeft[0]).toBeCloseTo(200 - halfWidth, 1)
    // The top-left arc starts on the left edge below the corner radius.
    expect(points[0][0]).toBeCloseTo(0, 1)
    expect(points[0][1]).toBeCloseTo(radius, 1)
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

  it('parks a small corner handle past the corner resize handle, on the arc beyond it', () => {
    // A deep radius clears the resize handle and stays on the arc.
    expect(cornerHandlePosition(120, 360, 240, 0.5)).toEqual({ x: 120, y: 120 })
    // A small radius parks at the viewport clearance (24 px at the zoom).
    expect(cornerHandlePosition(16, 360, 240, 0.5)).toEqual({
      x: SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX / 0.5,
      y: SHAPE_PARAM_HANDLE_CLEARANCE_VIEWPORT_PX / 0.5,
    })
    // A zoomed-out clearance is capped at a quarter of the short side, so the
    // element's centre grab area stays free and the handle never overreaches.
    expect(cornerHandlePosition(16, 360, 240, 0.25)).toEqual({ x: 60, y: 60 })
    expect(cornerHandlePosition(16, 120, 100, 0.725)).toEqual({ x: 25, y: 25 })
    expect(25 + 10 / 0.725).toBeLessThan(50)
    // A tiny box keeps the handle inside its own half.
    expect(cornerHandlePosition(8, 40, 30, 0.5)).toEqual({ x: 8, y: 8 })
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
    expect(tail!.y).toBeGreaterThan(100)
  })

  it('places the bubble tail handle under the tail and reads the position back', () => {
    const handle = shapeHandlePosition('bubble', 400, 300, { bubbleTailX: 0.25 })
    expect(handle!.x).toBeCloseTo(100, 4)
    expect(shapeParamFromPointer('bubbleTailX', { x: 260, y: 400 }, 400, 300)).toBeCloseTo(0.65, 5)
    expect(shapeParamFromPointer('bubbleTailX', { x: -40, y: 0 }, 400, 300)).toBe(BUBBLE_TAIL_X_MIN)
    expect(shapeParamFromPointer('bubbleTailX', { x: 900, y: 0 }, 400, 300)).toBe(BUBBLE_TAIL_X_MAX)
  })
})
