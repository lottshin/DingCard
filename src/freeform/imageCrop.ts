import {
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  calculateFramedImageGeometry,
  cloneImageFraming,
  isValidImageFraming,
} from './imageFraming'
import {
  SCENE_EPSILON,
  decomposeSimilarity,
  invert,
  multiply,
  sceneNodeLocalMatrix,
  sceneNodeWithLocalMatrix,
  transformVector,
  translation,
} from './sceneTransform'
import type { ImageFrameSize } from './imageFraming'
import type { Matrix2D, Point } from './sceneTransform'
import type { FreeformImageElement, ImageFraming } from './types'

export type ImageCropHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

export interface ImageCropBounds {
  left: number
  top: number
  right: number
  bottom: number
}

export interface ImageCropDraft {
  frame: ImageCropBounds
  image: ImageCropBounds
  framing: ImageFraming
}

export interface ImageCropNodeUpdate {
  x: number
  y: number
  width: number
  height: number
  framing: ImageFraming
}

export interface ImageCropScreenTransformInput {
  screenDelta: Point
  renderScale: number
  startWorldMatrix: Matrix2D
}

export interface CreateImageCropDraftInput {
  startNode: FreeformImageElement
  naturalSize: ImageFrameSize
}

export interface ImageCropDraftToUpdateInput extends CreateImageCropDraftInput {
  draft: ImageCropDraft
}

export interface ProjectImageCropHandleInput extends CreateImageCropDraftInput {
  startDraft: ImageCropDraft
  handle: ImageCropHandle
  localDelta: Point
  minimumFrameSize: ImageFrameSize
  symmetric?: boolean
}

export interface PanImageCropDraftInput {
  draft: ImageCropDraft
  localDelta: Point
}

export interface ApplyImageCropAspectRatioInput extends CreateImageCropDraftInput {
  draft: ImageCropDraft
  ratio: number | 'original'
  minimumFrameSize: ImageFrameSize
}

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

function isCropBounds(bounds: ImageCropBounds): boolean {
  return isFiniteNumber(bounds?.left)
    && isFiniteNumber(bounds?.top)
    && isFiniteNumber(bounds?.right)
    && isFiniteNumber(bounds?.bottom)
    && bounds.right > bounds.left
    && bounds.bottom > bounds.top
}

function boundsWidth(bounds: ImageCropBounds): number {
  return bounds.right - bounds.left
}

