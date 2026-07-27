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

export type FramedImageWaitResult =
  | { ok: true }
  | { ok: false; reason: 'image-load' | 'timeout' }

export interface ImageWaitClock {
  now: () => number
  wait: (milliseconds: number) => Promise<void>
}

export interface WaitForFramedImagesOptions {
  timeoutMs: number
  clock?: ImageWaitClock
}

const DEFAULT_IMAGE_WAIT_CLOCK: ImageWaitClock = {
  now: () => globalThis.performance?.now?.() ?? Date.now(),
  wait: (milliseconds) => new Promise((resolve) => {
    globalThis.setTimeout(resolve, milliseconds)
  }),
}

const FRAMED_IMAGE_SELECTOR = 'img[data-framed-image-content="true"]'

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

function currentImageSource(image: HTMLImageElement): string {
  return image.getAttribute('src') ?? ''
}

function currentImageIsDecoded(image: HTMLImageElement): boolean {
  return image.complete
    && positiveFinite(image.naturalWidth)
    && positiveFinite(image.naturalHeight)
}

function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === 'function') return image.decode()
  if (currentImageIsDecoded(image)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
    }
    const onLoad = () => {
      cleanup()
      if (currentImageIsDecoded(image)) resolve()
      else reject(new Error('Image loaded without positive natural dimensions'))
    }
    const onError = () => {
      cleanup()
      reject(new Error('Image failed to load'))
    }
    image.addEventListener('load', onLoad, { once: true })
    image.addEventListener('error', onError, { once: true })
  })
}

type DecodeAttempt = 'decoded' | 'decode-error' | 'timeout'

async function decodeCurrentSource(
  image: HTMLImageElement,
  deadline: number,
  clock: ImageWaitClock,
): Promise<FramedImageWaitResult> {
  while (true) {
    const source = currentImageSource(image)
    if (!source) return { ok: false, reason: 'image-load' }
    const remaining = deadline - clock.now()
    if (!Number.isFinite(remaining) || remaining <= 0) {
      return { ok: false, reason: 'timeout' }
    }

    const attempt = await Promise.race<DecodeAttempt>([
      decodeImage(image).then<DecodeAttempt, DecodeAttempt>(
        () => 'decoded',
        () => 'decode-error',
      ),
      clock.wait(remaining).then<DecodeAttempt>(() => 'timeout'),
    ])
    if (attempt === 'timeout') return { ok: false, reason: 'timeout' }
    if (currentImageSource(image) !== source) continue
    if (attempt === 'decode-error' || !currentImageIsDecoded(image)) {
      return { ok: false, reason: 'image-load' }
    }
    return { ok: true }
  }
}

function framedImagesIn(root: ParentNode): HTMLImageElement[] {
  return Array.from(root.querySelectorAll<HTMLImageElement>(FRAMED_IMAGE_SELECTOR))
}

function sameCurrentImages(
  previous: readonly HTMLImageElement[],
  current: readonly HTMLImageElement[],
  sources: readonly string[],
): boolean {
  return previous.length === current.length
    && previous.every((image, index) => (
      current[index] === image && currentImageSource(image) === sources[index]
    ))
}

export async function waitForFramedImages(
  root: ParentNode,
  options: WaitForFramedImagesOptions,
): Promise<FramedImageWaitResult> {
  const clock = options.clock ?? DEFAULT_IMAGE_WAIT_CLOCK
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(0, options.timeoutMs)
    : 0
  const deadline = clock.now() + timeoutMs

  while (true) {
    const images = framedImagesIn(root)
    if (images.length === 0) return { ok: true }
    const decodedSources: string[] = []
    for (const image of images) {
      const result = await decodeCurrentSource(image, deadline, clock)
      if (!result.ok) return result
      decodedSources.push(currentImageSource(image))
    }
    const current = framedImagesIn(root)
    if (sameCurrentImages(images, current, decodedSources)) return { ok: true }
    if (clock.now() >= deadline) return { ok: false, reason: 'timeout' }
  }
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
