import { MAX_SCENE_DEPTH } from './constants'
import type { FreeformSceneNode } from './types'

export type Matrix2D = readonly [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
]

export interface Point {
  x: number
  y: number
}

export interface SceneBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SimilarityTransform {
  x: number
  y: number
  rotation: number
  scale: number
}

export const SCENE_EPSILON = 1e-6

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`)
  }
}

function requirePositive(value: number, name: string): void {
  requireFinite(value, name)
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`)
  }
}

function validateMatrix(matrix: Matrix2D, name: string): void {
  if (!Array.isArray(matrix) || matrix.length !== 6) {
    throw new RangeError(`${name} must contain exactly six components`)
  }
  for (let index = 0; index < 6; index += 1) {
    requireFinite(matrix[index], `${name}[${index}]`)
  }
}

function validatePoint(point: Point, name: string): void {
  if (point === null || typeof point !== 'object') {
    throw new RangeError(`${name} must be a point`)
  }
  requireFinite(point.x, `${name}.x`)
  requireFinite(point.y, `${name}.y`)
}

export function identity(): Matrix2D {
  return [1, 0, 0, 1, 0, 0]
}

export function multiply(left: Matrix2D, right: Matrix2D): Matrix2D {
  validateMatrix(left, 'left matrix')
  validateMatrix(right, 'right matrix')

  const [leftA, leftB, leftC, leftD, leftE, leftF] = left
  const [rightA, rightB, rightC, rightD, rightE, rightF] = right

  const result: Matrix2D = [
    leftA * rightA + leftC * rightB,
    leftB * rightA + leftD * rightB,
    leftA * rightC + leftC * rightD,
    leftB * rightC + leftD * rightD,
    leftA * rightE + leftC * rightF + leftE,
    leftB * rightE + leftD * rightF + leftF,
  ]
  validateMatrix(result, 'matrix product')
  return result
}

export function translation(x: number, y: number): Matrix2D {
  requireFinite(x, 'x')
  requireFinite(y, 'y')
  return [1, 0, 0, 1, x, y]
}

export function clockwiseRotation(degrees: number): Matrix2D {
  requireFinite(degrees, 'degrees')
  const radians = ((degrees % 360) * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return [cosine, sine, -sine, cosine, 0, 0]
}

export function uniformScale(scale: number): Matrix2D {
  requirePositive(scale, 'scale')
  return [scale, 0, 0, scale, 0, 0]
}

export function invert(matrix: Matrix2D): Matrix2D | null {
  validateMatrix(matrix, 'matrix')
  const [a, b, c, d, e, f] = matrix
  const buildInverse = (
    inverseA: number,
    inverseB: number,
    inverseC: number,
    inverseD: number,
  ): Matrix2D => {
    const result: Matrix2D = [
      inverseA,
      inverseB,
      inverseC,
      inverseD,
      -(inverseA * e + inverseC * f),
      -(inverseB * e + inverseD * f),
    ]
    validateMatrix(result, 'inverse matrix')
    return result
  }
  const determinant = a * d - b * c

  if (Number.isFinite(determinant) && determinant !== 0) {
    return buildInverse(d / determinant, -b / determinant, -c / determinant, a / determinant)
  }

  const linearScale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))

  if (linearScale === 0) {
    return null
  }

  const scaledA = a / linearScale
  const scaledB = b / linearScale
  const scaledC = c / linearScale
  const scaledD = d / linearScale
  const scaledDeterminant = scaledA * scaledD - scaledB * scaledC

  if (scaledDeterminant === 0) {
    return null
  }

  const inverseFactor = (1 / linearScale) / scaledDeterminant
  const inverseA = scaledD * inverseFactor
  const inverseB = -scaledB * inverseFactor
  const inverseC = -scaledC * inverseFactor
  const inverseD = scaledA * inverseFactor
  return buildInverse(inverseA, inverseB, inverseC, inverseD)
}

export function transformPoint(matrix: Matrix2D, point: Point): Point {
  validateMatrix(matrix, 'matrix')
  validatePoint(point, 'point')
  const [a, b, c, d, e, f] = matrix

  const result = {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  }
  validatePoint(result, 'transformed point')
  return result
}

export function transformVector(matrix: Matrix2D, vector: Point): Point {
  validateMatrix(matrix, 'matrix')
  validatePoint(vector, 'vector')
  const [a, b, c, d] = matrix

  const result = {
    x: a * vector.x + c * vector.y,
    y: b * vector.x + d * vector.y,
  }
  validatePoint(result, 'transformed vector')
  return result
}

export function groupLocal(x: number, y: number, rotation: number, scale: number): Matrix2D {
  return multiply(
    translation(x, y),
    multiply(clockwiseRotation(rotation), uniformScale(scale)),
  )
}

export function leafLocal(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
  scale: number,
): Matrix2D {
  requireFinite(x, 'x')
  requireFinite(y, 'y')
  requirePositive(width, 'width')
  requirePositive(height, 'height')

  return multiply(
    translation(x + width / 2, y + height / 2),
    multiply(
      clockwiseRotation(rotation),
      multiply(uniformScale(scale), translation(-width / 2, -height / 2)),
    ),
  )
}

