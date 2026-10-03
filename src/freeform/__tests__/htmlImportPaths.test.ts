import { describe, expect, it } from 'vitest'
import {
  ellipsePath,
  fitCornerRadii,
  parsePoints,
  polylinePath,
  roundedRectPath,
  svgRectPath,
  transformArc,
  transformPathData,
} from '../htmlImportPaths'
import { isValidPathData, pathDataBounds } from '../pathData'

describe('html import paths', () => {
  it('redraws path data through a matrix with every command made absolute', () => {
    expect(transformPathData('M10 10 h 10 v 10 z', [1, 0, 0, 1, 5, 5])).toBe('M 15 15 L 25 15 L 25 25 Z')
    expect(transformPathData('M0 0 l10 0 m5 5 l1 1', [2, 0, 0, 2, 0, 0])).toBe('M 0 0 L 20 0 M 30 10 L 32 12')
    // S reflects the previous control point before mapping.
    expect(transformPathData('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0', [1, 0, 0, 1, 0, 0]))
      .toBe('M 0 0 C 0 10 10 10 10 0 C 10 -10 20 -10 20 0')
    expect(transformPathData('M0 0 Q 5 10 10 0 T 20 0', [1, 0, 0, 1, 0, 0])).toBe('M 0 0 Q 5 10 10 0 Q 15 -10 20 0')
    expect(transformPathData('not a path', [1, 0, 0, 1, 0, 0])).toBeNull()
  })

  it('maps arcs to the stretched, turned or mirrored ellipse', () => {
    expect(transformArc(10, 5, 0, [2, 0, 0, 2, 0, 0])).toMatchObject({ rx: 20, ry: 10 })
    const turned = transformArc(10, 5, 0, [0, 1, -1, 0, 0, 0])
    expect(turned.rx).toBeCloseTo(10, 6)
    expect(turned.ry).toBeCloseTo(5, 6)
    expect(((turned.rotation % 180) + 180) % 180).toBeCloseTo(90, 6)
    // A mirror flips the sweep so the arc bends the same way on screen.
    expect(transformPathData('M0 0 A 5 5 0 0 1 10 0', [-1, 0, 0, 1, 0, 0])).toMatch(/^M 0 0 A 5 5 \S+ 0 0 -10 0$/)
    expect(transformPathData('M0 0 A 0 5 0 0 1 10 0', [1, 0, 0, 1, 0, 0])).toBe('M 0 0 L 10 0')
  })

  it('draws CSS boxes with uneven or elliptical corners', () => {
    const d = roundedRectPath(0, 0, 100, 50, { topLeft: [20, 20], topRight: [0, 0], bottomRight: [10, 10], bottomLeft: [0, 0] })
    expect(isValidPathData(d)).toBe(true)
    expect(pathDataBounds(d)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    // Neighbouring radii that overlap shrink together, as CSS does.
    expect(fitCornerRadii(100, 50, { topLeft: [80, 80], topRight: [80, 80], bottomRight: [0, 0], bottomLeft: [0, 0] }).topLeft)
      .toEqual([50, 50])
    const ellipse = ellipsePath(50, 25, 50, 25)
    expect(isValidPathData(ellipse)).toBe(true)
    expect(pathDataBounds(ellipse)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(isValidPathData(svgRectPath(0, 0, 10, 10, 2, null))).toBe(true)
  })

  it('reads polyline points', () => {
    expect(parsePoints('0,0 10,5 20 0')).toEqual([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }])
    expect(polylinePath(parsePoints('0,0 10,5'), true)).toBe('M 0 0 L 10 5 Z')
    expect(polylinePath([{ x: 1, y: 1 }], false)).toBeNull()
  })
})
