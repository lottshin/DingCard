import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  applyImageCropAspectRatio,
  panImageCropDraft,
  projectImageCropGesture,
  projectImageCropHandle,
  type ImageCropDraft,
  type ImageCropHandle,
} from './imageCrop'
import type { ImageFrameSize } from './imageFraming'
import type { ImageCropOverlayHandle } from './ImageCropOverlay'
import type { Matrix2D, Point } from './sceneTransform'
import type {
  FreeformDocument,
  FreeformImageElement,
  ScenePath,
} from './types'

const MINIMUM_CROP_WORLD_SIZE = 40

export interface ImageCropSession {
  scopeGeneration: number
  draftScopeKey: string
  slideId: string
  path: ScenePath
  logicalSrc: string
  resolvedSrc: string
  naturalSize: ImageFrameSize
  startDocument: FreeformDocument
  startNode: FreeformImageElement
  startWorldMatrix: Matrix2D
  minimumFrameSize: ImageFrameSize
  startDraft: ImageCropDraft
  /** The last draft settled by a completed keyboard or pointer segment. */
  draft: ImageCropDraft
}

export interface StartImageCropInput {
  scopeGeneration: number
  draftScopeKey: string
  slideId: string
  path: ScenePath
  logicalSrc: string
  resolvedSrc: string
  naturalSize: ImageFrameSize
  startDocument: FreeformDocument
  startNode: FreeformImageElement
  startWorldMatrix: Matrix2D
  minimumFrameSize?: ImageFrameSize
  draft: ImageCropDraft
}

export type ImageCropFinishReason = 'done' | 'enter' | 'outside' | 'transition'

export interface ImageCropFinishResult {
  reason: ImageCropFinishReason
  session: ImageCropSession
  draft: ImageCropDraft
}

export interface ImageCropSessionApi {
  session: ImageCropSession | null
  overlayRef: RefObject<ImageCropOverlayHandle>
  renderDraft: ImageCropDraft | null
  start(input: StartImageCropInput): boolean
  finish(reason: ImageCropFinishReason): ImageCropFinishResult | null
  invalidate(): void
  panPointerDown(event: ReactPointerEvent<HTMLImageElement>): void
  handlePointerDown(
    handle: ImageCropHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void
  handleKeyDown(handle: ImageCropHandle, event: ReactKeyboardEvent<HTMLButtonElement>): void
  overlayKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void
  nudgePan(delta: Point): void
  nudgeHandle(handle: ImageCropHandle, delta: Point, symmetric: boolean): void
  applyAspectRatio(ratio: number | 'original'): boolean
}

interface CropGesture {
  pointerId: number
  pointerType: string
  kind: 'pan' | 'handle'
  handle?: ImageCropHandle
  symmetric: boolean
  startClient: Point
  latestClient: Point
  startDraft: ImageCropDraft
  renderScale: number
  target: HTMLElement | null
  frameId: number | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPositiveSize(value: unknown): value is ImageFrameSize {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && isFiniteNumber((value as ImageFrameSize).width)
    && (value as ImageFrameSize).width > 0
    && isFiniteNumber((value as ImageFrameSize).height)
    && (value as ImageFrameSize).height > 0
}

function isFinitePoint(value: unknown): value is Point {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && isFiniteNumber((value as Point).x)
    && isFiniteNumber((value as Point).y)
}

function isFiniteMatrix(value: unknown): value is Matrix2D {
  return Array.isArray(value)
    && value.length === 6
    && value.every(isFiniteNumber)
}

function cloneDraft(draft: ImageCropDraft): ImageCropDraft {
  return {
    frame: { ...draft.frame },
    image: { ...draft.image },
    framing: { ...draft.framing },
  }
}

function validDraft(value: unknown): value is ImageCropDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const draft = value as ImageCropDraft
  const bounds = [draft.frame, draft.image]
  if (!bounds.every((bound) => (
    bound
    && isFiniteNumber(bound.left)
    && isFiniteNumber(bound.top)
    && isFiniteNumber(bound.right)
    && isFiniteNumber(bound.bottom)
    && bound.right > bound.left
    && bound.bottom > bound.top
  ))) return false
  return draft.image.left <= draft.frame.left
    && draft.image.top <= draft.frame.top
    && draft.image.right >= draft.frame.right
    && draft.image.bottom >= draft.frame.bottom
    && Boolean(draft.framing)
}

function validStartInput(input: unknown): input is StartImageCropInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false
  const value = input as StartImageCropInput
  return isFiniteNumber(value.scopeGeneration)
    && typeof value.draftScopeKey === 'string'
    && typeof value.slideId === 'string'
    && Array.isArray(value.path)
    && value.path.length > 0
    && value.path.every((id) => typeof id === 'string' && id.length > 0)
    && typeof value.logicalSrc === 'string'
    && typeof value.resolvedSrc === 'string'
    && isPositiveSize(value.naturalSize)
    && Boolean(value.startDocument)
    && value.startNode?.type === 'image'
    && isFiniteMatrix(value.startWorldMatrix)
    && validDraft(value.draft)
    && (value.minimumFrameSize === undefined || isPositiveSize(value.minimumFrameSize))
}

