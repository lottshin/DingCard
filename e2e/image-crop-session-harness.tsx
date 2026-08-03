import { Component, forwardRef, useEffect, useImperativeHandle, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'

import { createImageCropDraft, type ImageCropDraft } from '../src/freeform/imageCrop'
import type { ImageCropOverlayHandle } from '../src/freeform/ImageCropOverlay'
import { useImageCropSession } from '../src/freeform/useImageCropSession'
import type { FreeformDocument, FreeformImageElement } from '../src/freeform/types'

type TrackedListenerType = 'pointermove' | 'pointerup' | 'pointercancel' | 'blur'

interface HarnessSnapshot {
  ready: boolean
  startResult: boolean | null
  unmounted: boolean
  layoutCommitCount: number
  beforeMutationFrameFlushCount: number
  beforeMutationRenderDraftMatchedLastCommit: boolean | null
  overlayWriteCount: number
  lastRenderedDraft: ImageCropDraft | null
  requestedFrameIds: number[]
  canceledFrameIds: number[]
  listenerAdds: Record<TrackedListenerType, number>
  listenerRemoves: Record<TrackedListenerType, number>
  activeListeners: Record<TrackedListenerType, number>
  captureSetIds: number[]
  captureReleaseIds: number[]
  capturedPointerIds: number[]
}

interface ImageCropSessionHarnessApi {
  arm(): void
  finish(): void
  setRenderScale(renderScale: number | null): void
  rerenderAndFlushPendingFrameBeforeMutation(): void
  unmount(): void
  fireCanceledFrames(): void
  dispatchLateEvents(): void
  snapshot(): HarnessSnapshot
}

declare global {
  interface Window {
    __imageCropSessionHarness: ImageCropSessionHarnessApi
  }
}

const TRACKED_LISTENER_TYPES: TrackedListenerType[] = [
  'pointermove',
  'pointerup',
  'pointercancel',
  'blur',
]

function listenerCounts(): Record<TrackedListenerType, number> {
  return { pointermove: 0, pointerup: 0, pointercancel: 0, blur: 0 }
}

const state = {
  ready: false,
  startResult: null as boolean | null,
  unmounted: false,
  layoutCommitCount: 0,
  beforeMutationFrameFlushCount: 0,
  beforeMutationRenderDraftMatchedLastCommit: null as boolean | null,
  overlayWriteCount: 0,
  lastRenderedDraft: null as ImageCropDraft | null,
  requestedFrameIds: [] as number[],
  canceledFrameIds: [] as number[],
  listenerAdds: listenerCounts(),
  listenerRemoves: listenerCounts(),
  captureSetIds: [] as number[],
  captureReleaseIds: [] as number[],
}

const activeListeners: Record<TrackedListenerType, Set<EventListenerOrEventListenerObject>> = {
  pointermove: new Set(),
  pointerup: new Set(),
  pointercancel: new Set(),
  blur: new Set(),
}
const capturedPointers = new Set<number>()
const heldFrames = new Map<number, FrameRequestCallback>()
const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window)
const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window)
const nativeAddEventListener = window.addEventListener.bind(window)
const nativeRemoveEventListener = window.removeEventListener.bind(window)
let nextFrameId = 3_000_000_000
let armed = false
let flushPendingFrameBeforeMutation = false
let lastCommittedRenderDraft: ImageCropDraft | null | undefined

function trackedListenerType(type: string): TrackedListenerType | null {
  return TRACKED_LISTENER_TYPES.includes(type as TrackedListenerType)
    ? type as TrackedListenerType
    : null
}

function flushHeldFrames(): number {
  const callbacks = [...heldFrames.values()]
  heldFrames.clear()
  for (const callback of callbacks) callback(performance.now())
  return callbacks.length
}

function armHarness(): void {
  if (armed) return
  armed = true
  window.requestAnimationFrame = (callback) => {
    const frameId = nextFrameId
    nextFrameId += 1
    state.requestedFrameIds.push(frameId)
    heldFrames.set(frameId, callback)
    return frameId
  }
  window.cancelAnimationFrame = (frameId) => {
    state.canceledFrameIds.push(frameId)
  }
  window.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => {
    const trackedType = trackedListenerType(type)
    if (trackedType && listener) {
      state.listenerAdds[trackedType] += 1
      activeListeners[trackedType].add(listener)
    }
    nativeAddEventListener(type, listener, options)
  }) as typeof window.addEventListener
  window.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => {
    const trackedType = trackedListenerType(type)
    if (trackedType && listener) {
      state.listenerRemoves[trackedType] += 1
      activeListeners[trackedType].delete(listener)
    }
    nativeRemoveEventListener(type, listener, options)
  }) as typeof window.removeEventListener

  const target = document.querySelector<HTMLElement>('[data-testid="crop-pointer-target"]')
  if (!target) throw new Error('crop pointer target missing')
  Object.defineProperties(target, {
    setPointerCapture: {
      configurable: true,
      value: (pointerId: number) => {
        state.captureSetIds.push(pointerId)
        capturedPointers.add(pointerId)
      },
    },
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => capturedPointers.has(pointerId),
    },
    releasePointerCapture: {
      configurable: true,
      value: (pointerId: number) => {
        state.captureReleaseIds.push(pointerId)
        capturedPointers.delete(pointerId)
      },
    },
  })
}

