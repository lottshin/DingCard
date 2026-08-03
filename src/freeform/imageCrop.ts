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

export interface ProjectImageCropGestureInput
  extends CreateImageCropDraftInput, ImageCropScreenTransformInput {
  startDraft: ImageCropDraft
  kind: 'pan' | 'handle'
  handle?: ImageCropHandle
  minimumFrameSize: ImageFrameSize
  symmetric?: boolean
}

export interface ApplyImageCropAspectRatioInput extends CreateImageCropDraftInput {
  draft: ImageCropDraft
  ratio: number | 'original'
  minimumFrameSize: ImageFrameSize
}

const IMAGE_CROP_HANDLES = new Set<ImageCropHandle>([
  'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw',
])
const IMAGE_CROP_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'src', 'alt', 'fit', 'framing',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveSize(size: unknown): size is ImageFrameSize {
  return isRecord(size)
    && isFiniteNumber(size.width) && size.width > 0
    && isFiniteNumber(size.height) && size.height > 0
}

function isFinitePoint(point: unknown): point is Point {
  return isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y)
}

function isCropBounds(bounds: unknown): bounds is ImageCropBounds {
  if (
    !isRecord(bounds)
    || !isFiniteNumber(bounds.left)
    || !isFiniteNumber(bounds.top)
    || !isFiniteNumber(bounds.right)
    || !isFiniteNumber(bounds.bottom)
  ) {
    return false
  }
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  return isFiniteNumber(width) && width > 0 && isFiniteNumber(height) && height > 0
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

function validStartNode(node: unknown): node is FreeformImageElement {
  if (!isRecord(node)) return false
  const keys = Object.keys(node)
  return keys.length === IMAGE_CROP_NODE_KEYS.size
    && keys.every((key) => IMAGE_CROP_NODE_KEYS.has(key))
    && typeof node.id === 'string'
    && node.id.trim().length > 0
    && typeof node.name === 'string'
    && typeof node.locked === 'boolean'
    && typeof node.hidden === 'boolean'
    && node.type === 'image'
    && isFiniteNumber(node.x)
    && isFiniteNumber(node.y)
    && isFiniteNumber(node.width)
    && node.width > 0
    && isFiniteNumber(node.height)
    && node.height > 0
    && isFiniteNumber(node.rotation)
    && isFiniteNumber(node.scale)
    && node.scale > 0
    && typeof node.src === 'string'
    && typeof node.alt === 'string'
    && node.fit === 'cover'
    && isValidImageFraming(node.framing)
}

function isImageCropDraft(value: unknown): value is ImageCropDraft {
  return isRecord(value)
    && isCropBounds(value.frame)
    && isCropBounds(value.image)
    && isValidImageFraming(value.framing)
}

function isImageCropHandle(value: unknown): value is ImageCropHandle {
  return typeof value === 'string' && IMAGE_CROP_HANDLES.has(value as ImageCropHandle)
}

export function createImageCropDraft(input: CreateImageCropDraftInput): ImageCropDraft | null {
  if (!isRecord(input)) return null
  const { startNode, naturalSize } = input as unknown as CreateImageCropDraftInput
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

export function imageCropDraftToUpdate(
  input: ImageCropDraftToUpdateInput,
): ImageCropNodeUpdate | null {
  if (!isRecord(input)) return null
  const { startNode, naturalSize, draft } = input as unknown as ImageCropDraftToUpdateInput
  if (
    !validStartNode(startNode)
    || !isPositiveSize(naturalSize)
    || !isImageCropDraft(draft)
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

  return [...new Set(progress)].sort((left, right) => left - right)
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

export function projectImageCropHandle(input: ProjectImageCropHandleInput): ImageCropDraft
export function projectImageCropHandle(input: null): null
export function projectImageCropHandle<const T extends { readonly startDraft: unknown }>(
  input: T,
): T['startDraft']
export function projectImageCropHandle(input: unknown): unknown {
  const startDraft = isRecord(input) ? input.startDraft : null
  if (!isRecord(input)) return startDraft
  const { startNode, naturalSize, handle, localDelta, minimumFrameSize } = input
  const symmetric = input.symmetric === undefined ? false : input.symmetric
  if (
    !validStartNode(startNode)
    || !isPositiveSize(naturalSize)
    || !isImageCropDraft(startDraft)
    || !isImageCropHandle(handle)
    || !isFinitePoint(localDelta)
    || !isPositiveSize(minimumFrameSize)
    || typeof symmetric !== 'boolean'
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
  if (!projected) return startDraft
  if (cropBoundsAlmostEqual(projected.candidate.frame, startDraft.frame)) return startDraft
  return projected.candidate
}

export function imageCropLocalDeltaFromScreen(input: ImageCropScreenTransformInput): Point | null {
  if (!isRecord(input)) return null
  const transformInput = input as unknown as ImageCropScreenTransformInput
  const { screenDelta, renderScale, startWorldMatrix } = transformInput
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

export function imageCropScreenScale(
  input: Pick<ImageCropScreenTransformInput, 'renderScale' | 'startWorldMatrix'>,
): number | null {
  if (!isRecord(input)) return null
  const { renderScale, startWorldMatrix } = input as unknown as Pick<
    ImageCropScreenTransformInput,
    'renderScale' | 'startWorldMatrix'
  >
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

export function panImageCropDraft(input: PanImageCropDraftInput): ImageCropDraft
export function panImageCropDraft(input: null): null
export function panImageCropDraft<const T extends { readonly draft: unknown }>(
  input: T,
): T['draft']
export function panImageCropDraft(input: unknown): unknown {
  const draft = isRecord(input) ? input.draft : null
  if (!isRecord(input)) return draft
  const { localDelta } = input
  if (
    !isFinitePoint(localDelta)
    || !isImageCropDraft(draft)
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
  const nextImage = {
    left: nextLeft,
    top: nextTop,
    right: nextLeft + imageWidth,
    bottom: nextTop + imageHeight,
  }
  if (!isCropBounds(nextImage)) return draft

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
    image: nextImage,
    framing,
  }
}

export function projectImageCropGesture(input: ProjectImageCropGestureInput): ImageCropDraft
export function projectImageCropGesture(input: null): null
export function projectImageCropGesture<const T extends { readonly startDraft: unknown }>(
  input: T,
): T['startDraft']
export function projectImageCropGesture(input: unknown): unknown {
  const startDraft = isRecord(input) ? input.startDraft : null
  if (!isRecord(input)) return startDraft
  const localDelta = imageCropLocalDeltaFromScreen({
    screenDelta: input.screenDelta,
    renderScale: input.renderScale,
    startWorldMatrix: input.startWorldMatrix,
  } as ImageCropScreenTransformInput)
  if (!localDelta) return startDraft
  if (input.kind === 'pan') {
    return panImageCropDraft({ draft: startDraft, localDelta })
  }
  if (input.kind !== 'handle') return startDraft
  return projectImageCropHandle({
    startNode: input.startNode,
    naturalSize: input.naturalSize,
    startDraft,
    handle: input.handle,
    localDelta,
    minimumFrameSize: input.minimumFrameSize,
    symmetric: input.symmetric,
  })
}

export function applyImageCropAspectRatio(input: ApplyImageCropAspectRatioInput): ImageCropDraft
export function applyImageCropAspectRatio(input: null): null
export function applyImageCropAspectRatio<const T extends { readonly draft: unknown }>(
  input: T,
): T['draft']
export function applyImageCropAspectRatio(input: unknown): unknown {
  const draft = isRecord(input) ? input.draft : null
  if (!isRecord(input)) return draft
  const { startNode, naturalSize, ratio, minimumFrameSize } = input
  if (
    !validStartNode(startNode)
    || !isPositiveSize(naturalSize)
    || !isImageCropDraft(draft)
    || !isPositiveSize(minimumFrameSize)
    || (ratio !== 'original' && (!isFiniteNumber(ratio) || ratio <= 0))
  ) {
    return draft
  }
  const resolvedRatio = ratio === 'original'
    ? naturalSize.width / naturalSize.height
    : ratio
  if (!isFiniteNumber(resolvedRatio) || resolvedRatio <= 0) return draft

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
