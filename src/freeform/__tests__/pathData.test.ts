import { describe, expect, it } from 'vitest'

import {
  PATH_DATA_MAX_LENGTH,
  fitPathData,
  isValidPathData,
  parsePathData,
  pathDataBounds,
  pathStrokeScale,
  stretchArc,
} from '../pathData'
import { ICONS } from '../iconLibrary'

describe('path data grammar', () => {
  it('reads every command, implicit repetitions and packed numbers', () => {
    expect(parsePathData('M10 20L30 40')).toEqual([
      { command: 'M', values: [10, 20] },
      { command: 'L', values: [30, 40] },
    ])
    // Pairs after a moveto repeat as linetos; packed decimals and signs split.
    expect(parsePathData('m6 6 12 12')).toEqual([{ command: 'm', values: [6, 6, 12, 12] }])
    expect(parsePathData('M1.5.5-2-3')).toEqual([{ command: 'M', values: [1.5, 0.5, -2, -3] }])
    expect(parsePathData('M0,0 h10v-5H3V1z')).toEqual([
      { command: 'M', values: [0, 0] },
      { command: 'h', values: [10] },
      { command: 'v', values: [-5] },
      { command: 'H', values: [3] },
      { command: 'V', values: [1] },
      { command: 'z', values: [] },
    ])
    expect(parsePathData('M0 0C1 2 3 4 5 6S7 8 9 10Q1 1 2 2T3 3')).toHaveLength(5)
    expect(parsePathData('M1e2 -1.5E-1')).toEqual([{ command: 'M', values: [100, -0.15] }])
  })

  it('reads packed arc flags', () => {
    expect(parsePathData('M0 0a1 1 0 00.5.5')).toEqual([
      { command: 'M', values: [0, 0] },
      { command: 'a', values: [1, 1, 0, 0, 0, 0.5, 0.5] },
    ])
    expect(parsePathData('M2 2A3 4 30 1 1 8 8')?.[1].values).toEqual([3, 4, 30, 1, 1, 8, 8])
  })

  it('accepts every built-in icon', () => {
    for (const icon of ICONS) expect(isValidPathData(icon.d), icon.id).toBe(true)
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['no moveto first', 'L10 10'],
    ['command without numbers', 'M0 0L'],
    ['odd coordinate', 'M0'],
    ['unknown command', 'M0 0X1 1'],
    ['numbers after close', 'M0 0z 1 1'],
    ['trailing comma', 'M0 0 1 1,'],
    ['comma before a command', 'M0 0, L1 1'],
    ['double comma', 'M0,,0'],
    ['bad exponent', 'M1e 2'],
    ['bad arc flag', 'M0 0a1 1 0 2 0 1 1'],
    ['negative arc radius', 'M0 0a-1 1 0 0 0 1 1'],
    ['infinite number', 'M1e999 0'],
    ['not a string', 42],
  ])('rejects %s', (_label, value) => {
    expect(parsePathData(value)).toBeNull()
    expect(isValidPathData(value)).toBe(false)
  })

  it('caps the length of a path', () => {
    const long = `M0 0${'L1 1'.repeat(PATH_DATA_MAX_LENGTH / 4)}`
    expect(long.length).toBeGreaterThan(PATH_DATA_MAX_LENGTH)
    expect(isValidPathData(long)).toBe(false)
  })
})