function snapshot(): HarnessSnapshot {
  return {
    ...state,
    requestedFrameIds: [...state.requestedFrameIds],
    canceledFrameIds: [...state.canceledFrameIds],
    listenerAdds: { ...state.listenerAdds },
    listenerRemoves: { ...state.listenerRemoves },
    lastRenderedDraft: state.lastRenderedDraft ? {
      frame: { ...state.lastRenderedDraft.frame },
      image: { ...state.lastRenderedDraft.image },
      framing: { ...state.lastRenderedDraft.framing },
    } : null,
    activeListeners: {
      pointermove: activeListeners.pointermove.size,
      pointerup: activeListeners.pointerup.size,
      pointercancel: activeListeners.pointercancel.size,
      blur: activeListeners.blur.size,
    },
    captureSetIds: [...state.captureSetIds],
    captureReleaseIds: [...state.captureReleaseIds],
    capturedPointerIds: [...capturedPointers],
  }
}

const FakeCropOverlay = forwardRef<ImageCropOverlayHandle>(function FakeCropOverlay(_props, ref) {
  useImperativeHandle(ref, () => ({
    renderDraft: (draft: ImageCropDraft) => {
      state.overlayWriteCount += 1
      state.lastRenderedDraft = draft
    },
    focusHandle: () => undefined,
  }), [])
  return null
})

class BeforeMutationFrameFlush extends Component<{ renderDraft: ImageCropDraft | null }> {
  getSnapshotBeforeUpdate(): null {
    if (!flushPendingFrameBeforeMutation) return null
    flushPendingFrameBeforeMutation = false
    state.beforeMutationRenderDraftMatchedLastCommit = (
      this.props.renderDraft === lastCommittedRenderDraft
    )
    state.beforeMutationFrameFlushCount += flushHeldFrames()
    return null
  }

  componentDidUpdate(): void {
    // React requires this lifecycle when getSnapshotBeforeUpdate is present.
  }

  render(): null {
    return null
  }
}

const startNode: FreeformImageElement = {
  id: 'crop-image',
  name: 'Crop image',
  locked: false,
  hidden: false,
  type: 'image',
  x: 0,
  y: 0,
  width: 200,
  height: 120,
  rotation: 0,
  scale: 1,
  src: 'img:crop-test',
  alt: '',
  fit: 'cover',
  framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
}
const startDocument: FreeformDocument = {
  documentVersion: 4,
  activeSlideId: 'slide',
  slides: [{
    id: 'slide',
    name: 'Slide',
    width: 400,
    height: 300,
    background: { type: 'solid', color: '#ffffff' },
    nodes: [startNode],
  }],
}
const startDraft = createImageCropDraft({
  startNode,
  naturalSize: { width: 400, height: 200 },
})
if (!startDraft) throw new Error('crop draft setup failed')

let finishCropSession: (() => void) | null = null

function HookHarness({ renderScale }: { renderScale: number | null }) {
  const session = useImageCropSession(renderScale)
  finishCropSession = () => {
    session.finish('done')
  }

  useLayoutEffect(() => {
    lastCommittedRenderDraft = session.renderDraft
    state.layoutCommitCount += 1
    document.documentElement.dataset.imageCropHarnessRenderScale = String(renderScale)
  })

  useEffect(() => {
    const started = session.start({
      scopeGeneration: 1,
      draftScopeKey: 'crop-session-harness',
      slideId: 'slide',
      path: [startNode.id],
      logicalSrc: startNode.src,
      resolvedSrc: startNode.src,
      naturalSize: { width: 400, height: 200 },
      startDocument,
      startNode,
      startWorldMatrix: [1, 0, 0, 1, 0, 0],
      draft: startDraft,
    })
    state.startResult = started
    state.ready = true
    document.documentElement.dataset.imageCropHarnessReady = 'true'
  }, [session.start])

  return (
    <>
      <BeforeMutationFrameFlush renderDraft={session.renderDraft} />
      <FakeCropOverlay ref={session.overlayRef} />
      <img
        data-testid="crop-pointer-target"
        alt=""
        onPointerDown={session.panPointerDown}
      />
    </>
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('harness root missing')
const root = createRoot(container)
const initialRenderScale = new URLSearchParams(window.location.search).get('initialRenderScale')
let currentRenderScale: number | null = initialRenderScale === 'null'
  ? null
  : initialRenderScale === 'zero'
    ? 0
    : initialRenderScale === 'nan'
      ? Number.NaN
      : 1
const renderHarness = () => root.render(<HookHarness renderScale={currentRenderScale} />)
renderHarness()

window.__imageCropSessionHarness = {
  arm: armHarness,
  finish: () => finishCropSession?.(),
  setRenderScale: (renderScale) => {
    currentRenderScale = renderScale
    renderHarness()
  },
  rerenderAndFlushPendingFrameBeforeMutation: () => {
    if (heldFrames.size === 0) throw new Error('pending crop frame missing')
    flushPendingFrameBeforeMutation = true
    renderHarness()
  },
  unmount: () => {
    root.unmount()
    state.unmounted = true
  },
  fireCanceledFrames: () => {
    window.requestAnimationFrame = nativeRequestAnimationFrame
    window.cancelAnimationFrame = nativeCancelAnimationFrame
    flushHeldFrames()
  },
  dispatchLateEvents: () => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: 80,
      clientY: 20,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 80,
      clientY: 20,
    }))
    window.dispatchEvent(new PointerEvent('pointercancel', {
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
    }))
    window.dispatchEvent(new Event('blur'))
  },
  snapshot,
}
