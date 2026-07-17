import { describe, expect, it } from 'vitest'

import {
  SCENE_EPSILON,
  boundsFromPoints,
  clockwiseRotation,
  decomposeSimilarity,
  groupLocal,
  identity,
  invert,
  leafLocal,
  matrixAlmostEqual,
  multiply,
  transformPoint,
  transformVector,
  translation,
  uniformScale,
} from '../sceneTransform'
import type { Matrix2D } from '../sceneTransform'

describe('scene similarity transforms', () => {
  it('composes column-vector transforms from right to left', () => {
    const matrix = multiply(translation(10, 20), uniformScale(2))

    expect(transformPoint(matrix, { x: 3, y: 4 })).toEqual({ x: 16, y: 28 })
  })

  it('uses positive clockwise angles in the y-down page coordinate system', () => {
    const point = transformPoint(groupLocal(100, 80, 90, 2), { x: 10, y: 0 })

    expect(point.x).toBeCloseTo(100)
    expect(point.y).toBeCloseTo(100)
    expect(transformPoint(clockwiseRotation(90), { x: 1, y: 0 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(0), y: expect.closeTo(1) }),
    )
  })

  it('normalizes very large finite angles before converting them to radians', () => {
    const rotation = clockwiseRotation(Number.MAX_VALUE)

    expect(rotation.every(Number.isFinite)).toBe(true)
    expect(matrixAlmostEqual(rotation, clockwiseRotation(Number.MAX_VALUE % 360))).toBe(true)
  })

  it('transforms vectors with only the matrix linear part', () => {
    const matrix = multiply(translation(50, -20), clockwiseRotation(90))

    expect(transformVector(matrix, { x: 3, y: 0 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(0), y: expect.closeTo(3) }),
    )
  })

  it('rotates and scales leaves around their center', () => {
    const matrix = leafLocal(20, 10, 100, 40, 90, 2)

    expect(transformPoint(matrix, { x: 50, y: 20 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(70), y: expect.closeTo(30) }),
    )
    expect(transformPoint(matrix, { x: 0, y: 0 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(110), y: expect.closeTo(-70) }),
    )
  })

  it('inverts a composed transform without rounding', () => {
    const world = multiply(
      groupLocal(200, 120, 30, 1.5),
      leafLocal(20, 10, 100, 40, -15, 0.75),
    )
    const inverse = invert(world)

    expect(inverse).not.toBeNull()
    expect(matrixAlmostEqual(multiply(inverse!, world), identity(), SCENE_EPSILON)).toBe(true)
  })

  it('returns null when a matrix is singular', () => {
    expect(invert([1, 0, 0, 0, 10, 20])).toBeNull()
  })

  it('keeps the minimum contract scale invertible even though its determinant is below epsilon', () => {
    const minimumScaleMatrix = uniformScale(1e-4)
    const inverse = invert(minimumScaleMatrix)

    expect(inverse).not.toBeNull()
    expect(matrixAlmostEqual(multiply(inverse!, minimumScaleMatrix), identity())).toBe(true)
  })

  it('inverts representable high-magnitude matrices without determinant overflow', () => {
    const highScaleMatrix: Matrix2D = [1e200, 0, 0, 1e200, 0, 0]
    const inverse = invert(highScaleMatrix)

    expect(inverse).not.toBeNull()
    expect(matrixAlmostEqual(multiply(inverse!, highScaleMatrix), identity())).toBe(true)
  })

  it('calculates axis-aligned bounds from every transformed corner', () => {
    const matrix = leafLocal(10, 20, 100, 40, 90, 1)
    const corners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 0, y: 40 },
    ].map((point) => transformPoint(matrix, point))

    expect(boundsFromPoints(corners)).toEqual(
      expect.objectContaining({
        x: expect.closeTo(40),
        y: expect.closeTo(-10),
        width: expect.closeTo(40),
        height: expect.closeTo(100),
      }),
    )
  })

  it('returns stable bounds for empty and single-point inputs', () => {
    expect(boundsFromPoints([])).toBeNull()
    expect(boundsFromPoints([{ x: -4.5, y: 8.25 }])).toEqual({
      x: -4.5,
      y: 8.25,
      width: 0,
      height: 0,
    })
  })

  it('decomposes and recomposes translation, clockwise rotation, and positive scale', () => {
    const source = groupLocal(-35.5, 80.25, -135, 0.625)
    const decomposition = decomposeSimilarity(source)

    expect(decomposition).not.toBeNull()
    const recomposed = multiply(
      translation(decomposition!.x, decomposition!.y),
      multiply(clockwiseRotation(decomposition!.rotation), uniformScale(decomposition!.scale)),
    )
    expect(matrixAlmostEqual(recomposed, source, SCENE_EPSILON)).toBe(true)
  })

  it('decomposes the minimum contract scale without accepting relative shear', () => {
    expect(decomposeSimilarity(uniformScale(1e-4))).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1e-4,
    })
    expect(decomposeSimilarity([1e-4, 0, 1e-6, 1e-4, 0, 0])).toBeNull()
  })

  it('uses normalized axes to reject high-magnitude shear without arithmetic overflow', () => {
    const scale = 1e200

    expect(decomposeSimilarity([scale, 0, 0, scale, 0, 0])?.scale).toBe(scale)
    expect(
      decomposeSimilarity([scale, 0, scale * 0.1, scale * Math.sqrt(0.99), 0, 0]),
    ).toBeNull()
  })

  it('returns null when decomposition would require shear, reflection, or zero scale', () => {
    expect(decomposeSimilarity([1, 0, 0.25, 1, 0, 0])).toBeNull()
    expect(decomposeSimilarity([-1, 0, 0, 1, 0, 0])).toBeNull()
    expect(decomposeSimilarity([0, 0, 0, 0, 0, 0])).toBeNull()
  })

  it('compares every matrix component using the shared epsilon', () => {
    const withinEpsilon: Matrix2D = [1, 0, 0, 1, SCENE_EPSILON / 2, 0]
    const outsideEpsilon: Matrix2D = [1, 0, 0, 1, SCENE_EPSILON * 2, 0]

    expect(SCENE_EPSILON).toBe(1e-6)
    expect(matrixAlmostEqual(identity(), withinEpsilon, SCENE_EPSILON)).toBe(true)
    expect(matrixAlmostEqual(identity(), outsideEpsilon, SCENE_EPSILON)).toBe(false)
  })

  it('allows finite negative positions and rotations', () => {
    expect(transformPoint(groupLocal(-10, -20, -90, 1), { x: 4, y: 0 })).toEqual(
      expect.objectContaining({ x: expect.closeTo(-10), y: expect.closeTo(-24) }),
    )
  })

  it.each([
    ['zero scale', () => uniformScale(0)],
    ['negative scale', () => groupLocal(0, 0, 0, -1)],
    ['negative width', () => leafLocal(0, 0, -10, 20, 0, 1)],
    ['zero height', () => leafLocal(0, 0, 10, 0, 0, 1)],
    ['NaN translation', () => translation(Number.NaN, 0)],
    ['infinite rotation', () => clockwiseRotation(Number.POSITIVE_INFINITY)],
    ['NaN matrix component', () => invert([1, 0, 0, 1, Number.NaN, 0])],
    [
      'NaN matrix comparison component',
      () => matrixAlmostEqual(identity(), [1, 0, 0, 1, Number.NaN, 0]),
    ],
    [
      'malformed matrix tuple',
      () => transformPoint([] as unknown as Matrix2D, { x: 0, y: 0 }),
    ],
    ['infinite point component', () => transformPoint(identity(), { x: 0, y: Number.NEGATIVE_INFINITY })],
    ['negative epsilon', () => matrixAlmostEqual(identity(), identity(), -SCENE_EPSILON)],
  ])('rejects invalid numeric input: %s', (_label, operation) => {
    expect(operation).toThrow(RangeError)
  })

  it('rejects non-finite points when calculating bounds', () => {
    expect(() => boundsFromPoints([{ x: 0, y: Number.POSITIVE_INFINITY }])).toThrow(RangeError)
  })

  it('rejects non-finite results caused by otherwise finite inputs', () => {
    const maximumScale: Matrix2D = [Number.MAX_VALUE, 0, 0, Number.MAX_VALUE, 0, 0]

    expect(() => multiply(maximumScale, uniformScale(2))).toThrow(RangeError)
    expect(() => transformPoint(maximumScale, { x: 2, y: 0 })).toThrow(RangeError)
    expect(() => transformVector(maximumScale, { x: 0, y: 2 })).toThrow(RangeError)
    expect(() =>
      boundsFromPoints([
        { x: -Number.MAX_VALUE, y: 0 },
        { x: Number.MAX_VALUE, y: 0 },
      ]),
    ).toThrow(RangeError)
  })
})