function boundsHeight(bounds: ImageCropBounds): number {
  return bounds.bottom - bounds.top
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function almostEqual(left: number, right: number): boolean {
  const scale = Math.max(1, Math.abs(left), Math.abs(right))
  return Math.abs(left - right) <= SCENE_EPSILON * scale * 8
}

function normalizeClosedRange(value: number, minimum: number, maximum: number): number | null {
  if (!isFiniteNumber(value)) return null
  const tolerance = SCENE_EPSILON * Math.max(1, Math.abs(value), Math.abs(minimum), Math.abs(maximum))
  if (value < minimum - tolerance || value > maximum + tolerance) return null
  return Math.min(maximum, Math.max(minimum, value))
}

function validStartNode(node: FreeformImageElement): boolean {
  if (
    node === null
    || typeof node !== 'object'
    || node.type !== 'image'
    || node.fit !== 'cover'
    || !isPositiveSize(node)
    || !isValidImageFraming(node.framing)
  ) {
    return false
  }

  try {
    sceneNodeLocalMatrix(node)
    return true
  } catch {
    return false
  }
}

export function createImageCropDraft({
  startNode,
  naturalSize,
}: CreateImageCropDraftInput): ImageCropDraft | null {
  if (!validStartNode(startNode) || !isPositiveSize(naturalSize)) return null
  const geometry = calculateFramedImageGeometry({
    naturalSize,
    frameSize: { width: startNode.width, height: startNode.height },
    fit: 'cover',
    framing: startNode.framing,
  })
  if (!geometry) return null

  const frame = {
    left: 0,
    top: 0,
    right: startNode.width,
    bottom: startNode.height,
  }
  const image = {
    left: geometry.left,
    top: geometry.top,
    right: geometry.left + geometry.width,
    bottom: geometry.top + geometry.height,
  }
  if (!isCropBounds(frame) || !isCropBounds(image)) return null
  return {
    frame,
    image,
    framing: cloneImageFraming(startNode.framing),
  }
}

export function imageCropDraftToUpdate({
  startNode,
  naturalSize,
  draft,
}: ImageCropDraftToUpdateInput): ImageCropNodeUpdate | null {
  if (
    !validStartNode(startNode)
    || !isPositiveSize(naturalSize)
    || draft === null
    || typeof draft !== 'object'
    || !isCropBounds(draft.frame)
    || !isCropBounds(draft.image)
    || !isValidImageFraming(draft.framing)
  ) {
    return null
  }

  const frameWidth = boundsWidth(draft.frame)
  const frameHeight = boundsHeight(draft.frame)
  const renderedWidth = boundsWidth(draft.image)
  const renderedHeight = boundsHeight(draft.image)
  if (
    draft.frame.left < draft.image.left - SCENE_EPSILON
    || draft.frame.top < draft.image.top - SCENE_EPSILON
    || draft.frame.right > draft.image.right + SCENE_EPSILON
    || draft.frame.bottom > draft.image.bottom + SCENE_EPSILON
  ) {
    return null
  }

  const horizontalScale = renderedWidth / naturalSize.width
  const verticalScale = renderedHeight / naturalSize.height
  if (
    !isFiniteNumber(horizontalScale)
    || horizontalScale <= 0
    || !isFiniteNumber(verticalScale)
    || verticalScale <= 0
    || !almostEqual(horizontalScale, verticalScale)
  ) {
    return null
  }

  const imageScale = horizontalScale + (verticalScale - horizontalScale) / 2
  const baseScale = Math.max(
    frameWidth / naturalSize.width,
    frameHeight / naturalSize.height,
  )
  const zoom = normalizeClosedRange(imageScale / baseScale, MIN_IMAGE_ZOOM, MAX_IMAGE_ZOOM)
  const focusX = normalizeClosedRange(
    (frameWidth / 2 - (draft.image.left - draft.frame.left)) / renderedWidth,
    0,
    1,
  )
  const focusY = normalizeClosedRange(
    (frameHeight / 2 - (draft.image.top - draft.frame.top)) / renderedHeight,
    0,
    1,
  )
  if (zoom === null || focusX === null || focusY === null) return null
  const framing = { focusX, focusY, zoom }
  if (!isValidImageFraming(framing)) return null

  const verified = calculateFramedImageGeometry({
    naturalSize,
    frameSize: { width: frameWidth, height: frameHeight },
    fit: 'cover',
    framing,
  })
  if (
    !verified
    || !almostEqual(verified.left, draft.image.left - draft.frame.left)
    || !almostEqual(verified.top, draft.image.top - draft.frame.top)
    || !almostEqual(verified.width, renderedWidth)
    || !almostEqual(verified.height, renderedHeight)
  ) {
    return null
  }

  try {
    const resizedSeed = { ...startNode, width: frameWidth, height: frameHeight }
    const shiftedMatrix = multiply(
      sceneNodeLocalMatrix(startNode),
      translation(draft.frame.left, draft.frame.top),
    )
    const resized = sceneNodeWithLocalMatrix(resizedSeed, shiftedMatrix, startNode.scale)
    if (!resized || resized.type !== 'image') return null
    return {
      x: resized.x,
      y: resized.y,
      width: frameWidth,
      height: frameHeight,
      framing,
    }
  } catch {
    return null
  }
}

function cropBoundsAlmostEqual(left: ImageCropBounds, right: ImageCropBounds): boolean {
  return almostEqual(left.left, right.left)
    && almostEqual(left.top, right.top)
    && almostEqual(left.right, right.right)
    && almostEqual(left.bottom, right.bottom)
}

function candidateCropDraft(
  startNode: FreeformImageElement,
  naturalSize: ImageFrameSize,
  startDraft: ImageCropDraft,
  frame: ImageCropBounds,
  minimumFrameSize: ImageFrameSize,
): ImageCropDraft | null {
  if (
    !isPositiveSize(minimumFrameSize)
    || !isCropBounds(frame)
    || boundsWidth(frame) < minimumFrameSize.width - SCENE_EPSILON
    || boundsHeight(frame) < minimumFrameSize.height - SCENE_EPSILON
  ) {
    return null
  }
  const candidate: ImageCropDraft = {
    frame,
    image: startDraft.image,
    framing: startDraft.framing,
  }
  const update = imageCropDraftToUpdate({ startNode, naturalSize, draft: candidate })
  if (!update) return null
  return { ...candidate, framing: update.framing }
}

function rawFrameForHandle(
  frame: ImageCropBounds,
  handle: ImageCropHandle,
  localDelta: Point,
  symmetric: boolean,
): ImageCropBounds | null {
  const raw = { ...frame }
  switch (handle) {
    case 'n':
      raw.top += localDelta.y
      if (symmetric) raw.bottom -= localDelta.y
      break
    case 'ne':
      raw.top += localDelta.y
      raw.right += localDelta.x
      break
    case 'e':
      raw.right += localDelta.x
      if (symmetric) raw.left -= localDelta.x
      break
    case 'se':
      raw.right += localDelta.x
      raw.bottom += localDelta.y
      break
    case 's':
      raw.bottom += localDelta.y
      if (symmetric) raw.top -= localDelta.y
      break
    case 'sw':
      raw.bottom += localDelta.y
      raw.left += localDelta.x
      break
    case 'w':
      raw.left += localDelta.x
      if (symmetric) raw.right -= localDelta.x
      break
    case 'nw':
      raw.left += localDelta.x
      raw.top += localDelta.y
      break
    default:
      return null
  }
  return Object.values(raw).every(isFiniteNumber) ? raw : null
}

function interpolateBounds(
  start: ImageCropBounds,
  end: ImageCropBounds,
  progress: number,
): ImageCropBounds {
  return {
    left: start.left + (end.left - start.left) * progress,
    top: start.top + (end.top - start.top) * progress,
    right: start.right + (end.right - start.right) * progress,
    bottom: start.bottom + (end.bottom - start.bottom) * progress,
  }
}

function addProgressAtTarget(
  values: number[],
  start: number,
  end: number,
  target: number,
): void {
  const change = end - start
  if (!isFiniteNumber(change) || Math.abs(change) <= Number.EPSILON) return
  const progress = (target - start) / change
  if (isFiniteNumber(progress) && progress > 0 && progress < 1) values.push(progress)
}

function cropPathBreakpoints(
  start: ImageCropBounds,
  raw: ImageCropBounds,
  image: ImageCropBounds,
  naturalSize: ImageFrameSize,
  minimumFrameSize: ImageFrameSize,
): number[] {
  const progress = [0, 1]
  addProgressAtTarget(progress, start.left, raw.left, image.left)
  addProgressAtTarget(progress, start.top, raw.top, image.top)
  addProgressAtTarget(progress, start.right, raw.right, image.right)
  addProgressAtTarget(progress, start.bottom, raw.bottom, image.bottom)

  const startWidth = boundsWidth(start)
  const rawWidth = boundsWidth(raw)
  const startHeight = boundsHeight(start)
  const rawHeight = boundsHeight(raw)
  addProgressAtTarget(progress, startWidth, rawWidth, minimumFrameSize.width)
  addProgressAtTarget(progress, startHeight, rawHeight, minimumFrameSize.height)
  addProgressAtTarget(progress, startWidth, rawWidth, boundsWidth(image) / MAX_IMAGE_ZOOM)
  addProgressAtTarget(progress, startHeight, rawHeight, boundsHeight(image) / MAX_IMAGE_ZOOM)

  const startDominance = startWidth / naturalSize.width - startHeight / naturalSize.height
  const rawDominance = rawWidth / naturalSize.width - rawHeight / naturalSize.height
  addProgressAtTarget(progress, startDominance, rawDominance, 0)

  return progress
    .sort((left, right) => left - right)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 1e-12)
}

