import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, SetStateAction } from 'react'
import { toBlob } from 'html-to-image'
import { DraftsPanel } from '../DraftsPanel'
import { Select } from '../Select'
import { type Draft, importDraftFromJson } from '../drafts'
import { downloadZip } from '../exportZip'
import { buildFontEmbedCSS } from '../fontEmbed'
import { downscaleDataUrl } from '../imageStore'
import { readLastSession, updateLastSession } from '../lastSession'
import { store } from '../storage'
import { FONTS } from '../theme'
import { OperationNotice } from '../workspaces/OperationNotice'
import { ToolbarDivider, ToolbarGroup, WorkspaceToolbar } from '../workspaces/WorkspaceToolbar'
import type { WorkspaceShellProps } from '../workspaces/types'
import { useImageLease } from '../workspaces/useImageLease'
import { TemplateGallery } from '../templates/TemplateGallery'
import { SaveTemplateDialog } from '../templates/SaveTemplateDialog'
import type { TemplateDefinition } from '../templates/types'
import {
  deleteUserTemplate,
  listUserTemplates,
  saveUserTemplate,
  userTemplateToDefinition,
  type UserTemplate,
} from '../templates/userTemplates'
import { MAX_EFFECTIVE_SCALE, MAX_FREEFORM_SLIDES, MIN_EFFECTIVE_SCALE } from './constants'
import { collectTextAutoSize } from './textAutoSize'
import {
  createFreeformDocument,
  createImageElement,
  createLineElement,
  createShapeElement,
  createTextElement,
  freeformReducer,
} from './document'
import { materializeLocalFreeformImages } from './imageAssets'
import { insertRichTextSpan } from './richText'
import { BLEND_MODES } from './appearance'
import { FreeformInsertMenu } from './FreeformInsertMenu'
import { InspectorNumberInput } from './InspectorNumberInput'
import { FreeformLayersPanel } from './FreeformLayersPanel'
import { FreeformPageSizePopover } from './FreeformPageSizePopover'
import { FreeformRightPanel } from './FreeformRightPanel'
import {
  FreeformSceneNodeView,
  type SceneNodePointerState,
} from './FreeformSceneNodeView'
import { ImageCropOverlay } from './ImageCropOverlay'
import {
  useImageCropSession,
  type ImageCropFinishReason,
  type ImageCropSession,
} from './useImageCropSession'
import { FreeformSlidePreview } from './FreeformSlidePreview'
import {
  FreeformSelectionOverlay,
  type SelectionOverlayTarget,
  type SelectionOverlayInteraction,
} from './FreeformSelectionOverlay'
import { InspectorSection } from './InspectorSection'
import {
  createHistory,
  isLatestSaveForDraft,
  jumpHistory,
  pushHistory,
  redo,
  undo,
  type HistoryState,
} from './history'
import { describeFreeformAction } from './actionLabels'
import {
  buildFreeformFontCSS,
  collectFreeformFontRequests,
} from './fontRequests'
import { collectFreeformImageSources } from './imageAssets'
import {
  MAX_IMAGE_ZOOM,
  MIN_IMAGE_ZOOM,
  createDefaultImageFraming,
  imageFramingEquals,
  panImageFraming,
  panImageFramingFromScreen,
  type ImageFrameSize,
} from './imageFraming'
import {
  clearAllImageReadiness,
  clearImageReadinessForSlide,
  createImageReadinessState,
  imageCropReadinessInvalidation,
  readReadyImage,
  readImageReadinessReport,
  updateImageReadiness,
  imageDecodeIdentityEquals,
  waitForFramedImages,
  type ImageDecodeIdentity,
  type ImageDecodeReport,
  type ImageReadinessState,
} from './imageReadiness'
import {
  createImageCropDraft,
  imageCropDraftToUpdate,
  imageCropScreenScale,
  type ImageCropNodeUpdate,
} from './imageCrop'
import { ColorPickerButton, PaintField } from './PaintField'
import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
  isHexColor,
  slideBackgroundToCss,
} from './paint'
import {
  directChildPathForScope,
  effectiveSceneState,
  lockedDescendantSourcePathForSelection,
  nearestLockedSourcePathForSelection,
  normalizeSceneSelection,
  reconcileSceneUiState,
  type SceneUiIdentity,
  type SceneUiState,
} from './sceneSelection'
import {
  cloneSceneNodes,
  createSceneGroup,
  findNodeAtPath,
  getChildrenAtPath,
  scenePathKey,
  transformSceneNodesByWorldMatrix,
  ungroupSceneGroups,
  type SceneMutationError,
} from './sceneTree'
import {
  scenePropertiesForPath,
  scenePropertyMutation,
  type ScenePropertyEdit,
  type SceneProperties,
} from './sceneProperties'
import {
  clockwiseRotation,
  decomposeSimilarity,
  invert,
  multiply,
  sceneNodeBoundsInWorld,
  sceneNodeLocalMatrix,
  sceneNodesBoundsInParent,
  sceneNodeWithLocalMatrix,
  sceneParentWorldMatrix,
  sceneWorldMatrixAtPath,
  transformVector,
  translation,
  uniformScale,
  type Matrix2D,
} from './sceneTransform'
import {
  getSceneNodesInMarquee,
  moveSceneNodesWithinSlide,
  type Rect,
} from './selection'
import { snapRotationDegrees, snapSceneDrag, type SnapLine } from './snapping'
import {
  measureDragDistances,
  type DragMeasurement,
  type MeasurementReference,
} from './measurements'
import { MAX_GUIDES_PER_SLIDE } from './guides'
import { pickRulerStep, rulerTicks } from './rulers'
import {
  DEFAULT_VIEW_PREFS,
  loadViewPrefs,
  saveViewPrefs,
  type FreeformViewPrefs,
} from './viewPrefs'
import type {
  FreeformAction,
  ColorPaint,
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  ImageFraming,
  FreeformLineElement,
  FreeformSceneNode,
  FreeformNodeContentPatch,
  FreeformNodeGeometryPatch,
  FreeformNodeStylePatch,
  FreeformShapeElement,
  FreeformSlide,
  BlendMode,
  FreeformTextElement,
  LineEndpointCap,
  SceneFilter,
  ScenePath,
  ShadowPaint,
  ShapeFill,
  SlideBackground,
} from './types'
import {
  DEFAULT_ZOOM_PERCENT,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  ZOOM_STEP,
  calculateFitScale,
  calculateRenderScale,
  clampZoomPercent,
  zoomPercentForBounds,
  zoomPercentFromWheelDelta,
} from './viewportScale'
import { copyStylePatch, pasteStylePatch } from './styleClipboard'

const FIT_SCALE_EPSILON = 0.0001
const EXPORT_IMAGE_WAIT_MS = 3_500

/** Preset highlight colors for rich text spans (solid hex, 6 digits). */
const RICH_SPAN_COLORS = ['#d92d20', '#f97316', '#f79009', '#129211', '#1570ef', '#6941c6'] as const

/** Drop shadow applied when the inspector enables shadows on a leaf. */
const DEFAULT_SHADOW: ShadowPaint = { color: '#101828', blur: 24, offsetX: 0, offsetY: 8 }

const BLEND_MODE_LABELS: Record<string, string> = {
  normal: '正常',
  multiply: '正片叠底',
  screen: '滤色',
  overlay: '叠加',
  darken: '变暗',
  lighten: '变亮',
  'color-dodge': '颜色减淡',
  'color-burn': '颜色加深',
  'hard-light': '强光',
  'soft-light': '柔光',
  difference: '差值',
  exclusion: '排除',
  hue: '色相',
  saturation: '饱和度',
  color: '颜色',
  luminosity: '明度',
}

const BLEND_MODE_OPTIONS = BLEND_MODES.map((mode) => ({ id: mode, label: BLEND_MODE_LABELS[mode] ?? mode }))

const LINE_CAPS: Array<{ id: 'round' | 'butt' | 'square'; label: string }> = [
  { id: 'round', label: '圆头' },
  { id: 'butt', label: '平头' },
  { id: 'square', label: '方头' },
]

const LINE_ENDPOINT_CAPS: Array<{ id: LineEndpointCap; label: string }> = [
  { id: 'none', label: '无' },
  { id: 'arrow', label: '箭头' },
  { id: 'dot', label: '圆点' },
]

const LINE_ENDPOINT_SIDES: Array<{ id: 'start' | 'end'; label: string }> = [
  { id: 'start', label: '起点' },
  { id: 'end', label: '终点' },
]

const SHAPES: Array<{ id: FreeformShapeElement['shape']; label: string }> = [
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '圆形' },
  { id: 'triangle', label: '三角形' },
  { id: 'star', label: '五角星' },
  { id: 'hexagon', label: '六边形' },
]

const LINES: Array<{ id: FreeformLineElement['lineKind']; label: string }> = [
  { id: 'line', label: '直线' },
  { id: 'arrow', label: '箭头' },
]

const FITS: Array<{ id: 'cover' | 'contain'; label: string }> = [
  { id: 'cover', label: '填满' },
  { id: 'contain', label: '适应' },
]

type ImageCropAspectId = 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16'

const IMAGE_CROP_ASPECTS: Array<{ id: ImageCropAspectId; label: string }> = [
  { id: 'original', label: '原图' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
]

const IMAGE_CROP_ASPECT_RATIOS: Record<ImageCropAspectId, number | 'original'> = {
  original: 'original',
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
}

type LiveEditCommitResult = 'committed' | 'cancelled' | 'rejected'

interface ImageFramingTarget {
  targetKind: 'image' | 'shape-fill'
  logicalSrc: string
  resolvedSrc: string
  fit: 'cover' | 'contain'
  framing: ImageFraming
  frameSize: ImageFrameSize
  shape: FreeformShapeElement['shape'] | null
}

interface ImageFramingSession {
  scopeGeneration: number
  draftScopeKey: string
  slideId: string
  path: ScenePath
  targetKind: ImageFramingTarget['targetKind']
  logicalSrc: string
  resolvedSrc: string
  naturalSize: ImageFrameSize
  startDocument: FreeformDocument
  startFraming: ImageFraming
}

type ImageCropDisplaySession = ImageCropSession

function imageCropDecodeIdentityForSession(
  session: ImageCropDisplaySession,
): ImageDecodeIdentity {
  return {
    scopeGeneration: session.scopeGeneration,
    slideId: session.slideId,
    scenePathKey: scenePathKey(session.path),
    logicalSrc: session.logicalSrc,
    resolvedSrc: session.resolvedSrc,
  }
}

function imageFramingTargetForNode(node: FreeformSceneNode | undefined): ImageFramingTarget | null {
  if (node?.type === 'image') {
    return {
      targetKind: 'image',
      logicalSrc: node.src,
      resolvedSrc: store.images.resolve(node.src),
      fit: node.fit,
      framing: node.framing,
      frameSize: { width: node.width, height: node.height },
      shape: null,
    }
  }
  if (node?.type === 'shape' && node.fill.type === 'image') {
    return {
      targetKind: 'shape-fill',
      logicalSrc: node.fill.src,
      resolvedSrc: store.images.resolve(node.fill.src),
      fit: node.fill.fit,
      framing: node.fill.framing,
      frameSize: { width: node.width, height: node.height },
      shape: node.shape,
    }
  }
  return null
}

function imageDecodeIdentityForTarget(
  scopeGeneration: number,
  slideId: string,
  path: ScenePath,
  target: ImageFramingTarget,
): ImageDecodeIdentity {
  return {
    scopeGeneration,
    slideId,
    scenePathKey: scenePathKey(path),
    logicalSrc: target.logicalSrc,
    resolvedSrc: target.resolvedSrc,
  }
}

function imageFramingScopeKey(
  scopeGeneration: number,
  userId: string | null,
  draftId: string | null,
): string {
  return JSON.stringify([scopeGeneration, userId, draftId])
}

function shapeFillOperationKey(
  scopeGeneration: number,
  slideId: string,
  path: ScenePath,
): string {
  return JSON.stringify([scopeGeneration, slideId, scenePathKey(path)])
}

function imageFramingMatrixStyle(matrix: Matrix2D): CSSProperties {
  return { transform: `matrix(${matrix.join(',')})` }
}

function imageFramingUpdateAction(
  slideId: string,
  path: ScenePath,
  target: ImageFramingTarget,
  framing: ImageFraming,
): FreeformAction {
  return {
    type: 'node/update-style',
    slideId,
    updates: [{
      path: [...path],
      patch: target.targetKind === 'image'
        ? { framing }
        : {
            fill: {
              type: 'image',
              src: target.logicalSrc,
              fit: target.fit,
              framing,
            },
          },
    }],
  }
}

function clampImageZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_IMAGE_ZOOM
  const percent = Math.round(zoom * 100)
  return Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, percent / 100))
}

function imageCropUpdateChangesNode(
  node: FreeformImageElement,
  update: ImageCropNodeUpdate,
): boolean {
  return node.x !== update.x
    || node.y !== update.y
    || node.width !== update.width
    || node.height !== update.height
    || !imageFramingEquals(node.framing, update.framing)
}

function scenePathFromKey(key: string): ScenePath | null {
  try {
    const value: unknown = JSON.parse(key)
    return Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === 'string')
      ? value
      : null
  } catch {
    return null
  }
}

function activeSlideOf(doc: FreeformDocument): FreeformSlide {
  const slide = doc.slides.find((candidate) => candidate.id === doc.activeSlideId)
  if (!slide) throw new Error('Freeform document has no valid active slide')
  return slide
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

function isBareEnterContext(target: EventTarget | null): boolean {
  if (target === globalThis.document?.body) return true
  return target instanceof HTMLElement && Boolean(target.closest('[data-testid="freeform-canvas"]'))
}

/** Elements where Space keeps its native meaning (activate/click) instead of arming canvas panning. */
function isSpacePanSuppressedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest(
    'button, input, textarea, select, a[href], label, summary, '
    + '[contenteditable="true"], [role="treeitem"], [role="option"], [role="menuitem"], [role="menu"]',
  ))
}

/** Climb from a DOM hit to the scene path it belongs to: outermost node first. */
function scenePathFromDomTarget(target: EventTarget | null): ScenePath | null {
  if (!(target instanceof Element)) return null
  const ids: string[] = []
  for (
    let wrapper: Element | null = target.closest('[data-scene-node-id]');
    wrapper;
    wrapper = wrapper.parentElement?.closest('[data-scene-node-id]') ?? null
  ) {
    const id = wrapper.getAttribute('data-scene-node-id')
    if (!id) break
    ids.unshift(id)
  }
  return ids.length > 0 ? ids : null
}

