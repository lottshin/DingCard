import { store } from '../storage'
import { FramedImage } from './FramedImage'
import type { ImageDecodeReport } from './imageReadiness'
import type { FreeformSlide } from './types'

/**
 * The scene path key a page's picture reports its decode under: no node
 * owns it, so it takes the page root's (empty) path, `scenePathKey([])`.
 */
export const PAGE_BACKGROUND_PATH_KEY = '[]'

/**
 * A picture page background (v16), framed like an image node and drawn
 * under everything on the page, inside the artwork so blend modes see it.
 * Colour backgrounds render nothing here: the artboard's CSS paints them.
 */
export function FreeformPageBackground({
  slide,
  presentationOnly = false,
  scopeGeneration,
  onDecodeReport,
}: {
  slide: FreeformSlide
  presentationOnly?: boolean
  scopeGeneration?: number
  onDecodeReport?: (report: ImageDecodeReport) => void
}) {
  const background = slide.background
  if (background.type !== 'image') return null
  const resolvedSrc = store.images.resolve(background.src)
  const reports = !presentationOnly && scopeGeneration !== undefined && onDecodeReport !== undefined
  return (
    <div
      className="freeform-page-background"
      data-testid={presentationOnly ? undefined : 'freeform-page-background'}
      aria-hidden="true"
    >
      <FramedImage
        logicalSrc={background.src}
        resolvedSrc={resolvedSrc}
        fit={background.fit}
        framing={background.framing}
        frameWidth={slide.width}
        frameHeight={slide.height}
        className="freeform-page-background-image"
        alt=""
        decodeIdentity={reports
          ? {
              scopeGeneration,
              slideId: slide.id,
              scenePathKey: PAGE_BACKGROUND_PATH_KEY,
              logicalSrc: background.src,
              resolvedSrc,
            }
          : undefined}
        onDecodeReport={reports ? onDecodeReport : undefined}
      />
    </div>
  )
}