function lastLegalProgress(
  breakpoints: readonly number[],
  candidateAt: (progress: number) => ImageCropDraft | null,
): { progress: number; candidate: ImageCropDraft } | null {
  const first = candidateAt(0)
  if (!first) return null
  let last = { progress: 0, candidate: first }

  const searchLastLegal = (legalProgress: number, illegalProgress: number): typeof last => {
    let low = legalProgress
    let high = illegalProgress
    let candidate = candidateAt(low) ?? last.candidate
    for (let iteration = 0; iteration < 56; iteration += 1) {
      const middle = low + (high - low) / 2
      const middleCandidate = candidateAt(middle)
      if (middleCandidate) {
        low = middle
        candidate = middleCandidate
      } else {
        high = middle
      }
    }
    return { progress: low, candidate }
  }

  for (let index = 1; index < breakpoints.length; index += 1) {
    const start = breakpoints[index - 1]
    const end = breakpoints[index]
    if (end <= last.progress) continue
    const middle = start + (end - start) / 2
    const middleCandidate = candidateAt(middle)
    if (!middleCandidate) return searchLastLegal(last.progress, middle)
    const endCandidate = candidateAt(end)
    if (!endCandidate) return searchLastLegal(middle, end)
    last = { progress: end, candidate: endCandidate }
  }
  return last
}

