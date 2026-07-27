import {
  SCENE_EPSILON,
  invert,
  transformVector,
} from './sceneTransform'
import type { Matrix2D, Point } from './sceneTransform'
import type { ImageFraming } from './types'

export type { ImageFraming } from './types'

export const MIN_IMAGE_ZOOM = 1
export const MAX_IMAGE_ZOOM = 4

export interface ImageFrameSize {
  width: number
  height: number
}

export interface FramedImageGeometry {
  left: number
  top: number
  width: number
  height: number
}

export interface CalculateFramedImageGeometryInput {
  naturalSize: ImageFrameSize
  frameSize: ImageFrameSize
  fit: 'cover' | 'contain'
  framing: ImageFraming
}

export interface PanImageFramingInput {
  naturalSize: ImageFrameSize
  frameSize: ImageFrameSize
  framing: ImageFraming
  localDelta: Point
}

export interface PanImageFramingFromScreenInput
  extends Omit<PanImageFramingInput, 'localDelta'> {
  screenDelta: Point
  renderScale: number
  worldMatrix: Matrix2D
}

const FRAMING_KEYS = ['focusX', 'focusY', 'zoom'] as const

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveSize(size: ImageFrameSize): boolean {
  return isFiniteNumber(size?.width) && size.width > 0
    && isFiniteNumber(size?.height) && size.height > 0
}

function isFinitePoint(point: Point): boolean {
  return isFiniteNumber(point?.x) && isFiniteNumber(point?.y)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function isFiniteMatrix(matrix: Matrix2D): boolean {
  return Array.isArray(matrix)
    && matrix.length === 6
    && matrix.every(isFiniteNumber)
}

export function createDefaultImageFraming(): ImageFraming {
  return { focusX: 0.5, focusY: 0.5, zoom: MIN_IMAGE_ZOOM }
}

export function isValidImageFraming(value: unknown): value is ImageFraming {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  if (
    keys.length !== FRAMING_KEYS.length
    || FRAMING_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    return false
  }

  const framing = value as Record<(typeof FRAMING_KEYS)[number], unknown>
  return isFiniteNumber(framing.focusX)
    && framing.focusX >= 0
    && framing.focusX <= 1
    && isFiniteNumber(framing.focusY)
    && framing.focusY >= 0
    && framing.focusY <= 1
    && isFiniteNumber(framing.zoom)
    && framing.zoom >= MIN_IMAGE_ZOOM
    && framing.zoom <= MAX_IMAGE_ZOOM
}

export function cloneImageFraming(framing: ImageFraming): ImageFraming {
  return {
    focusX: framing.focusX,
    focusY: framing.focusY,
    zoom: framing.zoom,
  }
}

export function imageFramingEquals(left: ImageFraming, right: ImageFraming): boolean {
  if (!isValidImageFraming(left) || !isValidImageFraming(right)) return false
  return Math.abs(left.focusX - right.focusX) <= SCENE_EPSILON
    && Math.abs(left.focusY - right.focusY) <= SCENE_EPSILON
    && Math.abs(left.zoom - right.zoom) <= SCENE_EPSILON
}

export function calculateFramedImageGeometry({
  naturalSize,
  frameSize,
  fit,
  framing,
}: CalculateFramedImageGeometryInput): FramedImageGeometry | null {
  if (
    !isPositiveSize(naturalSize)
    || !isPositiveSize(frameSize)
    || !isValidImageFraming(framing)
    || (fit !== 'cover' && fit !== 'contain')
  ) {
    return null
  }

  const scale = fit === 'cover'
    ? Math.max(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height)
      * framing.zoom
    : Math.min(frameSize.width / naturalSize.width, frameSize.height / naturalSize.height)
  let width = naturalSize.width * scale
  let height = naturalSize.height * scale
  if (!isFiniteNumber(scale) || scale <= 0 || !isFiniteNumber(width) || !isFiniteNumber(height)) {
    return null
  }

  if (fit === 'cover') {
    width = Math.max(width, frameSize.width)
    height = Math.max(height, frameSize.height)
  } else {
    width = Math.min(width, frameSize.width)
    height = Math.min(height, frameSize.height)
  }

  if (fit === 'contain') {
    return {
      left: (frameSize.width - width) / 2,
      top: (frameSize.height - height) / 2,
      width,
      height,
    }
  }

  const left = clamp(
    frameSize.width / 2 - framing.focusX * width,
    frameSize.width - width,
    0,
  )
  const top = clamp(
    frameSize.height / 2 - framing.focusY * height,
    frameSize.height - height,
    0,
  )
  if (![left, top].every(isFiniteNumber)) return null
  return { left, top, width, height }
}

export function panImageFraming({
  naturalSize,
  frameSize,
  framing,
  localDelta,
}: PanImageFramingInput): ImageFraming {
  if (!isFinitePoint(localDelta)) return framing
  const geometry = calculateFramedImageGeometry({
    naturalSize,
    frameSize,
    fit: 'cover',
    framing,
  })
  if (!geometry) return framing

  const nextLeft = clamp(
    geometry.left + localDelta.x,
    frameSize.width - geometry.width,
    0,
  )
  const nextTop = clamp(
    geometry.top + localDelta.y,
    frameSize.height - geometry.height,
    0,
  )
  if (!isFiniteNumber(nextLeft) || !isFiniteNumber(nextTop)) return framing

  const movedX = nextLeft !== geometry.left
  const movedY = nextTop !== geometry.top
  if (!movedX && !movedY) return framing

  const candidate: ImageFraming = {
    focusX: movedX
      ? clamp((frameSize.width / 2 - nextLeft) / geometry.width, 0, 1)
      : framing.focusX,
    focusY: movedY
      ? clamp((frameSize.height / 2 - nextTop) / geometry.height, 0, 1)
      : framing.focusY,
    zoom: framing.zoom,
  }
  return imageFramingEquals(candidate, framing) ? framing : candidate
}

export function panImageFramingFromScreen({
  naturalSize,
  frameSize,
  framing,
  screenDelta,
  renderScale,
  worldMatrix,
}: PanImageFramingFromScreenInput): ImageFraming {
  if (
    !isFinitePoint(screenDelta)
    || !isFiniteNumber(renderScale)
    || renderScale <= 0
    || !isFiniteMatrix(worldMatrix)
  ) {
    return framing
  }

  try {
    const inverse = invert(worldMatrix)
    if (!inverse) return framing
    const transformed = transformVector(inverse, screenDelta)
    const localDelta = {
      x: transformed.x / renderScale,
      y: transformed.y / renderScale,
    }
    if (!isFinitePoint(localDelta)) return framing
    return panImageFraming({ naturalSize, frameSize, framing, localDelta })
  } catch {
    return framing
  }
}
