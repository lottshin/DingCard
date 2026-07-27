import type { ImageFrameSize } from './imageFraming'

export interface ImageDecodeIdentity {
  scopeGeneration: number
  slideId: string
  scenePathKey: string
  logicalSrc: string
  resolvedSrc: string
}

export type ImageDecodeReport =
  | { identity: ImageDecodeIdentity; status: 'loading' | 'error' }
  | {
      identity: ImageDecodeIdentity
      status: 'ready'
      naturalWidth: number
      naturalHeight: number
    }

export type ImageReadinessState = ReadonlyMap<string, ImageDecodeReport>

function imageDecodeSlotKey(identity: ImageDecodeIdentity): string {
  return JSON.stringify([
    identity.scopeGeneration,
    identity.slideId,
    identity.scenePathKey,
  ])
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function validReadyReport(
  report: ImageDecodeReport,
): report is Extract<ImageDecodeReport, { status: 'ready' }> {
  return report.status === 'ready'
    && positiveFinite(report.naturalWidth)
    && positiveFinite(report.naturalHeight)
}

function cloneIdentity(identity: ImageDecodeIdentity): ImageDecodeIdentity {
  return {
    scopeGeneration: identity.scopeGeneration,
    slideId: identity.slideId,
    scenePathKey: identity.scenePathKey,
    logicalSrc: identity.logicalSrc,
    resolvedSrc: identity.resolvedSrc,
  }
}

function cloneReport(report: ImageDecodeReport): ImageDecodeReport {
  const identity = cloneIdentity(report.identity)
  return report.status === 'ready'
    ? {
        identity,
        status: 'ready',
        naturalWidth: report.naturalWidth,
        naturalHeight: report.naturalHeight,
      }
    : { identity, status: report.status }
}

function reportEquals(left: ImageDecodeReport, right: ImageDecodeReport): boolean {
  if (
    left.status !== right.status
    || !imageDecodeIdentityEquals(left.identity, right.identity)
  ) return false
  if (left.status !== 'ready' || right.status !== 'ready') return true
  return left.naturalWidth === right.naturalWidth
    && left.naturalHeight === right.naturalHeight
}

export function createImageReadinessState(): ImageReadinessState {
  return new Map()
}

export function imageDecodeIdentityEquals(
  left: ImageDecodeIdentity,
  right: ImageDecodeIdentity,
): boolean {
  return left.scopeGeneration === right.scopeGeneration
    && left.slideId === right.slideId
    && left.scenePathKey === right.scenePathKey
    && left.logicalSrc === right.logicalSrc
    && left.resolvedSrc === right.resolvedSrc
}

export function updateImageReadiness(
  state: ImageReadinessState,
  report: ImageDecodeReport,
  expectedIdentity: ImageDecodeIdentity,
): ImageReadinessState {
  if (!imageDecodeIdentityEquals(report.identity, expectedIdentity)) return state
  if (report.status === 'ready' && !validReadyReport(report)) return state

  const key = imageDecodeSlotKey(expectedIdentity)
  const previous = state.get(key)
  if (
    report.status === 'error'
    && previous?.status === 'ready'
    && imageDecodeIdentityEquals(previous.identity, report.identity)
  ) return state
  if (previous && reportEquals(previous, report)) return state

  const next = new Map(state)
  next.set(key, cloneReport(report))
  return next
}

export function readReadyImage(
  state: ImageReadinessState,
  expectedIdentity: ImageDecodeIdentity,
): ImageFrameSize | null {
  const current = state.get(imageDecodeSlotKey(expectedIdentity))
  if (
    !current
    || !imageDecodeIdentityEquals(current.identity, expectedIdentity)
    || !validReadyReport(current)
  ) return null
  return { width: current.naturalWidth, height: current.naturalHeight }
}

export function clearImageReadinessForSlide(
  state: ImageReadinessState,
  scopeGeneration: number,
  slideId: string,
): ImageReadinessState {
  let next: Map<string, ImageDecodeReport> | null = null
  for (const [key, entry] of state) {
    if (
      entry.identity.scopeGeneration === scopeGeneration
      && entry.identity.slideId === slideId
    ) {
      next ??= new Map(state)
      next.delete(key)
    }
  }
  return next ?? state
}

export function clearAllImageReadiness(
  state: ImageReadinessState,
): ImageReadinessState {
  return state.size === 0 ? state : createImageReadinessState()
}