export function projectImageCropHandle({
  startNode,
  naturalSize,
  startDraft,
  handle,
  localDelta,
  minimumFrameSize,
  symmetric = false,
}: ProjectImageCropHandleInput): ImageCropDraft {
  if (
    !isFinitePoint(localDelta)
    || !isPositiveSize(minimumFrameSize)
    || (localDelta.x === 0 && localDelta.y === 0)
  ) {
    return startDraft
  }
  const raw = rawFrameForHandle(startDraft.frame, handle, localDelta, symmetric)
  if (!raw) return startDraft
  const breakpoints = cropPathBreakpoints(
    startDraft.frame,
    raw,
    startDraft.image,
    naturalSize,
    minimumFrameSize,
  )
  const projected = lastLegalProgress(breakpoints, (progress) => candidateCropDraft(
    startNode,
    naturalSize,
    startDraft,
    interpolateBounds(startDraft.frame, raw, progress),
    minimumFrameSize,
  ))
  if (!projected || projected.progress <= Number.EPSILON) return startDraft
  if (cropBoundsAlmostEqual(projected.candidate.frame, startDraft.frame)) return startDraft
  return projected.candidate
}

export function imageCropLocalDeltaFromScreen({
  screenDelta,
  renderScale,
  startWorldMatrix,
}: ImageCropScreenTransformInput): Point | null {
  if (!isFinitePoint(screenDelta) || !isFiniteNumber(renderScale) || renderScale <= 0) return null
  try {
    const inverse = invert(startWorldMatrix)
    if (!inverse) return null
    const localDelta = transformVector(inverse, {
      x: screenDelta.x / renderScale,
      y: screenDelta.y / renderScale,
    })
    return isFinitePoint(localDelta) ? localDelta : null
  } catch {
    return null
  }
}

export function imageCropScreenScale({
  renderScale,
  startWorldMatrix,
}: Pick<ImageCropScreenTransformInput, 'renderScale' | 'startWorldMatrix'>): number | null {
  if (!isFiniteNumber(renderScale) || renderScale <= 0) return null
  try {
    const transform = decomposeSimilarity(startWorldMatrix)
    if (!transform) return null
    const screenScale = transform.scale * renderScale
    return isFiniteNumber(screenScale) && screenScale > 0 ? screenScale : null
  } catch {
    return null
  }
}

