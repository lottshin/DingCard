import { memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { FreeformPageBackground } from './FreeformPageBackground'
import { FreeformSceneNodeView } from './FreeformSceneNodeView'
import { slideBackgroundToCss } from './paint'
import type { FreeformSlide } from './types'

interface FreeformSlidePreviewProps {
  slide: FreeformSlide
  frameWidth: number
  frameHeight: number
  className?: string
  artboardClassName?: string
  deferOffscreen?: boolean
}

const noop = () => undefined

function positiveDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1
}

function classes(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/** Render a non-interactive slide, scaled to fit inside a stable frame. */
export const FreeformSlidePreview = memo(function FreeformSlidePreview({
  slide,
  frameWidth,
  frameHeight,
  className,
  artboardClassName,
  deferOffscreen = false,
}: FreeformSlidePreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [renderScene, setRenderScene] = useState(!deferOffscreen)
  const safeFrameWidth = positiveDimension(frameWidth)
  const safeFrameHeight = positiveDimension(frameHeight)
  const safeSlideWidth = positiveDimension(slide.width)
  const safeSlideHeight = positiveDimension(slide.height)
  const scale = Math.min(safeFrameWidth / safeSlideWidth, safeFrameHeight / safeSlideHeight)
  const renderedWidth = safeSlideWidth * scale
  const renderedHeight = safeSlideHeight * scale
  const artboardStyle: CSSProperties = {
    left: (safeFrameWidth - renderedWidth) / 2,
    top: (safeFrameHeight - renderedHeight) / 2,
    width: safeSlideWidth,
    height: safeSlideHeight,
    background: slideBackgroundToCss(slide.background),
    transform: `scale(${scale})`,
  }

  useEffect(() => {
    if (!deferOffscreen) {
      setRenderScene(true)
      return
    }

    const frame = frameRef.current
    if (!frame || typeof IntersectionObserver === 'undefined') {
      setRenderScene(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      setRenderScene(entry.isIntersecting)
    }, {
      root: frame.closest('.freeform-slide-list'),
      // The page list scrolls down the side, or sideways on phones.
      rootMargin: '192px',
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [deferOffscreen])

  return (
    <div
      ref={frameRef}
      className={classes('freeform-slide-preview', className)}
      style={{ width: safeFrameWidth, height: safeFrameHeight }}
      aria-hidden="true"
    >
      <div
        className={classes('freeform-slide-preview-artboard', artboardClassName)}
        style={artboardStyle}
      >
        {renderScene && <FreeformPageBackground slide={slide} presentationOnly />}
        {renderScene && (
          <FreeformSceneNodeView
            nodes={slide.nodes}
            slideId={slide.id}
            presentationOnly
            activeParentPath={['__preview__']}
            selectedPaths={[]}
            onNodePointerDown={noop}
            onNodeDoubleClick={noop}
            onTextChange={noop}
            onTextFocus={noop}
          />
        )}
      </div>
    </div>
  )
})