export function decomposeSimilarity(matrix: Matrix2D): SimilarityTransform | null {
  validateMatrix(matrix, 'matrix')
  const [a, b, c, d, x, y] = matrix
  const firstAxisScale = Math.hypot(a, b)
  const secondAxisScale = Math.hypot(c, d)
  requireFinite(firstAxisScale, 'first axis scale')
  requireFinite(secondAxisScale, 'second axis scale')

  if (firstAxisScale === 0 || secondAxisScale === 0) {
    return null
  }

  const largestScale = Math.max(firstAxisScale, secondAxisScale)
  const relativeScaleDifference = Math.abs(firstAxisScale - secondAxisScale) / largestScale
  const firstAxisX = a / firstAxisScale
  const firstAxisY = b / firstAxisScale
  const secondAxisX = c / secondAxisScale
  const secondAxisY = d / secondAxisScale
  const normalizedDotProduct = firstAxisX * secondAxisX + firstAxisY * secondAxisY
  const normalizedDeterminant = firstAxisX * secondAxisY - firstAxisY * secondAxisX
  const absoluteStructureResidual = Math.max(Math.abs(a - d), Math.abs(b + c))

  if (
    relativeScaleDifference > SCENE_EPSILON ||
    Math.abs(normalizedDotProduct) > SCENE_EPSILON ||
    normalizedDeterminant <= 0 ||
    absoluteStructureResidual > SCENE_EPSILON
  ) {
    return null
  }

  const scale = firstAxisScale + (secondAxisScale - firstAxisScale) / 2
  requirePositive(scale, 'similarity scale')
  return {
    x,
    y,
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    scale,
  }
}

export function boundsFromPoints(points: readonly Point[]): SceneBounds | null {
  if (points.length === 0) {
    return null
  }

  points.forEach((point, index) => validatePoint(point, `points[${index}]`))
  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y

  for (const point of points.slice(1)) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  const result = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
  requireFinite(result.width, 'bounds.width')
  requireFinite(result.height, 'bounds.height')
  return result
}

export function matrixAlmostEqual(
  left: Matrix2D,
  right: Matrix2D,
  epsilon = SCENE_EPSILON,
): boolean {
  validateMatrix(left, 'left matrix')
  validateMatrix(right, 'right matrix')
  requireFinite(epsilon, 'epsilon')
  if (epsilon < 0) {
    throw new RangeError('epsilon must be greater than or equal to zero')
  }

  for (let index = 0; index < 6; index += 1) {
    if (Math.abs(left[index] - right[index]) > epsilon) {
      return false
    }
  }
  return true
}

/** Return a node's complete local transform in its direct parent space. */
export function sceneNodeLocalMatrix(node: FreeformSceneNode): Matrix2D {
  return node.type === 'group'
    ? groupLocal(node.x, node.y, node.rotation, node.scale)
    : leafLocal(node.x, node.y, node.width, node.height, node.rotation, node.scale)
}

/**
 * Re-express a node through a similarity matrix without changing its content.
 * Leaves store x/y as the unrotated top-left, so their transformed center must
 * be converted back instead of treating matrix e/f as x/y. Callers with known
 * transform semantics may provide the exact logical scale; it is accepted only
 * when the matrix-derived scale differs by machine-rounding noise.
 */
export function sceneNodeWithLocalMatrix(
  node: FreeformSceneNode,
  matrix: Matrix2D,
  expectedScale?: number,
): FreeformSceneNode | null {
  const transform = decomposeSimilarity(matrix)
  if (!transform) return null
  let scale = transform.scale
  if (expectedScale !== undefined) {
    if (!Number.isFinite(expectedScale) || expectedScale <= 0) return null
    const roundingTolerance =
      Math.max(Math.abs(transform.scale), Math.abs(expectedScale)) *
      Number.EPSILON *
      64
    if (Math.abs(transform.scale - expectedScale) > roundingTolerance) return null
    scale = expectedScale
  }

  if (node.type === 'group') {
    return {
      ...node,
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
      scale,
    }
  }

  const center = transformPoint(matrix, {
    x: node.width / 2,
    y: node.height / 2,
  })
  const x = center.x - node.width / 2
  const y = center.y - node.height / 2
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    ...node,
    x,
    y,
    rotation: transform.rotation,
    scale,
  }
}

function collectLeafCorners(
  node: FreeformSceneNode,
  parentMatrix: Matrix2D,
  points: Point[],
  depth: number,
): void {
  if (!Number.isInteger(depth) || depth < 1 || depth > MAX_SCENE_DEPTH) {
    throw new RangeError(`scene depth must be an integer from 1 to ${MAX_SCENE_DEPTH}`)
  }
  const matrix = multiply(parentMatrix, sceneNodeLocalMatrix(node))
  if (node.type === 'group') {
    for (const child of node.children) {
      collectLeafCorners(child, matrix, points, depth + 1)
    }
    return
  }

  points.push(
    transformPoint(matrix, { x: 0, y: 0 }),
    transformPoint(matrix, { x: node.width, y: 0 }),
    transformPoint(matrix, { x: node.width, y: node.height }),
    transformPoint(matrix, { x: 0, y: node.height }),
  )
}

/** Bounds of a node's complete leaf subtree in its direct parent space. */
export function sceneNodeBoundsInParent(node: FreeformSceneNode): SceneBounds | null {
  const points: Point[] = []
  collectLeafCorners(node, identity(), points, 1)
  return boundsFromPoints(points)
}