export function panImageCropDraft({
  draft,
  localDelta,
}: PanImageCropDraftInput): ImageCropDraft {
  if (
    !isFinitePoint(localDelta)
    || draft === null
    || typeof draft !== 'object'
    || !isCropBounds(draft.frame)
    || !isCropBounds(draft.image)
    || !isValidImageFraming(draft.framing)
    || draft.frame.left < draft.image.left - SCENE_EPSILON
    || draft.frame.top < draft.image.top - SCENE_EPSILON
    || draft.frame.right > draft.image.right + SCENE_EPSILON
    || draft.frame.bottom > draft.image.bottom + SCENE_EPSILON
  ) {
    return draft
  }

  const imageWidth = boundsWidth(draft.image)
  const imageHeight = boundsHeight(draft.image)
  const nextLeft = clamp(
    draft.image.left + localDelta.x,
    draft.frame.right - imageWidth,
    draft.frame.left,
  )
  const nextTop = clamp(
    draft.image.top + localDelta.y,
    draft.frame.bottom - imageHeight,
    draft.frame.top,
  )
  const movedX = Math.abs(nextLeft - draft.image.left) > SCENE_EPSILON
  const movedY = Math.abs(nextTop - draft.image.top) > SCENE_EPSILON
  if (!movedX && !movedY) return draft

  const frameWidth = boundsWidth(draft.frame)
  const frameHeight = boundsHeight(draft.frame)
  const focusX = movedX
    ? normalizeClosedRange(
        (frameWidth / 2 - (nextLeft - draft.frame.left)) / imageWidth,
        0,
        1,
      )
    : draft.framing.focusX
  const focusY = movedY
    ? normalizeClosedRange(
        (frameHeight / 2 - (nextTop - draft.frame.top)) / imageHeight,
        0,
        1,
      )
    : draft.framing.focusY
  if (focusX === null || focusY === null) return draft
  const framing = { focusX, focusY, zoom: draft.framing.zoom }
  if (!isValidImageFraming(framing)) return draft
  return {
    frame: draft.frame,
    image: {
      left: nextLeft,
      top: nextTop,
      right: nextLeft + imageWidth,
      bottom: nextTop + imageHeight,
    },
    framing,
  }
}

export function applyImageCropAspectRatio({
  startNode,
  naturalSize,
  draft,
  ratio,
  minimumFrameSize,
}: ApplyImageCropAspectRatioInput): ImageCropDraft {
  const resolvedRatio = ratio === 'original'
    ? naturalSize.width / naturalSize.height
    : ratio
  if (!isFiniteNumber(resolvedRatio) || resolvedRatio <= 0 || !isPositiveSize(minimumFrameSize)) {
    return draft
  }

  const width = boundsWidth(draft.frame)
  const height = boundsHeight(draft.frame)
  if (!isFiniteNumber(width) || width <= 0 || !isFiniteNumber(height) || height <= 0) return draft
  const centerX = draft.frame.left + width / 2
  const centerY = draft.frame.top + height / 2
  let candidateWidth = width
  let candidateHeight = height
  if (width / height > resolvedRatio) {
    candidateWidth = height * resolvedRatio
  } else {
    candidateHeight = width / resolvedRatio
  }
  if (!isFiniteNumber(candidateWidth) || !isFiniteNumber(candidateHeight)) return draft
  const frame = {
    left: centerX - candidateWidth / 2,
    top: centerY - candidateHeight / 2,
    right: centerX + candidateWidth / 2,
    bottom: centerY + candidateHeight / 2,
  }
  if (cropBoundsAlmostEqual(frame, draft.frame)) return draft
  return candidateCropDraft(
    startNode,
    naturalSize,
    draft,
    frame,
    minimumFrameSize,
  ) ?? draft
}