describe('fitting a path into its box', () => {
  it('maps absolute coordinates through the viewBox and stretches relative ones', () => {
    const viewBox = { x: 0, y: 0, width: 24, height: 24 }
    expect(fitPathData('M20 6 9 17l-5-5', viewBox, 48, 48)).toBe('M40 12 18 34l-10 -10')
    expect(fitPathData('M2 2H22V12h-4v4', viewBox, 240, 120)).toBe('M20 10H220V60h-40v20')
    // A viewBox offset shifts absolute points only.
    expect(fitPathData('M10 10l5 5', { x: 10, y: 10, width: 10, height: 10 }, 100, 100)).toBe('M0 0l50 50')
  })

  it('treats a path\'s opening relative moveto as absolute', () => {
    const viewBox = { x: 4, y: 4, width: 16, height: 16 }
    expect(fitPathData('m6 6 12 12', viewBox, 32, 32)).toBe('M4 4l24 24')
  })

  it('stretches arcs into the matching ellipse', () => {
    expect(fitPathData('M0 12a12 12 0 0 1 24 0', { x: 0, y: 0, width: 24, height: 24 }, 48, 24))
      .toBe('M0 12a24 12 0 0 1 48 0')
    const stretched = stretchArc(10, 4, 30, 2, 0.5)
    // Same ellipse: R·diag(rx, ry) and the stretched map span the same quadratic form.
    const angle = (30 * Math.PI) / 180
    const target = [
      [2 * 10 * Math.cos(angle), -2 * 4 * Math.sin(angle)],
      [0.5 * 10 * Math.sin(angle), 0.5 * 4 * Math.cos(angle)],
    ]
    const turn = (stretched.rotation * Math.PI) / 180
    const actual = [
      [stretched.rx * Math.cos(turn), -stretched.ry * Math.sin(turn)],
      [stretched.rx * Math.sin(turn), stretched.ry * Math.cos(turn)],
    ]
    const form = (m: number[][]) => [
      m[0][0] ** 2 + m[0][1] ** 2,
      m[0][0] * m[1][0] + m[0][1] * m[1][1],
      m[1][0] ** 2 + m[1][1] ** 2,
    ]
    form(actual).forEach((value, index) => expect(value).toBeCloseTo(form(target)[index], 9))
  })

  it('keeps flags and drops float noise', () => {
    expect(fitPathData('M0 0A5 5 0 1 0 10 10', { x: 0, y: 0, width: 3, height: 3 }, 1, 1))
      .toBe('M0 0A1.667 1.667 0 1 0 3.333 3.333')
  })

  it('returns null for invalid data and measures the stroke as the mean stretch', () => {
    expect(fitPathData('nope', { x: 0, y: 0, width: 1, height: 1 }, 1, 1)).toBeNull()
    expect(pathStrokeScale({ x: 0, y: 0, width: 24, height: 24 }, 96, 96)).toBe(4)
    expect(pathStrokeScale({ x: 0, y: 0, width: 10, height: 10 }, 40, 10)).toBe(2)
  })
})

describe('path data bounds', () => {
  const near = (value: { x: number; y: number; width: number; height: number } | null) => value && {
    x: Math.round(value.x * 10) / 10,
    y: Math.round(value.y * 10) / 10,
    width: Math.round(value.width * 10) / 10,
    height: Math.round(value.height * 10) / 10,
  }

  it('spans lines, relative moves and closed subpaths', () => {
    expect(near(pathDataBounds('M10 20L30 60H5V8Z'))).toEqual({ x: 5, y: 8, width: 25, height: 52 })
    expect(near(pathDataBounds('m4 4 10 0 0 10z m20 0 5 5'))).toEqual({ x: 4, y: 4, width: 25, height: 10 })
  })

  it('follows curves past their end points, smooth curves included', () => {
    // A cubic bulging up to y = -15 between two points on y = 0.
    expect(near(pathDataBounds('M0 0C0 -20 40 -20 40 0'))).toEqual({ x: 0, y: -15, width: 40, height: 15 })
    expect(near(pathDataBounds('M0 0Q20 20 40 0T80 0'))).toEqual({ x: 0, y: -10, width: 80, height: 20 })
  })

  it('takes the whole sweep of an arc, the long way round when asked', () => {
    // Half of a circle of radius 10 centred on (10, 0), drawn below.
    expect(near(pathDataBounds('M0 0A10 10 0 0 0 20 0'))).toEqual({ x: 0, y: 0, width: 20, height: 10 })
    expect(near(pathDataBounds('M0 10A10 10 0 1 0 20 10A10 10 0 1 0 0 10Z'))).toEqual({ x: 0, y: 0, width: 20, height: 20 })
  })

  it('reads nothing from data outside the grammar', () => {
    expect(pathDataBounds('L1 2')).toBeNull()
  })
})
