import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { isValidImageFraming } from './imageFraming'
import type { ImageCropBounds, ImageCropDraft, ImageCropHandle } from './imageCrop'
import { SCENE_EPSILON, type Matrix2D } from './sceneTransform'

const HANDLE_LABELS: ReadonlyArray<readonly [ImageCropHandle, string]> = [
  ['n', '裁剪上边'],
  ['ne', '裁剪右上角'],
  ['e', '裁剪右边'],
  ['se', '裁剪右下角'],
  ['s', '裁剪下边'],
  ['sw', '裁剪左下角'],
  ['w', '裁剪左边'],
  ['nw', '裁剪左上角'],
]

export interface ImageCropOverlayProps {
  draft: ImageCropDraft
  worldMatrix: Matrix2D
  screenScale: number
  resolvedSrc: string
  alt: string
  activeHandle?: ImageCropHandle | null
  onHandlePointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
    handle: ImageCropHandle,
  ) => void
  onImagePointerDown?: (event: ReactPointerEvent<HTMLImageElement>) => void
}

function finiteBounds(bounds: ImageCropBounds): boolean {
  return Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.right)
    && Number.isFinite(bounds.bottom)
    && bounds.right > bounds.left
    && bounds.bottom > bounds.top
}

function validDraft(draft: ImageCropDraft): boolean {
  return Boolean(draft)
    && finiteBounds(draft.frame)
    && finiteBounds(draft.image)
    && draft.image.left <= draft.frame.left + SCENE_EPSILON
    && draft.image.top <= draft.frame.top + SCENE_EPSILON
    && draft.image.right + SCENE_EPSILON >= draft.frame.right
    && draft.image.bottom + SCENE_EPSILON >= draft.frame.bottom
    && isValidImageFraming(draft.framing)
}

function validWorldMatrix(matrix: Matrix2D): boolean {
  return Array.isArray(matrix)
    && matrix.length === 6
    && matrix.every((value) => Number.isFinite(value))
}

function boundsStyle(bounds: ImageCropBounds): CSSProperties {
  return {
    left: bounds.left,
    top: bounds.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  }
}

export function ImageCropOverlay({
  draft,
  worldMatrix,
  screenScale,
  resolvedSrc,
  alt,
  activeHandle = null,
  onHandlePointerDown,
  onImagePointerDown,
}: ImageCropOverlayProps) {
  if (
    !validDraft(draft)
    || !validWorldMatrix(worldMatrix)
    || !Number.isFinite(screenScale)
    || screenScale <= 0
    || typeof resolvedSrc !== 'string'
    || resolvedSrc.length === 0
  ) return null

  const frameStyle = boundsStyle(draft.frame)
  const imageStyle = boundsStyle(draft.image)
  const brightImageStyle: CSSProperties = {
    left: draft.image.left - draft.frame.left,
    top: draft.image.top - draft.frame.top,
    width: draft.image.right - draft.image.left,
    height: draft.image.bottom - draft.image.top,
  }
  const overlayStyle = {
    transform: `matrix(${worldMatrix.join(',')})`,
    width: Math.max(1, draft.frame.right, draft.image.right),
    height: Math.max(1, draft.frame.bottom, draft.image.bottom),
    '--crop-hit-size': `${24 / screenScale}px`,
    '--crop-handle-long': `${12 / screenScale}px`,
    '--crop-handle-thick': `${4 / screenScale}px`,
    '--crop-handle-corner': `${8 / screenScale}px`,
    '--crop-halo': `${1 / screenScale}px`,
    '--crop-frame-line': `${1 / screenScale}px`,
    '--crop-focus-line': `${2 / screenScale}px`,
  } as CSSProperties

  return (
    <div
      className="freeform-ui-only freeform-image-crop-overlay"
      data-testid="freeform-image-crop-overlay"
      style={overlayStyle}
    >
      <img
        className="freeform-image-crop-dim"
        src={resolvedSrc}
        alt={alt}
        draggable={false}
        style={imageStyle}
        onPointerDown={onImagePointerDown}
      />
      <div className="freeform-image-crop-window" style={frameStyle} aria-hidden="true">
        <img
          className="freeform-image-crop-bright"
          src={resolvedSrc}
          alt=""
          draggable={false}
          style={brightImageStyle}
        />
      </div>
      <div className="freeform-image-crop-frame" style={frameStyle}>
        {HANDLE_LABELS.map(([handle, label]) => (
          <button
            key={handle}
            type="button"
            data-crop-handle={handle}
            data-active={activeHandle === handle ? 'true' : undefined}
            aria-label={label}
            onPointerDown={(event) => onHandlePointerDown?.(event, handle)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  )
}
