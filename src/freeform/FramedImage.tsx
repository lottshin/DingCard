import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, SyntheticEvent } from 'react'
import {
  calculateFramedImageGeometry,
  imageFramingEquals,
  type ImageFrameSize,
} from './imageFraming'
import type { ImageDecodeIdentity, ImageDecodeReport } from './imageReadiness'
import type { ImageFraming } from './types'

type ImageLoadState = 'loading' | 'ready' | 'error'

interface LocalDecodeState {
  resolvedSrc: string
  status: ImageLoadState
  naturalSize: ImageFrameSize | null
}

export interface FramedImageProps {
  logicalSrc: string
  resolvedSrc: string
  alt: string
  fit: 'cover' | 'contain'
  framing: ImageFraming
  frameWidth: number
  frameHeight: number
  className?: string
  decodeIdentity?: ImageDecodeIdentity
  onDecodeReport?: (report: ImageDecodeReport) => void
}

interface ReportingConfig {
  identity: ImageDecodeIdentity
  callback: (report: ImageDecodeReport) => void
  key: string
}

const DEFAULT_FRAMING: ImageFraming = { focusX: 0.5, focusY: 0.5, zoom: 1 }

function reportingKey(identity: ImageDecodeIdentity): string {
  return JSON.stringify([
    identity.scopeGeneration,
    identity.slideId,
    identity.scenePathKey,
    identity.logicalSrc,
    identity.resolvedSrc,
  ])
}

function currentReportingConfig(
  logicalSrc: string,
  resolvedSrc: string,
  identity: ImageDecodeIdentity | undefined,
  callback: ((report: ImageDecodeReport) => void) | undefined,
): ReportingConfig | null {
  if (
    !identity
    || !callback
    || identity.logicalSrc !== logicalSrc
    || identity.resolvedSrc !== resolvedSrc
  ) return null
  return { identity, callback, key: reportingKey(identity) }
}

function positiveNaturalSize(image: HTMLImageElement): ImageFrameSize | null {
  return Number.isFinite(image.naturalWidth)
    && image.naturalWidth > 0
    && Number.isFinite(image.naturalHeight)
    && image.naturalHeight > 0
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : null
}