function minimumFrameSizeFor(input: StartImageCropInput): ImageFrameSize {
  if (input.minimumFrameSize) return { ...input.minimumFrameSize }
  const a = input.startWorldMatrix[0]
  const b = input.startWorldMatrix[1]
  const worldScale = Math.hypot(a, b)
  if (!isFiniteNumber(worldScale) || worldScale <= 0) {
    return { width: MINIMUM_CROP_WORLD_SIZE, height: MINIMUM_CROP_WORLD_SIZE }
  }
  return {
    width: MINIMUM_CROP_WORLD_SIZE / worldScale,
    height: MINIMUM_CROP_WORLD_SIZE / worldScale,
  }
}

function handleAxes(handle: ImageCropHandle): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  return {
    x: handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0,
    y: handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0,
  }
}

function isEdgeHandle(handle: ImageCropHandle): boolean {
  return handle === 'n' || handle === 'e' || handle === 's' || handle === 'w'
}

function keyDeltaForHandle(handle: ImageCropHandle, event: ReactKeyboardEvent): Point | null {
  const step = event.shiftKey ? 10 : 1
  const axes = handleAxes(handle)
  if (event.key === 'ArrowLeft' && axes.x !== 0) return { x: -step, y: 0 }
  if (event.key === 'ArrowRight' && axes.x !== 0) return { x: step, y: 0 }
  if (event.key === 'ArrowUp' && axes.y !== 0) return { x: 0, y: -step }
  if (event.key === 'ArrowDown' && axes.y !== 0) return { x: 0, y: step }
  return null
}

/**
 * Owns transient crop drafts and all pointer listeners. Document writes are
 * intentionally left to the workspace so a gesture can become one action.
 */
