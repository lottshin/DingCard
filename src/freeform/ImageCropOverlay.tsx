import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
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

export interface ImageCropOverlayHandle {
  renderDraft: (draft: ImageCropDraft) => void
  focusHandle: (handle: ImageCropHandle) => void
}

export interface ImageCropOverlayStyle {
  overlayStyle: CSSProperties
  frameStyle: CSSProperties
  imageStyle: CSSProperties
  brightImageStyle: CSSProperties
  data: {
    frame: ImageCropBounds
    image: ImageCropBounds
  }
}

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
  onHandleKeyDown?: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    handle: ImageCropHandle,
  ) => void
  onImagePointerDown?: (event: ReactPointerEvent<HTMLImageElement>) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void
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

function draftKey(draft: ImageCropDraft): string {
  return [
    draft.frame.left,
    draft.frame.top,
    draft.frame.right,
    draft.frame.bottom,
    draft.image.left,
    draft.image.top,
    draft.image.right,
    draft.image.bottom,
  ].join('|')
}

function setBoundsData(element: HTMLElement, prefix: 'frame' | 'image', bounds: ImageCropBounds) {
  element.dataset[`crop${prefix[0].toUpperCase()}${prefix.slice(1)}Left`] = String(bounds.left)
  element.dataset[`crop${prefix[0].toUpperCase()}${prefix.slice(1)}Top`] = String(bounds.top)
  element.dataset[`crop${prefix[0].toUpperCase()}${prefix.slice(1)}Right`] = String(bounds.right)
  element.dataset[`crop${prefix[0].toUpperCase()}${prefix.slice(1)}Bottom`] = String(bounds.bottom)
}

export function imageCropDraftToOverlayStyle(
  draft: ImageCropDraft,
  worldMatrix: Matrix2D,
  screenScale: number,
): ImageCropOverlayStyle | null {
  if (
    !validDraft(draft)
    || !validWorldMatrix(worldMatrix)
    || !Number.isFinite(screenScale)
    || screenScale <= 0
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
  return {
    overlayStyle,
    frameStyle,
    imageStyle,
    brightImageStyle,
    data: { frame: draft.frame, image: draft.image },
  }
}

function applyStyle(element: HTMLElement, style: CSSProperties) {
  Object.entries(style).forEach(([property, value]) => {
    if (value === undefined) return
    if (property.startsWith('--')) element.style.setProperty(property, String(value))
    else element.style.setProperty(property, typeof value === 'number' ? `${value}px` : String(value))
  })
}

export const ImageCropOverlay = forwardRef<ImageCropOverlayHandle, ImageCropOverlayProps>(
  function ImageCropOverlay({
    draft,
    worldMatrix,
    screenScale,
    resolvedSrc,
    alt,
    activeHandle = null,
    onHandlePointerDown,
    onHandleKeyDown,
    onImagePointerDown,
    onKeyDown,
  }, ref) {
    const rootRef = useRef<HTMLDivElement>(null)
    const dimRef = useRef<HTMLImageElement>(null)
    const windowRef = useRef<HTMLDivElement>(null)
    const brightRef = useRef<HTMLImageElement>(null)
    const frameRef = useRef<HTMLDivElement>(null)
    const lastDraftKeyRef = useRef<string | null>(null)
    const style = imageCropDraftToOverlayStyle(draft, worldMatrix, screenScale)

    const renderDraft = (nextDraft: ImageCropDraft) => {
      const nextStyle = imageCropDraftToOverlayStyle(nextDraft, worldMatrix, screenScale)
      const root = rootRef.current
      const dim = dimRef.current
      const windowElement = windowRef.current
      const bright = brightRef.current
      const frame = frameRef.current
      if (!nextStyle || !root || !dim || !windowElement || !bright || !frame) return

      applyStyle(root, nextStyle.overlayStyle)
      applyStyle(dim, nextStyle.imageStyle)
      applyStyle(windowElement, nextStyle.frameStyle)
      applyStyle(bright, nextStyle.brightImageStyle)
      applyStyle(frame, nextStyle.frameStyle)
      setBoundsData(root, 'frame', nextStyle.data.frame)
      setBoundsData(root, 'image', nextStyle.data.image)
      const key = draftKey(nextDraft)
      if (key !== lastDraftKeyRef.current) {
        lastDraftKeyRef.current = key
        root.dataset.cropDraftKey = key
      }
    }

    useImperativeHandle(ref, () => ({
      renderDraft,
      focusHandle: (handle) => {
        rootRef.current?.querySelector<HTMLButtonElement>(`[data-crop-handle="${handle}"]`)?.focus()
      },
    }), [worldMatrix, screenScale])

    useLayoutEffect(() => {
      renderDraft(draft)
    })

    if (!style || typeof resolvedSrc !== 'string' || resolvedSrc.length === 0) return null

    return (
      <div
        ref={rootRef}
        className="freeform-ui-only freeform-image-crop-overlay"
        data-testid="freeform-image-crop-overlay"
        data-crop-draft-key={draftKey(draft)}
        role="application"
        aria-label="图片裁剪"
        tabIndex={-1}
        style={style.overlayStyle}
        onKeyDown={onKeyDown}
      >
        <img
          ref={dimRef}
          className="freeform-image-crop-dim"
          src={resolvedSrc}
          alt={alt}
          draggable={false}
          style={style.imageStyle}
          onPointerDown={onImagePointerDown}
        />
        <div ref={windowRef} className="freeform-image-crop-window" style={style.frameStyle} aria-hidden="true">
          <img
            ref={brightRef}
            className="freeform-image-crop-bright"
            src={resolvedSrc}
            alt=""
            draggable={false}
            style={style.brightImageStyle}
          />
        </div>
        <div ref={frameRef} className="freeform-image-crop-frame" style={style.frameStyle}>
          {HANDLE_LABELS.map(([handle, label]) => (
            <button
              key={handle}
              type="button"
              tabIndex={0}
              data-crop-handle={handle}
              data-active={activeHandle === handle ? 'true' : undefined}
              aria-label={label}
              onPointerDown={(event) => onHandlePointerDown?.(event, handle)}
              onKeyDown={(event) => onHandleKeyDown?.(event, handle)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    )
  },
)

ImageCropOverlay.displayName = 'ImageCropOverlay'