function blurActiveTypingTarget() {
  const activeElement = globalThis.document?.activeElement
  if (activeElement instanceof HTMLElement && isTypingTarget(activeElement)) {
    activeElement.blur()
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = globalThis.document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function slidePngName(index: number): string {
  return `slide-${String(index + 1).padStart(2, '0')}.png`
}

function hasMixedSlideSizes(slides: FreeformSlide[]): boolean {
  const first = slides[0]
  if (!first) return false
  return slides.some((slide) => slide.width !== first.width || slide.height !== first.height)
}

interface SceneClipboard {
  nodes: FreeformSceneNode[]
  sourceParentWorld: Matrix2D
}

function geometryUpdatesBetweenSceneTrees(
  sourceNodes: readonly FreeformSceneNode[],
  targetNodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
): Array<{ path: ScenePath; patch: FreeformNodeGeometryPatch }> {
  return nodeIds.flatMap((id) => {
    const source = findNodeAtPath(sourceNodes, [...parentPath, id])
    const target = findNodeAtPath(targetNodes, [...parentPath, id])
    if (!source || !target || source.type !== target.type) return []
    const patch: FreeformNodeGeometryPatch = {
      x: target.x,
      y: target.y,
      rotation: target.rotation,
      scale: target.scale,
    }
    if (source.type !== 'group' && target.type !== 'group') {
      patch.width = target.width
      patch.height = target.height
    }
    return [{ path: [...parentPath, id], patch }]
  })
}

function sceneWorldBoundsForPaths(
  nodes: readonly FreeformSceneNode[],
  paths: readonly ScenePath[],
) {
  const bounds = paths.flatMap((path) => {
    const value = sceneNodeBoundsInWorld(nodes, path)
    return value ? [value] : []
  })
  if (bounds.length === 0) return null
  const left = Math.min(...bounds.map((value) => value.x))
  const top = Math.min(...bounds.map((value) => value.y))
  const right = Math.max(...bounds.map((value) => value.x + value.width))
  const bottom = Math.max(...bounds.map((value) => value.y + value.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function sceneWorldScaleRange(
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
  nodeIds: readonly string[],
): { min: number; max: number } {
  const parentWorld = sceneParentWorldMatrix(nodes, parentPath)
  const parentScale = parentWorld ? decomposeSimilarity(parentWorld)?.scale ?? 1 : 1
  const scales: number[] = []
  const collect = (node: FreeformSceneNode, scale: number) => {
    const nextScale = scale * node.scale
    scales.push(parentScale * nextScale)
    if (node.type === 'group') node.children.forEach((child) => collect(child, nextScale))
  }
  const children = getChildrenAtPath(nodes, parentPath) ?? []
  children
    .filter((node) => nodeIds.includes(node.id))
    .forEach((node) => collect(node, 1))
  if (scales.length === 0) return { min: MIN_EFFECTIVE_SCALE, max: MAX_EFFECTIVE_SCALE }
  return {
    min: Math.max(...scales.map((scale) => MIN_EFFECTIVE_SCALE / scale)),
    max: Math.min(...scales.map((scale) => MAX_EFFECTIVE_SCALE / scale)),
  }
}

function matrixAroundPoint(matrix: Matrix2D, point: { x: number; y: number }): Matrix2D {
  return multiply(translation(point.x, point.y), multiply(matrix, translation(-point.x, -point.y)))
}

function centerNewElementInScope<T extends FreeformElement>(
  element: T,
  nodes: readonly FreeformSceneNode[],
  parentPath: ScenePath,
): T {
  if (parentPath.length === 0) return element
  const parent = findNodeAtPath(nodes, parentPath)
  const bounds = parent?.type === 'group'
    ? sceneNodesBoundsInParent(parent.children)
    : null
  if (!bounds) {
    return {
      ...element,
      x: -element.width / 2,
      y: -element.height / 2,
    }
  }
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  return {
    ...element,
    x: centerX - element.width / 2,
    y: centerY - element.height / 2,
  }
}

type Alignment = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom'
type Distribution = 'horizontal' | 'vertical'
type MarqueeState = { startX: number; startY: number; currentX: number; currentY: number }
type RulerView = {
  left: number
  top: number
  scale: number
  width: number
  height: number
}
type GuideDragState = { axis: 'x' | 'y'; guideId: string | null; position: number }

function operationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

const LOCKED_OPERATION_NOTICE = '图层已锁定，先解锁后再编辑'
const ACTIVE_INTERACTION_NOTICE = '请先结束当前变换'

function sceneStructureFailureMessage(
  operation: 'group' | 'ungroup' | 'insert',
  reason: SceneMutationError,
): string {
  if (reason === 'locked' || reason === 'locked-parent') {
    return operation === 'group'
      ? '图层或父级已锁定，无法组合'
      : operation === 'ungroup'
        ? '图层或父级已锁定，无法解组'
        : LOCKED_OPERATION_NOTICE
  }
  if (operation === 'group') {
    if (reason === 'requires-two' || reason === 'empty-selection') {
      return '至少选择两个同级图层后才能组合'
    }
    if (reason === 'invalid-selection') return '只能组合同一组内的图层'
    if (reason === 'hidden') return '隐藏图层无法组合'
    return '当前图层无法组合'
  }
  if (operation === 'ungroup') {
    if (reason === 'not-group') return '请选择一个或多个组合后再解组'
    return '当前图层无法解组'
  }
  return '无法在当前编辑范围内插入对象'
}

function toRect(marquee: MarqueeState): Rect {
  return {
    x: marquee.startX,
    y: marquee.startY,
    width: marquee.currentX - marquee.startX,
    height: marquee.currentY - marquee.startY,
  }
}

function isShapeElement(element: FreeformElement | undefined): element is FreeformShapeElement {
  return element?.type === 'shape'
}

function isImageElement(element: FreeformElement | undefined): element is FreeformImageElement {
  return element?.type === 'image'
}

function isTextElement(element: FreeformElement | undefined): element is FreeformTextElement {
  return element?.type === 'text'
}

function isLineElement(element: FreeformElement | undefined): element is FreeformLineElement {
  return element?.type === 'line'
}

/** Filter stack editor shared by every leaf type; `null` clears the stored filter. */
function FilterField({
  filter,
  resetKey,
  onChange,
}: {
  filter: SceneFilter | undefined
  resetKey: unknown
  onChange: (filter: SceneFilter | null) => void
}) {
  if (!filter) {
    return (
      <div className="inspector-actions">
        <button
          className="ghost"
          type="button"
          data-testid="filter-add"
          onClick={() => onChange({ brightness: 1.1, contrast: 1.1 })}
        >
          添加滤镜
        </button>
      </div>
    )
  }
  const fields: Array<{ key: keyof SceneFilter; label: string; min: number; max: number; fallback: number }> = [
    { key: 'brightness', label: '亮度', min: 0, max: 3, fallback: 1 },
    { key: 'contrast', label: '对比度', min: 0, max: 3, fallback: 1 },
    { key: 'saturation', label: '饱和度', min: 0, max: 3, fallback: 1 },
    { key: 'blur', label: '模糊', min: 0, max: 100, fallback: 0 },
  ]
  return (
    <>
      <div className="field-grid">
        {fields.map(({ key, label, min, max, fallback }) => (
          <label key={key}>
            {label}
            <InspectorNumberInput
              ariaLabel={`滤镜${label}`}
              min={min}
              max={max}
              resetKey={resetKey}
              value={filter[key] ?? fallback}
              onCommit={(value) => onChange({ ...filter, [key]: value })}
            />
          </label>
        ))}
      </div>
      <div className="inspector-actions">
        <button
          className="ghost"
          type="button"
          data-testid="filter-clear"
          onClick={() => onChange(null)}
        >
          清除滤镜
        </button>
      </div>
    </>
  )
}

/** Drop-shadow editor shared by every leaf type; `null` clears the stored shadow. */
function ShadowField({
  shadow,
  resetKey,
  onChange,
}: {
  shadow: ShadowPaint | undefined
  resetKey: unknown
  onChange: (shadow: ShadowPaint | null) => void
}) {
  if (!shadow) {
    return (
      <div className="inspector-actions">
        <button
          className="ghost"
          type="button"
          data-testid="shadow-add"
          onClick={() => onChange({ ...DEFAULT_SHADOW })}
        >
          添加阴影
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="field-grid with-gap">
        <div className="stroke-color-field" data-testid="shadow-color">
          <span className="stroke-color-label">颜色</span>
          <div className="color-field">
            <span className="color-field-value">{shadow.color.toUpperCase()}</span>
            <ColorPickerButton
              label="阴影颜色"
              color={shadow.color}
              onChange={(color) => onChange({ ...shadow, color })}
            />
          </div>
        </div>
        <label>
          模糊
          <InspectorNumberInput
            ariaLabel="阴影模糊"
            min={0}
            max={400}
            resetKey={resetKey}
            value={shadow.blur}
            onCommit={(value) => onChange({ ...shadow, blur: value })}
          />
        </label>
      </div>
      <div className="field-grid">
        <label>
          水平偏移
          <InspectorNumberInput
            ariaLabel="阴影水平偏移"
            min={-1000}
            max={1000}
            resetKey={resetKey}
            value={shadow.offsetX}
            onCommit={(value) => onChange({ ...shadow, offsetX: value })}
          />
        </label>
        <label>
          垂直偏移
          <InspectorNumberInput
            ariaLabel="阴影垂直偏移"
            min={-1000}
            max={1000}
            resetKey={resetKey}
            value={shadow.offsetY}
            onCommit={(value) => onChange({ ...shadow, offsetY: value })}
          />
        </label>
      </div>
      <div className="inspector-actions">
        <button
          className="ghost"
          type="button"
          data-testid="shadow-clear"
          onClick={() => onChange(null)}
        >
          清除阴影
        </button>
      </div>
    </>
  )
}

export function FreeformWorkspace({ isActive, user, requestAuth }: WorkspaceShellProps) {
  const [history, setHistory] = useState<HistoryState<FreeformDocument>>(() =>
    createHistory(createFreeformDocument()),
  )
  const doc = history.current
  const activeSlide = activeSlideOf(doc)
  const selectedElementIds = useRef<string[]>([])
  const initialSceneIdentity: SceneUiIdentity = {
    activeSlideId: activeSlide.id,
    draftId: null,
    userId: user?.id ?? null,
  }
  const [sceneUiState, setSceneUiState] = useState<SceneUiState>(() => ({
    activeGroupPath: [],
    selectionPaths: [],
    identity: initialSceneIdentity,
  }))
  const activeGroupPath = sceneUiState.activeGroupPath
  const requestedSelectionPaths = sceneUiState.selectionPaths
  const activeChildren = useMemo(
    () => getChildrenAtPath(activeSlide.nodes, activeGroupPath) ?? [],
    [activeGroupPath, activeSlide.nodes],
  )
  const [clipboard, setClipboard] = useState<SceneClipboard | null>(null)
  const [styleClipboard, setStyleClipboard] = useState<FreeformNodeStylePatch | null>(null)
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT)
  const [fitScale, setFitScale] = useState<number | null>(null)
  // Space-held canvas panning and the anchor point for cursor-centered zoom.
  const [spacePanReady, setSpacePanReady] = useState(false)
  const [spacePanning, setSpacePanning] = useState(false)
  const spacePanReadyRef = useRef(false)
  const pendingZoomAnchorRef = useRef<{
    clientX: number
    clientY: number
    worldX: number
    worldY: number
  } | null>(null)
  const pendingZoomCenterRef = useRef<{
    worldX: number
    worldY: number
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  // Per-thumbnail context menu and HTML5 drag state for reordering pages.
  const [slideContextMenu, setSlideContextMenu] = useState<{
    slideId: string
    x: number
    y: number
  } | null>(null)
  const slideContextMenuRef = useRef<HTMLDivElement>(null)
  const dragSlideIdRef = useRef<string | null>(null)
  const [slideDropTarget, setSlideDropTarget] = useState<{
    slideId: string
    position: 'before' | 'after'
  } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
  const [showMixedSizeWarning, setShowMixedSizeWarning] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [userTemplates, setUserTemplates] = useState<readonly UserTemplate[]>([])
  const [textSelection, setTextSelection] = useState<{
    path: ScenePath
    start: number
    end: number
  } | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  // 刷新恢复：每账号只尝试一次；openDraftRef 让恢复 effect 不必依赖 openDraft 的函数身份。
  const restoreAttemptedUserIdRef = useRef<string | null>(null)
  const openDraftRef = useRef<(draft: Draft) => void>(() => {})
  const [operationNotice, setOperationNotice] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  const [dragMeasurements, setDragMeasurements] = useState<DragMeasurement[]>([])
  const [interactionBadge, setInteractionBadge] = useState<string | null>(null)
  const [viewPrefs, setViewPrefs] = useState<FreeformViewPrefs>(loadViewPrefs)

  function updateViewPrefs(patch: Partial<FreeformViewPrefs>) {
    setViewPrefs((current) => {
      const next = { ...DEFAULT_VIEW_PREFS, ...current, ...patch }
      saveViewPrefs(next)
      return next
    })
  }
  const [activeInteraction, setActiveInteraction] = useState<SelectionOverlayInteraction>(null)
  const activeInteractionRef = useRef<SelectionOverlayInteraction>(null)
  const [imageReadiness, setImageReadiness] = useState<ImageReadinessState>(
    createImageReadinessState,
  )
  const [imageReadinessRefresh, setImageReadinessRefresh] = useState(0)
  const imageReadinessRef = useRef<ImageReadinessState>(imageReadiness)
  const invalidatedCropDecodeIdentityRef = useRef<ImageDecodeIdentity | null>(null)
  const [pendingShapeFillKeys, setPendingShapeFillKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [framingSession, setFramingSession] = useState<ImageFramingSession | null>(null)
  const framingSessionRef = useRef<ImageFramingSession | null>(null)
  const renderScale = calculateRenderScale(fitScale, zoomPercent)
  const imageCropSessionApi = useImageCropSession(renderScale)
  const imageCropSession = imageCropSessionApi.session
  const imageCropSessionRef = useRef<ImageCropDisplaySession | null>(null)
  const framingSurfaceRef = useRef<HTMLDivElement>(null)
  const framingDragPointerIdRef = useRef<number | null>(null)
  const selectionPaths = useMemo(
    () => normalizeSceneSelection(activeSlide.nodes, activeGroupPath, requestedSelectionPaths),
    [activeGroupPath, activeSlide.nodes, requestedSelectionPaths],
  )
  const selection = useMemo(
    () => selectionPaths.map((path) => path[path.length - 1]),
    [selectionPaths],
  )
  // Context-menu state derived from the current selection.
  const menuSelectionNodes = useMemo(
    () => activeChildren.filter((node) => selection.includes(node.id)),
    [activeChildren, selection],
  )
  const menuSelectionAllLocked = menuSelectionNodes.length > 0
    && menuSelectionNodes.every((node) => node.locked)
  const menuSelectionAllHidden = menuSelectionNodes.length > 0
    && menuSelectionNodes.every((node) => node.hidden)
  const menuSelectionHasGroup = menuSelectionNodes.some((node) => node.type === 'group')
  const menuSelectionHasLeaf = menuSelectionNodes.some((node) => node.type !== 'group')
  const slideMenuIndex = slideContextMenu
    ? doc.slides.findIndex((slide) => slide.id === slideContextMenu.slideId)
    : -1
  // Timeline rows for the history panel, newest first. Each row is labeled
  // with the edit that produced its state (edges live on the source entry).
  const historyRows = useMemo(() => {
    const rows: Array<{
      key: string
      label: string
      kind: 'past' | 'current' | 'future'
      index: number
    }> = []
    for (let j = history.future.length - 1; j >= 0; j -= 1) {
      rows.push({
        key: `future-${j}`,
        label: history.future[j].label,
        kind: 'future',
        index: j,
      })
    }
    rows.push({
      key: 'current',
      label: history.past.length > 0
        ? history.past[history.past.length - 1].label
        : '初始文档',
      kind: 'current',
      index: -1,
    })
    for (let i = history.past.length - 1; i >= 0; i -= 1) {
      rows.push({
        key: `past-${i}`,
        label: i > 0 ? history.past[i - 1].label : '初始文档',
        kind: 'past',
        index: i,
      })
    }
    return rows
  }, [history])
  const setSelection = useCallback((update: SetStateAction<string[]>) => {
    setSceneUiState((current) => {
      const currentIds = normalizeSceneSelection(
        activeSlide.nodes,
        current.activeGroupPath,
        current.selectionPaths,
      ).map((path) => path[path.length - 1])
      const nextIds = typeof update === 'function' ? update(currentIds) : update
      return {
        ...current,
        selectionPaths: nextIds.map((id) => [...current.activeGroupPath, id]),
      }
    })
  }, [activeSlide.nodes])

  const stageScrollRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const stageViewportRef = useRef<HTMLDivElement>(null)
  const [rulerView, setRulerView] = useState<RulerView | null>(null)
  const [guideDrag, setGuideDrag] = useState<GuideDragState | null>(null)
  const guideTapRef = useRef<{ guideId: string; time: number } | null>(null)
  const marqueePointerIdRef = useRef<number | null>(null)
  const propertiesTabRef = useRef<HTMLButtonElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const shapeFillInputRef = useRef<HTMLInputElement>(null)
  const shapeFillOperationTokensRef = useRef(new Map<string, symbol>())
  const previousUserId = useRef<string | null>(user?.id ?? null)
  const documentIdentityGenerationRef = useRef(0)
  const inspectorNumberResetGenerationRef = useRef(0)
  const historyRef = useRef(history)
  const currentDocumentRef = useRef(doc)
  const currentDraftIdRef = useRef(draftId)
  const currentUserIdRef = useRef<string | null>(user?.id ?? null)
  const draftListGenerationRef = useRef(0)
  const saveGenerationRef = useRef(0)
  const saveInFlightRef = useRef(false)
  const successfulSaveRef = useRef<{
    source: FreeformDocument
    document: FreeformDocument
    updatedAt: number
  } | null>(null)

  selectedElementIds.current = selection
  historyRef.current = history
  currentDocumentRef.current = doc
  currentDraftIdRef.current = draftId
  currentUserIdRef.current = user?.id ?? null
  imageReadinessRef.current = imageReadiness
  framingSessionRef.current = framingSession
  imageCropSessionRef.current = imageCropSession

  const updateDraftId = useCallback((nextDraftId: string | null) => {
    currentDraftIdRef.current = nextDraftId
    setDraftId(nextDraftId)
  }, [])

  const liveSelection = selection
  const selectedElement = useMemo(
    () => {
      const node = selectionPaths[0]
        ? findNodeAtPath(activeSlide.nodes, selectionPaths[0])
        : undefined
      return node?.type === 'group' ? undefined : node
    },
    [activeSlide.nodes, selectionPaths],
  )
  const selectedPath = selectionPaths.length === 1 ? selectionPaths[0] : null
  const inspectorNumberResetKey = JSON.stringify([
    documentIdentityGenerationRef.current,
    inspectorNumberResetGenerationRef.current,
    activeSlide.id,
    selectedPath,
  ])
  const selectedProperties = useMemo<SceneProperties | null>(() => {
    if (!selectedPath) return null
    const result = scenePropertiesForPath(activeSlide.nodes, selectedPath)
    return result.ok ? result.properties : null
  }, [activeSlide.nodes, selectedPath])
  const effectiveLockedSelection = useMemo(() => {
    const unlockPath = nearestLockedSourcePathForSelection(activeSlide.nodes, selectionPaths)
    if (!unlockPath) return null
    const unlockNode = findNodeAtPath(activeSlide.nodes, unlockPath)
    if (!unlockNode) return null
    return {
      unlockPath,
      unlockName: unlockNode.name,
    }
  }, [activeSlide.nodes, selectionPaths])
  const lockedDescendantSelection = useMemo(() => {
    const sourcePath = lockedDescendantSourcePathForSelection(activeSlide.nodes, selectionPaths)
      ?? (selectedProperties?.editability.kind === 'locked-descendant'
        ? selectedProperties.editability.sourcePath
        : null)
    if (!sourcePath) return null
    const sourceNode = findNodeAtPath(activeSlide.nodes, sourcePath)
    if (!sourceNode) return null
    return {
      sourcePath,
      sourceName: sourceNode.name,
    }
  }, [activeSlide.nodes, selectedProperties, selectionPaths])
  const propertySelectionReadOnly = Boolean(effectiveLockedSelection || lockedDescendantSelection)
  const selectedImageTarget = useMemo(
    () => imageFramingTargetForNode(selectedElement),
    [selectedElement],
  )
  const selectedImageIdentity = useMemo(() => (
    selectedPath && selectedImageTarget
      ? imageDecodeIdentityForTarget(
          documentIdentityGenerationRef.current,
          activeSlide.id,
          selectedPath,
          selectedImageTarget,
        )
      : null
  ), [activeSlide.id, selectedImageTarget, selectedPath])
  const selectedImageNaturalSize = selectedImageIdentity
    ? readReadyImage(imageReadiness, selectedImageIdentity)
    : null
  const selectedShapeFillPending = Boolean(
    selectedPath
    && selectedImageTarget?.targetKind === 'shape-fill'
    && pendingShapeFillKeys.has(shapeFillOperationKey(
      documentIdentityGenerationRef.current,
      activeSlide.id,
      selectedPath,
    )),
  )
  const selectedFramingDisabledReason = propertySelectionReadOnly
    ? '请先解锁图片'
    : selectedShapeFillPending
      ? '图片正在处理中'
      : selectedImageTarget?.fit === 'contain'
        ? selectedImageTarget.targetKind === 'image'
          ? '请先切换到填满模式后裁剪'
          : '适应模式不支持调整取景'
        : !selectedImageNaturalSize
          ? selectedImageTarget?.targetKind === 'image'
            ? '图片加载完成后可裁剪'
            : '图片加载完成后可调整取景'
          : null
  const canAdjustSelectedFraming = Boolean(
    selectedImageTarget
    && selectedPath
    && selectedImageTarget.fit === 'cover'
    && !selectedFramingDisabledReason,
  )
  const canCropSelectedImage = Boolean(
    canAdjustSelectedFraming && selectedImageTarget?.targetKind === 'image',
  )
  const canResetSelectedFraming = Boolean(
    selectedImageTarget
    && selectedImageTarget.fit === 'cover'
    && !selectedShapeFillPending
    && !propertySelectionReadOnly
    && !imageFramingEquals(selectedImageTarget.framing, createDefaultImageFraming()),
  )
  const scopeBreadcrumbs = useMemo(() => {
    const breadcrumbs: Array<{ name: string; path: ScenePath }> = [{ name: '页面', path: [] }]
    for (let length = 1; length <= activeGroupPath.length; length += 1) {
      const path = activeGroupPath.slice(0, length)
      const node = findNodeAtPath(activeSlide.nodes, path)
      if (node?.type !== 'group') break
      breadcrumbs.push({ name: node.name, path })
    }
    return breadcrumbs
  }, [activeGroupPath, activeSlide.nodes])
  const canUseLogicalAlignment = useMemo(() => (
    selectionPaths.length > 0 &&
    !effectiveLockedSelection &&
    !lockedDescendantSelection &&
    selectionPaths.every((path) => (
      scenePathKey(path.slice(0, -1)) === scenePathKey(activeGroupPath) &&
      !findNodeAtPath(activeSlide.nodes, path)?.hidden
    ))
  ), [
    activeGroupPath,
    activeSlide.nodes,
    effectiveLockedSelection,
    lockedDescendantSelection,
    selectionPaths,
  ])

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0
  const marqueeRect = marquee ? toRect(marquee) : null
  const activeFontRequests = useMemo(
    () => collectFreeformFontRequests([activeSlide]),
    [activeSlide],
  )
  const documentFontRequests = useMemo(
    () => collectFreeformFontRequests(doc.slides),
    [doc.slides],
  )
  const imageSources = useMemo(() => collectFreeformImageSources(doc), [doc])
  const showOperationError = useCallback((error: unknown, fallback: string) => {
    setOperationNotice(operationErrorMessage(error, fallback))
  }, [])

  const updateHistory = useCallback((update: SetStateAction<HistoryState<FreeformDocument>>) => {
    const current = historyRef.current
    const next = typeof update === 'function' ? update(current) : update
    historyRef.current = next
    currentDocumentRef.current = next.current
    if (!Object.is(next, current)) setHistory(next)
    return next
  }, [])
  const showLockedOperationNotice = useCallback(() => {
    setOperationNotice(LOCKED_OPERATION_NOTICE)
  }, [])
  const blockDocumentMutationDuringInteraction = useCallback(() => {
    if (
      !activeInteractionRef.current
      && marqueePointerIdRef.current === null
      && !framingSessionRef.current
      && !imageCropSessionRef.current
    ) return false
    setOperationNotice(ACTIVE_INTERACTION_NOTICE)
    return true
  }, [])
  const handleImageLeaseError = useCallback((error: unknown) => {
    showOperationError(error, '图片续租失败，请检查网络后重试')
  }, [showOperationError])
  const retainImagesNow = useImageLease(
    imageSources,
    store.remote && Boolean(user),
    handleImageLeaseError,
  )
  const clearAllImageReadinessNow = useCallback(() => {
    setImageReadiness((current) => {
      const next = clearAllImageReadiness(current)
      imageReadinessRef.current = next
      return next
    })
    setImageReadinessRefresh((current) => current + 1)
  }, [])
  const clearActiveSlideImageReadiness = useCallback((slideId: string) => {
    const scopeGeneration = documentIdentityGenerationRef.current
    setImageReadiness((current) => {
      const next = clearImageReadinessForSlide(current, scopeGeneration, slideId)
      imageReadinessRef.current = next
      return next
    })
  }, [])
  const handleImageDecodeReport = useCallback((report: ImageDecodeReport) => {
    void imageReadinessRefresh
    if (report.identity.scopeGeneration !== documentIdentityGenerationRef.current) return
    const path = scenePathFromKey(report.identity.scenePathKey)

    const cropSession = imageCropSessionRef.current
    if (cropSession) {
      const sessionIdentity = imageCropDecodeIdentityForSession(cropSession)
      const authority = currentImageCropAuthorityForSession(cropSession)
      const invalidation = imageCropReadinessInvalidation({
        sessionIdentity,
        currentIdentity: authority?.identity ?? null,
        readiness: report,
      })
      if (invalidation.invalidate) {
        if (invalidation.reason === 'loading') {
          invalidatedCropDecodeIdentityRef.current = { ...report.identity }
        } else if (invalidation.reason === 'error') {
          invalidatedCropDecodeIdentityRef.current = null
          setOperationNotice('图片加载失败，请重试')
        } else {
          invalidatedCropDecodeIdentityRef.current = null
        }
        clearImageCropSession()
      }
    }
    const followsInvalidatedCrop = Boolean(
      invalidatedCropDecodeIdentityRef.current
      && imageDecodeIdentityEquals(
        report.identity,
        invalidatedCropDecodeIdentityRef.current,
      ),
    )
    const slide = path
      ? currentDocumentRef.current.slides.find(
          (candidate) => candidate.id === report.identity.slideId,
        )
      : undefined
    const target = slide && path
      ? imageFramingTargetForNode(findNodeAtPath(slide.nodes, path))
      : null
    const expectedIdentity = slide && path && target
      ? imageDecodeIdentityForTarget(
          documentIdentityGenerationRef.current,
          slide.id,
          path,
          target,
        )
      : null
    if (!expectedIdentity) return
    const currentReadiness = imageReadinessRef.current
    const nextReadiness = updateImageReadiness(currentReadiness, report, expectedIdentity)
    if (!Object.is(nextReadiness, currentReadiness)) {
      imageReadinessRef.current = nextReadiness
      setImageReadiness(nextReadiness)
    }
    if (report.status === 'error' && followsInvalidatedCrop) {
      invalidatedCropDecodeIdentityRef.current = null
      setOperationNotice('图片加载失败，请重试')
    } else if (report.status === 'ready' && followsInvalidatedCrop) {
      invalidatedCropDecodeIdentityRef.current = null
    }
  }, [activeGroupPath, imageReadinessRefresh])

  const loadDrafts = useCallback(async (uid: string) => {
    const generation = ++draftListGenerationRef.current
    try {
      const list = await store.drafts.list(uid)
      if (
        generation === draftListGenerationRef.current &&
        currentUserIdRef.current === uid
      ) setDrafts(list)
    } catch (error) {
      if (
        generation === draftListGenerationRef.current &&
        currentUserIdRef.current === uid
      ) showOperationError(error, '草稿列表加载失败，请稍后重试')
    }
  }, [showOperationError])

  const refreshDrafts = useCallback(() => {
    const uid = currentUserIdRef.current
    if (!uid) {
      draftListGenerationRef.current += 1
      setDrafts([])
      return
    }
    void loadDrafts(uid)
  }, [loadDrafts])

  const measureFitScale = useCallback(() => {
    const stage = stageScrollRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const style = getComputedStyle(stage)
    const contentWidth = rect.width
      - cssPixels(style.borderLeftWidth)
      - cssPixels(style.borderRightWidth)
      - cssPixels(style.paddingLeft)
      - cssPixels(style.paddingRight)
    const contentHeight = rect.height
      - cssPixels(style.borderTopWidth)
      - cssPixels(style.borderBottomWidth)
      - cssPixels(style.paddingTop)
      - cssPixels(style.paddingBottom)
    const next = calculateFitScale(
      contentWidth,
      contentHeight,
      activeSlide.width,
      activeSlide.height,
    )
    if (next === null) return
    setFitScale((current) =>
      current !== null && Math.abs(current - next) < FIT_SCALE_EPSILON ? current : next,
    )
  }, [activeSlide.height, activeSlide.width])

  useLayoutEffect(() => {
    if (!isActive) return
    measureFitScale()
    const stage = stageScrollRef.current
    if (!stage) return
    const observer = new ResizeObserver(() => measureFitScale())
    observer.observe(stage)
    return () => observer.disconnect()
  }, [isActive, measureFitScale])

  // Ctrl/Cmd + wheel zooms the canvas around the cursor instead of scrolling.
  // A native non-passive listener is required to override the browser page zoom.
  useEffect(() => {
    if (!isActive) return
    const stage = stageViewportRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = zoomPercentFromWheelDelta(zoomPercent, event.deltaY)
      if (next === zoomPercent) return
      const artboard = artboardRef.current
      if (!artboard || renderScale === null || renderScale <= 0) {
        pendingZoomAnchorRef.current = null
        setZoomPercent(next)
        return
      }
      const bounds = artboard.getBoundingClientRect()
      pendingZoomAnchorRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        worldX: (event.clientX - bounds.left) / renderScale,
        worldY: (event.clientY - bounds.top) / renderScale,
      }
      setZoomPercent(next)
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  })

  // Keeps the grabbed world point pinned under the cursor after the scale change,
  // or centers a requested world point once scrollbars have settled.
  useLayoutEffect(() => {
    const stage = stageScrollRef.current
    const artboard = artboardRef.current
    const center = pendingZoomCenterRef.current
    if (center) {
      pendingZoomCenterRef.current = null
      pendingZoomAnchorRef.current = null
      const box = stage ? stageContentBox() : null
      if (!stage || !artboard || !box || renderScale === null || renderScale <= 0) return
      const bounds = artboard.getBoundingClientRect()
      stage.scrollLeft += bounds.left - (box.clientLeft + box.width / 2 - center.worldX * renderScale)
      stage.scrollTop += bounds.top - (box.clientTop + box.height / 2 - center.worldY * renderScale)
      return
    }
    const anchor = pendingZoomAnchorRef.current
    if (!anchor) return
    pendingZoomAnchorRef.current = null
    if (!stage || !artboard || renderScale === null || renderScale <= 0) return
    const bounds = artboard.getBoundingClientRect()
    stage.scrollLeft += bounds.left - (anchor.clientX - anchor.worldX * renderScale)
    stage.scrollTop += bounds.top - (anchor.clientY - anchor.worldY * renderScale)
  })

  // Rulers mirror the artboard's position inside the stage viewport. Measurement
  // is event-driven (scroll, viewport resize, zoom, and page size) so it never
  // fights React's render loop; the epsilon check keeps it change-driven.
  const measureRulerView = useCallback(() => {
    const viewport = stageViewportRef.current
    const artboard = artboardRef.current
    if (!viewport || !artboard || renderScale === null || renderScale <= 0) {
      setRulerView(null)
      return
    }
    const viewportRect = viewport.getBoundingClientRect()
    const artboardRect = artboard.getBoundingClientRect()
    const next: RulerView = {
      left: artboardRect.left - viewportRect.left,
      top: artboardRect.top - viewportRect.top,
      scale: renderScale,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    }
    setRulerView((prev) => {
      if (
        prev
        && prev.width === next.width
        && prev.height === next.height
        && Math.abs(prev.left - next.left) < 0.01
        && Math.abs(prev.top - next.top) < 0.01
        && Math.abs(prev.scale - next.scale) < 0.01
      ) {
        return prev
      }
      return next
    })
  }, [renderScale])

  useEffect(() => {
    measureRulerView()
  }, [measureRulerView, renderScale, activeSlide.width, activeSlide.height])

  useEffect(() => {
    if (!isActive) return
    const viewport = stageViewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => measureRulerView())
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [isActive, measureRulerView])

  // Keep the open context menu fully inside the viewport (measured post-mount, pre-paint).
  useLayoutEffect(() => {
    const open = slideContextMenu ?? contextMenu
    if (!open) return
    const menu = slideContextMenu ? slideContextMenuRef.current : contextMenuRef.current
    if (!menu) return
    const bounds = menu.getBoundingClientRect()
    const margin = 8
    const x = clamp(open.x, margin, Math.max(margin, window.innerWidth - bounds.width - margin))
    const y = clamp(open.y, margin, Math.max(margin, window.innerHeight - bounds.height - margin))
    if (x === open.x && y === open.y) return
    if (slideContextMenu) setSlideContextMenu({ ...slideContextMenu, x, y })
    else setContextMenu({ x, y })
  }, [contextMenu, slideContextMenu])

  // Clicking anywhere outside the open context menus dismisses them.
  useEffect(() => {
    if (!contextMenu && !slideContextMenu) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (
        contextMenuRef.current?.contains(target)
        || slideContextMenuRef.current?.contains(target)
      )) return
      setContextMenu(null)
      setSlideContextMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [contextMenu, slideContextMenu])

  useEffect(() => {
    const nextUserId = user?.id ?? null
    const userChanged = previousUserId.current !== nextUserId
    if (userChanged) {
      cancelFramingBeforeTransition(previousUserId.current, currentDraftIdRef.current)
      previousUserId.current = nextUserId
      documentIdentityGenerationRef.current += 1
      shapeFillOperationTokensRef.current.clear()
      setPendingShapeFillKeys(new Set())
      clearAllImageReadinessNow()
      draftListGenerationRef.current += 1
      saveGenerationRef.current += 1
      successfulSaveRef.current = null
      setDrafts([])
      updateDraftId(null)
      setSavedAt(null)
      setShowDrafts(false)
      setOperationNotice(null)
    }

    if (user) {
      void loadDrafts(user.id)
      setUserTemplates(listUserTemplates(user.id))
    } else {
      draftListGenerationRef.current += 1
      setDrafts([])
      setUserTemplates([])
    }

    return () => {
      draftListGenerationRef.current += 1
    }
  }, [clearAllImageReadinessNow, loadDrafts, updateDraftId, user])

  // 刷新恢复：账号确认后自动回到本工作台最近打开的草稿（每个账号只尝试
  // 一次；草稿已被删除或读取失败则保持新文档，不提示）。
  useEffect(() => {
    if (!user || restoreAttemptedUserIdRef.current === user.id) return
    restoreAttemptedUserIdRef.current = user.id
    const draftId = readLastSession(user.id).freeformDraftId
    if (!draftId) return
    const uid = user.id
    void store.drafts.list(uid).then(
      (list) => {
        if (currentUserIdRef.current !== uid) return
        const target = list.find((draft) => draft.id === draftId && draft.mode === 'freeform-slide')
        if (target) openDraftRef.current(target)
      },
      () => {},
    )
  }, [user])

  useEffect(() => {
    const session = imageCropSessionRef.current
    if (!session) return
    const sessionIdentity = imageCropDecodeIdentityForSession(session)
    const authority = currentImageCropAuthorityForSession(session)
    const readiness = readImageReadinessReport(imageReadinessRef.current, sessionIdentity)
    const invalidation = imageCropReadinessInvalidation({
      sessionIdentity,
      currentIdentity: authority?.identity ?? null,
      readiness,
    })
    if (!invalidation.invalidate) return
    if (invalidation.reason === 'loading') {
      invalidatedCropDecodeIdentityRef.current = { ...sessionIdentity }
    } else if (invalidation.reason === 'error') {
      invalidatedCropDecodeIdentityRef.current = null
      setOperationNotice('图片加载失败，请重试')
    } else {
      invalidatedCropDecodeIdentityRef.current = null
    }
    clearImageCropSession()
  }, [
    activeGroupPath,
    activeSlide.id,
    activeSlide.nodes,
    draftId,
    imageCropSession,
    imageReadiness,
    user?.id,
  ])

  useEffect(() => {
    const identity: SceneUiIdentity = {
      activeSlideId: activeSlide.id,
      draftId,
      userId: user?.id ?? null,
    }
    setSceneUiState((current) => reconcileSceneUiState(activeSlide.nodes, current, identity))
  }, [activeSlide.id, activeSlide.nodes, draftId, user?.id])

  useEffect(() => {
    if (activeFontRequests.length === 0) return
    const timer = window.setTimeout(() => {
      void buildFreeformFontCSS(activeFontRequests).catch(() => undefined)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [activeFontRequests])

  useEffect(() => {
    if (documentFontRequests.length === 0) return
    const timer = window.setTimeout(() => {
      void buildFreeformFontCSS(documentFontRequests).catch(() => undefined)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [documentFontRequests])

  const applyAction = useCallback((action: FreeformAction, label?: string) => {
    if (blockDocumentMutationDuringInteraction()) return false
    const start = currentDocumentRef.current
    const next = freeformReducer(start, action)
    if (Object.is(next, start)) return false
    const entryLabel = label ?? describeFreeformAction(action)
    updateHistory((current) => {
      if (Object.is(current.current, start)) return pushHistory(current, next, entryLabel)
      const rebased = freeformReducer(current.current, action)
      return Object.is(rebased, current.current)
        ? current
        : pushHistory(current, rebased, entryLabel)
    })
    setSavedAt(null)
    return true
  }, [blockDocumentMutationDuringInteraction, updateHistory])

  // 文字盒自动增高：内容超出盒子时把盒子长到实际需要的大小（横排增高、竖排
  // 加宽），只增不减——手工调大的盒子保持不变。这是视图层的显示修正而不是
  // 用户操作：静默替换当前文档，不进撤销历史（历史是绝对状态快照，撤销/重做
  // 不受影响；撤销后若再次超出会重新长高）。拖拽/裁剪等交互进行中跳过，等
  // 交互结束后的下一次提交再测。网页字体加载完成后重测一次（fallback 字体
  // 与真实字体的度量不同）。
  useLayoutEffect(() => {
    if (!isActive) return

    const runTextAutoSize = () => {
      if (
        activeInteractionRef.current
        || marqueePointerIdRef.current !== null
        || framingSessionRef.current
        || imageCropSessionRef.current
      ) return
      const artboard = artboardRef.current
      if (!artboard) return
      const measure = (id: string, vertical: boolean): number | null => {
        const host = artboard.querySelector(`[data-scene-node-id="${CSS.escape(id)}"]`)
        const textbox = host?.querySelector('.freeform-textbox')
        if (!(textbox instanceof HTMLElement)) return null
        return vertical ? textbox.scrollWidth : textbox.scrollHeight
      }
      const updates = collectTextAutoSize(activeSlide.nodes, measure)
      if (updates.length === 0) return
      const action: FreeformAction = {
        type: 'node/update-geometry',
        slideId: activeSlide.id,
        updates: updates.map((update) => ({
          path: [...update.path],
          patch: update.dimension === 'height'
            ? { height: update.size }
            : { width: update.size },
        })),
      }
      const start = currentDocumentRef.current
      const next = freeformReducer(start, action)
      if (Object.is(next, start)) return
      updateHistory((current) => {
        const rebased = freeformReducer(current.current, action)
        return Object.is(rebased, current.current)
          ? current
          : { ...current, current: rebased }
      })
      setSavedAt(null)
    }

    runTextAutoSize()
    const onFontsLoaded = () => runTextAutoSize()
    document.fonts.addEventListener('loadingdone', onFontsLoaded)
    return () => {
      document.fonts.removeEventListener('loadingdone', onFontsLoaded)
    }
  }, [isActive, activeSlide, updateHistory])

  function updateNodeContentAtPath(
    slideId: string,
    path: ScenePath,
    patch: FreeformNodeContentPatch,
  ): boolean {
    return applyAction({
      type: 'node/update-content',
      slideId,
      updates: [{ path: [...path], patch }],
    })
  }

  function updateNodeStyleAtPath(
    slideId: string,
    path: ScenePath,
    patch: FreeformNodeStylePatch,
  ): boolean {
    return applyAction({
      type: 'node/update-style',
      slideId,
      updates: [{ path: [...path], patch }],
    })
  }

  function updateSelectedContent(patch: FreeformNodeContentPatch): boolean {
    if (!selectedPath) return false
    return updateNodeContentAtPath(activeSlide.id, selectedPath, patch)
  }

  function updateSelectedStyle(patch: FreeformNodeStylePatch): boolean {
    if (!selectedPath) return false
    return updateNodeStyleAtPath(activeSlide.id, selectedPath, patch)
  }

  const activeTextRange = useMemo(() => {
    if (!textSelection || !isTextElement(selectedElement)) return null
    if (textSelection.path[textSelection.path.length - 1] !== selectedElement.id) return null
    const end = Math.min(textSelection.end, selectedElement.text.length)
    const start = Math.min(textSelection.start, end)
    return start < end ? { start, end } : null
  }, [textSelection, selectedElement])

  function applySelectedTextSpan(style: { bold?: true; color?: string }) {
    if (!selectedPath || !isTextElement(selectedElement) || !activeTextRange) return
    const next = insertRichTextSpan(
      selectedElement.spans,
      { start: activeTextRange.start, end: activeTextRange.end, ...style },
      selectedElement.text.length,
    )
    if (!next) return
    updateSelectedStyle({ spans: next })
  }

  function removeSelectedTextSpan(index: number) {
    if (!isTextElement(selectedElement) || !selectedElement.spans) return
    updateSelectedStyle({ spans: selectedElement.spans.filter((_, i) => i !== index) })
  }

  function beginShapeFillOperation(slideId: string, path: ScenePath) {
    const key = shapeFillOperationKey(
      documentIdentityGenerationRef.current,
      slideId,
      path,
    )
    const token = Symbol(key)
    shapeFillOperationTokensRef.current.set(key, token)
    setPendingShapeFillKeys((current) => {
      const next = new Set(current)
      next.add(key)
      return next
    })
    return { key, token }
  }

  function finishShapeFillOperation(operation: { key: string; token: symbol }) {
    if (shapeFillOperationTokensRef.current.get(operation.key) !== operation.token) return
    shapeFillOperationTokensRef.current.delete(operation.key)
    setPendingShapeFillKeys((current) => {
      if (!current.has(operation.key)) return current
      const next = new Set(current)
      next.delete(operation.key)
      return next
    })
  }

  function updateSelectedShapeFill(fill: ShapeFill): boolean {
    if (!selectedPath) return false
    const operation = beginShapeFillOperation(activeSlide.id, selectedPath)
    const changed = updateSelectedStyle({ fill })
    finishShapeFillOperation(operation)
    return changed
  }

  function commitSceneProperty(edit: ScenePropertyEdit): boolean {
    if (!selectedPath) return false
    const currentSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === activeSlide.id,
    )
    if (!currentSlide) return false
    const mutation = scenePropertyMutation(currentSlide.nodes, selectedPath, edit)
    if (!mutation.ok) {
      if (mutation.reason === 'locked' || mutation.reason === 'locked-descendant') {
        showLockedOperationNotice()
      }
      return false
    }
    if (!mutation.update) return false
    return mutation.category === 'geometry'
      ? applyAction({
          type: 'node/update-geometry',
          slideId: activeSlide.id,
          updates: [mutation.update],
        })
      : applyAction({
          type: 'node/update-style',
          slideId: activeSlide.id,
          updates: [mutation.update],
        })
  }

  const replaceCurrent = useCallback((action: FreeformAction) => {
    updateHistory((current) => {
      const next = freeformReducer(current.current, action)
      return Object.is(next, current.current) ? current : { ...current, current: next }
    })
  }, [updateHistory])

  const commitLiveEdit = useCallback((startDocument: FreeformDocument, label = '编辑') => {
    const savedStart = successfulSaveRef.current
    const historyStart = savedStart && (
      Object.is(savedStart.source, startDocument) || Object.is(savedStart.document, startDocument)
    )
      ? savedStart.document
      : startDocument
    updateHistory((current) => {
      if (Object.is(current.current, historyStart) || Object.is(current.current, startDocument)) {
        return current
      }
      return {
        past: [...current.past, { state: historyStart, label }],
        current: current.current,
        future: [],
      }
    })
    setSavedAt(null)
  }, [updateHistory])

  const cancelLiveEdit = useCallback((startDocument: FreeformDocument) => {
    const savedStart = successfulSaveRef.current
    const restoredDocument = savedStart && (
      Object.is(savedStart.source, startDocument) || Object.is(savedStart.document, startDocument)
    )
      ? savedStart.document
      : startDocument
    updateHistory((current) => Object.is(current.current, restoredDocument)
      ? current
      : { ...current, current: restoredDocument })
    if (savedStart && (
      Object.is(savedStart.source, startDocument) || Object.is(savedStart.document, startDocument)
    )) {
      setSavedAt(savedStart.updatedAt)
    }
  }, [updateHistory])

  const applyAndCommitLiveEdit = useCallback((
    startDocument: FreeformDocument,
    action: FreeformAction,
    expectedChanged: boolean,
    label?: string,
  ): LiveEditCommitResult => {
    if (!expectedChanged) {
      cancelLiveEdit(startDocument)
      return 'cancelled'
    }

    const preflightStart = currentDocumentRef.current
    const preflightNext = freeformReducer(preflightStart, action)
    if (Object.is(preflightNext, preflightStart)) return 'rejected'

    const savedStart = successfulSaveRef.current
    const historyStart = savedStart && (
      Object.is(savedStart.source, startDocument) || Object.is(savedStart.document, startDocument)
    )
      ? savedStart.document
      : startDocument
    const entryLabel = label ?? describeFreeformAction(action)
    const commitState: { result: LiveEditCommitResult } = { result: 'rejected' }
    updateHistory((current) => {
      const next = freeformReducer(current.current, action)
      if (Object.is(next, current.current)) return current
      commitState.result = 'committed'
      return {
        past: [...current.past, { state: historyStart, label: entryLabel }],
        current: next,
        future: [],
      }
    })
    if (commitState.result === 'committed') setSavedAt(null)
    return commitState.result
  }, [cancelLiveEdit, updateHistory])

  function currentTargetForFramingSession(
    session: ImageFramingSession,
    scopeUserId = currentUserIdRef.current,
    scopeDraftId = currentDraftIdRef.current,
  ): { slide: FreeformSlide; target: ImageFramingTarget } | null {
    if (!framingSessionBelongsToScope(session, scopeUserId, scopeDraftId)) return null
    const slide = currentDocumentRef.current.slides.find(
      (candidate) => candidate.id === session.slideId,
    )
    if (!slide) return null
    const target = imageFramingTargetForNode(findNodeAtPath(slide.nodes, session.path))
    if (
      !target
      || target.targetKind !== session.targetKind
      || target.logicalSrc !== session.logicalSrc
      || target.resolvedSrc !== session.resolvedSrc
    ) return null
    return { slide, target }
  }

  function framingSessionBelongsToCurrentScope(session: ImageFramingSession): boolean {
    return framingSessionBelongsToScope(
      session,
      currentUserIdRef.current,
      currentDraftIdRef.current,
    )
  }

  function framingSessionBelongsToScope(
    session: ImageFramingSession,
    scopeUserId: string | null,
    scopeDraftId: string | null,
  ): boolean {
    return session.scopeGeneration === documentIdentityGenerationRef.current
      && session.draftScopeKey === imageFramingScopeKey(
        documentIdentityGenerationRef.current,
        scopeUserId,
        scopeDraftId,
      )
  }

  function imageCropSessionBelongsToScope(
    session: ImageCropDisplaySession,
    scopeUserId: string | null,
    scopeDraftId: string | null,
  ): boolean {
    return session.scopeGeneration === documentIdentityGenerationRef.current
      && session.draftScopeKey === imageFramingScopeKey(
        documentIdentityGenerationRef.current,
        scopeUserId,
        scopeDraftId,
      )
  }

  function currentImageCropAuthorityForSession(
    session: ImageCropDisplaySession,
    scopeUserId = currentUserIdRef.current,
    scopeDraftId = currentDraftIdRef.current,
  ): {
    slide: FreeformSlide
    node: FreeformImageElement
    identity: ImageDecodeIdentity
  } | null {
    if (!imageCropSessionBelongsToScope(session, scopeUserId, scopeDraftId)) return null
    const document = currentDocumentRef.current
    if (document.activeSlideId !== session.slideId) return null
    const slide = document.slides.find((candidate) => candidate.id === session.slideId)
    if (!slide) return null
    const directPath = directChildPathForScope(slide.nodes, activeGroupPath, session.path)
    if (!directPath || scenePathKey(directPath) !== scenePathKey(session.path)) return null
    const state = effectiveSceneState(slide.nodes, session.path)
    const node = findNodeAtPath(slide.nodes, session.path)
    if (
      !state
      || state.locked
      || state.hidden
      || node?.type !== 'image'
      || node.fit !== 'cover'
    ) return null
    const target = imageFramingTargetForNode(node)
    if (!target || target.targetKind !== 'image') return null
    return {
      slide,
      node,
      identity: imageDecodeIdentityForTarget(
        session.scopeGeneration,
        slide.id,
        session.path,
        target,
      ),
    }
  }

  function currentTargetForImageCropSession(
    session: ImageCropDisplaySession,
    scopeUserId = currentUserIdRef.current,
    scopeDraftId = currentDraftIdRef.current,
  ): { slide: FreeformSlide; node: FreeformImageElement } | null {
    const current = currentImageCropAuthorityForSession(session, scopeUserId, scopeDraftId)
    if (!current) return null
    if (!imageDecodeIdentityEquals(
      current.identity,
      imageCropDecodeIdentityForSession(session),
    )) return null
    const naturalSize = readReadyImage(imageReadinessRef.current, current.identity)
    if (
      !naturalSize
      || naturalSize.width !== session.naturalSize.width
      || naturalSize.height !== session.naturalSize.height
    ) return null
    return { slide: current.slide, node: current.node }
  }

  function clearImageCropSession() {
    imageCropSessionApi.invalidate()
    imageCropSessionRef.current = null
  }

  function invalidateImageCropAfterDecodeError() {
    const session = imageCropSessionRef.current
    if (!session) return
    const current = currentTargetForImageCropSession(session)
    clearImageCropSession()
    invalidatedCropDecodeIdentityRef.current = null
    if (current) setOperationNotice('图片加载失败，请重试')
  }

  function startImageCrop(path: ScenePath): boolean {
    if (
      imageCropSessionRef.current
      || framingSessionRef.current
      || blockDocumentMutationDuringInteraction()
    ) return false
    const document = currentDocumentRef.current
    const slide = document.slides.find((candidate) => candidate.id === document.activeSlideId)
    if (!slide || slide.id !== activeSlide.id || renderScale === null) return false
    const directPath = directChildPathForScope(slide.nodes, activeGroupPath, path)
    if (!directPath || scenePathKey(directPath) !== scenePathKey(path)) return false
    const state = effectiveSceneState(slide.nodes, path)
    const node = findNodeAtPath(slide.nodes, path)
    if (!state || state.locked || state.hidden || node?.type !== 'image' || node.fit !== 'cover') {
      return false
    }
    const target = imageFramingTargetForNode(node)
    if (!target || target.targetKind !== 'image') return false
    const identity = imageDecodeIdentityForTarget(
      documentIdentityGenerationRef.current,
      slide.id,
      path,
      target,
    )
    const naturalSize = readReadyImage(imageReadinessRef.current, identity)
    const worldMatrix = sceneWorldMatrixAtPath(slide.nodes, path)
    if (!naturalSize || !worldMatrix) return false
    const draft = createImageCropDraft({ startNode: node, naturalSize })
    if (
      !draft
      || imageCropScreenScale({ renderScale, startWorldMatrix: worldMatrix }) === null
    ) return false

    const started = imageCropSessionApi.start({
      scopeGeneration: documentIdentityGenerationRef.current,
      draftScopeKey: imageFramingScopeKey(
        documentIdentityGenerationRef.current,
        currentUserIdRef.current,
        currentDraftIdRef.current,
      ),
      slideId: slide.id,
      path: [...path],
      logicalSrc: node.src,
      resolvedSrc: target.resolvedSrc,
      naturalSize: { ...naturalSize },
      startDocument: document,
      startNode: { ...node, framing: { ...node.framing } },
      startWorldMatrix: [...worldMatrix] as Matrix2D,
      draft,
    })
    if (!started) return false
    invalidatedCropDecodeIdentityRef.current = null
    blurActiveTypingTarget()
    setSelection([path[path.length - 1]])
    setOperationNotice(null)
    return true
  }

  function applyImageCropAspect(aspect: ImageCropAspectId) {
    const changed = imageCropSessionApi.applyAspectRatio(IMAGE_CROP_ASPECT_RATIOS[aspect])
    setOperationNotice(changed ? null : '当前裁剪范围无法应用该比例')
  }

  function finishImageCrop(
    reason: ImageCropFinishReason = 'done',
    scopeUserId = currentUserIdRef.current,
    scopeDraftId = currentDraftIdRef.current,
  ): LiveEditCommitResult | null {
    const finished = imageCropSessionApi.finish(reason)
    if (!finished) {
      imageCropSessionRef.current = null
      invalidatedCropDecodeIdentityRef.current = null
      return null
    }

    const { session, draft } = finished
    const current = currentTargetForImageCropSession(session, scopeUserId, scopeDraftId)
    if (!current) {
      imageCropSessionRef.current = null
      invalidatedCropDecodeIdentityRef.current = null
      return null
    }
    const update = imageCropDraftToUpdate({
      startNode: session.startNode,
      naturalSize: session.naturalSize,
      draft,
    })
    if (!update) {
      setOperationNotice('图片裁剪未能应用，请重试')
      imageCropSessionRef.current = null
      invalidatedCropDecodeIdentityRef.current = null
      return 'rejected'
    }

    const result = applyAndCommitLiveEdit(
      session.startDocument,
      {
        type: 'node/update-image-crop',
        slideId: session.slideId,
        path: [...session.path],
        patch: {
          ...update,
          framing: { ...update.framing },
        },
      },
      imageCropUpdateChangesNode(session.startNode, update),
      '调整裁切',
    )
    setOperationNotice(result === 'rejected' ? '图片裁剪未能应用，请重试' : null)
    imageCropSessionRef.current = null
    invalidatedCropDecodeIdentityRef.current = null
    return result
  }

  function replaceSessionFraming(
    session: ImageFramingSession,
    framing: ImageFraming,
  ): boolean {
    if (framingSessionRef.current !== session) return false
    const current = currentTargetForFramingSession(session)
    if (!current || current.target.fit !== 'cover') return false
    if (imageFramingEquals(current.target.framing, framing)) return false
    replaceCurrent(imageFramingUpdateAction(
      session.slideId,
      session.path,
      current.target,
      framing,
    ))
    return true
  }

  function clearImageFramingSession() {
    framingSessionRef.current = null
    framingDragPointerIdRef.current = null
    setFramingSession(null)
  }

  function startImageFraming(path: ScenePath): boolean {
    if (framingSessionRef.current || blockDocumentMutationDuringInteraction()) return false
    const document = currentDocumentRef.current
    const slide = document.slides.find((candidate) => candidate.id === document.activeSlideId)
    if (!slide || slide.id !== activeSlide.id) return false
    const directPath = directChildPathForScope(slide.nodes, activeGroupPath, path)
    if (!directPath || scenePathKey(directPath) !== scenePathKey(path)) return false
    const state = effectiveSceneState(slide.nodes, path)
    if (!state || state.locked || state.hidden) return false
    const target = imageFramingTargetForNode(findNodeAtPath(slide.nodes, path))
    if (!target || target.fit !== 'cover') return false
    if (
      target.targetKind === 'shape-fill'
      && shapeFillOperationTokensRef.current.has(shapeFillOperationKey(
        documentIdentityGenerationRef.current,
        slide.id,
        path,
      ))
    ) return false
    const identity = imageDecodeIdentityForTarget(
      documentIdentityGenerationRef.current,
      slide.id,
      path,
      target,
    )
    const naturalSize = readReadyImage(imageReadinessRef.current, identity)
    if (!naturalSize) return false

    const session: ImageFramingSession = {
      scopeGeneration: documentIdentityGenerationRef.current,
      draftScopeKey: imageFramingScopeKey(
        documentIdentityGenerationRef.current,
        currentUserIdRef.current,
        currentDraftIdRef.current,
      ),
      slideId: slide.id,
      path: [...path],
      targetKind: target.targetKind,
      logicalSrc: target.logicalSrc,
      resolvedSrc: target.resolvedSrc,
      naturalSize: { ...naturalSize },
      startDocument: document,
      startFraming: { ...target.framing },
    }
    blurActiveTypingTarget()
    setSelection([path[path.length - 1]])
    framingSessionRef.current = session
    setFramingSession(session)
    setOperationNotice(null)
    requestAnimationFrame(() => framingSurfaceRef.current?.focus())
    return true
  }

  function finishImageFraming() {
    const session = framingSessionRef.current
    if (!session) return
    if (!framingSessionBelongsToCurrentScope(session)) {
      clearImageFramingSession()
      return
    }
    const current = currentTargetForFramingSession(session)
    if (!current || imageFramingEquals(current.target.framing, session.startFraming)) {
      cancelLiveEdit(session.startDocument)
    } else {
      commitLiveEdit(session.startDocument, '调整取景')
    }
    clearImageFramingSession()
  }

  function cancelImageFraming() {
    const session = framingSessionRef.current
    if (!session) return
    if (framingSessionBelongsToCurrentScope(session)) {
      cancelLiveEdit(session.startDocument)
    }
    clearImageFramingSession()
  }

  function cancelFramingBeforeTransition(
    scopeUserId = currentUserIdRef.current,
    scopeDraftId = currentDraftIdRef.current,
  ) {
    const cropSession = imageCropSessionRef.current
    if (cropSession) {
      if (currentTargetForImageCropSession(cropSession, scopeUserId, scopeDraftId)) {
        finishImageCrop('transition', scopeUserId, scopeDraftId)
      } else {
        clearImageCropSession()
      }
    }
    const session = framingSessionRef.current
    if (session) {
      if (currentTargetForFramingSession(session, scopeUserId, scopeDraftId)) {
        cancelLiveEdit(session.startDocument)
      }
      clearImageFramingSession()
    }
    invalidatedCropDecodeIdentityRef.current = null
    clearAllImageReadinessNow()
  }

  function resetSelectedImageFraming() {
    if (!selectedPath || !selectedImageTarget || !canResetSelectedFraming) return
    applyAction(imageFramingUpdateAction(
      activeSlide.id,
      selectedPath,
      selectedImageTarget,
      createDefaultImageFraming(),
    ))
  }

  function updateImageFramingZoom(zoom: number) {
    const session = framingSessionRef.current
    if (!session) return
    const current = currentTargetForFramingSession(session)
    if (!current) return
    replaceSessionFraming(session, {
      ...current.target.framing,
      zoom: clampImageZoom(zoom),
    })
  }

  function nudgeImageFraming(localDelta: { x: number; y: number }) {
    const session = framingSessionRef.current
    if (!session) return
    const current = currentTargetForFramingSession(session)
    if (!current) return
    replaceSessionFraming(session, panImageFraming({
      naturalSize: session.naturalSize,
      frameSize: current.target.frameSize,
      framing: current.target.framing,
      localDelta,
    }))
  }

  function onImageFramingPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (
      !event.isPrimary
      || event.button !== 0
      || framingDragPointerIdRef.current !== null
    ) return
    const session = framingSessionRef.current
    const current = session ? currentTargetForFramingSession(session) : null
    const worldMatrix = session && current
      ? sceneWorldMatrixAtPath(current.slide.nodes, session.path)
      : null
    if (!session || !current || !worldMatrix || renderScale === null) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    const pointerId = event.pointerId
    framingDragPointerIdRef.current = pointerId
    const startClient = { x: event.clientX, y: event.clientY }
    const startFraming = { ...current.target.framing }
    const frameSize = { ...current.target.frameSize }
    const activeRenderScale = renderScale
    let finished = false

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      if (framingDragPointerIdRef.current === pointerId) {
        framingDragPointerIdRef.current = null
      }
    }
    const onMove = (moveEvent: PointerEvent) => {
      if (finished || moveEvent.pointerId !== pointerId) return
      moveEvent.preventDefault()
      replaceSessionFraming(session, panImageFramingFromScreen({
        naturalSize: session.naturalSize,
        frameSize,
        framing: startFraming,
        screenDelta: {
          x: moveEvent.clientX - startClient.x,
          y: moveEvent.clientY - startClient.y,
        },
        renderScale: activeRenderScale,
        worldMatrix,
      }))
    }
    const onUp = (upEvent: PointerEvent) => {
      if (finished || upEvent.pointerId !== pointerId) return
      finished = true
      cleanup()
    }
    const restoreDragSegment = () => {
      if (finished) return
      finished = true
      cleanup()
      replaceSessionFraming(session, startFraming)
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) restoreDragSegment()
    }
    const onBlur = () => restoreDragSegment()

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }

  useEffect(() => {
    if (!framingSession) return
    const frame = requestAnimationFrame(() => framingSurfaceRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [framingSession])

  useEffect(() => {
    if (isActive) return
    if (framingSessionRef.current || imageCropSessionRef.current) {
      cancelFramingBeforeTransition()
    }
  }, [isActive])

  function selectSlide(slideId: string) {
    if (framingSessionRef.current || imageCropSessionRef.current) {
      cancelFramingBeforeTransition()
    }
    if (blockDocumentMutationDuringInteraction()) return
    if (slideId === activeSlide.id) return
    clearActiveSlideImageReadiness(activeSlide.id)
    replaceCurrent({ type: 'slide/select', slideId })
    setSelection([])
  }

  function addSlide() {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/add-after-active' })
    setSelection([])
  }

  function duplicateSlide(slideId: string = activeSlide.id) {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/duplicate', slideId })
    setSelection([])
  }

  const [renamingSlideId, setRenamingSlideId] = useState<string | null>(null)
  const [slideRenameValue, setSlideRenameValue] = useState('')
  const slideRenameCompositionRef = useRef(false)
  const slideRenameInputRef = useRef<HTMLInputElement>(null)

  function beginSlideRename(slideId: string) {
    const slide = doc.slides.find((candidate) => candidate.id === slideId)
    if (!slide) return
    slideRenameCompositionRef.current = false
    setRenamingSlideId(slideId)
    setSlideRenameValue(slide.name)
    requestAnimationFrame(() => {
      slideRenameInputRef.current?.focus()
      slideRenameInputRef.current?.select()
    })
  }

  /** Empty names keep the current one; an unchanged name records no history. */
  function commitSlideRename() {
    slideRenameCompositionRef.current = false
    const slideId = renamingSlideId
    const slide = doc.slides.find((candidate) => candidate.id === slideId)
    if (slideId && slide) {
      const nextName = slideRenameValue.trim()
      if (nextName && nextName !== slide.name) {
        applyAction({ type: 'slide/update', slideId, patch: { name: nextName } })
      }
    }
    setRenamingSlideId(null)
    setSlideRenameValue('')
  }

  function cancelSlideRename() {
    slideRenameCompositionRef.current = false
    setRenamingSlideId(null)
    setSlideRenameValue('')
  }

  function deleteSlide(slideId: string = activeSlide.id) {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/delete', slideId })
    setSelection([])
  }

  function reorderSlide(slideId: string, targetIndex: number) {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/reorder', slideId, targetIndex })
    setSelection([])
  }

  /** Insertion index for a drop on a thumbnail half, mapped to the post-removal order. */
  function slideDropTargetIndex(sourceId: string, targetSlideId: string, after: boolean) {
    const sourceIndex = doc.slides.findIndex((slide) => slide.id === sourceId)
    const targetSlideIndex = doc.slides.findIndex((slide) => slide.id === targetSlideId)
    if (sourceIndex < 0 || targetSlideIndex < 0) return null
    const insertion = after ? targetSlideIndex + 1 : targetSlideIndex
    return insertion > sourceIndex ? insertion - 1 : insertion
  }

  function onSlideThumbContextMenu(event: React.MouseEvent<HTMLButtonElement>, slideId: string) {
    if (framingSessionRef.current || imageCropSessionRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (slideId !== activeSlide.id) selectSlide(slideId)
    setContextMenu(null)
    setSlideContextMenu({ slideId, x: event.clientX, y: event.clientY })
  }

  function selectInsertedNode(
    parentPath: ScenePath,
    nodeId: string,
    onlyIfScopeIsCurrent = false,
  ) {
    setSceneUiState((current) => {
      if (
        onlyIfScopeIsCurrent &&
        scenePathKey(current.activeGroupPath) !== scenePathKey(parentPath)
      ) return current
      return {
        ...current,
        activeGroupPath: [...parentPath],
        selectionPaths: [[...parentPath, nodeId]],
      }
    })
  }

  function insertNewElement(element: FreeformElement): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    const parentPath = [...activeGroupPath]
    const node = centerNewElementInScope(element, activeSlide.nodes, parentPath)
    const changed = applyAction({
      type: 'node/insert-children',
      slideId: activeSlide.id,
      parentPath,
      nodes: [node],
    })
    if (changed) {
      selectInsertedNode(parentPath, node.id)
      return true
    }
    if (effectiveSceneState(activeSlide.nodes, parentPath)?.locked) {
      showLockedOperationNotice()
    } else {
      setOperationNotice(sceneStructureFailureMessage('insert', 'invalid-selection'))
    }
    return false
  }

  function addText() {
    insertNewElement(createTextElement(activeSlide))
  }

  function addShape(shape: FreeformShapeElement['shape']) {
    insertNewElement(createShapeElement(activeSlide, shape))
  }

  function addLine(lineKind: FreeformLineElement['lineKind']) {
    insertNewElement(createLineElement(activeSlide, lineKind))
  }

  async function addImageFromFile(file: File) {
    if (blockDocumentMutationDuringInteraction()) return
    const targetIdentityGeneration = documentIdentityGenerationRef.current
    const targetUserId = currentUserIdRef.current
    const targetSlideId = activeSlide.id
    const targetParentPath = [...activeGroupPath]
    if (store.remote) await retainImagesNow()
    const raw = await readFileAsDataUrl(file)
    const downscaled = await downscaleDataUrl(raw, 1800)
    const src = await store.images.put(downscaled)
    if (
      targetIdentityGeneration !== documentIdentityGenerationRef.current ||
      targetUserId !== currentUserIdRef.current
    ) return
    if (blockDocumentMutationDuringInteraction()) return
    const currentSlide = currentDocumentRef.current.slides.find((slide) => slide.id === targetSlideId)
    if (!currentSlide) return
    const element = centerNewElementInScope(
      createImageElement(currentSlide, src, file.name),
      currentSlide.nodes,
      targetParentPath,
    )
    if (applyAction({
      type: 'node/insert-children',
      slideId: targetSlideId,
      parentPath: targetParentPath,
      nodes: [element],
    })) {
      if (currentDocumentRef.current.activeSlideId === targetSlideId) {
        selectInsertedNode(targetParentPath, element.id, true)
      }
    } else if (effectiveSceneState(currentSlide.nodes, targetParentPath)?.locked) {
      showLockedOperationNotice()
    } else {
      setOperationNotice(sceneStructureFailureMessage('insert', 'invalid-selection'))
    }
  }

  async function handleImageInput(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      await addImageFromFile(file)
    } catch (error) {
      showOperationError(error, '图片插入失败，请稍后重试')
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  async function fillSelectedShapeFromFile(file: File) {
    const targetPath = selectedPath ? [...selectedPath] : null
    const targetSlideId = activeSlide.id
    const targetIdentityGeneration = documentIdentityGenerationRef.current
    const targetUserId = currentUserIdRef.current
    const targetNode = targetPath
      ? findNodeAtPath(
          currentDocumentRef.current.slides.find((slide) => slide.id === targetSlideId)?.nodes ?? [],
          targetPath,
        )
      : undefined
    if (targetNode?.type !== 'shape' || !targetPath) return
    const operation = beginShapeFillOperation(targetSlideId, targetPath)
    try {
      if (store.remote) await retainImagesNow()
      const raw = await readFileAsDataUrl(file)
      const downscaled = await downscaleDataUrl(raw, 1800)
      const src = await store.images.put(downscaled)
      if (
        shapeFillOperationTokensRef.current.get(operation.key) !== operation.token ||
        targetIdentityGeneration !== documentIdentityGenerationRef.current ||
        targetUserId !== currentUserIdRef.current
      ) return
      if (blockDocumentMutationDuringInteraction()) return
      const currentSlide = currentDocumentRef.current.slides.find((slide) => slide.id === targetSlideId)
      const currentTarget = currentSlide ? findNodeAtPath(currentSlide.nodes, targetPath) : undefined
      if (currentTarget?.type !== 'shape') return
      updateNodeStyleAtPath(targetSlideId, targetPath, {
        fill: {
          type: 'image',
          src,
          fit: 'cover',
          framing: createDefaultImageFraming(),
        },
      })
    } finally {
      finishShapeFillOperation(operation)
    }
  }

  async function handleShapeFillInput(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      await fillSelectedShapeFromFile(file)
    } catch (error) {
      showOperationError(error, '形状图片填充失败，请稍后重试')
    } finally {
      if (shapeFillInputRef.current) shapeFillInputRef.current.value = ''
    }
  }

  function deleteSelection() {
    if (selection.length === 0) return
    if (blockDocumentMutationDuringInteraction()) return
    const changed = applyAction({
      type: 'node/delete',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodeIds: selection,
    })
    if (changed) {
      setSelection([])
    } else if (effectiveLockedSelection || lockedDescendantSelection) {
      showLockedOperationNotice()
    }
  }

  function copySelection() {
    if (selection.length === 0) return
    const children = getChildrenAtPath(activeSlide.nodes, activeGroupPath) ?? []
    const selected = children.filter((node) => selection.includes(node.id))
    const sourceParentWorld = sceneParentWorldMatrix(activeSlide.nodes, activeGroupPath)
    if (!sourceParentWorld || selected.length === 0) return
    setClipboard({
      nodes: structuredClone(selected),
      sourceParentWorld: [...sourceParentWorld],
    })
  }

  /** Ctrl/⌘+D: duplicate the selection in place and select the fresh copies. */
  function duplicateSelection() {
    if (selection.length === 0) return
    const slideBefore = currentDocumentRef.current.slides.find(
      (slide) => slide.id === activeSlide.id,
    )
    const childrenBefore = slideBefore
      ? getChildrenAtPath(slideBefore.nodes, activeGroupPath)
      : undefined
    if (!childrenBefore) return
    const idsBefore = new Set(childrenBefore.map((node) => node.id))
    const changed = applyAction({
      type: 'node/clone',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodeIds: selection,
    }, '原位复制')
    if (!changed) {
      if (effectiveLockedSelection || lockedDescendantSelection) showLockedOperationNotice()
      return
    }
    const slideAfter = currentDocumentRef.current.slides.find(
      (slide) => slide.id === activeSlide.id,
    )
    const childrenAfter = slideAfter
      ? getChildrenAtPath(slideAfter.nodes, activeGroupPath)
      : undefined
    const clones = (childrenAfter ?? []).filter((node) => !idsBefore.has(node.id))
    setSelection(clones.map((node) => node.id))
  }

  function pasteClipboard(inPlace = false) {
    if (!clipboard || clipboard.nodes.length === 0) return
    if (blockDocumentMutationDuringInteraction()) return
    const targetParentWorld = sceneParentWorldMatrix(activeSlide.nodes, activeGroupPath)
    const inverseTarget = targetParentWorld ? invert(targetParentWorld) : null
    if (!targetParentWorld || !inverseTarget) return
    // A normal paste offsets the copies; paste-in-place keeps the source
    // coordinates exactly (Photoshop semantics — useful across pages).
    const offset = translation(inPlace ? 0 : 16, inPlace ? 0 : 16)
    const pasted = cloneSceneNodes(clipboard.nodes).flatMap((node) => {
      const localMatrix = multiply(
        inverseTarget,
        multiply(offset, multiply(clipboard.sourceParentWorld, sceneNodeLocalMatrix(node))),
      )
      const transformed = sceneNodeWithLocalMatrix(node, localMatrix)
      return transformed ? [transformed]
        : []
    })
    if (pasted.length !== clipboard.nodes.length) {
      setOperationNotice('无法在当前编辑范围内粘贴对象')
      return
    }
    const changed = applyAction({
      type: 'node/insert-children',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodes: pasted,
    }, inPlace ? '原位粘贴' : undefined)
    if (changed) {
      setSelection(pasted.map((node) => node.id))
    } else if (
      effectiveLockedSelection ||
      effectiveSceneState(activeSlide.nodes, activeGroupPath)?.locked
    ) {
      showLockedOperationNotice()
    }
  }

  /** Ctrl/⌘+X: copy the selection to the clipboard, then remove it — one undo step. */
  function cutSelection() {
    if (selection.length === 0) return
    copySelection()
    const changed = applyAction({
      type: 'node/delete',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodeIds: selection,
    }, '剪切对象')
    if (changed) {
      setSelection([])
    } else if (effectiveLockedSelection || lockedDescendantSelection) {
      showLockedOperationNotice()
    }
  }

  function groupSelection(): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    const parentPath = [...activeGroupPath]
    const nodeIds = selectionPaths
      .filter((path) => scenePathKey(path.slice(0, -1)) === scenePathKey(parentPath))
      .map((path) => path[path.length - 1])
    const currentSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === activeSlide.id,
    )
    if (!currentSlide || nodeIds.length !== selectionPaths.length) {
      setOperationNotice(sceneStructureFailureMessage('group', 'invalid-selection'))
      return false
    }

    const groupId = crypto.randomUUID()
    const mutation = createSceneGroup(currentSlide.nodes, parentPath, nodeIds, {
      id: groupId,
      name: '组',
    })
    if (!mutation.ok) {
      setOperationNotice(sceneStructureFailureMessage('group', mutation.reason))
      return false
    }

    const changed = applyAction({
      type: 'group/create',
      slideId: currentSlide.id,
      parentPath,
      nodeIds,
      groupId,
      name: '组',
    })
    const committedSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === currentSlide.id,
    )
    const groupPath = [...parentPath, groupId]
    if (!changed || findNodeAtPath(committedSlide?.nodes ?? [], groupPath)?.type !== 'group') {
      setOperationNotice('组合未能应用到当前文档，请重试')
      return false
    }

    setOperationNotice(null)
    setSceneUiState((current) => ({
      ...current,
      activeGroupPath: parentPath,
      selectionPaths: [groupPath],
    }))
    return true
  }

  function ungroupSelection(): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    const parentPath = [...activeGroupPath]
    const groupIds = selectionPaths
      .filter((path) => scenePathKey(path.slice(0, -1)) === scenePathKey(parentPath))
      .map((path) => path[path.length - 1])
    const currentSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === activeSlide.id,
    )
    if (!currentSlide || groupIds.length !== selectionPaths.length || groupIds.length === 0) {
      setOperationNotice(sceneStructureFailureMessage('ungroup', 'not-group'))
      return false
    }

    const mutation = ungroupSceneGroups(currentSlide.nodes, parentPath, groupIds, 'one-level')
    if (!mutation.ok) {
      setOperationNotice(sceneStructureFailureMessage('ungroup', mutation.reason))
      return false
    }
    const changed = applyAction({
      type: 'group/ungroup',
      slideId: currentSlide.id,
      parentPath,
      groupIds,
      mode: 'one-level',
    })
    const committedSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === currentSlide.id,
    )
    const promotedPaths = mutation.selectionIds
      .map((id) => [...parentPath, id])
      .filter((path) => Boolean(findNodeAtPath(committedSlide?.nodes ?? [], path)))
    if (!changed || promotedPaths.length !== mutation.selectionIds.length) {
      setOperationNotice('解组未能应用到当前文档，请重试')
      return false
    }

    setOperationNotice(null)
    setSceneUiState((current) => ({
      ...current,
      activeGroupPath: parentPath,
      selectionPaths: promotedPaths,
    }))
    return true
  }

  function enterSelectedGroup(): boolean {
    if (selectionPaths.length !== 1) return false
    const path = selectionPaths[0]
    const node = findNodeAtPath(activeSlide.nodes, path)
    if (
      node?.type !== 'group' ||
      scenePathKey(path.slice(0, -1)) !== scenePathKey(activeGroupPath)
    ) return false
    setSceneUiState((current) => ({
      ...current,
      activeGroupPath: [...path],
      selectionPaths: [],
    }))
    return true
  }

  function exitGroupScope() {
    setSceneUiState((current) => {
      if (current.activeGroupPath.length === 0) {
        return { ...current, selectionPaths: [] }
      }
      return {
        ...current,
        activeGroupPath: current.activeGroupPath.slice(0, -1),
        selectionPaths: [],
      }
    })
  }

  function reorderSelection(direction: 'forward' | 'backward' | 'front' | 'back') {
    if (selection.length === 0) return
    const changed = applyAction({
      type: 'node/reorder',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodeIds: selection,
      direction,
    })
    if (!changed && (effectiveLockedSelection || lockedDescendantSelection)) {
      showLockedOperationNotice()
    }
  }

  function selectLayerPath(path: ScenePath, options: { toggle: boolean }): boolean {
    if (path.length === 0 || !findNodeAtPath(activeSlide.nodes, path)) return false
    const parentPath = path.slice(0, -1)
    if (
      options.toggle &&
      selectionPaths.length > 0 &&
      scenePathKey(activeGroupPath) !== scenePathKey(parentPath)
    ) return false

    setSceneUiState((current) => {
      if (!options.toggle) return {
        ...current,
        activeGroupPath: [...parentPath],
        selectionPaths: [[...path]],
      }
      const existing = normalizeSceneSelection(activeSlide.nodes, parentPath, current.selectionPaths)
      const key = scenePathKey(path)
      const hasPath = existing.some((candidate) => scenePathKey(candidate) === key)
      return {
        ...current,
        activeGroupPath: [...parentPath],
        selectionPaths: hasPath
          ? existing.filter((candidate) => scenePathKey(candidate) !== key)
          : [...existing, [...path]],
      }
    })
    return true
  }

  function renameLayer(path: ScenePath, name: string): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    return applyAction({ type: 'node/rename', slideId: activeSlide.id, path, name })
  }

  function setLayerLocked(path: ScenePath, locked: boolean): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    return applyAction({ type: 'node/set-locked', slideId: activeSlide.id, path, locked })
  }

  function setLayerHidden(path: ScenePath, hidden: boolean): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    return applyAction({ type: 'node/set-hidden', slideId: activeSlide.id, path, hidden })
  }

  function reorderLayers(
    parentPath: ScenePath,
    nodeIds: readonly string[],
    direction: 'forward' | 'backward' | 'front' | 'back',
  ): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    const selectedAtParent = selectionPaths.filter(
      (path) => scenePathKey(path.slice(0, -1)) === scenePathKey(parentPath),
    )
    const selectedIds = selectedAtParent.map((path) => path[path.length - 1])
    const useSelection = nodeIds.every((id) => selectedIds.includes(id))
    return applyAction({
      type: 'node/reorder',
      slideId: activeSlide.id,
      parentPath,
      nodeIds: useSelection && selectedIds.length > 0 ? selectedIds : [...nodeIds],
      direction,
    })
  }

  function reorderLayersAbove(
    parentPath: ScenePath,
    nodeIds: readonly string[],
    targetNodeId: string,
  ): boolean {
    if (blockDocumentMutationDuringInteraction()) return false
    const selectedAtParent = selectionPaths.filter(
      (path) => scenePathKey(path.slice(0, -1)) === scenePathKey(parentPath),
    )
    const selectedIds = selectedAtParent.map((path) => path[path.length - 1])
    const useSelection = nodeIds.every((id) => selectedIds.includes(id))
    const movingIds = useSelection && selectedIds.length > 0 ? selectedIds : [...nodeIds]
    if (movingIds.includes(targetNodeId)) return false
    return applyAction({
      type: 'node/reorder-above',
      slideId: activeSlide.id,
      parentPath,
      nodeIds: movingIds,
      targetNodeId,
    })
  }

  function alignSelection(alignment: Alignment) {
    const selectedNodes = activeChildren.filter((node) => selection.includes(node.id) && !node.hidden)
    if (selectedNodes.length < 1) return
    if (blockDocumentMutationDuringInteraction()) return
    const parentWorld = sceneParentWorldMatrix(activeSlide.nodes, activeGroupPath)
    const inverseParent = parentWorld ? invert(parentWorld) : null
    if (!inverseParent) return
    const entries = selectedNodes.flatMap((node) => {
      const path = [...activeGroupPath, node.id]
      const bounds = sceneNodeBoundsInWorld(activeSlide.nodes, path)
      return bounds ? [{ node, path, bounds }] : []
    })
    if (entries.length !== selectedNodes.length) return

    // A single selected object aligns against its parent container (the
    // enclosing group's world bounds, or the page at the top level); multiple
    // objects keep aligning against the selection's shared bounds.
    const single = entries.length === 1
    const parentBounds = single && activeGroupPath.length > 0
      ? sceneNodeBoundsInWorld(activeSlide.nodes, activeGroupPath)
      : null
    const left = single
      ? (parentBounds?.x ?? 0)
      : Math.min(...entries.map(({ bounds }) => bounds.x))
    const right = single
      ? (parentBounds ? parentBounds.x + parentBounds.width : activeSlide.width)
      : Math.max(...entries.map(({ bounds }) => bounds.x + bounds.width))
    const top = single
      ? (parentBounds?.y ?? 0)
      : Math.min(...entries.map(({ bounds }) => bounds.y))
    const bottom = single
      ? (parentBounds ? parentBounds.y + parentBounds.height : activeSlide.height)
      : Math.max(...entries.map(({ bounds }) => bounds.y + bounds.height))
    const horizontalCenter = (left + right) / 2
    const verticalCenter = (top + bottom) / 2
    applyAction(
      {
        type: 'node/update-geometry',
        slideId: activeSlide.id,
        updates: entries.map(({ node, path, bounds }) => {
          const dx = alignment === 'left'
            ? left - bounds.x
            : alignment === 'h-center'
              ? horizontalCenter - (bounds.x + bounds.width / 2)
              : alignment === 'right'
                ? right - (bounds.x + bounds.width)
                : 0
          const dy = alignment === 'top'
            ? top - bounds.y
            : alignment === 'v-center'
              ? verticalCenter - (bounds.y + bounds.height / 2)
              : alignment === 'bottom'
                ? bottom - (bounds.y + bounds.height)
                : 0
          const localDelta = transformVector(inverseParent, { x: dx, y: dy })
          return { path, patch: { x: node.x + localDelta.x, y: node.y + localDelta.y } }
        }),
      },
      single ? '对齐到页面' : '对齐',
    )
  }

  function distributeSelection(distribution: Distribution) {
    const selectedNodes = activeChildren.filter((node) => selection.includes(node.id) && !node.hidden)
    if (selectedNodes.length < 3) return
    if (blockDocumentMutationDuringInteraction()) return
    const parentWorld = sceneParentWorldMatrix(activeSlide.nodes, activeGroupPath)
    const inverseParent = parentWorld ? invert(parentWorld) : null
    if (!inverseParent) return

    const entries = selectedNodes.flatMap((node) => {
      const path = [...activeGroupPath, node.id]
      const bounds = sceneNodeBoundsInWorld(activeSlide.nodes, path)
      return bounds ? [{ node, path, bounds }] : []
    })
    if (entries.length !== selectedNodes.length) return
    const sorted = [...entries].sort((a, b) =>
      distribution === 'horizontal' ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y,
    )
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    const start = distribution === 'horizontal' ? first.bounds.x : first.bounds.y
    const end =
      distribution === 'horizontal'
        ? last.bounds.x + last.bounds.width
        : last.bounds.y + last.bounds.height
    const totalSize = sorted.reduce(
      (sum, entry) => sum + (
        distribution === 'horizontal' ? entry.bounds.width : entry.bounds.height
      ),
      0,
    )
    const gap = (end - start - totalSize) / (sorted.length - 1)
    let cursor = start
    const updates = sorted.map(({ node, path, bounds }) => {
      const delta = cursor - (distribution === 'horizontal' ? bounds.x : bounds.y)
      cursor += (distribution === 'horizontal' ? bounds.width : bounds.height) + gap
      const localDelta = transformVector(inverseParent, distribution === 'horizontal'
        ? { x: delta, y: 0 }
        : { x: 0, y: delta })
      return {
        path,
        patch: { x: node.x + localDelta.x, y: node.y + localDelta.y },
      }
    })
    applyAction({ type: 'node/update-geometry', slideId: activeSlide.id, updates }, '分布')
  }

  /** Jump the timeline to any past or future state in one step. */
  function jumpToHistoryState(kind: 'past' | 'future', index: number) {
    if (blockDocumentMutationDuringInteraction()) return
    let changed = false
    updateHistory((current) => {
      const next = jumpHistory(current, { kind, index })
      changed = next !== current
      return next
    })
    if (changed) {
      inspectorNumberResetGenerationRef.current += 1
      setSelection([])
      setSavedAt(null)
    }
  }

  function applySlideSize(width: number, height: number) {
    if (activeSlide.width === width && activeSlide.height === height) return
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/resize', slideId: activeSlide.id, width, height })
  }

  function undoDocument() {
    if (blockDocumentMutationDuringInteraction()) return
    inspectorNumberResetGenerationRef.current += 1
    updateHistory((current) => undo(current))
    setSavedAt(null)
  }

  function redoDocument() {
    if (blockDocumentMutationDuringInteraction()) return
    inspectorNumberResetGenerationRef.current += 1
    updateHistory((current) => redo(current))
    setSavedAt(null)
  }

  function nudgeSelection(dx: number, dy: number) {
    const selectedIds = selectedElementIds.current
    if (selectedIds.length === 0) return

    const nodeById = new Map(activeChildren.map((node) => [node.id, node]))
    const patches = moveSceneNodesWithinSlide(
      activeSlide,
      activeSlide.nodes,
      activeGroupPath,
      selectedIds,
      dx,
      dy,
    ).filter(
      ({ nodeId, patch }) => {
        const node = nodeById.get(nodeId)
        return node && (node.x !== patch.x || node.y !== patch.y)
      },
    )

    if (patches.length === 0) {
      if (effectiveLockedSelection || lockedDescendantSelection) showLockedOperationNotice()
      return
    }
    const changed = applyAction({
      type: 'node/update-geometry',
      slideId: activeSlide.id,
      updates: patches.map(({ nodeId, patch }) => ({
        path: [...activeGroupPath, nodeId],
        patch,
      })),
    })
    if (!changed && (effectiveLockedSelection || lockedDescendantSelection)) showLockedOperationNotice()
  }

  useEffect(() => {
    if (!isActive) return
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const activeCropSession = imageCropSessionRef.current
      if (activeCropSession) {
        if (event.key === 'Escape' || event.key === 'Enter') {
          event.preventDefault()
          finishImageCrop()
          return
        }
        if (
          event.key.startsWith('Arrow')
          || (event.ctrlKey || event.metaKey)
          || ['delete', 'backspace'].includes(key)
        ) event.preventDefault()
        return
      }
      const activeFramingSession = framingSessionRef.current
      if (activeFramingSession) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelImageFraming()
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          finishImageFraming()
          return
        }
        const framingArrow = event.key === 'ArrowLeft'
          ? { x: -(event.shiftKey ? 10 : 1), y: 0 }
          : event.key === 'ArrowRight'
            ? { x: event.shiftKey ? 10 : 1, y: 0 }
            : event.key === 'ArrowUp'
              ? { x: 0, y: -(event.shiftKey ? 10 : 1) }
              : event.key === 'ArrowDown'
                ? { x: 0, y: event.shiftKey ? 10 : 1 }
                : null
        const targetIsFramingRange = event.target instanceof HTMLInputElement
          && event.target.dataset.testid === 'freeform-framing-zoom'
        if (framingArrow && !targetIsFramingRange) {
          event.preventDefault()
          nudgeImageFraming(framingArrow)
          return
        }
        if (
          (event.ctrlKey || event.metaKey)
          || ['delete', 'backspace'].includes(key)
        ) event.preventDefault()
        return
      }
      if ((contextMenu || slideContextMenu) && event.key === 'Escape') {
        event.preventDefault()
        setContextMenu(null)
        setSlideContextMenu(null)
        return
      }
      const isDocumentShortcut = (
        ((event.ctrlKey || event.metaKey) && ['z', 'y', 'c', 'x', 'v', 'g', 'd'].includes(key)) ||
        [
          'arrowleft',
          'arrowright',
          'arrowup',
          'arrowdown',
          'delete',
          'backspace',
          'escape',
          'enter',
          '[',
          ']',
        ].includes(key)
      )
      if ((activeInteractionRef.current || marqueePointerIdRef.current !== null) && isDocumentShortcut) {
        event.preventDefault()
        return
      }
      // Ctrl/⌘+D has no typing meaning anywhere: always duplicate in place and
      // keep the browser's bookmark shortcut out of the way.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyD') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (isTypingTarget(event.target)) return
      // Match on key codes: macOS Option combos remap event.key to special chars.
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyC') {
        event.preventDefault()
        copySelectionStyle()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyV') {
        event.preventDefault()
        pasteStyleToSelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyA') {
        event.preventDefault()
        const selected = new Set(selectedElementIds.current)
        setSelection(activeChildren
          .map((node) => node.id)
          .filter((id) => (event.shiftKey ? !selected.has(id) : true)))
        return
      }
      // ]/[ jump straight to front/back (Figma/FigJam); Ctrl/⌘ steps one
      // layer, Ctrl/⌘+Shift also jumps (Photoshop / Windows Figma). Bare
      // brackets stay behind the typing guard so text input keeps them.
      if (!event.altKey && (event.code === 'BracketRight' || event.code === 'BracketLeft')) {
        const towardTop = event.code === 'BracketRight'
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          reorderSelection(towardTop
            ? (event.shiftKey ? 'front' : 'forward')
            : (event.shiftKey ? 'back' : 'backward'))
          return
        }
        if (!event.shiftKey) {
          event.preventDefault()
          reorderSelection(towardTop ? 'front' : 'back')
          return
        }
      }
      if (
        (event.ctrlKey || event.metaKey)
        && !event.altKey
        && ['=', '+', '-', '_'].includes(event.key)
      ) {
        event.preventDefault()
        zoomCanvasByStep(event.key === '-' || event.key === '_' ? -ZOOM_STEP : ZOOM_STEP)
        return
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === '0') {
        event.preventDefault()
        zoomCanvasToPercent(DEFAULT_ZOOM_PERCENT)
        return
      }
      if (
        event.shiftKey
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && (event.code === 'Digit1' || event.code === 'Digit2')
      ) {
        event.preventDefault()
        if (event.code === 'Digit1') zoomCanvasToPercent(DEFAULT_ZOOM_PERCENT)
        else zoomToSelectionBounds()
        return
      }
      if (
        event.code === 'Space'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.shiftKey
        && !isSpacePanSuppressedTarget(event.target)
      ) {
        event.preventDefault()
        if (!spacePanReadyRef.current) {
          spacePanReadyRef.current = true
          setSpacePanReady(true)
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoDocument()
        else undoDocument()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault()
        redoDocument()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'x') {
        event.preventDefault()
        cutSelection()
        return
      }
      // Shift escalates paste to paste-in-place; check before the plain branch.
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 'v') {
        event.preventDefault()
        pasteClipboard(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'v') {
        event.preventDefault()
        pasteClipboard()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'g') {
        event.preventDefault()
        if (event.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      if (event.key === 'Enter' && isBareEnterContext(event.target) && enterSelectedGroup()) {
        event.preventDefault()
        return
      }
      const nudgeStep = event.shiftKey ? 10 : 1
      const nudgeDelta =
        event.key === 'ArrowLeft'
          ? { dx: -nudgeStep, dy: 0 }
          : event.key === 'ArrowRight'
            ? { dx: nudgeStep, dy: 0 }
            : event.key === 'ArrowUp'
              ? { dx: 0, dy: -nudgeStep }
              : event.key === 'ArrowDown'
                ? { dx: 0, dy: nudgeStep }
                : null
      if (nudgeDelta) {
        if (selectedElementIds.current.length > 0) {
          event.preventDefault()
          nudgeSelection(nudgeDelta.dx, nudgeDelta.dy)
        }
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedElementIds.current.length > 0) {
          event.preventDefault()
          deleteSelection()
        }
      }
      if (event.key === 'Escape') {
        if (activeGroupPath.length > 0 || selectedElementIds.current.length > 0) {
          event.preventDefault()
        }
        exitGroupScope()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Releasing Space (or losing the window) disarms canvas panning.
  useEffect(() => {
    if (!isActive) return
    const releaseSpacePan = () => {
      spacePanReadyRef.current = false
      setSpacePanReady(false)
      setSpacePanning(false)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      releaseSpacePan()
    }
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseSpacePan)
    return () => {
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseSpacePan)
    }
  })

  function onSceneNodePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    leaf: FreeformElement,
    hitPath: ScenePath,
    state: SceneNodePointerState,
  ) {
    // Secondary buttons never start scene gestures; the contextmenu event that
    // follows keeps its original target (an early selection here would cover
    // the click point with fresh overlay chrome and re-target it).
    if (event.button !== 0) return
    if (framingSessionRef.current || imageCropSessionRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const directPath = directChildPathForScope(activeSlide.nodes, activeGroupPath, hitPath)
    if (!directPath) return
    const directNode = findNodeAtPath(activeSlide.nodes, directPath)
    if (!directNode) return
    const id = directPath[directPath.length - 1]

    if (state.locked) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      showLockedOperationNotice()
      return
    }

    if (event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      setSelection((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])
      return
    }

    if (directNode.type === 'group') {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      setSelection([id])
      return
    }
    onElementPointerDown(event, leaf)
  }

  function onSceneNodeDoubleClick(
    event: React.MouseEvent<HTMLDivElement>,
    _leaf: FreeformElement,
    hitPath: ScenePath,
    state: SceneNodePointerState,
  ) {
    if (framingSessionRef.current || imageCropSessionRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const directPath = directChildPathForScope(activeSlide.nodes, activeGroupPath, hitPath)
    const directNode = directPath
      ? findNodeAtPath(activeSlide.nodes, directPath)
      : undefined
    if (!directPath || !directNode) return
    if (
      directNode.type !== 'group'
      && scenePathKey(directPath) === scenePathKey(hitPath)
      && imageFramingTargetForNode(directNode)
    ) {
      event.preventDefault()
      event.stopPropagation()
      if (state.locked || state.hidden) {
        showLockedOperationNotice()
        return
      }
      setSelection([directNode.id])
      if (directNode.type === 'image') startImageCrop(directPath)
      else startImageFraming(directPath)
      return
    }
    if (directNode.type !== 'group') return
    event.preventDefault()
    event.stopPropagation()
    if (state.locked || state.hidden) {
      showLockedOperationNotice()
      return
    }
    setSceneUiState((current) => ({
      ...current,
      activeGroupPath: [...directPath],
      selectionPaths: [],
    }))
  }

  /** "W×H" readout for the live world bounds of the given nodes — the size the selection frame shows on screen. */
  function sizeBadgeText(
    slide: FreeformSlide,
    parentPath: ScenePath,
    ids: readonly string[],
  ): string | null {
    const bounds = sceneWorldBoundsForPaths(
      slide.nodes,
      ids.map((id) => [...parentPath, id]),
    )
    return bounds
      ? `${Math.round(bounds.width)}×${Math.round(bounds.height)}`
      : null
  }

  function beginMovePointerDown(
    event: React.PointerEvent,
    primaryId: string,
    requestedIds?: readonly string[],
  ) {
    // Only the primary button moves objects: a right-button press must stay a
    // no-op so the context menu keeps its original hit target.
    if (event.button !== 0) return
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    blurActiveTypingTarget()
    // startDocument stays the pre-gesture document: it is the undo baseline
    // for the whole drag, including the Alt-duplicate insert below.
    const startDocument = currentDocumentRef.current
    let startSlide = startDocument.slides.find((slide) => slide.id === activeSlide.id)
    let startChildren = startSlide
      ? getChildrenAtPath(startSlide.nodes, activeGroupPath)
      : undefined
    if (!startSlide || !startChildren) return
    const currentSelection = selectedElementIds.current
    const requestedDraggingIds = requestedIds && requestedIds.length > 0
      ? [...requestedIds]
      : currentSelection.includes(primaryId) ? currentSelection : [primaryId]
    const directIds = new Set(startChildren.map((node) => node.id))
    if (requestedDraggingIds.some((id) => !directIds.has(id))) return
    if (!currentSelection.includes(primaryId)) setSelection([primaryId])

    // Alt+drag duplicates the dragged nodes in place first; the insert rides
    // the same live edit, so one undo removes duplicate and move together.
    let draggingIds = requestedDraggingIds
    if (event.altKey) {
      const sourceNodes = startChildren.filter((node) => requestedDraggingIds.includes(node.id))
      if (sourceNodes.length > 0) {
        const duplicates = cloneSceneNodes(sourceNodes)
        let inserted = false
        updateHistory((current) => {
          const next = freeformReducer(current.current, {
            type: 'node/insert-children',
            slideId: activeSlide.id,
            parentPath: activeGroupPath,
            nodes: duplicates,
          })
          if (next === current.current) return current
          inserted = true
          return { ...current, current: next }
        })
        if (inserted) {
          startSlide = currentDocumentRef.current.slides.find(
            (slide) => slide.id === activeSlide.id,
          ) ?? startSlide
          draggingIds = duplicates.map((node) => node.id)
          setSelection(draggingIds)
        }
      }
    }

    const interactionScale = renderScale
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    activeInteractionRef.current = 'move'
    setActiveInteraction('move')

    // Red spacing lines: the non-dragged visible siblings are the references;
    // the page edges only apply at the top level (a group scope measures
    // object-to-object gaps, matching how groups are transparent containers).
    const measurementReferences: MeasurementReference[] = startChildren
      .filter((node) => !draggingIds.includes(node.id) && !node.hidden)
      .flatMap((node) => {
        const bounds = sceneNodeBoundsInWorld(
          startSlide.nodes,
          [...activeGroupPath, node.id],
        )
        return bounds ? [{ ...bounds, source: 'element' as const }] : []
      })
    const measurementPage = activeGroupPath.length === 0
      ? { width: startSlide.width, height: startSlide.height }
      : null

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const rawDx = (moveEvent.clientX - startX) / interactionScale
      const rawDy = (moveEvent.clientY - startY) / interactionScale
      // Hidden guides never snap; a disabled snap toggle keeps the parent
      // clamping but never engages or shows snap lines.
      const snapSlide = viewPrefs.guidesVisible
        ? startSlide
        : { ...startSlide, guides: undefined }
      const snap = snapSceneDrag(
        snapSlide,
        startSlide.nodes,
        activeGroupPath,
        draggingIds,
        rawDx,
        rawDy,
        viewPrefs.snappingEnabled ? {} : { threshold: 0 },
      )
      const patches = moveSceneNodesWithinSlide(
        startSlide,
        startSlide.nodes,
        activeGroupPath,
        draggingIds,
        snap.dx,
        snap.dy,
      )
      setSnapLines(snap.lines)
      updateHistory((current) => {
        const next = freeformReducer(current.current, {
          type: 'node/update-geometry',
          slideId: startSlide.id,
          updates: patches.map(({ nodeId, patch }) => ({
            path: [...activeGroupPath, nodeId],
            patch,
          })),
        })
        return Object.is(next, current.current) ? current : { ...current, current: next }
      })
      const liveSlide = currentDocumentRef.current.slides.find(
        (slide) => slide.id === startSlide.id,
      )
      if (liveSlide) {
        const draggedBounds = sceneWorldBoundsForPaths(
          liveSlide.nodes,
          draggingIds.map((id) => [...activeGroupPath, id]),
        )
        setDragMeasurements(draggedBounds
          ? measureDragDistances(draggedBounds, measurementReferences, measurementPage)
          : [])
        setInteractionBadge(sizeBadgeText(liveSlide, activeGroupPath, draggingIds))
      }
    }

    const cleanupDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setSnapLines([])
      setDragMeasurements([])
      setInteractionBadge(null)
      setActiveInteraction(null)
    }
    const finishDrag = () => {
      cleanupDrag()
      commitLiveEdit(startDocument, event.altKey ? '拖拽复制' : '移动对象')
    }
    const cancelDrag = () => {
      cleanupDrag()
      cancelLiveEdit(startDocument)
    }
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finishDrag()
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cancelDrag()
    }
    const onBlur = () => cancelDrag()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }

  function onElementPointerDown(event: React.PointerEvent, element: FreeformElement) {
    if (blockDocumentMutationDuringInteraction()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (element.locked || element.hidden) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      if (element.locked) showLockedOperationNotice()
      return
    }
    if (event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      setSelection((ids) => ids.includes(element.id)
        ? ids.filter((id) => id !== element.id)
        : [...ids, element.id])
      return
    }
    if (isTypingTarget(event.target)) {
      setSelection([element.id])
      return
    }
    beginMovePointerDown(event, element.id)
  }

  function rawArtboardPointFromClient(clientX: number, clientY: number) {
    const artboard = artboardRef.current
    if (!artboard || renderScale === null) return null
    const bounds = artboard.getBoundingClientRect()
    return {
      x: (clientX - bounds.left) / renderScale,
      y: (clientY - bounds.top) / renderScale,
    }
  }

  /** Zoom while keeping the world point under the given client position stationary. */
  function zoomCanvas(nextPercent: number, clientX: number, clientY: number) {
    if (nextPercent === zoomPercent) return
    const point = rawArtboardPointFromClient(clientX, clientY)
    pendingZoomAnchorRef.current = point
      ? { clientX, clientY, worldX: point.x, worldY: point.y }
      : null
    setZoomPercent(clampZoomPercent(nextPercent))
  }

  /** Keyboard zoom anchors on the center of the visible stage. */
  function zoomCanvasByStep(step: number) {
    const stage = stageScrollRef.current
    if (!stage) {
      setZoomPercent((value) => clampZoomPercent(value + step))
      return
    }
    const rect = stage.getBoundingClientRect()
    zoomCanvas(
      clampZoomPercent(zoomPercent + step),
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    )
  }

  function zoomCanvasToPercent(percent: number) {
    const stage = stageScrollRef.current
    if (!stage) {
      setZoomPercent(clampZoomPercent(percent))
      return
    }
    const rect = stage.getBoundingClientRect()
    zoomCanvas(percent, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  /** Content box of the stage scroll area in client coordinates (scrollbar-aware). */
  function stageContentBox() {
    const stage = stageScrollRef.current
    if (!stage) return null
    const rect = stage.getBoundingClientRect()
    const style = getComputedStyle(stage)
    const borderLeft = cssPixels(style.borderLeftWidth)
    const borderTop = cssPixels(style.borderTopWidth)
    const paddingLeft = cssPixels(style.paddingLeft)
    const paddingTop = cssPixels(style.paddingTop)
    const width = stage.clientWidth - paddingLeft - cssPixels(style.paddingRight)
    const height = stage.clientHeight - paddingTop - cssPixels(style.paddingBottom)
    return {
      clientLeft: rect.left + borderLeft + paddingLeft,
      clientTop: rect.top + borderTop + paddingTop,
      width,
      height,
    }
  }

  /** Zoom so the selection bounds fit the stage, centered after layout settles. */
  function zoomToSelectionBounds() {
    if (selectionPaths.length === 0 || fitScale === null) return
    const box = stageContentBox()
    if (!box || box.width <= 0 || box.height <= 0) return
    const boundsList = selectionPaths.flatMap((path) => {
      const bounds = sceneNodeBoundsInWorld(activeSlide.nodes, path)
      return bounds ? [bounds] : []
    })
    if (boundsList.length !== selectionPaths.length || boundsList.length === 0) return
    const left = Math.min(...boundsList.map((bounds) => bounds.x))
    const top = Math.min(...boundsList.map((bounds) => bounds.y))
    const right = Math.max(...boundsList.map((bounds) => bounds.x + bounds.width))
    const bottom = Math.max(...boundsList.map((bounds) => bounds.y + bounds.height))
    const width = right - left
    const height = bottom - top
    if (!(width > 0) || !(height > 0)) return
    const next = zoomPercentForBounds(fitScale, box.width, box.height, width, height)
    if (next === null || next === zoomPercent) return
    // Scrollbars may appear once the canvas grows past the stage, so the
    // centering is applied post-layout (in the zoom apply effect) rather
    // than pinned to the current client point here.
    pendingZoomCenterRef.current = {
      worldX: left + width / 2,
      worldY: top + height / 2,
    }
    setZoomPercent(next)
  }

  /** Copy the paint/typography/effect fields of the first selected leaf. */
  function copySelectionStyle() {
    const source = selectionPaths
      .map((path) => findNodeAtPath(activeSlide.nodes, path))
      .find((node) => node !== undefined && node.type !== 'group')
    if (!source) return
    setStyleClipboard(copyStylePatch(source))
  }

  /** Apply the copied style to every selected leaf in one history entry. */
  function pasteStyleToSelection() {
    if (!styleClipboard) return
    if (blockDocumentMutationDuringInteraction()) return
    const updates = selectionPaths.flatMap((path) => {
      const node = findNodeAtPath(activeSlide.nodes, path)
      if (!node || node.type === 'group') return []
      const patch = pasteStylePatch(styleClipboard, node.type)
      if (Object.keys(patch).length === 0) return []
      return [{ path: [...path], patch }]
    })
    if (updates.length === 0) return
    const changed = applyAction({
      type: 'node/update-style',
      slideId: activeSlide.id,
      updates,
    })
    if (!changed && (effectiveLockedSelection || lockedDescendantSelection)) {
      showLockedOperationNotice()
    }
  }

  // Space-held panning drags the scroll container itself; the capture phase
  // keeps node pointer handlers (marquee, move, text editing) out of the way.
  /**
   * Drag a guide line from a ruler (guideId null) or move an existing one.
   * Dragging off the page deletes an existing guide and discards a new one.
   */
  function guideDragPointerDown(
    event: React.PointerEvent<HTMLElement>,
    axis: 'x' | 'y',
    guideId: string | null,
  ) {
    if (event.button !== 0) return
    if (renderScale === null) return
    event.preventDefault()
    event.stopPropagation()
    const slide = activeSlide
    if (!guideId && (slide.guides?.length ?? 0) >= MAX_GUIDES_PER_SLIDE) return
    if (!guideId && !viewPrefs.guidesVisible) updateViewPrefs({ guidesVisible: true })
    const start = rawArtboardPointFromClient(event.clientX, event.clientY)
    if (!start) return
    const pointerId = event.pointerId
    const startPosition = axis === 'x' ? start.x : start.y
    let position = startPosition
    setGuideDrag({ axis, guideId, position })
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const point = rawArtboardPointFromClient(moveEvent.clientX, moveEvent.clientY)
      if (!point) return
      position = axis === 'x' ? point.x : point.y
      setGuideDrag({ axis, guideId, position })
    }
    const stopListening = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onUp = () => {
      stopListening()
      setGuideDrag(null)
      const bound = axis === 'x' ? slide.width : slide.height
      const settled = Math.round(position)
      // preventDefault on the guide's pointerdown suppresses dblclick, so a
      // second tap on the same barely-moved guide is detected manually.
      if (guideId && Math.abs(settled - Math.round(startPosition)) <= 1) {
        const lastTap = guideTapRef.current
        const now = performance.now()
        if (lastTap && lastTap.guideId === guideId && now - lastTap.time < 500) {
          guideTapRef.current = null
          applyAction(
            {
              type: 'guides/set',
              slideId: slide.id,
              guides: (slide.guides ?? []).filter((guide) => guide.id !== guideId),
            },
            '删除参考线',
          )
          return
        }
        guideTapRef.current = { guideId, time: now }
      }
      if (settled < 0 || settled > bound) {
        if (guideId) {
          applyAction(
            {
              type: 'guides/set',
              slideId: slide.id,
              guides: (slide.guides ?? []).filter((guide) => guide.id !== guideId),
            },
            '删除参考线',
          )
        }
        return
      }
      if (guideId) {
        const moved = (slide.guides ?? []).some(
          (guide) => guide.id === guideId && guide.position === settled,
        )
        if (moved) return
        applyAction(
          {
            type: 'guides/set',
            slideId: slide.id,
            guides: (slide.guides ?? []).map((guide) =>
              guide.id === guideId ? { ...guide, position: settled } : guide,
            ),
          },
          '调整参考线',
        )
        return
      }
      applyAction(
        {
          type: 'guides/set',
          slideId: slide.id,
          guides: [
            ...(slide.guides ?? []),
            { id: `guide-${crypto.randomUUID()}`, axis, position: settled },
          ],
        },
        '新增参考线',
      )
    }
    const onCancel = () => {
      stopListening()
      setGuideDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  function onStagePointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (spacePanReadyRef.current) {
      if (framingSessionRef.current || imageCropSessionRef.current) return
      if (event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      setSpacePanning(true)
      const stage = stageScrollRef.current
      if (!stage) return
      const pointerId = event.pointerId
      const startClientX = event.clientX
      const startClientY = event.clientY
      const startScrollLeft = stage.scrollLeft
      const startScrollTop = stage.scrollTop
      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return
        stage.scrollLeft = startScrollLeft - (moveEvent.clientX - startClientX)
        stage.scrollTop = startScrollTop - (moveEvent.clientY - startClientY)
      }
      const finishPan = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
        window.removeEventListener('blur', finishPan)
        setSpacePanning(false)
      }
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId === pointerId) finishPan()
      }
      const onCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId === pointerId) finishPan()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      window.addEventListener('blur', finishPan)
      return
    }
    if (contextMenu) setContextMenu(null)
  }

  /**
   * Geometric fallback for context menus: the pointer can land on selection
   * chrome (the drag/resize/rotate handles sit above the artwork), where the
   * DOM hit carries no scene path. Resolve the topmost scene node whose
   * rendered bounds contain the point instead.
   */
  function scenePathFromClientPoint(clientX: number, clientY: number): ScenePath | null {
    const artboard = artboardRef.current
    if (!artboard) return null
    const nodes = Array.from(artboard.querySelectorAll<HTMLElement>('[data-scene-node-id]'))
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const rect = nodes[index].getBoundingClientRect()
      if (clientX > rect.left && clientX < rect.right && clientY > rect.top && clientY < rect.bottom) {
        const path = scenePathFromDomTarget(nodes[index])
        if (path) return path
      }
    }
    return null
  }

  function onStageContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    if (framingSessionRef.current || imageCropSessionRef.current) return
    if (isTypingTarget(event.target)) return
    event.preventDefault()
    blurActiveTypingTarget()
    const hitPath = scenePathFromDomTarget(event.target)
      ?? scenePathFromClientPoint(event.clientX, event.clientY)
    if (hitPath) {
      const directPath = directChildPathForScope(activeSlide.nodes, activeGroupPath, hitPath)
      if (directPath) {
        const directId = directPath[directPath.length - 1]
        if (!selection.includes(directId)) setSelection([directId])
      }
    } else {
      // Right-clicking bare canvas scopes the menu to paste-only.
      setSelection([])
    }
    setSlideContextMenu(null)
    setContextMenu({ x: event.clientX, y: event.clientY })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function artboardPointFromClient(clientX: number, clientY: number) {
    const point = rawArtboardPointFromClient(clientX, clientY)
    return point ? {
      x: clamp(point.x, 0, activeSlide.width),
      y: clamp(point.y, 0, activeSlide.height),
    } : null
  }

  function onArtboardPointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (!imageCropSessionRef.current) return
    const target = event.target
    if (
      target instanceof Element
      && target.closest('[data-testid="freeform-image-crop-overlay"]')
    ) return
    finishImageCrop('outside')
  }

  function onArtboardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (blockDocumentMutationDuringInteraction()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const start = artboardPointFromClient(event.clientX, event.clientY)
    if (!start) return

    event.preventDefault()
    blurActiveTypingTarget()
    const pointerId = event.pointerId
    marqueePointerIdRef.current = pointerId
    setSelection([])
    setMarquee({
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    })

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      if (marqueePointerIdRef.current === pointerId) marqueePointerIdRef.current = null
    }

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const current = artboardPointFromClient(moveEvent.clientX, moveEvent.clientY)
      if (!current) return
      setMarquee((value) =>
        value ? { ...value, currentX: current.x, currentY: current.y } : value,
      )
    }

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return
      cleanup()
      const current = artboardPointFromClient(upEvent.clientX, upEvent.clientY) ?? start
      const finalMarquee = {
        startX: start.x,
        startY: start.y,
        currentX: current.x,
        currentY: current.y,
      }
      const rect = toRect(finalMarquee)
      setMarquee(null)

      if (Math.hypot(rect.width, rect.height) < 4) {
        setSelection([])
        return
      }

      setSelection(getSceneNodesInMarquee(activeSlide.nodes, activeGroupPath, rect).filter((id) => (
        !effectiveSceneState(activeSlide.nodes, [...activeGroupPath, id])?.locked
      )))
    }

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return
      cleanup()
      setMarquee(null)
    }

    const onBlur = () => {
      cleanup()
      setMarquee(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }

  function onResizePointerDown(event: React.PointerEvent, target: SelectionOverlayTarget) {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const interactionScale = renderScale
    const pointerId = event.pointerId
    const resizeParentPath = [...activeGroupPath]
    event.preventDefault()
    event.stopPropagation()
    blurActiveTypingTarget()
    const startDocument = currentDocumentRef.current
    const startSlide = startDocument.slides.find((slide) => slide.id === activeSlide.id)
    if (!startSlide) return
    const startPaths = target.nodeIds.map((id) => [...resizeParentPath, id])
    const startBounds = sceneWorldBoundsForPaths(startSlide.nodes, startPaths)
    if (!startBounds) return

    const startX = event.clientX
    const startY = event.clientY
    const startPagePoint = rawArtboardPointFromClient(startX, startY)
    if (!startPagePoint) return
    const singleLeaf = target.kind === 'leaf' && target.nodeIds.length === 1
      ? findNodeAtPath(startSlide.nodes, startPaths[0])
      : null
    const startLeaf = singleLeaf?.type === 'group' ? null : singleLeaf
    const startLeafWorld = startLeaf
      ? sceneWorldMatrixAtPath(startSlide.nodes, startPaths[0])
      : null
    const inverseLeafWorld = startLeafWorld ? invert(startLeafWorld) : null
    const startLeafLocal = startLeaf ? sceneNodeLocalMatrix(startLeaf) : null
    const scaleRange = sceneWorldScaleRange(
      startSlide.nodes,
      resizeParentPath,
      target.nodeIds,
    )
    const pivot = target.kind === 'multi'
      ? { x: startBounds.x, y: startBounds.y }
      : target.resizePivot
    const startVector = {
      x: startPagePoint.x - pivot.x,
      y: startPagePoint.y - pivot.y,
    }
    const startLengthSquared = startVector.x ** 2 + startVector.y ** 2
    activeInteractionRef.current = 'resize'
    setActiveInteraction('resize')

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const worldDelta = {
        x: (moveEvent.clientX - startX) / interactionScale,
        y: (moveEvent.clientY - startY) / interactionScale,
      }
      const refreshBadge = () => {
        const liveSlide = currentDocumentRef.current.slides.find(
          (slide) => slide.id === startSlide.id,
        )
        setInteractionBadge(liveSlide
          ? sizeBadgeText(liveSlide, resizeParentPath, target.nodeIds)
          : null)
      }
      if (startLeaf && startLeafWorld && inverseLeafWorld && startLeafLocal) {
        const localDelta = transformVector(inverseLeafWorld, worldDelta)
        const worldScale = decomposeSimilarity(startLeafWorld)?.scale ?? 1
        let width: number
        let height: number
        if (moveEvent.shiftKey && startLengthSquared > Number.EPSILON) {
          // Shift keeps the leaf's aspect ratio: scale both edges by the
          // pointer's distance change from the resize pivot.
          const currentLength = Math.hypot(
            startVector.x + worldDelta.x,
            startVector.y + worldDelta.y,
          )
          const factor = currentLength / Math.sqrt(startLengthSquared)
          width = Math.max(40 / worldScale, startLeaf.width * factor)
          height = Math.max(40 / worldScale, startLeaf.height * factor)
        } else {
          width = Math.max(40 / worldScale, startLeaf.width + localDelta.x)
          height = Math.max(40 / worldScale, startLeaf.height + localDelta.y)
        }
        const resized = sceneNodeWithLocalMatrix(
          { ...startLeaf, width, height },
          startLeafLocal,
        )
        if (!resized || resized.type === 'group') return
        replaceCurrent({
          type: 'node/update-geometry',
          slideId: startSlide.id,
          updates: [{
            path: startPaths[0],
            patch: { x: resized.x, y: resized.y, width, height },
          }],
        })
        refreshBadge()
        return
      }
      if (startLengthSquared <= Number.EPSILON) return
      const currentVector = {
        x: startVector.x + worldDelta.x,
        y: startVector.y + worldDelta.y,
      }
      const requestedFactor = (
        currentVector.x * startVector.x + currentVector.y * startVector.y
      ) / startLengthSquared
      const factor = clamp(requestedFactor, scaleRange.min, scaleRange.max)
      if (!Number.isFinite(factor) || factor <= 0) return
      const transformed = transformSceneNodesByWorldMatrix(
        startSlide.nodes,
        resizeParentPath,
        target.nodeIds,
        matrixAroundPoint(uniformScale(factor), pivot),
      )
      if (!transformed.ok) return
      replaceCurrent({
        type: 'node/update-geometry',
        slideId: startSlide.id,
        updates: geometryUpdatesBetweenSceneTrees(
          startSlide.nodes,
          transformed.nodes,
          resizeParentPath,
          target.nodeIds,
        ),
      })
      refreshBadge()
    }

    const cleanupResize = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setSnapLines([])
      setInteractionBadge(null)
      setActiveInteraction(null)
    }

    const finishResize = () => {
      cleanupResize()
      commitLiveEdit(startDocument, '调整大小')
    }

    const cancelResize = () => {
      cleanupResize()
      cancelLiveEdit(startDocument)
    }

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finishResize()
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cancelResize()
    }
    const onBlur = () => cancelResize()

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }

  function onRotatePointerDown(event: React.PointerEvent, target: SelectionOverlayTarget) {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    blurActiveTypingTarget()
    const startDocument = currentDocumentRef.current
    const startSlide = startDocument.slides.find((slide) => slide.id === activeSlide.id)
    if (!startSlide) return
    const parentPath = [...activeGroupPath]
    const paths = target.nodeIds.map((id) => [...parentPath, id])
    const bounds = sceneWorldBoundsForPaths(startSlide.nodes, paths)
    if (!bounds) return
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    const pointerId = event.pointerId
    const startPoint = rawArtboardPointFromClient(event.clientX, event.clientY)
    if (!startPoint) return
    const startAngle = Math.atan2(
      startPoint.y - center.y,
      startPoint.x - center.x,
    )
    activeInteractionRef.current = 'rotate'
    setActiveInteraction('rotate')

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const point = rawArtboardPointFromClient(moveEvent.clientX, moveEvent.clientY)
      if (!point) return
      const angle = Math.atan2(
        point.y - center.y,
        point.x - center.x,
      )
      const rawDegrees = ((angle - startAngle) * 180) / Math.PI
      // Shift snaps the rotation delta to 15° steps.
      const degrees = moveEvent.shiftKey ? snapRotationDegrees(rawDegrees) : rawDegrees
      const transformed = transformSceneNodesByWorldMatrix(
        startSlide.nodes,
        parentPath,
        target.nodeIds,
        matrixAroundPoint(clockwiseRotation(degrees), center),
      )
      if (!transformed.ok) return
      replaceCurrent({
        type: 'node/update-geometry',
        slideId: startSlide.id,
        updates: geometryUpdatesBetweenSceneTrees(
          startSlide.nodes,
          transformed.nodes,
          parentPath,
          target.nodeIds,
        ),
      })
      setInteractionBadge(`${Math.round(degrees)}°`)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setInteractionBadge(null)
      setActiveInteraction(null)
    }
    const finish = () => {
      cleanup()
      commitLiveEdit(startDocument, '旋转对象')
    }
    const cancel = () => {
      cleanup()
      cancelLiveEdit(startDocument)
    }
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finish()
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cancel()
    }
    const onBlur = () => cancel()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }

  async function renderSlideBlob(slide: FreeformSlide, fontEmbedCSS: string): Promise<Blob | null> {
    const node = artboardRef.current
    if (!node) return null
    const imageWait = await waitForFramedImages(node, {
      timeoutMs: EXPORT_IMAGE_WAIT_MS,
    })
    if (!imageWait.ok) {
      throw new Error(imageWait.reason === 'timeout'
        ? '图片加载超时，导出已取消'
        : '图片加载失败，导出已取消')
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return toBlob(node, {
      pixelRatio: 1,
      width: slide.width,
      height: slide.height,
      style: {
        transform: 'none',
      },
      fontEmbedCSS,
      filter: (element) =>
        !(element instanceof HTMLElement && element.classList.contains('freeform-ui-only')),
    })
  }

  async function freeformFontEmbedOnce(slides: FreeformSlide[]): Promise<string> {
    try {
      return await buildFreeformFontCSS(collectFreeformFontRequests(slides))
    } catch {
      return ''
    }
  }

  async function exportCurrentSlide() {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) return
    setExporting(true)
    try {
      setSelection([])
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const fontCSS = await freeformFontEmbedOnce([activeSlide])
      const blob = await renderSlideBlob(activeSlide, fontCSS)
      if (blob) {
        const activeIndex = Math.max(
          0,
          doc.slides.findIndex((slide) => slide.id === activeSlide.id),
        )
        downloadBlob(blob, slidePngName(activeIndex))
      }
    } catch (error) {
      showOperationError(error, '导出失败，请稍后重试')
    } finally {
      setExporting(false)
    }
  }

  async function exportAllSlides() {
    if (doc.slides.length === 0 || renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) return
    setExporting(true)
    setExportProgress(null)
    const originalSlideId = activeSlide.id
    try {
      setSelection([])
      const fontCSS = await freeformFontEmbedOnce(doc.slides)
      const entries: Array<{ name: string; blob: Blob }> = []
      for (let index = 0; index < doc.slides.length; index++) {
        const slide = doc.slides[index]
        setExportProgress({ current: index + 1, total: doc.slides.length })
        replaceCurrent({ type: 'slide/select', slideId: slide.id })
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const blob = await renderSlideBlob(slide, fontCSS)
        if (blob) entries.push({ name: slidePngName(index), blob })
      }
      if (entries.length > 0) {
        const stamp = new Date().toISOString().slice(0, 10)
        await downloadZip(entries, `freeform-slides-${stamp}.zip`)
      }
    } catch (error) {
      showOperationError(error, '打包导出失败，请稍后重试')
    } finally {
      replaceCurrent({ type: 'slide/select', slideId: originalSlideId })
      setExportProgress(null)
      setExporting(false)
    }
  }

  function requestExportAllSlides() {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) return
    if (hasMixedSlideSizes(doc.slides)) {
      setShowMixedSizeWarning(true)
      return
    }
    void exportAllSlides()
  }

  function continueMixedSizeExport() {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) return
    setShowMixedSizeWarning(false)
    void exportAllSlides()
  }

  async function handleSaveDraft() {
    if (blockDocumentMutationDuringInteraction()) return
    if (!user) {
      requestAuth()
      return
    }
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    const snapshot = doc
    const startedDraftId = currentDraftIdRef.current
    const saveGeneration = ++saveGenerationRef.current
    try {
      const saved = await store.drafts.save(user.id, {
        id: startedDraftId ?? undefined,
        mode: 'freeform-slide',
        document: snapshot,
      })
      const saveIsCurrent = (
        currentUserIdRef.current === user.id &&
        isLatestSaveForDraft(
          saveGeneration,
          saveGenerationRef.current,
          startedDraftId,
          currentDraftIdRef.current,
        )
      )
      const snapshotIsCurrent = Object.is(currentDocumentRef.current, snapshot)
      if (saveIsCurrent) {
        updateDraftId(saved.id)
        updateLastSession(user.id, { freeformDraftId: saved.id })
      }
      if (saveIsCurrent && saved.mode === 'freeform-slide') {
        successfulSaveRef.current = {
          source: snapshot,
          document: saved.document,
          updatedAt: saved.updatedAt,
        }
      }
      if (saveIsCurrent && store.remote && saved.mode === 'freeform-slide') {
        updateHistory((current) => (
          Object.is(current.current, snapshot)
            ? { ...current, current: saved.document }
            : current
        ))
      }
      if (saveIsCurrent) setSavedAt(snapshotIsCurrent ? saved.updatedAt : null)
      if (currentUserIdRef.current === user.id) void refreshDrafts()
    } catch (error) {
      if (
        currentUserIdRef.current !== user.id ||
        !isLatestSaveForDraft(
          saveGeneration,
          saveGenerationRef.current,
          startedDraftId,
          currentDraftIdRef.current,
        )
      ) return
      showOperationError(error, '草稿保存失败，请稍后重试')
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  /** Import a picked/dropped .json file as a draft; freeform drafts open right away. */
  async function importDraftFile(file: File) {
    if (!user) {
      requestAuth()
      return
    }
    if (blockDocumentMutationDuringInteraction()) return
    let text: string
    try {
      text = await file.text()
    } catch {
      showOperationError(new Error('文件读取失败'), '文件读取失败，请重试')
      return
    }
    const outcome = importDraftFromJson(text)
    if (!outcome.ok) {
      showOperationError(new Error(outcome.error), '文件无法识别为叮卡文档')
      return
    }
    try {
      const saved = await store.drafts.save(user.id, outcome.data)
      if (currentUserIdRef.current !== user.id) return
      void refreshDrafts()
      if (saved.mode === 'freeform-slide') {
        openDraft(saved)
      } else {
        setOperationNotice('已导入 Markdown 文档，请在 Markdown 工作台的「我的草稿」打开')
      }
    } catch (error) {
      if (currentUserIdRef.current !== user.id) return
      showOperationError(error, '草稿导入失败，请稍后重试')
    }
  }

  function openDraft(draft: Draft) {
    if (draft.mode !== 'freeform-slide') return
    cancelFramingBeforeTransition()
    if (blockDocumentMutationDuringInteraction()) return
    documentIdentityGenerationRef.current += 1
    shapeFillOperationTokensRef.current.clear()
    setPendingShapeFillKeys(new Set())
    saveGenerationRef.current += 1
    successfulSaveRef.current = {
      source: draft.document,
      document: draft.document,
      updatedAt: draft.updatedAt,
    }
    updateHistory(createHistory(draft.document))
    setSelection([])
    updateDraftId(draft.id)
    setSavedAt(draft.updatedAt)
    setShowDrafts(false)
    if (user) updateLastSession(user.id, { freeformDraftId: draft.id })
  }
  openDraftRef.current = openDraft

  async function removeDraft(id: string) {
    if (!user) return
    if (blockDocumentMutationDuringInteraction()) return
    try {
      if (store.remote) await retainImagesNow()
      if (blockDocumentMutationDuringInteraction()) return
      await store.drafts.remove(user.id, id)
      if (currentUserIdRef.current !== user.id) return
      if (id === currentDraftIdRef.current) {
        cancelFramingBeforeTransition()
        documentIdentityGenerationRef.current += 1
        shapeFillOperationTokensRef.current.clear()
        setPendingShapeFillKeys(new Set())
        saveGenerationRef.current += 1
        successfulSaveRef.current = null
        updateDraftId(null)
        setSavedAt(null)
      }
      if (readLastSession(user.id).freeformDraftId === id) {
        updateLastSession(user.id, { freeformDraftId: null })
      }
      void refreshDrafts()
    } catch (error) {
      if (currentUserIdRef.current === user.id) {
        showOperationError(error, '草稿删除失败，请稍后重试')
      }
    }
  }

  const userTemplateDefinitions = useMemo(
    () => userTemplates.map(userTemplateToDefinition),
    [userTemplates],
  )

  function handleOpenSaveTemplate() {
    if (!user) {
      requestAuth()
      return
    }
    setShowSaveTemplate(true)
  }

  function saveAsTemplate(name: string) {
    if (!user) return
    try {
      const materialized = materializeLocalFreeformImages(doc, store.images)
      const saved = saveUserTemplate(user.id, {
        name,
        pageCount: doc.slides.length,
        draft: { mode: 'freeform-slide', document: materialized },
      })
      if (currentUserIdRef.current === user.id) {
        setUserTemplates(listUserTemplates(user.id))
      }
      setShowSaveTemplate(false)
      setOperationNotice(`已存为模板「${saved.name}」，在模板中心随时可用`)
    } catch (error) {
      showOperationError(error, '模板保存失败，请稍后重试')
    }
  }

  function removeUserTemplate(id: string) {
    if (!user) return
    try {
      deleteUserTemplate(user.id, id)
      if (currentUserIdRef.current === user.id) {
        setUserTemplates(listUserTemplates(user.id))
      }
    } catch (error) {
      showOperationError(error, '模板删除失败，请稍后重试')
    }
  }

  function applyFreeformTemplate(template: TemplateDefinition) {
    if (template.workspace !== 'freeform') return
    cancelFramingBeforeTransition()
    if (blockDocumentMutationDuringInteraction()) return
    const document = template.createFreeform?.()
    if (!document) return
    documentIdentityGenerationRef.current += 1
    inspectorNumberResetGenerationRef.current += 1
    shapeFillOperationTokensRef.current.clear()
    setPendingShapeFillKeys(new Set())
    saveGenerationRef.current += 1
    successfulSaveRef.current = null
    updateHistory(createHistory(document))
    setSceneUiState({
      activeGroupPath: [],
      selectionPaths: [],
      identity: {
        activeSlideId: document.activeSlideId,
        draftId: null,
        userId: currentUserIdRef.current,
      },
    })
    setClipboard(null)
    setMarquee(null)
    setSnapLines([])
    updateDraftId(null)
    setSavedAt(null)
    setShowDrafts(false)
    setShowTemplates(false)
  }

  const framingRenderTarget = framingSession
    ? currentTargetForFramingSession(framingSession)
    : null
  const framingWorldMatrix = framingSession && framingRenderTarget
    ? sceneWorldMatrixAtPath(framingRenderTarget.slide.nodes, framingSession.path)
    : null
  const framingOverlayStyle: CSSProperties | undefined = framingWorldMatrix && framingRenderTarget
    ? {
        ...imageFramingMatrixStyle(framingWorldMatrix),
        width: framingRenderTarget.target.frameSize.width,
        height: framingRenderTarget.target.frameSize.height,
      }
    : undefined
  const framingShapeClass = framingRenderTarget?.target.shape
    ? ` shape-${framingRenderTarget.target.shape}`
    : ''
  const imageCropRenderTarget = imageCropSession
    ? currentTargetForImageCropSession(imageCropSession)
    : null
  const imageCropRenderScale = imageCropSession && imageCropRenderTarget && renderScale !== null
    ? imageCropScreenScale({
        renderScale,
        startWorldMatrix: imageCropSession.startWorldMatrix,
      })
    : null
  const imageCropPathKey = imageCropRenderTarget && imageCropSession
    ? scenePathKey(imageCropSession.path)
    : undefined
  const hasImageEditSession = Boolean(framingSession || imageCropSession)

  const rulerStep = rulerView ? pickRulerStep(rulerView.scale) : 1
  const rulerXTicks = rulerView
    ? rulerTicks(
      -rulerView.left / rulerView.scale,
      (rulerView.width - rulerView.left) / rulerView.scale,
      rulerStep,
    )
    : []
  const rulerYTicks = rulerView
    ? rulerTicks(
      -rulerView.top / rulerView.scale,
      (rulerView.height - rulerView.top) / rulerView.scale,
      rulerStep,
    )
    : []
  const guideDragBound = guideDrag
    ? (guideDrag.axis === 'x' ? activeSlide.width : activeSlide.height)
    : 0
  const guideDragValid = guideDrag !== null
    && guideDrag.position >= 0
    && guideDrag.position <= guideDragBound

  return (
    <div
      className={[
        'freeform-workspace',
        framingSession ? 'is-framing' : '',
        imageCropSession ? 'is-image-cropping' : '',
      ].filter(Boolean).join(' ')}
      aria-label="自由编辑工作区"
      data-history-depth={history.past.length}
    >
      <WorkspaceToolbar
        testId="freeform-toolbar"
        label="自由编辑工具栏"
        className="freeform-toolbar"
        disabled={hasImageEditSession}
      >
        <ToolbarGroup>
          <button className='bar-btn' data-testid='freeform-template-button' onClick={() => setShowTemplates(true)}>
            模板
          </button>
          <div className="freeform-page-context">
            <FreeformPageSizePopover
              isActive={isActive}
              width={activeSlide.width}
              height={activeSlide.height}
              onApply={applySlideSize}
            />
            <span
              className="freeform-page-meta toolbar-collapsible-label"
              data-testid="freeform-slide-meta"
            >
              {doc.slides.length}页
              {savedAt ? '·已保存' : ''}
            </span>
          </div>

          <div className="toolbar-insert-tools" role="group" aria-label="插入工具">
            <button className="bar-btn" type="button" data-testid="insert-text" onClick={addText}>
              文本框
            </button>
            <button
              className="bar-btn"
              type="button"
              data-testid="insert-image"
              onClick={() => imageInputRef.current?.click()}
            >
              图片
            </button>
            <input
              ref={imageInputRef}
              className="freeform-file"
              type="file"
              accept="image/*"
              onChange={(event) => handleImageInput(event.currentTarget.files)}
            />
            <FreeformInsertMenu
              isActive={isActive}
              testId="insert-shape"
              label="形状"
              options={SHAPES}
              onSelect={addShape}
            />
            <FreeformInsertMenu
              isActive={isActive}
              testId="insert-line"
              label="线条"
              options={LINES}
              onSelect={addLine}
            />
          </div>

          <ToolbarDivider />

          <button className="bar-btn" type="button" onClick={undoDocument} disabled={!canUndo}>
            撤销
          </button>
          <button className="bar-btn" type="button" onClick={redoDocument} disabled={!canRedo}>
            重做
          </button>
        </ToolbarGroup>

        <ToolbarGroup side="right">
          <button className="bar-btn" type="button" onClick={handleSaveDraft} disabled={saving}>
            {saving ? '保存中…' : '保存草稿'}
          </button>
          <button
            className="bar-btn"
            type="button"
            data-testid="freeform-save-template-button"
            onClick={handleOpenSaveTemplate}
          >
            存为模板
          </button>
          <button
            className="bar-btn"
            type="button"
            onClick={() => {
              if (!user) {
                requestAuth()
                return
              }
              setShowDrafts(true)
            }}
          >
            我的草稿{user && drafts.length ? ` · ${drafts.length}` : ''}
          </button>
          <button
            className="bar-btn"
            type="button"
            onClick={requestExportAllSlides}
            disabled={exporting || renderScale === null}
          >
            {exportProgress ? `导出 ${exportProgress.current}/${exportProgress.total}` : '打包导出'}
          </button>
          <button
            className="toolbar-primary"
            type="button"
            data-testid="freeform-primary-export"
            onClick={exportCurrentSlide}
            disabled={exporting || renderScale === null}
          >
            {exporting ? '导出中…' : '导出当前页'}
          </button>
        </ToolbarGroup>
      </WorkspaceToolbar>

      {operationNotice && (
        <OperationNotice
          title={operationNotice}
          onDismiss={() => setOperationNotice(null)}
        />
      )}

      <main className="freeform-main">
        <aside className="freeform-rail" aria-label="页面列表">
          <div className="freeform-panel-head">
            <span>页面</span>
            <button
              className="mini-btn freeform-add-page"
              type="button"
              aria-label="新增页面"
              title="新增页面"
              onClick={addSlide}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 4v12M4 10h12" />
              </svg>
            </button>
          </div>
          <div
            className="freeform-slide-list"
            onDragOver={(event) => {
              if (!dragSlideIdRef.current) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              const sourceId = dragSlideIdRef.current
              if (!sourceId) return
              event.preventDefault()
              dragSlideIdRef.current = null
              setSlideDropTarget(null)
              reorderSlide(sourceId, doc.slides.length - 1)
            }}
          >
            {doc.slides.map((slide, index) => (
              <div key={slide.id} className="freeform-thumb-wrap">
                <button
                  type="button"
                  draggable
                  className={`freeform-thumb${slide.id === activeSlide.id ? ' on' : ''}${
                    slideDropTarget?.slideId === slide.id
                      ? slideDropTarget.position === 'before' ? ' drop-before' : ' drop-after'
                      : ''
                  }`}
                  aria-current={slide.id === activeSlide.id ? 'page' : undefined}
                  data-testid="freeform-thumb"
                  onClick={() => selectSlide(slide.id)}
                  onDragStart={(event) => {
                    dragSlideIdRef.current = slide.id
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', slide.id)
                  }}
                  onDragEnd={() => {
                    dragSlideIdRef.current = null
                    setSlideDropTarget(null)
                  }}
                  onDragOver={(event) => {
                    if (!dragSlideIdRef.current || dragSlideIdRef.current === slide.id) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    const bounds = event.currentTarget.getBoundingClientRect()
                    const position: 'before' | 'after' =
                      event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
                    setSlideDropTarget((current) =>
                      current && current.slideId === slide.id && current.position === position
                        ? current
                        : { slideId: slide.id, position },
                    )
                  }}
                  onDragLeave={() => {
                    setSlideDropTarget((current) =>
                      current?.slideId === slide.id ? null : current,
                    )
                  }}
                  onDrop={(event) => {
                    const sourceId = dragSlideIdRef.current
                    if (!sourceId || sourceId === slide.id) return
                    event.preventDefault()
                    event.stopPropagation()
                    dragSlideIdRef.current = null
                    setSlideDropTarget(null)
                    const bounds = event.currentTarget.getBoundingClientRect()
                    const after = event.clientY >= bounds.top + bounds.height / 2
                    const targetIndex = slideDropTargetIndex(sourceId, slide.id, after)
                    if (targetIndex !== null) reorderSlide(sourceId, targetIndex)
                  }}
                  onContextMenu={(event) => onSlideThumbContextMenu(event, slide.id)}
                >
                  <FreeformSlidePreview
                    slide={slide}
                    frameWidth={104}
                    frameHeight={128}
                    className="freeform-thumb-art"
                    deferOffscreen={slide.id !== activeSlide.id}
                  />
                  <span className="freeform-thumb-caption">
                    <span className="freeform-thumb-number">{String(index + 1).padStart(2, '0')}</span>
                    <span
                      className="freeform-thumb-title"
                      data-testid="freeform-thumb-title"
                      title={slide.name}
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        event.preventDefault()
                        beginSlideRename(slide.id)
                      }}
                    >
                      {slide.name}
                    </span>
                  </span>
                </button>
                {renamingSlideId === slide.id && (
                  <input
                    ref={slideRenameInputRef}
                    className="freeform-thumb-rename"
                    data-testid="freeform-thumb-rename"
                    aria-label="重命名页面"
                    value={slideRenameValue}
                    onChange={(event) => setSlideRenameValue(event.currentTarget.value)}
                    onPointerDown={(event) => event.stopPropagation()}
                    onBlur={() => commitSlideRename()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Enter') {
                        if (event.nativeEvent.isComposing || slideRenameCompositionRef.current) return
                        event.preventDefault()
                        commitSlideRename()
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelSlideRename()
                      }
                    }}
                    onCompositionStart={() => {
                      slideRenameCompositionRef.current = true
                    }}
                    onCompositionEnd={() => {
                      slideRenameCompositionRef.current = false
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="freeform-rail-actions">
            <button className="ghost" type="button" onClick={() => duplicateSlide()}>
              复制页面
            </button>
            <button className="ghost" type="button" onClick={() => deleteSlide()} disabled={doc.slides.length <= 1}>
              删除页面
            </button>
          </div>
        </aside>

        <section className="freeform-stage-pane" aria-label="自由画布">
          <div className="freeform-stage-head">
            {imageCropSession ? (
              <div
                className="freeform-framing-head freeform-crop-head"
                role="toolbar"
                aria-label="图片裁剪"
              >
                <div
                  className="freeform-toolbar"
                  data-image-crop-control=""
                  style={{ position: 'relative', zIndex: 70 }}
                >
                  <FreeformInsertMenu
                    isActive={isActive}
                    testId="freeform-image-crop-aspect"
                    label="比例"
                    options={IMAGE_CROP_ASPECTS}
                    onSelect={applyImageCropAspect}
                    onEscape={() => { finishImageCrop() }}
                  />
                </div>
                <strong>裁剪</strong>
                <button
                  className="toolbar-primary"
                  type="button"
                  data-testid="freeform-image-crop-done"
                  onClick={() => { finishImageCrop() }}
                >
                  完成
                </button>
              </div>
            ) : framingSession ? (
              <div className="freeform-framing-head" role="toolbar" aria-label="图片取景">
                <button
                  className="ghost"
                  type="button"
                  data-testid="freeform-framing-cancel"
                  onClick={cancelImageFraming}
                >
                  取消
                </button>
                <strong>调整取景</strong>
                <button
                  className="toolbar-primary"
                  type="button"
                  data-testid="freeform-framing-done"
                  onClick={finishImageFraming}
                >
                  完成
                </button>
              </div>
            ) : (
              <>
                <div className="zoom-controls" aria-label="画布设置">
                  <button
                    className="zoom-btn"
                    type="button"
                    data-testid="freeform-guides-toggle"
                    aria-label="显示参考线"
                    title="显示参考线"
                    aria-pressed={viewPrefs.guidesVisible}
                    onClick={() => updateViewPrefs({ guidesVisible: !viewPrefs.guidesVisible })}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M6.5 3v14M13.5 3v14" />
                    </svg>
                  </button>
                  <button
                    className="zoom-btn"
                    type="button"
                    data-testid="freeform-snap-toggle"
                    aria-label="对象吸附"
                    title="对象吸附"
                    aria-pressed={viewPrefs.snappingEnabled}
                    onClick={() => updateViewPrefs({ snappingEnabled: !viewPrefs.snappingEnabled })}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 10h12M10 4v12" />
                    </svg>
                  </button>
                </div>
                <div className="zoom-controls" aria-label="预览缩放">
                  <button
                    className="zoom-btn"
                    type="button"
                    aria-label="缩小画布"
                    title="缩小画布"
                    disabled={zoomPercent <= MIN_ZOOM_PERCENT}
                    onClick={() => setZoomPercent((value) => clampZoomPercent(value - ZOOM_STEP))}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4 10h12" />
                    </svg>
                  </button>
                  <button
                    className="zoom-value"
                    type="button"
                    title="适应画布（恢复 100%）"
                    onClick={() => setZoomPercent(DEFAULT_ZOOM_PERCENT)}
                  >
                    {zoomPercent}%
                  </button>
                  <button
                    className="zoom-btn"
                    type="button"
                    aria-label="放大画布"
                    title="放大画布"
                    disabled={zoomPercent >= MAX_ZOOM_PERCENT}
                    onClick={() => setZoomPercent((value) => clampZoomPercent(value + ZOOM_STEP))}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M10 4v12M4 10h12" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>

          <div
            ref={stageViewportRef}
            className={`freeform-stage-viewport${guideDrag ? ` guide-dragging-${guideDrag.axis}` : ''}`}
          >
            {rulerView && (
              <>
                <div
                  className="freeform-ruler freeform-ruler-x"
                  data-testid="freeform-ruler-x"
                  title="按住拖动可拉出竖向参考线"
                  onPointerDown={(event) => guideDragPointerDown(event, 'x', null)}
                >
                  {rulerXTicks.map((tick) => (
                    <Fragment key={tick.position}>
                      <div
                        className={`freeform-ruler-tick${tick.label !== null ? ' major' : ''}`}
                        style={{ left: rulerView.left + tick.position * rulerView.scale }}
                      />
                      {tick.label !== null && (
                        <div
                          className="freeform-ruler-label"
                          style={{ left: rulerView.left + tick.position * rulerView.scale }}
                        >
                          {tick.label}
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
                <div
                  className="freeform-ruler freeform-ruler-y"
                  data-testid="freeform-ruler-y"
                  title="按住拖动可拉出横向参考线"
                  onPointerDown={(event) => guideDragPointerDown(event, 'y', null)}
                >
                  {rulerYTicks.map((tick) => (
                    <Fragment key={tick.position}>
                      <div
                        className={`freeform-ruler-tick${tick.label !== null ? ' major' : ''}`}
                        style={{ top: rulerView.top + tick.position * rulerView.scale }}
                      />
                      {tick.label !== null && (
                        <div
                          className="freeform-ruler-label"
                          style={{ top: rulerView.top + tick.position * rulerView.scale }}
                        >
                          {tick.label}
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
                <div className="freeform-ruler-corner" aria-hidden="true" />
              </>
            )}
            <div
              ref={stageScrollRef}
              className={`freeform-stage-scroll${spacePanning ? ' space-panning' : spacePanReady ? ' space-pan-ready' : ''}`}
              aria-busy={renderScale === null}
              onScroll={measureRulerView}
              onPointerDownCapture={onStagePointerDownCapture}
              onContextMenu={onStageContextMenu}
            >
            {renderScale !== null && (
              <div
                className="freeform-stage-box"
                style={{
                  width: activeSlide.width * renderScale,
                  height: activeSlide.height * renderScale,
                }}
              >
                <div
                  ref={artboardRef}
                  className="freeform-artboard"
                  data-testid="freeform-canvas"
                  data-active-group-path={activeGroupPath.join('/')}
                  onPointerDownCapture={onArtboardPointerDownCapture}
                  style={{
                    width: activeSlide.width,
                    height: activeSlide.height,
                    transform: `scale(${renderScale})`,
                    background: slideBackgroundToCss(activeSlide.background),
                  }}
                >
                  <div
                    className="freeform-artwork-clip"
                    onPointerDown={onArtboardPointerDown}
                  >
                    <FreeformSceneNodeView
                      nodes={activeSlide.nodes}
                      slideId={activeSlide.id}
                      scopeGeneration={documentIdentityGenerationRef.current}
                      onImageDecodeReport={handleImageDecodeReport}
                      hiddenImageContentPathKey={imageCropPathKey}
                      activeParentPath={activeGroupPath}
                      selectedPaths={selectionPaths}
                      onNodePointerDown={onSceneNodePointerDown}
                      onNodeDoubleClick={onSceneNodeDoubleClick}
                      onTextChange={(path, text) => {
                        const directPath = directChildPathForScope(
                          activeSlide.nodes,
                          activeGroupPath,
                          path,
                        )
                        if (!directPath || scenePathKey(directPath) !== scenePathKey(path)) return
                        applyAction({
                          type: 'node/update-content',
                          slideId: activeSlide.id,
                          updates: [{ path, patch: { text } }],
                        })
                      }}
                      onTextFocus={(path) => {
                        const directPath = directChildPathForScope(
                          activeSlide.nodes,
                          activeGroupPath,
                          path,
                        )
                        if (directPath) setSelection([directPath[directPath.length - 1]])
                      }}
                      onTextSelectionChange={(path, range) => {
                        setTextSelection(range ? { path, start: range.start, end: range.end } : null)
                      }}
                    />
                    {marqueeRect && (
                      <div
                        className="freeform-ui-only freeform-marquee"
                        style={{
                          left: Math.min(marqueeRect.x, marqueeRect.x + marqueeRect.width),
                          top: Math.min(marqueeRect.y, marqueeRect.y + marqueeRect.height),
                          width: Math.abs(marqueeRect.width),
                          height: Math.abs(marqueeRect.height),
                        }}
                      />
                    )}
                    {snapLines.map((line) => (
                      <div
                        key={`${line.axis}-${line.position}-${line.source}`}
                        className={`freeform-ui-only freeform-snap-line freeform-snap-line-${line.axis} freeform-snap-source-${line.source}`}
                        data-testid="freeform-snap-line"
                        style={line.axis === 'x' ? { left: line.position } : { top: line.position }}
                      />
                    ))}
                    {dragMeasurements.map((measurement, index) => (
                      <div
                        key={`${measurement.axis}-${measurement.side}-${index}`}
                        className="freeform-ui-only freeform-measurement"
                        data-testid="freeform-measurement"
                        data-measurement-axis={measurement.axis}
                        data-measurement-side={measurement.side}
                        data-measurement-source={measurement.source}
                        style={measurement.axis === 'x' ? {
                          left: Math.min(measurement.from, measurement.to),
                          top: measurement.at,
                          width: Math.max(Math.abs(measurement.to - measurement.from), 1 / renderScale),
                          height: 1 / renderScale,
                        } : {
                          left: measurement.at,
                          top: Math.min(measurement.from, measurement.to),
                          width: 1 / renderScale,
                          height: Math.max(Math.abs(measurement.to - measurement.from), 1 / renderScale),
                        }}
                      >
                        <span
                          className="freeform-ui-only freeform-measurement-label"
                          data-testid="freeform-measurement-label"
                          style={{ fontSize: 11 / renderScale }}
                        >
                          {measurement.distance}
                        </span>
                      </div>
                    ))}
                    {(viewPrefs.guidesVisible ? (activeSlide.guides ?? []) : [])
                      .filter((guide) => guideDrag?.guideId !== guide.id)
                      .map((guide) => (
                        <div
                          key={guide.id}
                          className={`freeform-ui-only freeform-guide freeform-guide-${guide.axis}`}
                          data-testid="freeform-guide"
                          data-guide-axis={guide.axis}
                          title="拖动参考线，拖出页面删除；双击移除"
                          onPointerDown={(event) => guideDragPointerDown(event, guide.axis, guide.id)}
                          style={guide.axis === 'x'
                            ? { left: guide.position, width: 1 / renderScale }
                            : { top: guide.position, height: 1 / renderScale }}
                        >
                          <div
                            className="freeform-guide-hit"
                            style={guide.axis === 'x'
                              ? { width: 8 / renderScale }
                              : { height: 8 / renderScale }}
                          />
                        </div>
                      ))}
                    {guideDrag && (
                      <div
                        className={`freeform-ui-only freeform-guide-ghost freeform-guide-${guideDrag.axis}${guideDragValid ? '' : ' freeform-guide-invalid'}`}
                        data-testid="freeform-guide-dragging"
                        style={guideDrag.axis === 'x'
                          ? { left: guideDrag.position, width: 1 / renderScale }
                          : { top: guideDrag.position, height: 1 / renderScale }}
                      />
                    )}
                  </div>
                  {imageCropSession
                    && imageCropRenderTarget
                    && imageCropRenderScale
                    && imageCropSessionApi.renderDraft && (
                    <ImageCropOverlay
                      ref={imageCropSessionApi.overlayRef}
                      draft={imageCropSessionApi.renderDraft}
                      worldMatrix={imageCropSession.startWorldMatrix}
                      screenScale={imageCropRenderScale}
                      resolvedSrc={imageCropSession.resolvedSrc}
                      alt={imageCropSession.startNode.alt}
                      onImagePointerDown={imageCropSessionApi.panPointerDown}
                      onImageError={invalidateImageCropAfterDecodeError}
                      onHandlePointerDown={(event, handle) => (
                        imageCropSessionApi.handlePointerDown(handle, event)
                      )}
                      onHandleKeyDown={(event, handle) => (
                        imageCropSessionApi.handleKeyDown(handle, event)
                      )}
                      onKeyDown={imageCropSessionApi.overlayKeyDown}
                    />
                  )}
                  {framingSession && framingRenderTarget && framingOverlayStyle && (
                    <div
                      ref={framingSurfaceRef}
                      className={`freeform-ui-only freeform-framing-surface${framingShapeClass}`}
                      data-testid="freeform-framing-surface"
                      data-framing-focus-x={framingRenderTarget.target.framing.focusX}
                      data-framing-focus-y={framingRenderTarget.target.framing.focusY}
                      data-framing-zoom={framingRenderTarget.target.framing.zoom}
                      role="application"
                      aria-label="调整图片取景"
                      tabIndex={0}
                      style={framingOverlayStyle}
                      onPointerDown={onImageFramingPointerDown}
                    >
                      <span className="freeform-framing-third freeform-framing-third-v first" aria-hidden="true" />
                      <span className="freeform-framing-third freeform-framing-third-v second" aria-hidden="true" />
                      <span className="freeform-framing-third freeform-framing-third-h first" aria-hidden="true" />
                      <span className="freeform-framing-third freeform-framing-third-h second" aria-hidden="true" />
                    </div>
                  )}
                  {!framingSession && !imageCropSession && (
                    <FreeformSelectionOverlay
                      nodes={activeSlide.nodes}
                      selectedPaths={selectionPaths}
                      renderScale={renderScale}
                      activeInteraction={activeInteraction}
                      interactive={!effectiveLockedSelection && !lockedDescendantSelection}
                      badge={interactionBadge}
                      onMovePointerDown={(event, target) => beginMovePointerDown(
                        event,
                        target.nodeIds[0],
                        target.nodeIds,
                      )}
                      onResizePointerDown={onResizePointerDown}
                      onRotatePointerDown={onRotatePointerDown}
                    />
                  )}
                </div>
              </div>
            )}
            </div>
          </div>
          {framingRenderTarget && (
            <div className="freeform-framing-zoom" role="group" aria-label="图片缩放">
              <button
                type="button"
                aria-label="缩小图片"
                title="缩小图片"
                data-testid="freeform-framing-zoom-out"
                disabled={framingRenderTarget.target.framing.zoom <= MIN_IMAGE_ZOOM}
                onClick={() => updateImageFramingZoom(
                  framingRenderTarget.target.framing.zoom - 0.1,
                )}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg>
              </button>
              <input
                type="range"
                min={MIN_IMAGE_ZOOM * 100}
                max={MAX_IMAGE_ZOOM * 100}
                step="1"
                value={Math.round(framingRenderTarget.target.framing.zoom * 100)}
                data-testid="freeform-framing-zoom"
                aria-label="图片缩放比例"
                onChange={(event) => updateImageFramingZoom(
                  Number(event.currentTarget.value) / 100,
                )}
              />
              <output>{Math.round(framingRenderTarget.target.framing.zoom * 100)}%</output>
              <button
                type="button"
                aria-label="放大图片"
                title="放大图片"
                data-testid="freeform-framing-zoom-in"
                disabled={framingRenderTarget.target.framing.zoom >= MAX_IMAGE_ZOOM}
                onClick={() => updateImageFramingZoom(
                  framingRenderTarget.target.framing.zoom + 0.1,
                )}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
              </button>
            </div>
          )}

          {canUseLogicalAlignment && !activeInteraction && !framingSession && !imageCropSession && (
            <div
              className="freeform-align-bar"
              data-testid="freeform-align-bar"
              role="toolbar"
              aria-label="对齐与分布"
            >
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-align-left"
                aria-label="左对齐"
                title="左对齐"
                onClick={() => alignSelection('left')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3v14M5 6h10M5 12h7" /></svg>
              </button>
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-align-hcenter"
                aria-label="水平居中"
                title="水平居中"
                onClick={() => alignSelection('h-center')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M5 6h10M7 12h6" /></svg>
              </button>
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-align-right"
                aria-label="右对齐"
                title="右对齐"
                onClick={() => alignSelection('right')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 3v14M5 6h10M8 12h7" /></svg>
              </button>
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-align-top"
                aria-label="顶对齐"
                title="顶对齐"
                onClick={() => alignSelection('top')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M6 5v10M12 5v7" /></svg>
              </button>
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-align-vcenter"
                aria-label="垂直居中"
                title="垂直居中"
                onClick={() => alignSelection('v-center')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M6 5v10M12 7v6" /></svg>
              </button>
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-align-bottom"
                aria-label="底对齐"
                title="底对齐"
                onClick={() => alignSelection('bottom')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15h14M6 5v10M12 8v7" /></svg>
              </button>
              <span className="align-bar-separator" aria-hidden="true" />
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-distribute-h"
                aria-label="水平均分"
                title="水平均分"
                disabled={selectionPaths.length < 3}
                onClick={() => distributeSelection('horizontal')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5v10M10 5v10M15 5v10" /></svg>
              </button>
              <button
                type="button"
                className="align-bar-btn"
                data-testid="freeform-distribute-v"
                aria-label="垂直均分"
                title="垂直均分"
                disabled={selectionPaths.length < 3}
                onClick={() => distributeSelection('vertical')}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10M5 10h10M5 15h10" /></svg>
              </button>
            </div>
          )}
        </section>

        <FreeformRightPanel
          propertiesTabRef={propertiesTabRef}
          disabled={hasImageEditSession}
          layers={(
            <FreeformLayersPanel
              nodes={activeSlide.nodes}
              selectedPaths={selectionPaths}
              hasStructuralLockedSelection={Boolean(
                effectiveLockedSelection || lockedDescendantSelection
              )}
              onSelect={selectLayerPath}
              onRename={renameLayer}
              onReorder={reorderLayers}
              onDropReorder={reorderLayersAbove}
              onSetLocked={setLayerLocked}
              onSetHidden={setLayerHidden}
              onGroup={groupSelection}
              onUngroup={ungroupSelection}
            />
          )}
          history={(
            <div
              className="freeform-history-panel"
              data-testid="freeform-history-panel"
              data-history-count={historyRows.length}
            >
              <p className="freeform-history-hint">点击任意步骤，在时间线上前后跳转；新编辑会清空重做步骤。</p>
              <ol className="freeform-history-list" aria-label="编辑历史">
                {historyRows.map((row) => {
                  const { kind, index } = row
                  return kind === 'current' ? (
                    <li key={row.key}>
                      <div
                        className="freeform-history-item is-current"
                        data-testid="freeform-history-item"
                        data-history-kind="current"
                      >
                        <span className="freeform-history-label">{row.label}</span>
                        <span className="freeform-history-state">当前</span>
                      </div>
                    </li>
                  ) : (
                    <li key={row.key}>
                      <button
                        type="button"
                        className="freeform-history-item"
                        data-testid="freeform-history-item"
                        data-history-kind={kind}
                        data-history-index={index}
                        title={kind === 'past' ? '撤销到这一步' : '重做到这一步'}
                        onClick={() => jumpToHistoryState(kind, index)}
                      >
                        <span className="freeform-history-label">{row.label}</span>
                        <span className="freeform-history-state">
                          {kind === 'past' ? '撤销' : '重做'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        >
          <div className="freeform-panel-head">
            <span>属性</span>
            {(selectedProperties || activeGroupPath.length > 0) && (
              <nav
                className="freeform-inspector-breadcrumb"
                aria-label={selectedProperties ? '对象路径' : '编辑范围'}
                data-testid={selectedProperties ? undefined : 'freeform-scope-breadcrumb'}
                title={(selectedProperties
                  ? [
                      ...selectedProperties.breadcrumbs.map((breadcrumb) => breadcrumb.name),
                      selectedProperties.node.name,
                    ]
                  : scopeBreadcrumbs.map((breadcrumb) => breadcrumb.name)
                ).join(' / ')}
              >
                {(selectedProperties?.breadcrumbs ?? scopeBreadcrumbs).map((breadcrumb, index) => (
                  <span key={scenePathKey(breadcrumb.path)} title={breadcrumb.name}>
                    {index > 0 && <span className="freeform-inspector-breadcrumb-separator" aria-hidden="true">/</span>}
                    {breadcrumb.name}
                  </span>
                ))}
                {selectedProperties && (
                  <span
                    className="freeform-inspector-breadcrumb-current"
                    title={selectedProperties.node.name}
                  >
                    <span className="freeform-inspector-breadcrumb-separator" aria-hidden="true">/</span>
                    {selectedProperties.node.name}
                  </span>
                )}
              </nav>
            )}
          </div>

          {liveSelection.length === 0 ? (
            <>
              <InspectorSection title="页面" testId="inspector-page">
                <label className="field">
                  <span className="field-label">页面名称</span>
                  <input
                    className="text-input"
                    value={activeSlide.name}
                    onChange={(event) =>
                      applyAction({
                        type: 'slide/update',
                        slideId: activeSlide.id,
                        patch: { name: event.currentTarget.value },
                      })
                    }
                  />
                </label>
                <div data-testid="page-background-paint">
                  <PaintField
                    label="背景"
                    value={activeSlide.background}
                    modes={['solid', 'linear-gradient', 'radial-gradient', 'transparent']}
                    fallbackPaint={DEFAULT_PAGE_PAINT}
                    onChange={(background) =>
                      applyAction({
                        type: 'slide/update',
                        slideId: activeSlide.id,
                        patch: { background: background as SlideBackground },
                      })
                    }
                  />
                </div>
              </InspectorSection>
              <div className="inspector-empty">选择对象以编辑属性。</div>
            </>
          ) : (
            <>
              {effectiveLockedSelection && (
                <div
                  className="freeform-lock-banner"
                  data-testid="freeform-lock-banner"
                  role="note"
                  aria-label="锁定状态"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="4" y="8" width="12" height="9" rx="2" />
                    <path d="M7 8V6a3 3 0 0 1 6 0v2" />
                  </svg>
                  <div className="freeform-lock-banner-copy">
                    <strong>已锁定</strong>
                    <span>锁定来源：{effectiveLockedSelection.unlockName}</span>
                  </div>
                  <button
                    className="ghost freeform-lock-banner-action"
                    type="button"
                    aria-label={`解锁 ${effectiveLockedSelection.unlockName}`}
                    title={`解锁 ${effectiveLockedSelection.unlockName}`}
                    onClick={() => {
                      if (setLayerLocked(effectiveLockedSelection.unlockPath, false)) {
                        requestAnimationFrame(() => propertiesTabRef.current?.focus())
                      }
                    }}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <rect x="4" y="8" width="12" height="9" rx="2" />
                      <path d="M7 8V6a3 3 0 0 1 5.7-1.3" />
                    </svg>
                    <span>解锁</span>
                  </button>
                </div>
              )}

              {!effectiveLockedSelection && lockedDescendantSelection && (
                <div
                  className="freeform-lock-descendant-banner"
                  data-testid="freeform-lock-descendant-banner"
                  role="note"
                  aria-label="包含锁定图层"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="4" y="8" width="12" height="9" rx="2" />
                    <path d="M7 8V6a3 3 0 0 1 6 0v2" />
                  </svg>
                  <div className="freeform-lock-banner-copy">
                    <strong>包含锁定图层</strong>
                    <span>锁定来源：{lockedDescendantSelection.sourceName}，请先在图层面板解锁</span>
                  </div>
                </div>
              )}

              {!propertySelectionReadOnly && liveSelection.length === 1 && selectedProperties && (
                <>
                  <InspectorSection title="位置与尺寸" testId="inspector-geometry">
                    <div className="field-grid">
                      <label>
                        {selectedProperties.kind === 'group' ? '中心 X' : 'X'}
                        <InspectorNumberInput
                          ariaLabel={selectedProperties.kind === 'group' ? '中心 X' : 'X'}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.x}
                          onCommit={(value) => commitSceneProperty({ property: 'x', value })}
                        />
                      </label>
                      <label>
                        {selectedProperties.kind === 'group' ? '中心 Y' : 'Y'}
                        <InspectorNumberInput
                          ariaLabel={selectedProperties.kind === 'group' ? '中心 Y' : 'Y'}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.y}
                          onCommit={(value) => commitSceneProperty({ property: 'y', value })}
                        />
                      </label>
                      <label>
                        宽
                        <InspectorNumberInput
                          ariaLabel="宽"
                          min={Number.MIN_VALUE}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.width}
                          onCommit={(value) => commitSceneProperty({ property: 'width', value })}
                        />
                      </label>
                      <label>
                        高
                        <InspectorNumberInput
                          ariaLabel="高"
                          min={Number.MIN_VALUE}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.height}
                          onCommit={(value) => commitSceneProperty({ property: 'height', value })}
                        />
                      </label>
                      <label>
                        旋转
                        <InspectorNumberInput
                          ariaLabel="旋转"
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.rotation}
                          onCommit={(value) => commitSceneProperty({ property: 'rotation', value })}
                        />
                      </label>
                      {selectedProperties.kind === 'group' && (
                        <label>
                          缩放 %
                          <InspectorNumberInput
                            ariaLabel="缩放 %"
                            min={Number.MIN_VALUE}
                            resetKey={inspectorNumberResetKey}
                            value={selectedProperties.scalePercent}
                            onCommit={(value) => commitSceneProperty({
                              property: 'scalePercent',
                              value,
                            })}
                          />
                        </label>
                      )}
                    </div>
                    {isShapeElement(selectedElement) && (
                      <>
                        <div className="field-label with-gap">形状</div>
                        <div className="seg stretch">
                          {SHAPES.map((shape) => (
                            <button
                              key={shape.id}
                              type="button"
                              className={selectedElement.shape === shape.id ? 'seg-btn on' : 'seg-btn'}
                              onClick={() => updateSelectedStyle({ shape: shape.id })}
                            >
                              {shape.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </InspectorSection>

                  {isTextElement(selectedElement) && (
                    <InspectorSection title="文字" testId="inspector-typography">
                      <label className="field">
                        <span className="field-label">文本</span>
                        <textarea
                          className="freeform-inspector-text"
                          value={selectedElement.text}
                          onChange={(event) =>
                            updateSelectedContent({ text: event.currentTarget.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">字体</span>
                        <Select
                          value={selectedElement.fontFamily}
                          onChange={(fontFamily) => {
                            void buildFontEmbedCSS(
                              selectedElement.text,
                              fontFamily,
                              [selectedElement.fontWeight],
                            ).catch(() => undefined)
                            updateSelectedStyle({ fontFamily })
                          }}
                          title="字体"
                          testId="freeform-font-select"
                          previewFonts
                          options={FONTS.map((font) => ({ id: font.id, label: font.label }))}
                        />
                      </label>
                      <div className="field-grid">
                        <label>
                          字号
                          <InspectorNumberInput
                            ariaLabel="字号"
                            min={Number.MIN_VALUE}
                            max={Number.MAX_VALUE}
                            resetKey={inspectorNumberResetKey}
                            value={selectedProperties.kind === 'leaf'
                              ? selectedProperties.fontSize ?? selectedElement.fontSize
                              : selectedElement.fontSize}
                            onCommit={(value) => commitSceneProperty({ property: 'fontSize', value })}
                          />
                        </label>
                        <label>
                          行高
                          <InspectorNumberInput
                            ariaLabel="行高"
                            min={0.5}
                            max={4}
                            resetKey={inspectorNumberResetKey}
                            value={selectedElement.lineHeight ?? 1.18}
                            onCommit={(value) => updateSelectedStyle({ lineHeight: value })}
                          />
                        </label>
                        <label>
                          字距
                          <InspectorNumberInput
                            ariaLabel="字距"
                            min={-50}
                            max={200}
                            resetKey={inspectorNumberResetKey}
                            value={selectedElement.letterSpacing ?? 0}
                            onCommit={(value) => updateSelectedStyle({ letterSpacing: value })}
                          />
                        </label>
                      </div>
                      <div className="field-label with-gap">对齐</div>
                      <div className="seg stretch">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            className={selectedElement.align === align ? 'seg-btn on' : 'seg-btn'}
                            onClick={() => updateSelectedStyle({ align })}
                          >
                            {align === 'left' ? '左' : align === 'center' ? '中' : '右'}
                          </button>
                        ))}
                      </div>
                      <div className="field-label with-gap">字型</div>
                      <div className="seg stretch">
                        <button
                          type="button"
                          className={selectedElement.fontWeight === 'bold' ? 'seg-btn on' : 'seg-btn'}
                          data-testid="text-weight-toggle"
                          aria-pressed={selectedElement.fontWeight === 'bold' ? 'true' : 'false'}
                          onClick={() => updateSelectedStyle({
                            fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold',
                          })}
                        >
                          粗体
                        </button>
                        <button
                          type="button"
                          className={selectedElement.italic ? 'seg-btn on' : 'seg-btn'}
                          data-testid="text-italic-toggle"
                          aria-pressed={selectedElement.italic ? 'true' : 'false'}
                          onClick={() => updateSelectedStyle({ italic: !selectedElement.italic })}
                        >
                          斜体
                        </button>
                        <button
                          type="button"
                          className={selectedElement.vertical ? 'seg-btn on' : 'seg-btn'}
                          data-testid="text-vertical-toggle"
                          aria-pressed={selectedElement.vertical ? 'true' : 'false'}
                          onClick={() => updateSelectedStyle({ vertical: !selectedElement.vertical })}
                        >
                          竖排
                        </button>
                      </div>
                      <div className="field-label with-gap">描边</div>
                      <div className="paint-row" data-testid="text-stroke-field">
                        <ColorPickerButton
                          label="描边颜色"
                          color={selectedElement.stroke ?? '#18181b'}
                          onChange={(color) => updateSelectedStyle({
                            stroke: color,
                            strokeWidth: selectedElement.strokeWidth ?? 2,
                          })}
                        />
                        <input
                          className="paint-hex"
                          value={selectedElement.stroke ?? ''}
                          placeholder="无"
                          onChange={(event) => {
                            if (!isHexColor(event.currentTarget.value)) return
                            updateSelectedStyle({
                              stroke: event.currentTarget.value,
                              strokeWidth: selectedElement.strokeWidth ?? 2,
                            })
                          }}
                          aria-label="描边 hex"
                        />
                        <InspectorNumberInput
                          ariaLabel="描边宽度"
                          min={0.5}
                          max={100}
                          resetKey={inspectorNumberResetKey}
                          value={selectedElement.strokeWidth ?? 2}
                          onCommit={(value) => updateSelectedStyle({
                            strokeWidth: value,
                            ...(selectedElement.stroke ? {} : { stroke: '#18181b' }),
                          })}
                        />
                        <button
                          type="button"
                          className="ghost"
                          data-testid="text-stroke-clear"
                          onClick={() => updateSelectedStyle({ stroke: null, strokeWidth: null })}
                        >
                          清除
                        </button>
                      </div>
                    </InspectorSection>
                  )}

                  {isTextElement(selectedElement) && (
                    <InspectorSection title="文字片段" testId="inspector-rich-spans">
                      <div className="rich-span-apply" data-testid="rich-span-apply">
                        {activeTextRange ? (
                          <span className="rich-span-hint">
                            已选 {activeTextRange.end - activeTextRange.start} 字
                          </span>
                        ) : (
                          <span className="rich-span-hint muted">双击文本后选中一段文字</span>
                        )}
                        <button
                          className="ghost"
                          type="button"
                          data-testid="rich-span-bold"
                          disabled={!activeTextRange}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applySelectedTextSpan({ bold: true })}
                        >
                          加粗
                        </button>
                        {RICH_SPAN_COLORS.map((color) => (
                          <button
                            key={color}
                            className="rich-span-swatch"
                            type="button"
                            aria-label={`标色 ${color}`}
                            title={color}
                            style={{ background: color }}
                            disabled={!activeTextRange}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applySelectedTextSpan({ color })}
                          />
                        ))}
                      </div>
                      {selectedElement.spans && selectedElement.spans.length > 0 && (
                        <ul className="rich-span-list" data-testid="rich-span-list">
                          {selectedElement.spans.map((span, index) => (
                            <li key={`${span.start}-${span.end}-${index}`}>
                              <span className="rich-span-range" title={selectedElement.text.slice(span.start, span.end)}>
                                {selectedElement.text.slice(span.start, span.end)}
                              </span>
                              {span.bold && <span className="rich-span-chip">加粗</span>}
                              {span.color && (
                                <span className="rich-span-chip" style={{ color: span.color }}>
                                  标色
                                </span>
                              )}
                              <button
                                className="draft-del"
                                type="button"
                                aria-label="删除文字片段"
                                onClick={() => removeSelectedTextSpan(index)}
                              >
                                删除
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </InspectorSection>
                  )}

                  {(isTextElement(selectedElement) ||
                    isShapeElement(selectedElement) ||
                    isImageElement(selectedElement)) && (
                    <InspectorSection title="填充" testId="inspector-fill">
                      {isTextElement(selectedElement) && (
                        <div data-testid="text-fill-paint">
                          <PaintField
                            label="文字颜色"
                            value={selectedElement.textFill}
                            modes={['solid', 'linear-gradient', 'radial-gradient']}
                            fallbackPaint={DEFAULT_TEXT_PAINT}
                            onChange={(textFill) =>
                              updateSelectedStyle({ textFill: textFill as ColorPaint })
                            }
                          />
                        </div>
                      )}
                      {isShapeElement(selectedElement) && (
                        <>
                          <div data-testid="shape-fill-paint">
                            <PaintField
                              label="填充"
                              value={selectedElement.fill}
                              modes={['solid', 'linear-gradient', 'radial-gradient', 'transparent', 'image']}
                              fallbackPaint={DEFAULT_SHAPE_PAINT}
                              onChange={(fill) =>
                                updateSelectedShapeFill(fill as ShapeFill)
                              }
                              onChooseImage={() => shapeFillInputRef.current?.click()}
                              onClearImage={() =>
                                updateSelectedShapeFill({ ...DEFAULT_SHAPE_PAINT })
                              }
                              onImageFitChange={(fit) => {
                                if (selectedElement.fill.type !== 'image') return
                                updateSelectedShapeFill({ ...selectedElement.fill, fit })
                              }}
                              onAdjustImageFraming={() => {
                                if (selectedPath) startImageFraming(selectedPath)
                              }}
                              onResetImageFraming={resetSelectedImageFraming}
                              imageFramingDisabled={!canAdjustSelectedFraming}
                              imageFramingDisabledReason={selectedFramingDisabledReason ?? undefined}
                              imageFramingResetDisabled={!canResetSelectedFraming}
                            />
                          </div>
                          <input
                            ref={shapeFillInputRef}
                            className="freeform-file"
                            type="file"
                            accept="image/*"
                            onChange={(event) => handleShapeFillInput(event.currentTarget.files)}
                          />
                        </>
                      )}
                      {isImageElement(selectedElement) && (
                        <>
                          <div className="field-label">图片填充方式</div>
                          <div className="seg stretch">
                            {FITS.map((fit) => (
                              <button
                                key={fit.id}
                                type="button"
                                className={selectedElement.fit === fit.id ? 'seg-btn on' : 'seg-btn'}
                                data-testid={`paint-image-fit-${fit.id}`}
                                onClick={() => updateSelectedStyle({ fit: fit.id })}
                              >
                                {fit.label}
                              </button>
                            ))}
                          </div>
                          <div className="inspector-actions">
                            <button
                              className="ghost"
                              type="button"
                              data-testid="freeform-crop-image"
                              aria-label="裁剪图片"
                              title={canCropSelectedImage
                                ? '裁剪图片'
                                : selectedFramingDisabledReason ?? undefined}
                              disabled={!canCropSelectedImage}
                              onClick={() => {
                                if (selectedPath) startImageCrop(selectedPath)
                              }}
                            >
                              裁剪
                            </button>
                            <button
                              className="ghost"
                              type="button"
                              data-testid="freeform-reset-framing"
                              aria-label="重置图片取景"
                              title={canResetSelectedFraming
                                ? '重置图片取景'
                                : '当前已经是默认取景'}
                              disabled={!canResetSelectedFraming}
                              onClick={resetSelectedImageFraming}
                            >
                              重置取景
                            </button>
                          </div>
                        </>
                      )}
                    </InspectorSection>
                  )}

                  {(isShapeElement(selectedElement) || isLineElement(selectedElement)) && (
                    <InspectorSection title="描边" testId="inspector-stroke">
                      {isLineElement(selectedElement) && (
                        <>
                          <div className="field-label">线条</div>
                          <div className="seg stretch" data-testid="line-kind-seg">
                            {(['line', 'arrow'] as const).map((lineKind) => (
                              <button
                                key={lineKind}
                                type="button"
                                className={selectedElement.lineKind === lineKind ? 'seg-btn on' : 'seg-btn'}
                                onClick={() => updateSelectedStyle({ lineKind })}
                              >
                                {lineKind === 'line' ? '直线' : '箭头'}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="field-grid with-gap">
                        <div
                          className="stroke-color-field"
                          data-testid={isShapeElement(selectedElement) ? 'shape-stroke-color' : 'line-stroke-color'}
                        >
                          <span className="stroke-color-label">
                            {isShapeElement(selectedElement) ? '描边' : '颜色'}
                          </span>
                          <div className="color-field">
                            <span className="color-field-value">{selectedElement.stroke.toUpperCase()}</span>
                            <ColorPickerButton
                              label={isShapeElement(selectedElement) ? '形状描边颜色' : '线条颜色'}
                              color={selectedElement.stroke}
                              onChange={(stroke) => updateSelectedStyle({ stroke })}
                            />
                          </div>
                        </div>
                        <label>
                          {isShapeElement(selectedElement) ? '描边宽' : '粗细'}
                          <InspectorNumberInput
                            ariaLabel={isShapeElement(selectedElement) ? '描边宽' : '粗细'}
                            min={isShapeElement(selectedElement) ? 0 : Number.MIN_VALUE}
                            max={Number.MAX_VALUE}
                            resetKey={inspectorNumberResetKey}
                            value={selectedProperties.kind === 'leaf'
                              ? selectedProperties.strokeWidth ?? selectedElement.strokeWidth
                              : selectedElement.strokeWidth}
                            onCommit={(value) => commitSceneProperty({ property: 'strokeWidth', value })}
                          />
                        </label>
                      </div>
                      {isLineElement(selectedElement) && (
                        <>
                          <div className="field-grid with-gap">
                            <label>
                              虚线
                              <InspectorNumberInput
                                ariaLabel="虚线"
                                min={1}
                                max={500}
                                resetKey={inspectorNumberResetKey}
                                value={selectedElement.dash ?? 0}
                                onCommit={(value) => updateSelectedStyle({ dash: value })}
                              />
                            </label>
                            <div className="inspector-actions">
                              <button
                                className="ghost"
                                type="button"
                                data-testid="line-dash-clear"
                                disabled={selectedElement.dash === undefined}
                                onClick={() => updateSelectedStyle({ dash: null })}
                              >
                                实线
                              </button>
                            </div>
                          </div>
                          <div className="field-label with-gap">线帽</div>
                          <div className="seg stretch">
                            {LINE_CAPS.map((cap) => (
                              <button
                                key={cap.id}
                                type="button"
                                className={(selectedElement.cap ?? 'round') === cap.id ? 'seg-btn on' : 'seg-btn'}
                                data-testid={`line-cap-${cap.id}`}
                                onClick={() => updateSelectedStyle({ cap: cap.id })}
                              >
                                {cap.label}
                              </button>
                            ))}
                          </div>
                          <div className="field-label with-gap">端点</div>
                          <div className="field-grid with-gap">
                            {LINE_ENDPOINT_SIDES.map((side) => {
                              const active = side.id === 'start'
                                ? selectedElement.startCap ?? 'none'
                                : selectedElement.endCap
                                  ?? (selectedElement.lineKind === 'arrow' ? 'arrow' : 'none')
                              return (
                                <div key={side.id}>
                                  <div className="field-label">{side.label}</div>
                                  <div className="seg stretch">
                                    {LINE_ENDPOINT_CAPS.map((cap) => {
                                      const fallback = side.id === 'end' && selectedElement.lineKind === 'arrow'
                                        ? 'arrow'
                                        : 'none'
                                      return (
                                        <button
                                          key={cap.id}
                                          type="button"
                                          className={active === cap.id ? 'seg-btn on' : 'seg-btn'}
                                          data-testid={`line-endpoint-${side.id}-${cap.id}`}
                                          onClick={() => updateSelectedStyle(
                                            cap.id === fallback
                                              ? (side.id === 'start' ? { startCap: null } : { endCap: null })
                                              : (side.id === 'start' ? { startCap: cap.id } : { endCap: cap.id }),
                                          )}
                                        >
                                          {cap.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </InspectorSection>
                  )}

                  {selectedElement && (
                  <InspectorSection title="外观" testId="inspector-appearance">
                    <div className="field-grid with-gap">
                      <label>
                        不透明度 %
                        <InspectorNumberInput
                          ariaLabel="不透明度 %"
                          min={0}
                          max={100}
                          resetKey={inspectorNumberResetKey}
                          value={Math.round((selectedElement.opacity ?? 1) * 100)}
                          onCommit={(value) =>
                            updateSelectedStyle({ opacity: Math.round(value) / 100 })}
                        />
                      </label>
                      {isShapeElement(selectedElement) && selectedElement.shape === 'rect' && (
                        <label>
                          圆角
                          <InspectorNumberInput
                            ariaLabel="圆角"
                            min={0}
                            max={2000}
                            resetKey={inspectorNumberResetKey}
                            value={selectedElement.cornerRadius ?? 16}
                            onCommit={(value) => updateSelectedStyle({ cornerRadius: value })}
                          />
                        </label>
                      )}
                    </div>
                    <div className="field-label with-gap">阴影</div>
                    <ShadowField
                      shadow={selectedElement.shadow}
                      resetKey={inspectorNumberResetKey}
                      onChange={(shadow) => updateSelectedStyle({ shadow })}
                    />
                    <div className="field-label with-gap">混合模式</div>
                    <Select
                      value={selectedElement.blendMode ?? 'normal'}
                      onChange={(blendMode) => updateSelectedStyle({
                        blendMode: blendMode === 'normal' ? null : blendMode as BlendMode,
                      })}
                      title="混合模式"
                      testId="freeform-blend-select"
                      options={BLEND_MODE_OPTIONS}
                    />
                    <div className="field-label with-gap">滤镜</div>
                    <FilterField
                      filter={selectedElement.filter}
                      resetKey={inspectorNumberResetKey}
                      onChange={(filter) => updateSelectedStyle({ filter })}
                    />
                  </InspectorSection>
                  )}
                </>
              )}

              {!propertySelectionReadOnly && (
                <InspectorSection title="排列" testId="inspector-arrange">
                  {canUseLogicalAlignment && (
                    <>
                      <div className="field-label">对齐与分布</div>
                      <div className="inspector-actions">
                        <button className="ghost" type="button" onClick={() => alignSelection('left')}>
                          左对齐
                        </button>
                        <button className="ghost" type="button" onClick={() => alignSelection('h-center')}>
                          水平居中
                        </button>
                        <button className="ghost" type="button" onClick={() => alignSelection('right')}>
                          右对齐
                        </button>
                        <button className="ghost" type="button" onClick={() => alignSelection('top')}>
                          顶对齐
                        </button>
                        <button className="ghost" type="button" onClick={() => alignSelection('v-center')}>
                          垂直居中
                        </button>
                        <button className="ghost" type="button" onClick={() => alignSelection('bottom')}>
                          底对齐
                        </button>
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => distributeSelection('horizontal')}
                        >
                          水平均分
                        </button>
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => distributeSelection('vertical')}
                        >
                          垂直均分
                        </button>
                      </div>
                    </>
                  )}
                  <div className="field-label with-gap">层级</div>
                  <div className="inspector-actions">
                    <button className="ghost" type="button" onClick={() => reorderSelection('backward')}>
                      后移
                    </button>
                    <button className="ghost" type="button" onClick={() => reorderSelection('forward')}>
                      前移
                    </button>
                    <button className="ghost" type="button" onClick={() => reorderSelection('back')}>
                      置底
                    </button>
                    <button className="ghost" type="button" onClick={() => reorderSelection('front')}>
                      置顶
                    </button>
                    </div>
                </InspectorSection>
              )}

              {!propertySelectionReadOnly && liveSelection.length === 1 && (
                <InspectorSection title="删除" testId="inspector-danger" tone="danger">
                  <button className="ghost inspector-delete" type="button" onClick={deleteSelection}>
                    删除
                  </button>
                </InspectorSection>
              )}
            </>
          )}
        </FreeformRightPanel>
      </main>

      {showDrafts && (
        <DraftsPanel
          drafts={drafts}
          activeId={draftId}
          onOpen={openDraft}
          onDelete={removeDraft}
          onClose={() => setShowDrafts(false)}
          onImportFile={importDraftFile}
        />
      )}

      <TemplateGallery
        open={showTemplates}
        workspace='freeform'
        hasCurrentContent={draftId !== null || history.past.length > 0 || doc.slides.length > 1 || doc.slides.some((slide) => slide.nodes.length > 0)}
        userTemplates={userTemplateDefinitions}
        onDeleteUserTemplate={removeUserTemplate}
        onClose={() => setShowTemplates(false)}
        onApply={applyFreeformTemplate}
      />

      <SaveTemplateDialog
        open={showSaveTemplate}
        defaultName={doc.slides[0]?.name?.trim() || ''}
        onClose={() => setShowSaveTemplate(false)}
        onConfirm={saveAsTemplate}
      />

      {showMixedSizeWarning && (
        <div className="sheet-backdrop" onClick={() => setShowMixedSizeWarning(false)}>
          <div className="sheet freeform-warning-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-body">
              <h2>包含不同尺寸页面</h2>
              <p className="form-note">
                当前作品包含不同尺寸页面。ZIP 中的图片会保留各自页面尺寸，不会统一拉伸或裁剪。
              </p>
              <div className="sheet-foot">
                <button type="button" className="ghost" onClick={() => setShowMixedSizeWarning(false)}>
                  取消
                </button>
                <button
                  type="button"
                  className="accent"
                  onClick={continueMixedSizeExport}
                  disabled={renderScale === null}
                >
                  继续导出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="freeform-context-menu"
          data-testid="freeform-context-menu"
          role="menu"
          aria-label="画布操作"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-copy"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); copySelection() }}
          >
            复制
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-duplicate"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); duplicateSelection() }}
          >
            原位复制
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-cut"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); cutSelection() }}
          >
            剪切
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-paste"
            disabled={!clipboard || clipboard.nodes.length === 0}
            onClick={() => { closeContextMenu(); pasteClipboard() }}
          >
            粘贴
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-paste-in-place"
            disabled={!clipboard || clipboard.nodes.length === 0}
            onClick={() => { closeContextMenu(); pasteClipboard(true) }}
          >
            原位粘贴
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-delete"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); deleteSelection() }}
          >
            删除
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-forward"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('forward') }}
          >
            上移一层
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-backward"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('backward') }}
          >
            下移一层
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-front"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('front') }}
          >
            置于顶层
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-back"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('back') }}
          >
            移到底层
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-group"
            disabled={selectionPaths.length < 2}
            onClick={() => { closeContextMenu(); groupSelection() }}
          >
            编组
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-ungroup"
            disabled={!menuSelectionHasGroup}
            onClick={() => { closeContextMenu(); ungroupSelection() }}
          >
            解组
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-lock"
            disabled={selection.length === 0}
            onClick={() => {
              closeContextMenu()
              selectionPaths.forEach((path) => { setLayerLocked(path, !menuSelectionAllLocked) })
            }}
          >
            {menuSelectionAllLocked ? '解锁' : '锁定'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-visibility"
            disabled={selection.length === 0}
            onClick={() => {
              closeContextMenu()
              selectionPaths.forEach((path) => { setLayerHidden(path, !menuSelectionAllHidden) })
            }}
          >
            {menuSelectionAllHidden ? '取消隐藏' : '隐藏'}
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-copy-style"
            disabled={!menuSelectionHasLeaf}
            onClick={() => { closeContextMenu(); copySelectionStyle() }}
          >
            复制样式
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-paste-style"
            disabled={!styleClipboard || !menuSelectionHasLeaf}
            onClick={() => { closeContextMenu(); pasteStyleToSelection() }}
          >
            粘贴样式
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-zoom-selection"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); zoomToSelectionBounds() }}
          >
            缩放到选区
          </button>
        </div>
      )}

      {slideContextMenu && slideMenuIndex >= 0 && (
        <div
          ref={slideContextMenuRef}
          className="freeform-context-menu"
          data-testid="freeform-slide-context-menu"
          role="menu"
          aria-label="页面操作"
          style={{ left: slideContextMenu.x, top: slideContextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-rename"
            onClick={() => {
              const slideId = slideContextMenu.slideId
              setSlideContextMenu(null)
              beginSlideRename(slideId)
            }}
          >
            重命名此页
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-duplicate"
            disabled={doc.slides.length >= MAX_FREEFORM_SLIDES}
            onClick={() => {
              setSlideContextMenu(null)
              duplicateSlide(slideContextMenu.slideId)
            }}
          >
            复制此页
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-delete"
            disabled={doc.slides.length <= 1}
            onClick={() => {
              setSlideContextMenu(null)
              deleteSlide(slideContextMenu.slideId)
            }}
          >
            删除此页
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-up"
            disabled={slideMenuIndex === 0}
            onClick={() => {
              setSlideContextMenu(null)
              reorderSlide(slideContextMenu.slideId, slideMenuIndex - 1)
            }}
          >
            上移一位
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-down"
            disabled={slideMenuIndex === doc.slides.length - 1}
            onClick={() => {
              setSlideContextMenu(null)
              reorderSlide(slideContextMenu.slideId, slideMenuIndex + 1)
            }}
          >
            下移一位
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-front"
            disabled={slideMenuIndex === 0}
            onClick={() => {
              setSlideContextMenu(null)
              reorderSlide(slideContextMenu.slideId, 0)
            }}
          >
            移到最前
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-back"
            disabled={slideMenuIndex === doc.slides.length - 1}
            onClick={() => {
              setSlideContextMenu(null)
              reorderSlide(slideContextMenu.slideId, doc.slides.length - 1)
            }}
          >
            移到最后
          </button>
        </div>
      )}
    </div>
  )
}