export function useImageCropSession(displayRenderScale: number | null): ImageCropSessionApi {
  const overlayRef = useRef<ImageCropOverlayHandle>(null)
  const displayRenderScaleRef = useRef<number | null>(null)
  const sessionStateRef = useRef<ImageCropSession | null>(null)
  const settledDraftRef = useRef<ImageCropDraft | null>(null)
  const previewDraftRef = useRef<ImageCropDraft | null>(null)
  const gestureRef = useRef<CropGesture | null>(null)
  const mountedRef = useRef(true)
  const pointerMoveHandlerRef = useRef<(event: PointerEvent) => void>(() => undefined)
  const pointerUpHandlerRef = useRef<(event: PointerEvent) => void>(() => undefined)
  const pointerCancelHandlerRef = useRef<(event: PointerEvent) => void>(() => undefined)
  const blurHandlerRef = useRef<() => void>(() => undefined)
  const listenerRef = useRef({
    move: (event: PointerEvent) => pointerMoveHandlerRef.current(event),
    up: (event: PointerEvent) => pointerUpHandlerRef.current(event),
    cancel: (event: PointerEvent) => pointerCancelHandlerRef.current(event),
    blur: () => blurHandlerRef.current(),
  })
  const [session, setSession] = useState<ImageCropSession | null>(null)

  displayRenderScaleRef.current = isFiniteNumber(displayRenderScale) && displayRenderScale > 0
    ? displayRenderScale
    : null

  const renderPreview = useCallback((draft: ImageCropDraft | null) => {
    if (!draft || !mountedRef.current) return
    overlayRef.current?.renderDraft(draft)
  }, [])

  const setSettledDraft = useCallback((draft: ImageCropDraft) => {
    const owned = cloneDraft(draft)
    settledDraftRef.current = owned
    previewDraftRef.current = owned
    const current = sessionStateRef.current
    if (current) {
      const next = { ...current, draft: owned }
      sessionStateRef.current = next
      setSession(next)
    }
    renderPreview(owned)
  }, [renderPreview])

  const releasePointer = useCallback((gesture: CropGesture | null) => {
    if (!gesture?.target || typeof gesture.target.releasePointerCapture !== 'function') return
    try {
      if (gesture.target.hasPointerCapture?.(gesture.pointerId)) {
        gesture.target.releasePointerCapture(gesture.pointerId)
      }
    } catch {
      // Synthetic and already-released pointers are both valid cleanup paths.
    }
  }, [])

  const cancelScheduledFrame = useCallback(() => {
    const gesture = gestureRef.current
    if (gesture?.frameId !== null && gesture?.frameId !== undefined) {
      cancelAnimationFrame(gesture.frameId)
      gesture.frameId = null
    }
  }, [])

  const removeGestureListeners = useCallback(() => {
    window.removeEventListener('pointermove', listenerRef.current.move)
    window.removeEventListener('pointerup', listenerRef.current.up)
    window.removeEventListener('pointercancel', listenerRef.current.cancel)
    window.removeEventListener('blur', listenerRef.current.blur)
  }, [])

  const cleanupGesture = useCallback(() => {
    const gesture = gestureRef.current
    cancelScheduledFrame()
    removeGestureListeners()
    releasePointer(gesture)
    gestureRef.current = null
  }, [cancelScheduledFrame, releasePointer, removeGestureListeners])

  const calculateGestureDraft = useCallback((gesture: CropGesture): ImageCropDraft => {
    const current = sessionStateRef.current
    if (!current) return gesture.startDraft
    return projectImageCropGesture({
      startNode: current.startNode,
      naturalSize: current.naturalSize,
      startDraft: gesture.startDraft,
      kind: gesture.kind,
      handle: gesture.handle,
      screenDelta: {
        x: gesture.latestClient.x - gesture.startClient.x,
        y: gesture.latestClient.y - gesture.startClient.y,
      },
      renderScale: gesture.renderScale,
      startWorldMatrix: current.startWorldMatrix,
      minimumFrameSize: current.minimumFrameSize,
      symmetric: gesture.symmetric,
    })
  }, [])

  const resolveGestureDraft = useCallback(() => {
    const gesture = gestureRef.current
    if (!gesture) return null
    cancelScheduledFrame()
    return calculateGestureDraft(gesture)
  }, [calculateGestureDraft, cancelScheduledFrame])

  const scheduleGestureFrame = useCallback(() => {
    const gesture = gestureRef.current
    if (!gesture || gesture.frameId !== null) return
    gesture.frameId = requestAnimationFrame(() => {
      const active = gestureRef.current
      if (!active || active !== gesture) return
      active.frameId = null
      const next = calculateGestureDraft(active)
      previewDraftRef.current = next
      renderPreview(next)
    })
  }, [calculateGestureDraft, renderPreview])

  const finishGestureSegment = useCallback((commit: boolean) => {
    const gesture = gestureRef.current
    if (!gesture) return
    if (commit) {
      const next = resolveGestureDraft() ?? gesture.startDraft
      setSettledDraft(next)
    } else {
      cancelScheduledFrame()
      setSettledDraft(gesture.startDraft)
    }
    cleanupGesture()
  }, [cancelScheduledFrame, cleanupGesture, resolveGestureDraft, setSettledDraft])

  const beginGesture = useCallback((
    kind: CropGesture['kind'],
    handle: ImageCropHandle | undefined,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const current = sessionStateRef.current
    const renderScale = displayRenderScaleRef.current
    if (
      !current
      || renderScale === null
      || gestureRef.current
      || !event.isPrimary
      || event.button !== 0
      || !isFiniteNumber(event.pointerId)
    ) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    try {
      target.setPointerCapture?.(event.pointerId)
    } catch {
      // Browser capture can reject synthetic events; window listeners still own it.
    }
    const startDraft = cloneDraft(settledDraftRef.current ?? current.draft)
    const gesture: CropGesture = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      kind,
      handle,
      symmetric: Boolean(event.ctrlKey || event.metaKey) && Boolean(handle && isEdgeHandle(handle)),
      startClient: { x: event.clientX, y: event.clientY },
      latestClient: { x: event.clientX, y: event.clientY },
      startDraft,
      renderScale,
      target,
      frameId: null,
    }
    gestureRef.current = gesture
    window.addEventListener('pointermove', listenerRef.current.move, { passive: false })
    window.addEventListener('pointerup', listenerRef.current.up)
    window.addEventListener('pointercancel', listenerRef.current.cancel)
    window.addEventListener('blur', listenerRef.current.blur)
  }, [])

  const panPointerDown = useCallback((event: ReactPointerEvent<HTMLImageElement>) => {
    beginGesture('pan', undefined, event)
  }, [beginGesture])

  const handlePointerDown = useCallback((
    handle: ImageCropHandle,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    beginGesture('handle', handle, event)
  }, [beginGesture])

  const nudgePan = useCallback((delta: Point) => {
    if (gestureRef.current) return
    const current = sessionStateRef.current
    if (!current || !isFinitePoint(delta)) return
    setSettledDraft(panImageCropDraft({
      draft: settledDraftRef.current ?? current.draft,
      localDelta: delta,
    }))
  }, [setSettledDraft])

  const nudgeHandle = useCallback((
    handle: ImageCropHandle,
    delta: Point,
    symmetric: boolean,
  ) => {
    if (gestureRef.current) return
    const current = sessionStateRef.current
    if (!current || !isFinitePoint(delta)) return
    setSettledDraft(projectImageCropHandle({
      startNode: current.startNode,
      naturalSize: current.naturalSize,
      startDraft: settledDraftRef.current ?? current.draft,
      handle,
      localDelta: delta,
      minimumFrameSize: current.minimumFrameSize,
      symmetric,
    }))
  }, [setSettledDraft])

  const handleKeyDown = useCallback((
    handle: ImageCropHandle,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const delta = keyDeltaForHandle(handle, event)
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    nudgeHandle(handle, delta, Boolean(event.ctrlKey || event.metaKey) && isEdgeHandle(handle))
  }, [nudgeHandle])

  const overlayKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowLeft'
      ? { x: -1, y: 0 }
      : event.key === 'ArrowRight'
        ? { x: 1, y: 0 }
        : event.key === 'ArrowUp'
          ? { x: 0, y: -1 }
          : event.key === 'ArrowDown'
            ? { x: 0, y: 1 }
            : null
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    nudgePan(event.shiftKey ? { x: delta.x * 10, y: delta.y * 10 } : delta)
  }, [nudgePan])

  const start = useCallback((input: StartImageCropInput): boolean => {
    if (
      !validStartInput(input)
      || displayRenderScaleRef.current === null
      || sessionStateRef.current
    ) return false
    const minimumFrameSize = minimumFrameSizeFor(input)
    const startDraft = cloneDraft(input.draft)
    const next: ImageCropSession = {
      ...input,
      path: [...input.path],
      naturalSize: { ...input.naturalSize },
      startNode: { ...input.startNode, framing: { ...input.startNode.framing } },
      startWorldMatrix: [...input.startWorldMatrix] as Matrix2D,
      minimumFrameSize,
      startDraft,
      draft: startDraft,
    }
    sessionStateRef.current = next
    settledDraftRef.current = startDraft
    previewDraftRef.current = startDraft
    setSession(next)
    renderPreview(startDraft)
    return true
  }, [renderPreview])

  const finish = useCallback((reason: ImageCropFinishReason): ImageCropFinishResult | null => {
    const current = sessionStateRef.current
    if (!current) return null
    const finalDraft = gestureRef.current
      ? (resolveGestureDraft() ?? previewDraftRef.current ?? current.draft)
      : (previewDraftRef.current ?? current.draft)
    if (gestureRef.current) {
      settledDraftRef.current = cloneDraft(finalDraft)
      previewDraftRef.current = settledDraftRef.current
      renderPreview(settledDraftRef.current)
    }
    cleanupGesture()
    const result: ImageCropFinishResult = {
      reason,
      session: { ...current, draft: cloneDraft(finalDraft) },
      draft: cloneDraft(finalDraft),
    }
    sessionStateRef.current = null
    settledDraftRef.current = null
    previewDraftRef.current = null
    setSession(null)
    return result
  }, [cleanupGesture, renderPreview, resolveGestureDraft])

  const invalidate = useCallback(() => {
    if (!sessionStateRef.current && !gestureRef.current) return
    cleanupGesture()
    sessionStateRef.current = null
    settledDraftRef.current = null
    previewDraftRef.current = null
    setSession(null)
  }, [cleanupGesture])

  pointerMoveHandlerRef.current = (event) => {
    const gesture = gestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    event.preventDefault()
    gesture.latestClient = { x: event.clientX, y: event.clientY }
    scheduleGestureFrame()
  }
  pointerUpHandlerRef.current = (event) => {
    const gesture = gestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    event.preventDefault()
    gesture.latestClient = { x: event.clientX, y: event.clientY }
    finishGestureSegment(true)
  }
  pointerCancelHandlerRef.current = (event) => {
    const gesture = gestureRef.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    finishGestureSegment(false)
  }
  blurHandlerRef.current = () => {
    if (gestureRef.current) finishGestureSegment(false)
  }

  useLayoutEffect(() => {
    renderPreview(previewDraftRef.current)
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanupGesture()
      sessionStateRef.current = null
      settledDraftRef.current = null
      previewDraftRef.current = null
    }
  }, [cleanupGesture])

  return {
    session,
    overlayRef,
    renderDraft: previewDraftRef.current,
    start,
    finish,
    invalidate,
    panPointerDown,
    handlePointerDown,
    handleKeyDown,
    overlayKeyDown,
    nudgePan,
    nudgeHandle,
    applyAspectRatio: (ratio) => {
      if (gestureRef.current) return false
      const current = sessionStateRef.current
      if (!current) return false
      const next = applyImageCropAspectRatio({
        startNode: current.startNode,
        naturalSize: current.naturalSize,
        draft: settledDraftRef.current ?? current.draft,
        ratio,
        minimumFrameSize: current.minimumFrameSize,
      })
      const changed = next !== (settledDraftRef.current ?? current.draft)
      if (changed) setSettledDraft(next)
      return changed
    },
  }
}