export function FramedImage({
  logicalSrc,
  resolvedSrc,
  alt,
  fit,
  framing,
  frameWidth,
  frameHeight,
  className,
  decodeIdentity,
  onDecodeReport,
}: FramedImageProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const sourceRef = useRef({ resolvedSrc, generation: 0 })
  if (sourceRef.current.resolvedSrc !== resolvedSrc) {
    sourceRef.current = {
      resolvedSrc,
      generation: sourceRef.current.generation + 1,
    }
  }
  const [decodeState, setDecodeState] = useState<LocalDecodeState>({
    resolvedSrc,
    status: resolvedSrc ? 'loading' : 'error',
    naturalSize: null,
  })
  const loadingReportKeyRef = useRef<string | null>(null)

  const currentState: LocalDecodeState = decodeState.resolvedSrc === resolvedSrc
    ? decodeState
    : {
        resolvedSrc,
        status: resolvedSrc ? 'loading' : 'error',
        naturalSize: null,
      }
  const reporting = currentReportingConfig(
    logicalSrc,
    resolvedSrc,
    decodeIdentity,
    onDecodeReport,
  )

  function reportLoading(config: ReportingConfig | null): void {
    if (!config || loadingReportKeyRef.current === config.key) return
    loadingReportKeyRef.current = config.key
    config.callback({ identity: config.identity, status: 'loading' })
  }

  function sourceStillCurrent(
    image: HTMLImageElement,
    generation: number,
    source: string,
  ): boolean {
    return sourceRef.current.generation === generation
      && sourceRef.current.resolvedSrc === source
      && image.getAttribute('src') === source
  }

  function markError(
    image: HTMLImageElement | null,
    generation = sourceRef.current.generation,
    source = resolvedSrc,
    config = reporting,
  ): void {
    if (image && !sourceStillCurrent(image, generation, source)) return
    if (sourceRef.current.generation !== generation || sourceRef.current.resolvedSrc !== source) return
    reportLoading(config)
    setDecodeState((previous) => (
      previous.resolvedSrc === source && previous.status === 'ready'
        ? previous
        : { resolvedSrc: source, status: 'error', naturalSize: null }
    ))
    config?.callback({ identity: config.identity, status: 'error' })
  }

  async function decodeCurrentImage(image: HTMLImageElement): Promise<void> {
    const generation = sourceRef.current.generation
    const source = resolvedSrc
    const config = reporting
    if (!sourceStillCurrent(image, generation, source)) return
    reportLoading(config)

    try {
      if (typeof image.decode === 'function') await image.decode()
    } catch {
      markError(image, generation, source, config)
      return
    }

    if (!sourceStillCurrent(image, generation, source)) return
    const naturalSize = positiveNaturalSize(image)
    if (!naturalSize) {
      markError(image, generation, source, config)
      return
    }
    setDecodeState({ resolvedSrc: source, status: 'ready', naturalSize })
    config?.callback({
      identity: config.identity,
      status: 'ready',
      naturalWidth: naturalSize.width,
      naturalHeight: naturalSize.height,
    })
  }

  useEffect(() => {
    const generation = sourceRef.current.generation
    const image = imageRef.current
    setDecodeState((previous) => (
      previous.resolvedSrc === resolvedSrc
        ? previous
        : {
            resolvedSrc,
            status: resolvedSrc ? 'loading' : 'error',
            naturalSize: null,
          }
    ))
    reportLoading(reporting)
    if (!resolvedSrc) {
      markError(null, generation, resolvedSrc, reporting)
    } else if (image?.complete) {
      void decodeCurrentImage(image)
    }
  }, [
    resolvedSrc,
    logicalSrc,
    decodeIdentity?.scopeGeneration,
    decodeIdentity?.slideId,
    decodeIdentity?.scenePathKey,
    decodeIdentity?.logicalSrc,
    decodeIdentity?.resolvedSrc,
    onDecodeReport,
  ])

  useEffect(() => () => {
    sourceRef.current = {
      resolvedSrc: sourceRef.current.resolvedSrc,
      generation: sourceRef.current.generation + 1,
    }
  }, [])

  const geometry = currentState.status === 'ready' && currentState.naturalSize
    ? calculateFramedImageGeometry({
        naturalSize: currentState.naturalSize,
        frameSize: { width: frameWidth, height: frameHeight },
        fit,
        framing,
      })
    : null
  const canUseCenteredFallback = fit === 'contain'
    || imageFramingEquals(framing, DEFAULT_FRAMING)
  const showImage = currentState.status !== 'error'
    && (geometry !== null || canUseCenteredFallback)
  const imageStyle: CSSProperties = geometry
    ? {
        left: geometry.left,
        top: geometry.top,
        width: geometry.width,
        height: geometry.height,
        objectFit: fit,
        objectPosition: 'center',
        visibility: showImage ? 'visible' : 'hidden',
      }
    : {
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        objectFit: fit,
        objectPosition: 'center',
        visibility: showImage ? 'visible' : 'hidden',
      }

  function handleLoad(event: SyntheticEvent<HTMLImageElement>): void {
    void decodeCurrentImage(event.currentTarget)
  }

  return (
    <div
      className="freeform-framed-image"
      data-framed-image="true"
      data-image-load-state={currentState.status}
    >
      {resolvedSrc && (
        <img
          key={resolvedSrc}
          ref={imageRef}
          className={className}
          data-framed-image-content="true"
          src={resolvedSrc}
          alt={alt}
          draggable={false}
          onLoad={handleLoad}
          onError={(event) => markError(event.currentTarget)}
          style={imageStyle}
        />
      )}
    </div>
  )
}
