import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, SetStateAction } from 'react'
import { toCanvas } from 'html-to-image'
import { AssetPanel } from '../app/AssetDrawer'
import { imageFiles } from '../app/assetFiles'
import { navigate, routes } from '../app/router'
import type { Asset } from '../assets'
import { Select } from '../Select'
import { importDraftFromJson, type Draft } from '../drafts'
import { createLongImage, longImageScale } from '../exportLongImage'
import { buildPdf, pdfPageFor, type PdfPage } from '../exportPdf'
import { downloadZip } from '../exportZip'
import { buildFontEmbedCSS } from '../fontEmbed'
import { downscaleDataUrl } from '../imageStore'
import { readLastSession, updateLastSession } from '../lastSession'
import { GUEST_OWNER_ID, isGuestOwner, store, storeFor } from '../storage'
import { assetDocumentSource } from '../workspaces/assetSource'
import {
  ChevronLeftIcon,
  CloseIcon,
  ImageIcon,
  LayersIcon,
  MoreIcon,
  PagesIcon,
  PlusIcon,
  RedoIcon,
  ShapePreviewIcon,
  ShapesIcon,
  StylesIcon,
  TemplatesIcon,
  TextIcon,
  UndoIcon,
  UploadIcon,
} from '../ui/icons'
import { EditorTopBar, type SaveState } from '../workspaces/EditorTopBar'
import { OperationNotice } from '../workspaces/OperationNotice'
import { ToolbarDivider, ToolbarGroup, WorkspaceToolbar } from '../workspaces/WorkspaceToolbar'
import type { WorkspaceShellProps } from '../workspaces/types'
import { useImageLease } from '../workspaces/useImageLease'
import { useProjectAutosave } from '../workspaces/useProjectAutosave'
import { FreeformTemplatePreview, TemplateGallery } from '../templates/TemplateGallery'
import { Measured } from '../app/DocumentPreview'
import { TEMPLATE_FORMATS } from '../templates/formats'
import { templatesForWorkspace } from '../templates/registry'
import type { TemplateDefinition } from '../templates/types'
import { MAX_EFFECTIVE_SCALE, MAX_FREEFORM_SLIDES, MIN_EFFECTIVE_SCALE, PAGE_SIZE_MAX, PAGE_SIZE_MIN } from './constants'
import { collectTextAutoSize } from './textAutoSize'
import {
  createFreeformDocument,
  createSlide,
  createImageElement,
  createLineElement,
  createPathElement,
  createShapeElement,
  createTextElement,
  freeformReducer,
} from './document'
import { ICON_STROKE_WIDTH, ICON_VIEWBOX, type IconDefinition } from './icons'
import { FreeformIconPicker } from './FreeformIconPicker'
import { FreeformStylePanel } from './FreeformStylePanel'
import { fontLabel, fontOptions, fontPickerValue, IMPORT_FONT_OPTION } from './fontChoices'
import { FONT_FILE_ACCEPT, importedFontStack } from './fontFiles'
import { fontLibrary, useImportedFonts } from './fontLibrary'
import { TextEffectField } from './TextEffectField'
import { TextEffectSample } from './TextEffectSample'
import { TEXT_STYLE_PRESETS, presetOnDarkPage, textStylePatch, type TextStylePreset } from './textStyles'
import { pathStrokeScale } from './pathData'
import { deckColors, deckFonts, type RestyleRequest } from './restyle'
import { DeckColorsContext, type DeckColorsValue } from './deckColors'
import { rangeHasRichTextStyle, restyleRichTextRange, type RichTextStyle } from './richText'
import { BLEND_MODES, LINE_POINTS_MIN } from './appearance'
import { FreeformExportMenu } from './FreeformExportMenu'
import { FreeformContextToolbar, type ContextToolbarSubject } from './FreeformContextToolbar'
import { FreeformInsertMenu } from './FreeformInsertMenu'
import { InspectorGlyph } from './InspectorGlyph'
import { isDefaultPageName, slideDisplayName } from './pageNames'
import { DELETE_KEY, isPlatformPasteShortcut, shortcutLabel } from './shortcutLabels'
import { staggerNewElement } from './insertPlacement'
import { InspectorNumberInput } from './InspectorNumberInput'
import { FreeformLayersPanel, layerLabel } from './FreeformLayersPanel'
import { FreeformPageSizePopover } from './FreeformPageSizePopover'
import { FreeformRightPanel, type FreeformRightPanelTab } from './FreeformRightPanel'
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
import { FreeformPageBackground, PAGE_BACKGROUND_PATH_KEY } from './FreeformPageBackground'
import { FreeformZoomControl } from './FreeformZoomControl'
import {
  FreeformSelectionOverlay,
  RESIZE_HANDLE_AXES,
  type ResizeHandle,
  type SelectionOverlayTarget,
  type SelectionOverlayInteraction,
} from './FreeformSelectionOverlay'
import { InspectorSection } from './InspectorSection'
import {
  createHistory,
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
  paintFallbackColor,
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
  transformPoint,
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
import { snapGuide, snapRotationDegrees, snapSceneDrag, type GuideSnap, type SnapLine } from './snapping'
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
  LinePoint,
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  ImageFraming,
  FreeformLineElement,
  FreeformSceneNode,
  FreeformNodeContentPatch,
  FreeformNodeGeometryPatch,
  FreeformNodeStylePatch,
  FreeformPathElement,
  FreeformShapeElement,
  FreeformSlide,
  BlendMode,
  PathFill,
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
import { getLang, t } from '../i18n'
import { useMediaQuery } from '../useMediaQuery'

const FIT_SCALE_EPSILON = 0.0001
const EXPORT_IMAGE_WAIT_MS = 3_500

/** Preset highlight colors for rich text spans (solid hex, 6 digits). */
const RICH_SPAN_COLORS = ['#d92d20', '#f97316', '#f79009', '#129211', '#1570ef', '#6941c6'] as const
/** Highlighter tints: light enough for dark words to stay legible on them. */
const RICH_SPAN_HIGHLIGHTS = ['#fef08a', '#fed7aa', '#fbcfe8', '#bbf7d0', '#bfdbfe', '#e9d5ff'] as const

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

const PATH_JOINS: Array<{ id: 'round' | 'miter' | 'bevel'; label: string }> = [
  { id: 'round', label: '圆滑' },
  { id: 'miter', label: '尖角' },
  { id: 'bevel', label: '斜切' },
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

type ToolDrawer = 'templates' | 'styles' | 'text' | 'images' | 'elements'

const FREEFORM_TEMPLATES = templatesForWorkspace('freeform')
/** Two columns in the 288px templates panel. */

/** Page list thumbnails share one width (smaller in narrow windows and the
 *  phone strip); the height follows each page's ratio, within bounds. */
function thumbFrame(slide: FreeformSlide, compact: boolean): { width: number; height: number } {
  const maxWidth = compact ? 52 : 80
  const maxHeight = compact ? 72 : 120
  const ratio = slide.width > 0 && slide.height > 0 ? slide.width / slide.height : 1
  const height = Math.min(maxHeight, maxWidth / ratio)
  return { width: Math.round(Math.min(maxWidth, height * ratio)), height: Math.round(height) }
}

/** Whether a dragged page lands before or after the hovered one: the list runs
 *  down the side on desktop and across under the stage on phones. */
function slideDropPosition(event: React.DragEvent<HTMLElement>): 'before' | 'after' {
  const bounds = event.currentTarget.getBoundingClientRect()
  const list = event.currentTarget.closest('.freeform-slide-list')
  const across = list !== null && getComputedStyle(list).flexDirection === 'row'
  return across
    ? (event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after')
    : (event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after')
}

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
  /** A picture node, a shape's picture fill, or the page's picture background (path []). */
  targetKind: 'image' | 'shape-fill' | 'page-background'
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

/** The framing target at a path: a node's picture, or (path []) the page's picture background. */
function imageFramingTargetForPath(slide: FreeformSlide, path: ScenePath): ImageFramingTarget | null {
  if (path.length > 0) return imageFramingTargetForNode(findNodeAtPath(slide.nodes, path))
  const background = slide.background
  if (background.type !== 'image') return null
  return {
    targetKind: 'page-background',
    logicalSrc: background.src,
    resolvedSrc: store.images.resolve(background.src),
    fit: background.fit,
    framing: background.framing,
    frameSize: { width: slide.width, height: slide.height },
    shape: null,
  }
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

/**
 * Crop and framing sessions belong to the document on screen and its owner.
 * Every document switch bumps the generation; the draft id stays out, because
 * a new project's first save hands it an id without changing the document.
 */
function imageFramingScopeKey(scopeGeneration: number, userId: string | null): string {
  return JSON.stringify([scopeGeneration, userId])
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
  if (target.targetKind === 'page-background') {
    return {
      type: 'slide/update',
      slideId,
      patch: { background: { type: 'image', src: target.logicalSrc, fit: target.fit, framing } },
    }
  }
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

/** Resize a new image element to its picture's aspect ratio, never upscaling it. */
function withNaturalAspect(
  element: FreeformImageElement,
  slide: FreeformSlide,
  natural: { width: number; height: number },
): FreeformImageElement {
  const scale = Math.min(1, element.width / natural.width, (slide.height * 0.7) / natural.height)
  const width = Math.max(1, Math.round(natural.width * scale))
  const height = Math.max(1, Math.round(natural.height * scale))
  return {
    ...element,
    x: Math.round((slide.width - width) / 2),
    y: Math.round((slide.height - height) / 2),
    width,
    height,
  }
}

/** The page itself is the root of every breadcrumb; everything below is a layer name. */
function breadcrumbLabel(breadcrumb: { name: string; path: readonly unknown[] }): string {
  return breadcrumb.path.length === 0 ? t(breadcrumb.name) : layerLabel(breadcrumb.name)
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

const EXPORT_EXTENSIONS = { png: 'png', jpeg: 'jpg', pdf: 'pdf' } as const

function slideExportName(index: number, format: keyof typeof EXPORT_EXTENSIONS): string {
  return `slide-${String(index + 1).padStart(2, '0')}.${EXPORT_EXTENSIONS[format]}`
}

function canvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
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

/** A new element's spot: centred in the page (stepped clear of one already
 *  there) or in the open group. */
function placeNewElementInScope<T extends FreeformElement>(
  element: T,
  slide: FreeformSlide,
  parentPath: ScenePath,
): T {
  const centred = centerNewElementInScope(element, slide.nodes, parentPath)
  return parentPath.length === 0 ? staggerNewElement(centred, slide.nodes, slide) : centred
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
type GuideDragState = { axis: 'x' | 'y'; guideId: string | null; position: number; target: GuideSnap['target'] }

function operationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? t(error.message) : fallback
}

/** Screen pixels in each dash (and gap) of a ruler guide. */
const GUIDE_DASH = 4
/** Screen pixels within which a dragged guide catches the page centre, its edges or an object. */
const GUIDE_SNAP_PX = 6

type GuideStyle = CSSProperties & { '--freeform-guide-dash': string }

/** A guide one screen pixel thick at `position`, its dashes kept the same length at any zoom. */
function guideStyle(axis: 'x' | 'y', position: number, renderScale: number): GuideStyle {
  return {
    ...(axis === 'x' ? { left: position, width: 1 / renderScale } : { top: position, height: 1 / renderScale }),
    '--freeform-guide-dash': `${GUIDE_DASH / renderScale}px`,
  }
}

const LOCKED_OPERATION_NOTICE = '图层已锁定，先解锁后再编辑'
const ACTIVE_INTERACTION_NOTICE = '请先结束当前变换'

function sceneStructureFailureMessage(
  operation: 'group' | 'ungroup' | 'insert',
  reason: SceneMutationError,
): string {
  if (reason === 'locked' || reason === 'locked-parent') {
    return operation === 'group'
      ? t('图层或父级已锁定，无法组合')
      : operation === 'ungroup'
        ? t('图层或父级已锁定，无法解组')
        : t(LOCKED_OPERATION_NOTICE)
  }
  if (operation === 'group') {
    if (reason === 'requires-two' || reason === 'empty-selection') {
      return t('至少选择两个同级图层后才能组合')
    }
    if (reason === 'invalid-selection') return t('只能组合同一组内的图层')
    if (reason === 'hidden') return t('隐藏图层无法组合')
    return t('当前图层无法组合')
  }
  if (operation === 'ungroup') {
    if (reason === 'not-group') return t('请选择一个或多个组合后再解组')
    return t('当前图层无法解组')
  }
  return t('无法在当前编辑范围内插入对象')
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

function isPathElement(element: FreeformElement | undefined): element is FreeformPathElement {
  return element?.type === 'path'
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
          {t('添加滤镜')}
        </button>
      </div>
    )
  }
  const fields: Array<{ key: keyof SceneFilter; label: string; min: number; max: number; fallback: number }> = [
    { key: 'brightness', label: t('亮度'), min: 0, max: 3, fallback: 1 },
    { key: 'contrast', label: t('对比度'), min: 0, max: 3, fallback: 1 },
    { key: 'saturation', label: t('饱和度'), min: 0, max: 3, fallback: 1 },
    { key: 'blur', label: t('模糊'), min: 0, max: 100, fallback: 0 },
  ]
  return (
    <>
      <div className="field-grid">
        {fields.map(({ key, label, min, max, fallback }) => (
          <label key={key}>
            {label}
            <InspectorNumberInput
              ariaLabel={t('滤镜{name}', { name: label })}
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
          {t('清除滤镜')}
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
          {t('添加阴影')}
        </button>
      </div>
    )
  }
  return (
    <>
      <div className="field-grid with-gap">
        <div className="stroke-color-field" data-testid="shadow-color">
          <span className="stroke-color-label">{t('颜色')}</span>
          <div className="color-field">
            <span className="color-field-value">
              {shadow.color === 'transparent' ? t('透明') : shadow.color.toUpperCase()}
            </span>
            <ColorPickerButton
              label={t('阴影颜色')}
              color={shadow.color}
              onChange={(color) => onChange({ ...shadow, color })}
            />
          </div>
        </div>
        <label title={t('阴影模糊')}>
          <InspectorGlyph name="blur" />
          <InspectorNumberInput
            ariaLabel={t('阴影模糊')}
            min={0}
            max={400}
            resetKey={resetKey}
            value={shadow.blur}
            onCommit={(value) => onChange({ ...shadow, blur: value })}
          />
        </label>
      </div>
      <div className="field-grid">
        <label title={t('阴影水平偏移')}>
          <span className="field-glyph" aria-hidden="true">X</span>
          <InspectorNumberInput
            ariaLabel={t('阴影水平偏移')}
            min={-1000}
            max={1000}
            resetKey={resetKey}
            value={shadow.offsetX}
            onCommit={(value) => onChange({ ...shadow, offsetX: value })}
          />
        </label>
        <label title={t('阴影垂直偏移')}>
          <span className="field-glyph" aria-hidden="true">Y</span>
          <InspectorNumberInput
            ariaLabel={t('阴影垂直偏移')}
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
          {t('清除阴影')}
        </button>
      </div>
    </>
  )
}

const ALIGN_ACTIONS = [
  { id: 'left', testId: 'left', label: '左对齐', icon: 'M4 3v14M7 6.5h9M7 13.5h5.5' },
  { id: 'h-center', testId: 'hcenter', label: '水平居中', icon: 'M10 3v14M5 6.5h10M6.75 13.5h6.5' },
  { id: 'right', testId: 'right', label: '右对齐', icon: 'M16 3v14M4 6.5h9M7.5 13.5H13' },
  { id: 'top', testId: 'top', label: '顶对齐', icon: 'M3 4h14M6.5 7v9M13.5 7v5.5' },
  { id: 'v-center', testId: 'vcenter', label: '垂直居中', icon: 'M3 10h14M6.5 5v10M13.5 6.75v6.5' },
  { id: 'bottom', testId: 'bottom', label: '底对齐', icon: 'M3 16h14M6.5 4v9M13.5 7.5V13' },
] as const

/** Files taken from one drop; the rest are ignored. */
const MAX_DROPPED_IMAGES = 10
/** Page units between images dropped together, so each one stays visible. */
const DROPPED_IMAGE_CASCADE = 32

/** A menu item's keyboard shortcut; hidden from the accessible name, which stays the action. */
function MenuShortcut({ keys }: { keys: string }) {
  return <kbd className="freeform-context-menu-shortcut" aria-hidden="true">{keys}</kbd>
}

type TextPresetId = 'box' | 'heading' | 'subheading' | 'body'

/** The text panel's entries; `box` is its primary button, the rest are styles. */
const TEXT_PRESETS: Array<{ id: TextPresetId; testId: string; label: string }> = [
  { id: 'box', testId: 'insert-text', label: '添加文本框' },
  { id: 'heading', testId: 'insert-text-heading', label: '添加标题' },
  { id: 'subheading', testId: 'insert-text-subheading', label: '添加副标题' },
  { id: 'body', testId: 'insert-text-body', label: '添加一段正文' },
]

const TEXT_PRESET_STYLES: Record<Exclude<TextPresetId, 'box'>, {
  text: string
  fontSize: number
  fontWeight: 'bold' | 'normal'
  lineHeight: number
  height: number
  maxWidth: number
  widthRatio: number
}> = {
  heading: { text: '添加标题', fontSize: 88, fontWeight: 'bold', lineHeight: 1.15, height: 110, maxWidth: 860, widthRatio: 0.8 },
  subheading: { text: '添加副标题', fontSize: 52, fontWeight: 'bold', lineHeight: 1.2, height: 70, maxWidth: 720, widthRatio: 0.68 },
  body: {
    text: '在这里写一段正文，说说你想分享的内容。',
    fontSize: 30,
    fontWeight: 'normal',
    lineHeight: 1.55,
    height: 104,
    maxWidth: 640,
    widthRatio: 0.6,
  },
}

const TEXT_ALIGN_OPTIONS = [
  { id: 'left', label: '文字左对齐', icon: 'M2.5 4h11M2.5 8h7M2.5 12h9' },
  { id: 'center', label: '文字居中', icon: 'M2.5 4h11M4.5 8h7M3.5 12h9' },
  { id: 'right', label: '文字右对齐', icon: 'M2.5 4h11M6.5 8h7M4.5 12h9' },
] as const

const LAYER_ORDER_ACTIONS = [
  { id: 'front', label: '置顶', icon: 'M10 16V7M6.5 10.5 10 7l3.5 3.5M5 3.5h10' },
  { id: 'forward', label: '前移', icon: 'M10 15.5V5.5M6.5 9 10 5.5 13.5 9' },
  { id: 'backward', label: '后移', icon: 'M10 4.5v10M6.5 11 10 14.5l3.5-3.5' },
  { id: 'back', label: '置底', icon: 'M10 4v9M6.5 9.5 10 13l3.5-3.5M5 16.5h10' },
] as const

export function FreeformWorkspace({
  isActive,
  user,
  ownerId,
  transfer = null,
  requestAuth,
  chrome,
  request = null,
  onMetaChange,
}: WorkspaceShellProps) {
  const [history, setHistory] = useState<HistoryState<FreeformDocument>>(() =>
    createHistory(createFreeformDocument()),
  )
  const doc = history.current
  const activeSlide = activeSlideOf(doc)
  const activeSlideIndex = doc.slides.indexOf(activeSlide)
  const selectedElementIds = useRef<string[]>([])
  const initialSceneIdentity: SceneUiIdentity = {
    activeSlideId: activeSlide.id,
    draftId: null,
    userId: ownerId,
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
    /** Opened from the thumbnail's 「…」 button, so the keyboard lands in the menu. */
    fromButton?: boolean
  } | null>(null)
  const slideContextMenuRef = useRef<HTMLDivElement>(null)
  const slideMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  /** ⌘V was pressed and the browser's paste event is on its way. */
  const pendingPasteRef = useRef<{ inPlace: boolean } | null>(null)
  const slideListRef = useRef<HTMLDivElement>(null)
  // Narrow windows get smaller page thumbnails (the same width as the CSS breakpoint).
  const compactPageStrip = useMediaQuery('(max-width: 1100px)')
  const dragSlideIdRef = useRef<string | null>(null)
  const [slideDropTarget, setSlideDropTarget] = useState<{
    slideId: string
    position: 'before' | 'after'
  } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
  const [showMixedSizeWarning, setShowMixedSizeWarning] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [galleryTemplateId, setGalleryTemplateId] = useState<string | undefined>(undefined)
  /** The insert panel docked beside the tool rail; one at a time. */
  const [toolDrawer, setToolDrawer] = useState<ToolDrawer | null>(null)
  // The icon picker gets one stable handler, so editor renders skip its grid.
  const addIconRef = useRef<(icon: IconDefinition) => void>(() => undefined)
  const pickIcon = useCallback((icon: IconDefinition) => addIconRef.current(icon), [])
  const [panelTab, setPanelTab] = useState<FreeformRightPanelTab>('properties')
  const [textSelection, setTextSelection] = useState<{
    path: ScenePath
    start: number
    end: number
  } | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [projectTitle, setProjectTitle] = useState(() => t('未命名设计'))
  /** Renamed since the last save. */
  const [titleDirty, setTitleDirty] = useState(false)
  // What is on screen was asked for (new, a template, a project): don't swap the last session in.
  const explicitDocumentRef = useRef(false)
  // Bumped whenever the document is replaced, so a slow session restore can't overwrite it.
  const restoreGenerationRef = useRef(0)
  const handledRequestRef = useRef(0)
  const openDraftRef = useRef<(draft: Draft) => void>(() => {})
  const [operationNotice, setOperationNotice] = useState<string | null>(null)
  const [fileDragActive, setFileDragActive] = useState(false)
  const fileDragDepthRef = useRef(0)
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

  /** Opens the settings panel on `tab`; asking again for the tab on show closes it. */
  function togglePanel(tab: FreeformRightPanelTab) {
    if (viewPrefs.panelOpen && panelTab === tab) {
      updateViewPrefs({ panelOpen: false })
      return
    }
    setPanelTab(tab)
    if (!viewPrefs.panelOpen) updateViewPrefs({ panelOpen: true })
  }

  function toggleToolDrawer(drawer: ToolDrawer) {
    setToolDrawer((current) => (current === drawer ? null : drawer))
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
  const menuSelectionIsImage = menuSelectionNodes.length === 1 && menuSelectionNodes[0].type === 'image'
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
  const fontInputRef = useRef<HTMLInputElement>(null)
  // Whether the font being imported goes onto the selected texts (picked from a text's font menu).
  const fontImportForSelectionRef = useRef(false)
  const importedFonts = useImportedFonts()
  const shapeFillInputRef = useRef<HTMLInputElement>(null)
  const pageBackgroundInputRef = useRef<HTMLInputElement>(null)
  const [pageBackgroundPending, setPageBackgroundPending] = useState(false)
  const shapeFillOperationTokensRef = useRef(new Map<string, symbol>())
  // Starts unknown, so an editor opened with a known owner reopens their last project.
  const previousOwnerId = useRef<string | null>(null)
  const documentIdentityGenerationRef = useRef(0)
  const inspectorNumberResetGenerationRef = useRef(0)
  const historyRef = useRef(history)
  const currentDocumentRef = useRef(doc)
  const currentDraftIdRef = useRef(draftId)
  // The owner (an account or this device's guest) the open project belongs to.
  const currentOwnerIdRef = useRef<string | null>(ownerId)
  const transferRef = useRef(transfer)
  const successfulSaveRef = useRef<{
    source: FreeformDocument
    document: FreeformDocument
    updatedAt: number
  } | null>(null)

  const projectTitleRef = useRef(projectTitle)
  const savedAtRef = useRef(savedAt)
  const titleDirtyRef = useRef(titleDirty)
  // The document as stored (or as opened); a different current document still needs saving.
  const persistedDocRef = useRef(doc)
  // The project an account's expired session left unsaved work in (see the owner effect).
  const parkedProjectRef = useRef<{ userId: string; draftId: string | null } | null>(null)
  const [parkedFor, setParkedFor] = useState<string | null>(null)
  // What autosave was last handed, so leaving a project doesn't queue it twice.
  const scheduledDocRef = useRef<FreeformDocument | null>(null)
  const scheduledTitleRef = useRef<string | null>(null)
  projectTitleRef.current = projectTitle
  savedAtRef.current = savedAt
  titleDirtyRef.current = titleDirty
  selectedElementIds.current = selection
  historyRef.current = history
  currentDocumentRef.current = doc
  currentDraftIdRef.current = draftId
  currentOwnerIdRef.current = ownerId
  transferRef.current = transfer
  const ownerStore = storeFor(ownerId ?? GUEST_OWNER_ID)
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
    ? t('请先解锁图片')
    : selectedShapeFillPending
      ? t('图片正在处理中')
      : selectedImageTarget?.fit === 'contain'
        ? selectedImageTarget.targetKind === 'image'
          ? t('请先切换到填满模式后裁剪')
          : t('适应模式不支持调整取景')
        : !selectedImageNaturalSize
          ? selectedImageTarget?.targetKind === 'image'
            ? t('图片加载完成后可裁剪')
            : t('图片加载完成后可调整取景')
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
  const pageBackgroundTarget = useMemo(
    () => imageFramingTargetForPath(activeSlide, []),
    [activeSlide],
  )
  const pageBackgroundNaturalSize = pageBackgroundTarget
    ? readReadyImage(imageReadiness, imageDecodeIdentityForTarget(
        documentIdentityGenerationRef.current,
        activeSlide.id,
        [],
        pageBackgroundTarget,
      ))
    : null
  const pageFramingDisabledReason = pageBackgroundPending
    ? t('图片正在处理中')
    : pageBackgroundTarget?.fit === 'contain'
      ? t('适应模式不支持调整取景')
      : !pageBackgroundNaturalSize
        ? t('图片加载完成后可调整取景')
        : null
  const canAdjustPageFraming = Boolean(
    pageBackgroundTarget && pageBackgroundTarget.fit === 'cover' && !pageFramingDisabledReason,
  )
  const canResetPageFraming = Boolean(
    pageBackgroundTarget
    && pageBackgroundTarget.fit === 'cover'
    && !pageBackgroundPending
    && !imageFramingEquals(pageBackgroundTarget.framing, createDefaultImageFraming()),
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
    setOperationNotice(t(LOCKED_OPERATION_NOTICE))
  }, [])
  const blockDocumentMutationDuringInteraction = useCallback(() => {
    if (
      !activeInteractionRef.current
      && marqueePointerIdRef.current === null
      && !framingSessionRef.current
      && !imageCropSessionRef.current
    ) return false
    setOperationNotice(t(ACTIVE_INTERACTION_NOTICE))
    return true
  }, [])
  const handleImageLeaseError = useCallback((error: unknown) => {
    showOperationError(error, t('图片续租失败，请检查网络后重试'))
  }, [showOperationError])
  const retainImagesNow = useImageLease(
    imageSources,
    ownerId !== null && ownerStore.remote,
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
    const path = report.identity.scenePathKey === PAGE_BACKGROUND_PATH_KEY
      ? []
      : scenePathFromKey(report.identity.scenePathKey)

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
          setOperationNotice(t('图片加载失败，请重试'))
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
      ? imageFramingTargetForPath(slide, path)
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
      setOperationNotice(t('图片加载失败，请重试'))
    } else if (report.status === 'ready' && followsInvalidatedCrop) {
      invalidatedCropDecodeIdentityRef.current = null
    }
  }, [activeGroupPath, imageReadinessRefresh])

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

  // The current page stays in view in the page list. Only the list scrolls, so
  // the phone layout doesn't jump to its page strip.
  useLayoutEffect(() => {
    const list = slideListRef.current
    const thumb = list?.querySelector<HTMLElement>(`.freeform-thumb[data-slide-id="${CSS.escape(activeSlide.id)}"]`)
    if (!list || !thumb) return
    const area = list.getBoundingClientRect()
    const box = thumb.getBoundingClientRect()
    const margin = 8
    if (box.top < area.top) list.scrollTop -= area.top - box.top + margin
    else if (box.bottom > area.bottom) list.scrollTop += box.bottom - area.bottom + margin
    if (box.left < area.left) list.scrollLeft -= area.left - box.left + margin
    else if (box.right > area.right) list.scrollLeft += box.right - area.right + margin
  }, [activeSlide.id, doc.slides.length, viewPrefs.pagesVisible])

  useEffect(() => {
    if (!slideContextMenu?.fromButton) return
    slideContextMenuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus({ preventScroll: true })
  }, [slideContextMenu?.slideId, slideContextMenu?.fromButton])

  // Pictures on the system clipboard (a screenshot, an image copied from a
  // page) paste into the middle of the page, stepped clear like any insert.
  useEffect(() => {
    if (!isActive) return
    const onPaste = (event: ClipboardEvent) => {
      const pending = pendingPasteRef.current
      pendingPasteRef.current = null
      if (isTypingTarget(event.target)) return
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return
      if (framingSessionRef.current || imageCropSessionRef.current) return
      const pictures = imageFiles(event.clipboardData?.files).slice(0, MAX_DROPPED_IMAGES)
      event.preventDefault()
      if (pictures.length > 0) {
        void insertDroppedImages(pictures, null)
        return
      }
      pasteClipboard(pending?.inPlace ?? false)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  // Clicking anywhere outside the open context menus dismisses them.
  useEffect(() => {
    if (!contextMenu && !slideContextMenu) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && (
        contextMenuRef.current?.contains(target)
        || slideContextMenuRef.current?.contains(target)
      )) return
      if (target instanceof Element && target.closest('.freeform-thumb-menu')) return
      setContextMenu(null)
      setSlideContextMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [contextMenu, slideContextMenu])

  // Autosave: every edit lands in the owner's project a moment later.
  const autosave = useProjectAutosave<{ title: string }>((saved, content, tag) => {
    if (saved.mode !== 'freeform-slide' || content.mode !== 'freeform-slide') return
    const snapshot = content.document
    updateDraftId(saved.id)
    const owner = currentOwnerIdRef.current
    if (owner) updateLastSession(owner, { mode: 'freeform-slide', freeformDraftId: saved.id })
    successfulSaveRef.current = { source: snapshot, document: saved.document, updatedAt: saved.updatedAt }
    const interacting = Boolean(
      activeInteractionRef.current
      || marqueePointerIdRef.current !== null
      || framingSessionRef.current
      || imageCropSessionRef.current,
    )
    // Remote saves upload inline images; adopt the uploaded copy if nothing changed since.
    if (storeFor(owner ?? GUEST_OWNER_ID).remote && !interacting) {
      updateHistory((current) => (
        Object.is(current.current, snapshot) ? { ...current, current: saved.document } : current
      ))
    }
    const current = currentDocumentRef.current
    persistedDocRef.current = Object.is(current, saved.document) ? saved.document : snapshot
    if (Object.is(current, snapshot) || Object.is(current, saved.document)) setSavedAt(saved.updatedAt)
    if (tag.title === projectTitleRef.current) {
      titleDirtyRef.current = false
      setTitleDirty(false)
    }
  })
  const { schedule: scheduleSave, release: releaseSave, discard: discardSave } = autosave

  // Leaving the editor (for the workbench, say): don't wait out the pause.
  const flushSave = autosave.flush
  useEffect(() => {
    if (!isActive) void flushSave()
  }, [flushSave, isActive])

  // A different owner (signing in or out, or the session check settling): the
  // open project belongs to the previous one.
  useEffect(() => {
    const next = ownerId
    const previous = previousOwnerId.current
    if (previous === next) return
    // Edits that never reached the previous owner (its saves were failing, say an expired session).
    const hadUnsavedEdits = titleDirtyRef.current
      || (savedAtRef.current === null && historyRef.current.past.length > 0)
    cancelFramingBeforeTransition(previous)
    previousOwnerId.current = next
    const parked = parkedProjectRef.current
    const sessionEnded = previous !== null && !isGuestOwner(previous) && isGuestOwner(next) && hadUnsavedEdits
    // A crop that just committed still belongs to the previous owner.
    if (previous !== null && !sessionEnded && !parked) leaveDocument(previous)
    else releaseSave()
    documentIdentityGenerationRef.current += 1
    shapeFillOperationTokensRef.current.clear()
    setPendingShapeFillKeys(new Set())
    clearAllImageReadinessNow()
    successfulSaveRef.current = null
    setSavedAt(null)
    setOperationNotice(null)
    if (sessionEnded) {
      // The session ended before these edits were saved: keep them on screen
      // for that account instead of filing them under the guest.
      parkedProjectRef.current = { userId: previous, draftId: currentDraftIdRef.current }
      setParkedFor(previous)
      updateDraftId(null)
      return
    }
    parkedProjectRef.current = null
    setParkedFor(null)
    if (next === null) return
    if (parked) {
      if (parked.userId === next) {
        // Signed back in: the kept edits go into the same project.
        updateDraftId(parked.draftId)
        return
      }
      // Someone else signed in: keep the edits on this device rather than drop them.
      leaveDocument(GUEST_OWNER_ID)
    }
    const moved = currentDraftIdRef.current ? transferRef.current?.get(currentDraftIdRef.current) : undefined
    if (moved?.mode === 'freeform-slide') {
      // The guest project on screen just moved into this account: keep editing
      // it there. Whatever it still had queued went to the guest copy above.
      persistedDocRef.current = currentDocumentRef.current
      titleDirtyRef.current = false
      openDraft(moved)
      return
    }
    if (previous === null && !parked) {
      // The session check settled: anything made meanwhile is saved for the
      // owner; otherwise pick up where they left off.
      updateDraftId(null)
      if (!hadUnsavedEdits && !explicitDocumentRef.current) restoreLastProject(next)
      return
    }
    explicitDocumentRef.current = false
    startFreshDocument(createFreeformDocument(), undefined, false)
    restoreLastProject(next)
  }, [clearAllImageReadinessNow, ownerId, releaseSave, updateDraftId])

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
      setOperationNotice(t('图片加载失败，请重试'))
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
    ownerId,
  ])

  useEffect(() => {
    const identity: SceneUiIdentity = {
      activeSlideId: activeSlide.id,
      draftId,
      userId: ownerId,
    }
    setSceneUiState((current) => reconcileSceneUiState(activeSlide.nodes, current, identity))
  }, [activeSlide.id, activeSlide.nodes, draftId, ownerId])

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

  /** Restyle every page from the 风格 drawer: one undo step per choice. */
  const restyleDeck = useCallback((request: RestyleRequest) => {
    applyAction({ type: 'document/restyle', ...request })
  }, [applyAction])
  const deckColorsValue = useMemo<DeckColorsValue>(() => ({
    colors: deckColors(doc).map((entry) => entry.color),
    replace: (from, to) => restyleDeck({ colors: { [from]: to } }),
  }), [doc, restyleDeck])
  // The font a text was just moved off, for 全部替换 under its font menu.
  const [fontSwap, setFontSwap] = useState<{ from: string; to: string } | null>(null)
  const deckFamilies = useMemo(() => new Set(deckFonts(doc).map((font) => font.fontFamily)), [doc])
  const fontSwapOwner = selectionPaths.map((path) => path.join('/')).join('|')
  useEffect(() => { setFontSwap(null) }, [fontSwapOwner])

  /** Apply a few actions as one undo step; nothing happens unless every one of them changes something. */
  const applyActionGroup = useCallback((actions: FreeformAction[], label: string) => {
    if (blockDocumentMutationDuringInteraction()) return false
    const start = currentDocumentRef.current
    let next = start
    for (const action of actions) {
      const reduced = freeformReducer(next, action)
      if (Object.is(reduced, next)) return false
      next = reduced
    }
    let applied = false
    updateHistory((current) => {
      if (!Object.is(current.current, start)) return current
      applied = true
      return pushHistory(current, next, label)
    })
    if (applied) setSavedAt(null)
    return applied
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

  /** Restyle the selected characters; the styles they already have stay unless `change` drops them. */
  function restyleSelectedText(change: (style: RichTextStyle) => RichTextStyle) {
    if (!selectedPath || !isTextElement(selectedElement) || !activeTextRange) return
    const next = restyleRichTextRange(
      selectedElement.spans,
      activeTextRange,
      change,
      selectedElement.text.length,
    )
    if (!next) return
    updateSelectedStyle({ spans: next })
  }

  const selectedTextIsBold = Boolean(
    activeTextRange && isTextElement(selectedElement)
    && rangeHasRichTextStyle(selectedElement.spans, activeTextRange, (style) => style.bold === true),
  )
  const selectedTextIsUnderlined = Boolean(
    activeTextRange && isTextElement(selectedElement)
    && rangeHasRichTextStyle(selectedElement.spans, activeTextRange, (style) => style.underline === true),
  )

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

  const commitLiveEdit = useCallback((startDocument: FreeformDocument, label = t('编辑')) => {
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
    scopeUserId = currentOwnerIdRef.current,
  ): { slide: FreeformSlide; target: ImageFramingTarget } | null {
    if (!framingSessionBelongsToScope(session, scopeUserId)) return null
    const slide = currentDocumentRef.current.slides.find(
      (candidate) => candidate.id === session.slideId,
    )
    if (!slide) return null
    const target = imageFramingTargetForPath(slide, session.path)
    if (
      !target
      || target.targetKind !== session.targetKind
      || target.logicalSrc !== session.logicalSrc
      || target.resolvedSrc !== session.resolvedSrc
    ) return null
    return { slide, target }
  }

  function framingSessionBelongsToCurrentScope(session: ImageFramingSession): boolean {
    return framingSessionBelongsToScope(session, currentOwnerIdRef.current)
  }

  function framingSessionBelongsToScope(
    session: ImageFramingSession,
    scopeUserId: string | null,
  ): boolean {
    return session.scopeGeneration === documentIdentityGenerationRef.current
      && session.draftScopeKey === imageFramingScopeKey(
        documentIdentityGenerationRef.current,
        scopeUserId,
      )
  }

  function imageCropSessionBelongsToScope(
    session: ImageCropDisplaySession,
    scopeUserId: string | null,
  ): boolean {
    return session.scopeGeneration === documentIdentityGenerationRef.current
      && session.draftScopeKey === imageFramingScopeKey(
        documentIdentityGenerationRef.current,
        scopeUserId,
      )
  }

  function currentImageCropAuthorityForSession(
    session: ImageCropDisplaySession,
    scopeUserId = currentOwnerIdRef.current,
  ): {
    slide: FreeformSlide
    node: FreeformImageElement
    identity: ImageDecodeIdentity
  } | null {
    if (!imageCropSessionBelongsToScope(session, scopeUserId)) return null
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
    scopeUserId = currentOwnerIdRef.current,
  ): { slide: FreeformSlide; node: FreeformImageElement } | null {
    const current = currentImageCropAuthorityForSession(session, scopeUserId)
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
    if (current) setOperationNotice(t('图片加载失败，请重试'))
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
        currentOwnerIdRef.current,
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
    setOperationNotice(changed ? null : t('当前裁剪范围无法应用该比例'))
  }

  function finishImageCrop(
    reason: ImageCropFinishReason = 'done',
    scopeUserId = currentOwnerIdRef.current,
  ): LiveEditCommitResult | null {
    const finished = imageCropSessionApi.finish(reason)
    if (!finished) {
      imageCropSessionRef.current = null
      invalidatedCropDecodeIdentityRef.current = null
      return null
    }

    const { session, draft } = finished
    const current = currentTargetForImageCropSession(session, scopeUserId)
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
      setOperationNotice(t('图片裁剪未能应用，请重试'))
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
      t('调整裁切'),
    )
    setOperationNotice(result === 'rejected' ? t('图片裁剪未能应用，请重试') : null)
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
    return openFramingSession(document, slide, path, target)
  }

  /** Frame the page's picture background, the way a picture node is framed. */
  function startPageBackgroundFraming(): boolean {
    if (framingSessionRef.current || blockDocumentMutationDuringInteraction()) return false
    const document = currentDocumentRef.current
    const slide = document.slides.find((candidate) => candidate.id === document.activeSlideId)
    if (!slide || slide.id !== activeSlide.id) return false
    const target = imageFramingTargetForPath(slide, [])
    if (!target || target.fit !== 'cover') return false
    return openFramingSession(document, slide, [], target)
  }

  function openFramingSession(
    document: FreeformDocument,
    slide: FreeformSlide,
    path: ScenePath,
    target: ImageFramingTarget,
  ): boolean {
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
        currentOwnerIdRef.current,
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
    // Framing the page's picture leaves nothing selected; a node's keeps it selected.
    setSelection(path.length > 0 ? [path[path.length - 1]] : [])
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
      commitLiveEdit(session.startDocument, t('调整取景'))
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
    scopeUserId = currentOwnerIdRef.current,
  ) {
    const cropSession = imageCropSessionRef.current
    if (cropSession) {
      if (currentTargetForImageCropSession(cropSession, scopeUserId)) {
        finishImageCrop('transition', scopeUserId)
      } else {
        clearImageCropSession()
      }
    }
    const session = framingSessionRef.current
    if (session) {
      if (currentTargetForFramingSession(session, scopeUserId)) {
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
    const index = doc.slides.findIndex((candidate) => candidate.id === slideId)
    if (index < 0) return
    slideRenameCompositionRef.current = false
    setRenamingSlideId(slideId)
    setSlideRenameValue(slideDisplayName(doc.slides[index].name, index))
    requestAnimationFrame(() => {
      slideRenameInputRef.current?.focus()
      slideRenameInputRef.current?.select()
    })
  }

  /** Empty names keep the current one; an unchanged name records no history. */
  function commitSlideRename() {
    slideRenameCompositionRef.current = false
    const slideId = renamingSlideId
    const index = doc.slides.findIndex((candidate) => candidate.id === slideId)
    const slide = doc.slides[index]
    if (slideId && slide) {
      // Confirming the name as shown (「第 2 页」 for an automatic one) is no rename.
      const nextName = slideRenameValue.trim()
      if (nextName && nextName !== slide.name && nextName !== slideDisplayName(slide.name, index)) {
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

  function toggleSlideMenu(event: React.MouseEvent<HTMLButtonElement>, slideId: string) {
    if (framingSessionRef.current || imageCropSessionRef.current) return
    event.stopPropagation()
    if (slideContextMenu?.slideId === slideId) {
      setSlideContextMenu(null)
      return
    }
    if (slideId !== activeSlide.id) selectSlide(slideId)
    const bounds = event.currentTarget.getBoundingClientRect()
    slideMenuButtonRef.current = event.currentTarget
    setContextMenu(null)
    setSlideContextMenu({ slideId, x: bounds.left, y: bounds.bottom + 4, fromButton: true })
  }

  function closeSlideMenu(returnFocus: boolean) {
    const opener = slideContextMenu?.fromButton ? slideMenuButtonRef.current : null
    setSlideContextMenu(null)
    if (returnFocus && opener?.isConnected) opener.focus({ preventScroll: true })
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
    const node = placeNewElementInScope(element, activeSlide, parentPath)
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

  function addTextPreset(preset: TextPresetId, look?: TextStylePreset) {
    const base = createTextElement(activeSlide)
    if (preset === 'box') {
      insertNewElement({ ...base, text: t(base.text) })
      return
    }
    const style = TEXT_PRESET_STYLES[preset]
    const width = Math.min(style.maxWidth, Math.round(activeSlide.width * style.widthRatio))
    insertNewElement({
      ...base,
      x: Math.round((activeSlide.width - width) / 2),
      y: Math.round((activeSlide.height - style.height) / 2),
      width,
      height: style.height,
      text: t(style.text),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      ...(look ? { textFill: structuredClone(look.textFill), ...(look.effect ? { effect: { ...look.effect } } : {}) } : {}),
    })
  }

  /** 花字: the selected texts take the look in one step; with no text selected, a new heading in it. */
  function applyTextStylePreset(preset: TextStylePreset) {
    if (blockDocumentMutationDuringInteraction()) return
    const patch = textStylePatch(preset)
    const updates = selectionPaths.flatMap((path) => {
      const node = findNodeAtPath(activeSlide.nodes, path)
      return node?.type === 'text' ? [{ path: [...path], patch }] : []
    })
    if (updates.length === 0) {
      addTextPreset('heading', preset)
      return
    }
    const changed = applyAction({ type: 'node/update-style', slideId: activeSlide.id, updates }, t('套用花字'))
    if (!changed && (effectiveLockedSelection || lockedDescendantSelection)) showLockedOperationNotice()
  }

  function addShape(shape: FreeformShapeElement['shape']) {
    insertNewElement(createShapeElement(activeSlide, shape))
  }

  function addLine(lineKind: FreeformLineElement['lineKind']) {
    insertNewElement(createLineElement(activeSlide, lineKind))
  }

  function addIcon(icon: IconDefinition) {
    insertNewElement(createPathElement(activeSlide, {
      name: icon.zh,
      d: icon.d,
      viewBox: ICON_VIEWBOX,
      size: Math.max(48, Math.round(Math.min(activeSlide.width, activeSlide.height) * 0.15)),
      strokeWidth: ICON_STROKE_WIDTH,
    }))
  }
  addIconRef.current = addIcon

  async function insertImageElement(
    loadSource: () => Promise<string>,
    alt: string,
    natural?: { width: number; height: number },
    /** Page point the image is centred on (a drop); otherwise it lands in the middle, clear of one already there. */
    placeAt?: { x: number; y: number },
  ) {
    if (blockDocumentMutationDuringInteraction()) return
    const targetIdentityGeneration = documentIdentityGenerationRef.current
    const targetUserId = currentOwnerIdRef.current
    const targetSlideId = activeSlide.id
    const targetParentPath = [...activeGroupPath]
    const src = await loadSource()
    if (
      targetIdentityGeneration !== documentIdentityGenerationRef.current ||
      targetUserId !== currentOwnerIdRef.current
    ) return
    if (blockDocumentMutationDuringInteraction()) return
    const currentSlide = currentDocumentRef.current.slides.find((slide) => slide.id === targetSlideId)
    if (!currentSlide) return
    const created = createImageElement(currentSlide, src, alt)
    const sized = natural ? withNaturalAspect(created, currentSlide, natural) : created
    const element = placeAt && targetParentPath.length === 0
      ? {
          ...sized,
          x: Math.round(Math.max(0, Math.min(placeAt.x - sized.width / 2, currentSlide.width - sized.width))),
          y: Math.round(Math.max(0, Math.min(placeAt.y - sized.height / 2, currentSlide.height - sized.height))),
        }
      : placeNewElementInScope(sized, currentSlide, targetParentPath)
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

  async function addImageFromFile(file: File, placeAt?: { x: number; y: number }) {
    const images = ownerStore
    await insertImageElement(async () => {
      if (images.remote) await retainImagesNow()
      const raw = await readFileAsDataUrl(file)
      const downscaled = await downscaleDataUrl(raw, 1800)
      return images.images.put(downscaled)
    }, file.name, undefined, placeAt)
  }

  function carriesFiles(event: React.DragEvent) {
    return Array.from(event.dataTransfer.types).includes('Files')
  }

  // Picture files dragged in from the desktop land where they are dropped.
  // Every file drag is claimed, so a stray drop never opens the file in the tab.
  function onStageFileDragEnter(event: React.DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    fileDragDepthRef.current += 1
    if (!framingSessionRef.current && !imageCropSessionRef.current) setFileDragActive(true)
  }

  function onStageFileDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = framingSessionRef.current || imageCropSessionRef.current ? 'none' : 'copy'
  }

  function onStageFileDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setFileDragActive(false)
  }

  function onStageFileDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    fileDragDepthRef.current = 0
    setFileDragActive(false)
    if (framingSessionRef.current || imageCropSessionRef.current) return
    const files = imageFiles(event.dataTransfer.files).slice(0, MAX_DROPPED_IMAGES)
    if (files.length === 0) {
      setOperationNotice(t('这里只能放图片'))
      return
    }
    const point = rawArtboardPointFromClient(event.clientX, event.clientY)
    const onPage = point !== null
      && point.x >= 0 && point.y >= 0
      && point.x <= activeSlide.width && point.y <= activeSlide.height
    void insertDroppedImages(files, onPage ? point : null)
  }

  async function insertDroppedImages(files: readonly File[], point: { x: number; y: number } | null) {
    for (const [index, file] of files.entries()) {
      try {
        await addImageFromFile(file, point
          ? { x: point.x + index * DROPPED_IMAGE_CASCADE, y: point.y + index * DROPPED_IMAGE_CASCADE }
          : undefined)
      } catch (error) {
        showOperationError(error, t('图片插入失败，请稍后重试'))
        return
      }
    }
  }

  async function addImageFromAsset(asset: Asset) {
    const owner = ownerId
    if (!owner) return
    // The user is editing this document now; a late last-session restore must not replace it.
    restoreGenerationRef.current += 1
    try {
      await insertImageElement(() => assetDocumentSource(asset, owner), asset.name, asset)
    } catch (error) {
      showOperationError(error, t('图片插入失败，请稍后重试'))
    }
  }

  function openFontImport(forSelection: boolean) {
    fontImportForSelectionRef.current = forSelection
    fontInputRef.current?.click()
  }

  async function handleFontInput(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      const font = await fontLibrary.importFile(file)
      if (fontImportForSelectionRef.current && selectedElement?.type === 'text') {
        updateSelectedStyle({ fontFamily: importedFontStack(font.family) })
      }
    } catch (error) {
      showOperationError(error, t('字体导入失败，请稍后重试'))
    } finally {
      if (fontInputRef.current) fontInputRef.current.value = ''
    }
  }

  async function handleImageInput(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      await addImageFromFile(file)
    } catch (error) {
      showOperationError(error, t('图片插入失败，请稍后重试'))
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  async function fillSelectedShapeFromFile(file: File) {
    const targetPath = selectedPath ? [...selectedPath] : null
    const targetSlideId = activeSlide.id
    const targetIdentityGeneration = documentIdentityGenerationRef.current
    const targetUserId = currentOwnerIdRef.current
    const targetNode = targetPath
      ? findNodeAtPath(
          currentDocumentRef.current.slides.find((slide) => slide.id === targetSlideId)?.nodes ?? [],
          targetPath,
        )
      : undefined
    if (targetNode?.type !== 'shape' || !targetPath) return
    const operation = beginShapeFillOperation(targetSlideId, targetPath)
    const images = ownerStore
    try {
      if (images.remote) await retainImagesNow()
      const raw = await readFileAsDataUrl(file)
      const downscaled = await downscaleDataUrl(raw, 1800)
      const src = await images.images.put(downscaled)
      if (
        shapeFillOperationTokensRef.current.get(operation.key) !== operation.token ||
        targetIdentityGeneration !== documentIdentityGenerationRef.current ||
        targetUserId !== currentOwnerIdRef.current
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
      showOperationError(error, t('形状图片填充失败，请稍后重试'))
    } finally {
      if (shapeFillInputRef.current) shapeFillInputRef.current.value = ''
    }
  }

  function updatePageBackground(slideId: string, background: SlideBackground) {
    return applyAction({ type: 'slide/update', slideId, patch: { background } })
  }

  /** A picture from disk fills the page, under everything on it. */
  async function setPageBackgroundFromFile(file: File) {
    const targetSlideId = activeSlide.id
    const targetIdentityGeneration = documentIdentityGenerationRef.current
    const targetUserId = currentOwnerIdRef.current
    const images = ownerStore
    setPageBackgroundPending(true)
    try {
      if (images.remote) await retainImagesNow()
      const raw = await readFileAsDataUrl(file)
      // A page is bigger than most pictures on it; keep more of the photo.
      const downscaled = await downscaleDataUrl(raw, 2400)
      const src = await images.images.put(downscaled)
      if (
        targetIdentityGeneration !== documentIdentityGenerationRef.current
        || targetUserId !== currentOwnerIdRef.current
      ) return
      updatePageBackground(targetSlideId, {
        type: 'image',
        src,
        fit: 'cover',
        framing: createDefaultImageFraming(),
      })
    } finally {
      setPageBackgroundPending(false)
    }
  }

  async function handlePageBackgroundInput(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      await setPageBackgroundFromFile(file)
    } catch (error) {
      showOperationError(error, t('背景图片设置失败，请稍后重试'))
    } finally {
      if (pageBackgroundInputRef.current) pageBackgroundInputRef.current.value = ''
    }
  }

  /** The selected picture becomes the page background (one undo step), as in Canva. */
  function setSelectedImageAsBackground() {
    if (!selectedPath || !isImageElement(selectedElement) || propertySelectionReadOnly) return
    const changed = applyActionGroup([
      {
        type: 'slide/update',
        slideId: activeSlide.id,
        patch: {
          background: {
            type: 'image',
            src: selectedElement.src,
            fit: 'cover',
            framing: createDefaultImageFraming(),
          },
        },
      },
      {
        type: 'node/delete',
        slideId: activeSlide.id,
        parentPath: selectedPath.slice(0, -1),
        nodeIds: [selectedElement.id],
      },
    ], t('设为背景'))
    if (changed) setSelection([])
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
    // The system clipboard gets the copy too (the words of any text in it), so
    // a screenshot copied before doesn't come in on the next paste instead.
    const words = selected.flatMap(function textOf(node): string[] {
      if (node.type === 'group') return node.children.flatMap(textOf)
      return node.type === 'text' ? [node.text] : []
    })
    void navigator.clipboard?.writeText(words.join('\n')).catch(() => undefined)
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
    }, t('原位复制'))
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
      setOperationNotice(t('无法在当前编辑范围内粘贴对象'))
      return
    }
    const changed = applyAction({
      type: 'node/insert-children',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodes: pasted,
    }, inPlace ? t('原位粘贴') : undefined)
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
    }, t('剪切对象'))
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
      name: t('组'),
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
      name: t('组'),
    })
    const committedSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === currentSlide.id,
    )
    const groupPath = [...parentPath, groupId]
    if (!changed || findNodeAtPath(committedSlide?.nodes ?? [], groupPath)?.type !== 'group') {
      setOperationNotice(t('组合未能应用到当前文档，请重试'))
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
      setOperationNotice(t('解组未能应用到当前文档，请重试'))
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
      single ? t('对齐到页面') : t('对齐'),
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
    applyAction({ type: 'node/update-geometry', slideId: activeSlide.id, updates }, t('分布'))
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
      // Keys pressed inside a dialog (signing in, moving guest work) never reach the canvas.
      if (event.target instanceof Element && event.target.closest('[aria-modal="true"]')) return
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
      // PageUp / PageDown step through the pages, as in slide editors (the page
      // list may be collapsed).
      if (
        (event.key === 'PageUp' || event.key === 'PageDown')
        && !event.ctrlKey && !event.metaKey && !event.altKey
      ) {
        event.preventDefault()
        const next = doc.slides[activeSlideIndex + (event.key === 'PageDown' ? 1 : -1)]
        if (next) selectSlide(next.id)
        return
      }
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
      // ⌘V (Ctrl+V off the Mac) lets the browser hand over the system clipboard,
      // so a copied screenshot comes in as a picture: the paste event decides.
      // If the browser sends none, the editor's own clipboard is pasted after all.
      // Shift escalates to paste-in-place.
      if ((event.ctrlKey || event.metaKey) && key === 'v') {
        const inPlace = event.shiftKey
        if (isPlatformPasteShortcut(event)) {
          pendingPasteRef.current = { inPlace }
          window.setTimeout(() => {
            if (!pendingPasteRef.current) return
            pendingPasteRef.current = null
            pasteClipboard(inPlace)
          }, 0)
          return
        }
        event.preventDefault()
        pasteClipboard(inPlace)
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
    // Double-clicking a polyline edits its vertices: near a vertex removes it,
    // near a segment inserts one at the projected point.
    if (directNode.type === 'line' && directNode.points && renderScale !== null) {
      const pagePoint = rawArtboardPointFromClient(event.clientX, event.clientY)
      const world = sceneWorldMatrixAtPath(activeSlide.nodes, directPath)
      const inverseWorld = world ? invert(world) : null
      if (!pagePoint || !world || !inverseWorld) return
      event.preventDefault()
      event.stopPropagation()
      if (state.locked || state.hidden) {
        showLockedOperationNotice()
        return
      }
      setSelection([directNode.id])
      const threshold = 8 / renderScale
      let nearestVertex = -1
      let nearestVertexDistance = threshold
      directNode.points.forEach((point, index) => {
        const vertexPage = transformPoint(world, point)
        const distance = Math.hypot(vertexPage.x - pagePoint.x, vertexPage.y - pagePoint.y)
        if (distance < nearestVertexDistance) {
          nearestVertexDistance = distance
          nearestVertex = index
        }
      })
      if (nearestVertex >= 0) {
        if (directNode.points.length <= LINE_POINTS_MIN) return
        applyAction({
          type: 'node/update-style',
          slideId: activeSlide.id,
          updates: [{
            path: directPath,
            patch: { points: directNode.points.filter((_, index) => index !== nearestVertex) },
          }],
        }, t('删除顶点'))
        return
      }
      let insertIndex = -1
      let insertPoint: LinePoint | null = null
      let nearestSegmentDistance = threshold
      for (let index = 0; index < directNode.points.length - 1; index += 1) {
        const a = transformPoint(world, directNode.points[index])
        const b = transformPoint(world, directNode.points[index + 1])
        const ab = { x: b.x - a.x, y: b.y - a.y }
        const lengthSquared = ab.x * ab.x + ab.y * ab.y
        const along = lengthSquared > 0
          ? clamp(
            ((pagePoint.x - a.x) * ab.x + (pagePoint.y - a.y) * ab.y) / lengthSquared,
            0,
            1,
          )
          : 0
        const projected = { x: a.x + ab.x * along, y: a.y + ab.y * along }
        const distance = Math.hypot(projected.x - pagePoint.x, projected.y - pagePoint.y)
        if (distance < nearestSegmentDistance) {
          nearestSegmentDistance = distance
          insertIndex = index + 1
          const local = transformPoint(inverseWorld, projected)
          insertPoint = {
            x: clamp(local.x, 0, directNode.width),
            y: clamp(local.y, 0, directNode.height),
          }
        }
      }
      if (insertIndex >= 0 && insertPoint) {
        const points = [...directNode.points]
        points.splice(insertIndex, 0, insertPoint)
        applyAction({
          type: 'node/update-style',
          slideId: activeSlide.id,
          updates: [{ path: directPath, patch: { points } }],
        }, t('添加顶点'))
      }
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
      commitLiveEdit(startDocument, event.altKey ? t('拖拽复制') : t('移动对象'))
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
      const patch = pasteStylePatch(
        styleClipboard,
        node.type,
        node.type === 'path' ? pathStrokeScale(node.viewBox, node.width, node.height) : 1,
      )
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
    // An existing guide shows where it is from the first press; a new one catches the page centre, edges and objects.
    const existing = guideId ? slide.guides?.find((guide) => guide.id === guideId) : undefined
    let position = existing?.position ?? startPosition
    const scale = renderScale
    const settle = (raw: number) => snapGuide(slide, slide.nodes, axis, raw, viewPrefs.snappingEnabled ? GUIDE_SNAP_PX / scale : 0)
    setGuideDrag({ axis, guideId, position, target: existing ? settle(position).target : null })
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const point = rawArtboardPointFromClient(moveEvent.clientX, moveEvent.clientY)
      if (!point) return
      const snapped = settle(axis === 'x' ? point.x : point.y)
      position = snapped.position
      setGuideDrag({ axis, guideId, position, target: snapped.target })
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
      if (guideId && Math.abs(settled - Math.round(existing?.position ?? startPosition)) <= 1) {
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
            t('删除参考线'),
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
            t('删除参考线'),
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
          t('调整参考线'),
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
        t('新增参考线'),
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

  /** Drag one polyline vertex; the vertex stays clamped inside the node box. */
  function onVertexPointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
    vertexIndex: number,
  ) {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    blurActiveTypingTarget()
    const interactionScale = renderScale
    const pointerId = event.pointerId
    const startDocument = currentDocumentRef.current
    const startSlide = startDocument.slides.find((slide) => slide.id === activeSlide.id)
    if (!startSlide) return
    const path = [...activeGroupPath, target.nodeIds[0]]
    const node = findNodeAtPath(startSlide.nodes, path)
    if (!node || node.type !== 'line' || !node.points) return
    if (node.points[vertexIndex] === undefined) return
    const world = sceneWorldMatrixAtPath(startSlide.nodes, path)
    const inverseWorld = world ? invert(world) : null
    if (!world || !inverseWorld) return
    const startPoints = node.points
    const startVertex = node.points[vertexIndex]
    const startX = event.clientX
    const startY = event.clientY
    activeInteractionRef.current = 'move'
    setActiveInteraction('move')

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const worldDelta = {
        x: (moveEvent.clientX - startX) / interactionScale,
        y: (moveEvent.clientY - startY) / interactionScale,
      }
      const localDelta = transformVector(inverseWorld, worldDelta)
      const nextVertex = {
        x: clamp(startVertex.x + localDelta.x, 0, node.width),
        y: clamp(startVertex.y + localDelta.y, 0, node.height),
      }
      replaceCurrent({
        type: 'node/update-style',
        slideId: startSlide.id,
        updates: [{
          path,
          patch: {
            points: startPoints.map((point, index) => index === vertexIndex ? nextVertex : point),
          },
        }],
      })
    }

    const cleanupVertexDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setActiveInteraction(null)
    }

    const finishVertexDrag = () => {
      cleanupVertexDrag()
      commitLiveEdit(startDocument, t('拖动顶点'))
    }

    const cancelVertexDrag = () => {
      cleanupVertexDrag()
      cancelLiveEdit(startDocument)
    }

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === pointerId) finishVertexDrag()
    }
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) cancelVertexDrag()
    }
    const onBlur = () => cancelVertexDrag()

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onBlur)
  }

  /** Double-clicking a vertex handle removes that vertex (the overlay only shows unlocked lines). */
  function onVertexDoubleClick(
    event: React.MouseEvent<HTMLButtonElement>,
    target: SelectionOverlayTarget,
    vertexIndex: number,
  ) {
    event.preventDefault()
    event.stopPropagation()
    const startSlide = currentDocumentRef.current.slides.find(
      (slide) => slide.id === activeSlide.id,
    )
    if (!startSlide) return
    const path = [...activeGroupPath, target.nodeIds[0]]
    const node = findNodeAtPath(startSlide.nodes, path)
    if (!node || node.type !== 'line' || !node.points) return
    if (node.points.length <= LINE_POINTS_MIN) return
    applyAction({
      type: 'node/update-style',
      slideId: startSlide.id,
      updates: [{
        path,
        patch: { points: node.points.filter((_, index) => index !== vertexIndex) },
      }],
    }, t('删除顶点'))
  }

  function onResizePointerDown(
    event: React.PointerEvent,
    target: SelectionOverlayTarget,
    handle: ResizeHandle = 'se',
  ) {
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
    const axes = RESIZE_HANDLE_AXES[handle]
    const cornerHandle = axes.x !== 0 && axes.y !== 0
    // Groups and multi-selections scale from a corner; only a single box stretches along an edge.
    if (!startLeaf && !cornerHandle) return
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
    // The corner opposite the handle stays where it is.
    const pivot = target.corners[
      axes.x < 0 ? (axes.y < 0 ? 'se' : 'ne') : (axes.y < 0 ? 'sw' : 'nw')
    ]
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
        const minSize = 40 / worldScale
        let width = startLeaf.width
        let height = startLeaf.height
        // Paths keep their drawing's proportions from a corner, as graphics
        // do in Canva; their edges still stretch.
        const keepAspect = cornerHandle && (moveEvent.shiftKey || startLeaf.type === 'path')
        if (keepAspect && startLengthSquared > Number.EPSILON) {
          // Shift keeps the leaf's aspect ratio: scale both edges by the
          // pointer's distance change from the opposite corner.
          const currentLength = Math.hypot(
            startVector.x + worldDelta.x,
            startVector.y + worldDelta.y,
          )
          const factor = currentLength / Math.sqrt(startLengthSquared)
          width = Math.max(minSize, startLeaf.width * factor)
          height = Math.max(minSize, startLeaf.height * factor)
        } else if (moveEvent.shiftKey && !cornerHandle) {
          // An edge with Shift scales the whole box, centred on that edge.
          const factor = axes.x !== 0
            ? Math.max(minSize, startLeaf.width + axes.x * localDelta.x) / startLeaf.width
            : Math.max(minSize, startLeaf.height + axes.y * localDelta.y) / startLeaf.height
          width = Math.max(minSize, startLeaf.width * factor)
          height = Math.max(minSize, startLeaf.height * factor)
        } else {
          if (axes.x !== 0) width = Math.max(minSize, startLeaf.width + axes.x * localDelta.x)
          if (axes.y !== 0) height = Math.max(minSize, startLeaf.height + axes.y * localDelta.y)
        }
        // Keep the edges opposite the handle in place (the middle, along an untouched axis).
        const anchorShift = translation(
          axes.x < 0 ? startLeaf.width - width : axes.x === 0 ? (startLeaf.width - width) / 2 : 0,
          axes.y < 0 ? startLeaf.height - height : axes.y === 0 ? (startLeaf.height - height) / 2 : 0,
        )
        const resized = sceneNodeWithLocalMatrix(
          { ...startLeaf, width, height },
          multiply(startLeafLocal, anchorShift),
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
      commitLiveEdit(startDocument, t('调整大小'))
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
      commitLiveEdit(startDocument, t('旋转对象'))
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

  /** The slide as pixels, as export draws it; `opaque` sets it on white (JPEG and PDF have no transparency). */
  async function renderSlideCanvas(
    slide: FreeformSlide,
    fontEmbedCSS: string,
    pixelRatio: number,
    opaque: boolean,
  ): Promise<HTMLCanvasElement | null> {
    const node = artboardRef.current
    if (!node) return null
    const imageWait = await waitForFramedImages(node, {
      timeoutMs: EXPORT_IMAGE_WAIT_MS,
    })
    if (!imageWait.ok) {
      throw new Error(imageWait.reason === 'timeout'
        ? t('图片加载超时，导出已取消')
        : t('图片加载失败，导出已取消'))
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    // html-to-image's toBlob drops the type/quality options, so render to a
    // canvas and encode it at the caller. JPEG has no alpha channel: composite
    // on white instead of letting transparent areas turn black.
    return toCanvas(node, {
      pixelRatio,
      width: slide.width,
      height: slide.height,
      ...(opaque ? { backgroundColor: '#ffffff' } : {}),
      style: {
        transform: 'none',
      },
      fontEmbedCSS,
      filter: (element) =>
        !(element instanceof HTMLElement && element.classList.contains('freeform-ui-only')),
    })
  }

  async function renderSlideBlob(slide: FreeformSlide, fontEmbedCSS: string): Promise<Blob | null> {
    const jpeg = viewPrefs.exportFormat === 'jpeg'
    const canvas = await renderSlideCanvas(slide, fontEmbedCSS, viewPrefs.exportScale, jpeg)
    if (!canvas) return null
    return jpeg ? canvasBlob(canvas, 'image/jpeg', viewPrefs.exportQuality) : canvasBlob(canvas, 'image/png')
  }

  /** One PDF page for a slide: its JPEG at the export scale, the page as large as the slide. */
  async function renderSlidePdfPage(slide: FreeformSlide, fontEmbedCSS: string): Promise<PdfPage | null> {
    const canvas = await renderSlideCanvas(slide, fontEmbedCSS, viewPrefs.exportScale, true)
    if (!canvas) return null
    const blob = await canvasBlob(canvas, 'image/jpeg', viewPrefs.exportQuality)
    if (!blob) return null
    return pdfPageFor(new Uint8Array(await blob.arrayBuffer()), slide, canvas)
  }

  function downloadPdf(pages: PdfPage[], filename: string) {
    downloadBlob(new Blob([buildPdf(pages)], { type: 'application/pdf' }), filename)
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
      const activeIndex = Math.max(
        0,
        doc.slides.findIndex((slide) => slide.id === activeSlide.id),
      )
      if (viewPrefs.exportFormat === 'pdf') {
        const page = await renderSlidePdfPage(activeSlide, fontCSS)
        if (page) downloadPdf([page], slideExportName(activeIndex, 'pdf'))
      } else {
        const blob = await renderSlideBlob(activeSlide, fontCSS)
        if (blob) downloadBlob(blob, slideExportName(activeIndex, viewPrefs.exportFormat))
      }
    } catch (error) {
      showOperationError(error, t('导出失败，请稍后重试'))
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
      const pdf = viewPrefs.exportFormat === 'pdf'
      const entries: Array<{ name: string; blob: Blob }> = []
      const pages: PdfPage[] = []
      for (let index = 0; index < doc.slides.length; index++) {
        const slide = doc.slides[index]
        setExportProgress({ current: index + 1, total: doc.slides.length })
        replaceCurrent({ type: 'slide/select', slideId: slide.id })
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        if (pdf) {
          const page = await renderSlidePdfPage(slide, fontCSS)
          if (page) pages.push(page)
        } else {
          const blob = await renderSlideBlob(slide, fontCSS)
          if (blob) entries.push({ name: slideExportName(index, viewPrefs.exportFormat), blob })
        }
      }
      const stamp = new Date().toISOString().slice(0, 10)
      if (pages.length > 0) downloadPdf(pages, `freeform-slides-${stamp}.pdf`)
      if (entries.length > 0) await downloadZip(entries, `freeform-slides-${stamp}.zip`)
    } catch (error) {
      showOperationError(error, viewPrefs.exportFormat === 'pdf' ? t('导出失败，请稍后重试') : t('打包导出失败，请稍后重试'))
    } finally {
      replaceCurrent({ type: 'slide/select', slideId: originalSlideId })
      setExportProgress(null)
      setExporting(false)
    }
  }

  /** Every page stacked into one tall picture, at the export scale or less if it would be too tall. */
  async function exportLongImage() {
    if (doc.slides.length === 0 || renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) return
    const scale = longImageScale(doc.slides, viewPrefs.exportScale)
    if (scale === null) {
      setOperationNotice(t('页面太多，拼不成一张长图，请改用打包下载'))
      return
    }
    setExporting(true)
    setExportProgress(null)
    const originalSlideId = activeSlide.id
    try {
      setSelection([])
      const fontCSS = await freeformFontEmbedOnce(doc.slides)
      const jpeg = viewPrefs.exportFormat === 'jpeg'
      const long = createLongImage(doc.slides, scale, jpeg ? '#ffffff' : undefined)
      for (let index = 0; index < doc.slides.length; index++) {
        const slide = doc.slides[index]
        setExportProgress({ current: index + 1, total: doc.slides.length })
        replaceCurrent({ type: 'slide/select', slideId: slide.id })
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const canvas = await renderSlideCanvas(slide, fontCSS, scale, jpeg)
        if (canvas) long.draw(index, canvas)
      }
      const blob = jpeg
        ? await canvasBlob(long.canvas, 'image/jpeg', viewPrefs.exportQuality)
        : await canvasBlob(long.canvas, 'image/png')
      if (!blob) throw new Error(t('长图导出失败，请稍后重试'))
      const stamp = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `freeform-long-${stamp}.${jpeg ? 'jpg' : 'png'}`)
      if (scale < viewPrefs.exportScale) setOperationNotice(t('长图太长，已缩小到 {scale}x 导出', { scale }))
    } catch (error) {
      showOperationError(error, t('长图导出失败，请稍后重试'))
    } finally {
      replaceCurrent({ type: 'slide/select', slideId: originalSlideId })
      setExportProgress(null)
      setExporting(false)
    }
  }

  function requestExportAllSlides() {
    if (renderScale === null) return
    if (blockDocumentMutationDuringInteraction()) return
    // A PDF's pages keep their own sizes; only a ZIP of pictures warns about mixed sizes.
    if (viewPrefs.exportFormat !== 'pdf' && hasMixedSlideSizes(doc.slides)) {
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

  /** Moving off this document: queue anything not stored yet (an edit a transition just committed), then let go. */
  function leaveDocument(owner = currentOwnerIdRef.current) {
    const current = currentDocumentRef.current
    const hasProject = currentDraftIdRef.current !== null || historyRef.current.past.length > 0
    const changed = !Object.is(current, persistedDocRef.current) || titleDirtyRef.current
    const alreadyQueued = Object.is(current, scheduledDocRef.current) && scheduledTitleRef.current === projectTitleRef.current
    if (owner && !parkedProjectRef.current && hasProject && changed && !alreadyQueued) {
      const title = projectTitleRef.current
      scheduleSave(owner, currentDraftIdRef.current, { mode: 'freeform-slide', title, document: current }, { title })
    }
    scheduledDocRef.current = null
    scheduledTitleRef.current = null
    releaseSave()
  }

  function openDraft(draft: Draft) {
    if (draft.mode !== 'freeform-slide') return
    cancelFramingBeforeTransition()
    if (blockDocumentMutationDuringInteraction()) return
    leaveDocument()
    persistedDocRef.current = draft.document
    documentIdentityGenerationRef.current += 1
    shapeFillOperationTokensRef.current.clear()
    setPendingShapeFillKeys(new Set())
    successfulSaveRef.current = {
      source: draft.document,
      document: draft.document,
      updatedAt: draft.updatedAt,
    }
    updateHistory(createHistory(draft.document))
    setSelection([])
    updateDraftId(draft.id)
    setSavedAt(draft.updatedAt)
    setProjectTitle(draft.title)
    titleDirtyRef.current = false
    setTitleDirty(false)
    const owner = currentOwnerIdRef.current
    if (owner) updateLastSession(owner, { mode: 'freeform-slide', freeformDraftId: draft.id })
  }
  openDraftRef.current = openDraft

  /** Reopen the owner's last project, unless something else goes on screen first. */
  function restoreLastProject(owner: string) {
    const lastId = readLastSession(owner).freeformDraftId
    if (!lastId) return
    const generation = ++restoreGenerationRef.current
    void storeFor(owner).drafts.list(owner).then(
      (list) => {
        if (currentOwnerIdRef.current !== owner || restoreGenerationRef.current !== generation) return
        const target = list.find((draft) => draft.id === lastId && draft.mode === 'freeform-slide')
        if (target) openDraftRef.current(target)
      },
      () => {},
    )
  }

  function renameProject(title: string) {
    setProjectTitle(title)
    setTitleDirty(true)
  }

  /**
   * A freeform document at a URL on this computer (the MCP server's
   * open_in_editor hands one over) opens as a new project; documents from
   * other sites are refused.
   */
  async function importFromUrl(url: string, title: string | null) {
    const generation = restoreGenerationRef.current
    let target: URL | null = null
    try {
      target = new URL(url, window.location.href)
    } catch {
      target = null
    }
    const onThisComputer = target !== null
      && /^https?:$/.test(target.protocol)
      && (target.origin === window.location.origin || ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname))
    if (!target || !onThisComputer) {
      setOperationNotice(t('只能导入本机上的文档'))
      return
    }
    let text: string
    try {
      const response = await fetch(target.href, { cache: 'no-store' })
      if (!response.ok) throw new Error(String(response.status))
      text = await response.text()
    } catch {
      setOperationNotice(t('读取导入的文档失败，请重试'))
      return
    }
    // Something else opened meanwhile: that wins.
    if (restoreGenerationRef.current !== generation) return
    const outcome = importDraftFromJson(text)
    if (!outcome.ok) {
      setOperationNotice(t(outcome.error))
      return
    }
    if (outcome.data.mode !== 'freeform-slide') {
      setOperationNotice(t('这里只能导入自由画布文档'))
      return
    }
    startFreshDocument(outcome.data.document, title?.trim() || t('导入的设计'))
    // Unlike a template, an import is finished work: it becomes a project now, not after a first edit.
    titleDirtyRef.current = true
    setTitleDirty(true)
  }

  function applyFreeformTemplate(template: TemplateDefinition) {
    if (template.workspace !== 'freeform') return
    const document = template.createFreeform?.()
    if (!document) return
    startFreshDocument(document, t(template.title))
  }

  /** Replace the canvas with an unsaved document (a template, or a blank page). */
  function startFreshDocument(document: FreeformDocument, title = t('未命名设计'), saveCurrent = true) {
    cancelFramingBeforeTransition()
    if (blockDocumentMutationDuringInteraction()) return
    if (saveCurrent) leaveDocument()
    else releaseSave()
    persistedDocRef.current = document
    restoreGenerationRef.current += 1
    documentIdentityGenerationRef.current += 1
    inspectorNumberResetGenerationRef.current += 1
    shapeFillOperationTokensRef.current.clear()
    setPendingShapeFillKeys(new Set())
    successfulSaveRef.current = null
    updateHistory(createHistory(document))
    setSceneUiState({
      activeGroupPath: [],
      selectionPaths: [],
      identity: {
        activeSlideId: document.activeSlideId,
        draftId: null,
        userId: currentOwnerIdRef.current,
      },
    })
    setClipboard(null)
    setMarquee(null)
    setSnapLines([])
    updateDraftId(null)
    setSavedAt(null)
    setProjectTitle(title)
    titleDirtyRef.current = false
    setTitleDirty(false)
    setShowTemplates(false)
  }

  const documentDirty = savedAt === null && history.past.length > 0
  const interactionIdle = !activeInteraction && marquee === null && !framingSession && !imageCropSession
  useEffect(() => {
    // The ref, not state: the owner effect may have parked the edits in this same commit.
    if (!ownerId || parkedProjectRef.current || !(documentDirty || titleDirty) || !interactionIdle) return
    scheduledDocRef.current = doc
    scheduledTitleRef.current = projectTitle
    scheduleSave(
      ownerId,
      currentDraftIdRef.current,
      { mode: 'freeform-slide', title: projectTitle, document: doc },
      { title: projectTitle },
    )
  }, [doc, documentDirty, interactionIdle, ownerId, parkedFor, projectTitle, scheduleSave, titleDirty])

  const unsaved = (documentDirty || titleDirty)
    && (ownerId === null || parkedFor !== null || autosave.status === 'error')
  useEffect(() => {
    onMetaChange?.({ title: projectTitle, draftId, unsaved })
  }, [projectTitle, draftId, unsaved, onMetaChange])

  const saveState: SaveState = parkedFor
    ? { kind: 'signed-out' }
    : ownerId === null
      ? { kind: 'none' }
      : autosave.status === 'error'
        ? { kind: 'error', message: autosave.error ?? '' }
        : documentDirty || titleDirty || autosave.status === 'saving'
          ? { kind: 'saving' }
          : draftId
            ? { kind: 'saved', at: savedAt ?? Date.now(), onDevice: isGuestOwner(ownerId) }
            : { kind: 'none' }

  // One-shot instructions from the workbench (open / new / template / import / removed / renamed).
  useEffect(() => {
    if (!request || handledRequestRef.current === request.nonce) return
    if (request.kind === 'open' && !ownerId) return
    handledRequestRef.current = request.nonce
    if (request.kind === 'removed' || request.kind === 'renamed') {
      if (currentDraftIdRef.current !== request.draftId) return
      if (request.kind === 'renamed') {
        setProjectTitle(request.title)
        return
      }
      // The project is gone: drop what was queued for it and start over.
      discardSave()
      startFreshDocument(createFreeformDocument(), undefined, false)
      return
    }
    restoreGenerationRef.current += 1
    explicitDocumentRef.current = true
    if (request.kind === 'new') {
      const clamp = (value: number | null) =>
        value === null ? undefined : Math.min(PAGE_SIZE_MAX, Math.max(PAGE_SIZE_MIN, value))
      const slide = createSlide({ width: clamp(request.width), height: clamp(request.height) })
      startFreshDocument({ ...createFreeformDocument(), activeSlideId: slide.id, slides: [slide] })
    } else if (request.kind === 'template') {
      applyFreeformTemplate(request.template)
    } else if (request.kind === 'import') {
      void importFromUrl(request.url, request.title)
    } else if (ownerId && currentDraftIdRef.current !== request.draftId) {
      const owner = ownerId
      const id = request.draftId
      const generation = restoreGenerationRef.current
      void storeFor(owner).drafts.list(owner).then(
        (list) => {
          if (currentOwnerIdRef.current !== owner || restoreGenerationRef.current !== generation) return
          const target = list.find((draft) => draft.id === id && draft.mode === 'freeform-slide')
          if (target) openDraft(target)
          else setOperationNotice(t('没有找到这个项目，它可能已经被删除了'))
        },
        (error: unknown) => showOperationError(error, t('暂时无法读取项目，请稍后重试')),
      )
    }
  }, [request, ownerId])

  const contextSubject: ContextToolbarSubject = (() => {
    if (liveSelection.length === 0) {
      return { kind: 'page' }
    }
    if (effectiveLockedSelection) return { kind: 'locked', name: layerLabel(effectiveLockedSelection.unlockName) }
    if (lockedDescendantSelection) return { kind: 'locked', name: layerLabel(lockedDescendantSelection.sourceName) }
    if (liveSelection.length > 1) return { kind: 'multi', count: liveSelection.length }
    if (!selectedElement) {
      const group = selectedPath ? findNodeAtPath(activeSlide.nodes, selectedPath) : undefined
      return { kind: 'group', name: layerLabel(group?.name ?? '组') }
    }
    const leafProperties = selectedProperties?.kind === 'leaf' ? selectedProperties : null
    if (selectedElement.type === 'text') {
      return { kind: 'text', node: selectedElement, fontSize: leafProperties?.fontSize ?? selectedElement.fontSize }
    }
    if (selectedElement.type === 'shape') {
      return {
        kind: 'shape',
        node: selectedElement,
        strokeWidth: leafProperties?.strokeWidth ?? selectedElement.strokeWidth,
        canFrame: canAdjustSelectedFraming && selectedImageTarget?.targetKind === 'shape-fill',
        frameDisabledReason: selectedFramingDisabledReason,
      }
    }
    if (selectedElement.type === 'line') {
      return { kind: 'line', node: selectedElement, strokeWidth: leafProperties?.strokeWidth ?? selectedElement.strokeWidth }
    }
    if (selectedElement.type === 'path') {
      return {
        kind: 'path',
        node: selectedElement,
        strokeWidth: leafProperties?.strokeWidth
          ?? selectedElement.strokeWidth * pathStrokeScale(selectedElement.viewBox, selectedElement.width, selectedElement.height),
      }
    }
    return {
      kind: 'image',
      node: selectedElement,
      canCrop: canCropSelectedImage,
      cropDisabledReason: selectedFramingDisabledReason,
    }
  })()

  function toggleSelectionLock() {
    if (effectiveLockedSelection) {
      setLayerLocked(effectiveLockedSelection.unlockPath, false)
      return
    }
    if (lockedDescendantSelection) {
      setLayerLocked(lockedDescendantSelection.sourcePath, false)
      return
    }
    for (const path of selectionPaths) setLayerLocked(path, true)
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
    <DeckColorsContext.Provider value={deckColorsValue}>
    <div
      className={[
        'freeform-workspace',
        framingSession ? 'is-framing' : '',
        imageCropSession ? 'is-image-cropping' : '',
      ].filter(Boolean).join(' ')}
      aria-label={t('自由编辑工作区')}
      data-history-depth={history.past.length}
    >
      {isActive && (
        <EditorTopBar
          chrome={chrome}
          user={user}
          requestAuth={requestAuth}
          system="freeform-slide"
          title={projectTitle}
          onRename={renameProject}
          save={saveState}
          onRetrySave={() => void autosave.flush()}
          center={(
            <WorkspaceToolbar
              testId="freeform-toolbar"
              label={t('自由编辑工具栏')}
              className="freeform-toolbar"
              disabled={hasImageEditSession}
            >
              <ToolbarGroup>
                <button
                  className="bar-btn bar-icon"
                  type="button"
                  onClick={undoDocument}
                  disabled={!canUndo}
                  aria-label={t('撤销')}
                  title={t('撤销（⌘Z）')}
                >
                  <UndoIcon />
                </button>
                <button
                  className="bar-btn bar-icon"
                  type="button"
                  onClick={redoDocument}
                  disabled={!canRedo}
                  aria-label={t('重做')}
                  title={t('重做（⇧⌘Z）')}
                >
                  <RedoIcon />
                </button>

                <ToolbarDivider />

                <div className="freeform-page-context">
                  <FreeformPageSizePopover
                    isActive={isActive}
                    width={activeSlide.width}
                    height={activeSlide.height}
                    onApply={applySlideSize}
                  />
                </div>

                <ToolbarDivider />

                <div className="freeform-view-toggles" role="group" aria-label={t('视图')}>
                  <button
                    className="bar-btn bar-icon"
                    type="button"
                    data-testid="freeform-rulers-toggle"
                    aria-label={t('显示标尺')}
                    title={t('显示标尺')}
                    aria-pressed={viewPrefs.rulersVisible}
                    onClick={() => updateViewPrefs({ rulersVisible: !viewPrefs.rulersVisible })}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M3.5 7.5h13v5h-13z" />
                      <path d="M6.5 7.5v2M9.5 7.5v2.75M12.5 7.5v2M15.5 7.5v2.75" />
                    </svg>
                  </button>
                  <button
                    className="bar-btn bar-icon"
                    type="button"
                    data-testid="freeform-guides-toggle"
                    aria-label={t('显示参考线')}
                    title={t('显示参考线')}
                    aria-pressed={viewPrefs.guidesVisible}
                    onClick={() => updateViewPrefs({ guidesVisible: !viewPrefs.guidesVisible })}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M7 2.5v15M2.5 13h15" strokeDasharray="2 2" />
                      <rect x="4.5" y="4.5" width="11" height="11" rx="1.5" />
                    </svg>
                  </button>
                  <button
                    className="bar-btn bar-icon"
                    type="button"
                    data-testid="freeform-snap-toggle"
                    aria-label={t('对象吸附')}
                    title={t('对象吸附')}
                    aria-pressed={viewPrefs.snappingEnabled}
                    onClick={() => updateViewPrefs({ snappingEnabled: !viewPrefs.snappingEnabled })}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M5.5 3.5v6.25a4.5 4.5 0 0 0 9 0V3.5" />
                      <path d="M5.5 6.75h3M11.5 6.75h3" />
                    </svg>
                  </button>
                </div>
              </ToolbarGroup>
            </WorkspaceToolbar>
          )}
          primary={(
            <FreeformExportMenu
              disabled={renderScale === null || hasImageEditSession}
              exporting={exporting}
              progress={exportProgress}
              pageCount={doc.slides.length}
              prefs={viewPrefs}
              onPrefsChange={updateViewPrefs}
              onExportCurrent={() => void exportCurrentSlide()}
              onExportAll={requestExportAllSlides}
              onExportLong={() => void exportLongImage()}
            />
          )}
        />
      )}

      {operationNotice && (
        <OperationNotice
          title={operationNotice}
          onDismiss={() => setOperationNotice(null)}
        />
      )}

      <main className={`freeform-main${toolDrawer ? ' has-drawer' : ''}${viewPrefs.panelOpen ? ' has-panel' : ''}`}>
        <nav
          className="freeform-tools"
          aria-label={t('插入')}
          ref={(element) => {
            if (!element) return
            if (hasImageEditSession) element.setAttribute('inert', '')
            else element.removeAttribute('inert')
          }}
        >
          <button
            className="freeform-tool"
            type="button"
            data-testid="freeform-template-button"
            aria-expanded={toolDrawer === 'templates'}
            aria-controls="freeform-templates-drawer"
            onClick={() => toggleToolDrawer('templates')}
          >
            <TemplatesIcon />
            <span>{t('模板')}</span>
          </button>
          <button
            className="freeform-tool"
            type="button"
            data-testid="freeform-styles-tool"
            aria-expanded={toolDrawer === 'styles'}
            aria-controls="freeform-styles-drawer"
            onClick={() => toggleToolDrawer('styles')}
          >
            <StylesIcon />
            <span>{t('风格')}</span>
          </button>
          <span className="freeform-tools-sep" aria-hidden="true" />
          <button
            className="freeform-tool"
            type="button"
            data-testid="freeform-text-tool"
            aria-expanded={toolDrawer === 'text'}
            aria-controls="freeform-text-drawer"
            onClick={() => toggleToolDrawer('text')}
          >
            <TextIcon />
            <span>{t('文字')}</span>
          </button>
          <button
            className="freeform-tool"
            type="button"
            data-testid="freeform-images-tool"
            aria-expanded={toolDrawer === 'images'}
            aria-controls="freeform-images-drawer"
            onClick={() => toggleToolDrawer('images')}
          >
            <ImageIcon />
            <span>{t('图片')}</span>
          </button>
          <button
            className="freeform-tool"
            type="button"
            data-testid="freeform-elements-tool"
            aria-expanded={toolDrawer === 'elements'}
            aria-controls="freeform-elements-drawer"
            onClick={() => toggleToolDrawer('elements')}
          >
            <ShapesIcon />
            <span>{t('元素')}</span>
          </button>
          <button
            className="freeform-tool freeform-tool-end freeform-pages-tool"
            type="button"
            data-testid="freeform-pages-tool"
            aria-pressed={viewPrefs.pagesVisible}
            aria-controls={viewPrefs.pagesVisible ? 'freeform-page-list' : undefined}
            onClick={() => updateViewPrefs({ pagesVisible: !viewPrefs.pagesVisible })}
          >
            <PagesIcon />
            <span>{t('页面')}</span>
          </button>
          <button
            className="freeform-tool"
            type="button"
            data-testid="freeform-layers-tool"
            aria-pressed={viewPrefs.panelOpen && panelTab === 'layers'}
            onClick={() => togglePanel('layers')}
          >
            <LayersIcon />
            <span>{t('图层')}</span>
          </button>
          <input
            ref={imageInputRef}
            className="freeform-file"
            type="file"
            accept="image/*"
            onChange={(event) => handleImageInput(event.currentTarget.files)}
          />
          <input
            ref={fontInputRef}
            className="freeform-font-file"
            type="file"
            accept={FONT_FILE_ACCEPT}
            data-testid="freeform-font-input"
            onChange={(event) => handleFontInput(event.currentTarget.files)}
          />
        </nav>

        {toolDrawer === 'templates' && (
          <aside
            className="freeform-drawer is-scroll"
            id="freeform-templates-drawer"
            aria-label={t('模板')}
            data-testid="freeform-templates-drawer"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              event.preventDefault()
              setToolDrawer(null)
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="freeform-template-button"]')?.focus())
            }}
          >
            <div className="freeform-drawer-head">
              <h2>{t('模板')}</h2>
              <button className="icon-btn" type="button" aria-label={t('关闭面板')} onClick={() => setToolDrawer(null)}>
                <CloseIcon />
              </button>
            </div>
            <button
              className="accent freeform-drawer-upload"
              type="button"
              data-testid="freeform-templates-browse"
              onClick={() => {
                setGalleryTemplateId(undefined)
                setShowTemplates(true)
              }}
            >
              <TemplatesIcon />
              {t('浏览全部模板')}
            </button>
            {TEMPLATE_FORMATS.map((format) => {
              const group = FREEFORM_TEMPLATES.filter((template) => template.format === format.id)
              if (group.length === 0) return null
              // Landscape sizes take the whole row.
              const wide = format.width > format.height * 1.2
              return (
                <Fragment key={format.id}>
                  <div className="freeform-drawer-section">{t(format.name)}</div>
                  <div className="freeform-template-tiles">
                    {group.map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        className={`freeform-template-tile${wide ? ' is-wide' : ''}`}
                        data-testid={`freeform-template-tile-${template.id}`}
                        aria-label={t('预览{title}', { title: t(template.title) })}
                        onClick={() => {
                          setGalleryTemplateId(template.id)
                          setShowTemplates(true)
                        }}
                      >
                        <Measured className="freeform-template-thumb" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
                          {(width) => <FreeformTemplatePreview template={template} frame={{ width, height: Math.round((width * format.height) / format.width) }} />}
                        </Measured>
                        <span className="freeform-template-tile-title">{t(template.title)}</span>
                        <span className="freeform-template-tile-meta">
                          {template.kind === 'poster' ? format.ratio : t('{n} 页', { n: template.pageCount })}
                        </span>
                      </button>
                    ))}
                  </div>
                </Fragment>
              )
            })}
          </aside>
        )}

        {toolDrawer === 'styles' && (
          <aside
            className="freeform-drawer is-scroll"
            id="freeform-styles-drawer"
            aria-label={t('风格')}
            data-testid="freeform-styles-drawer"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              event.preventDefault()
              setToolDrawer(null)
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="freeform-styles-tool"]')?.focus())
            }}
          >
            <div className="freeform-drawer-head">
              <h2>{t('风格')}</h2>
              <button className="icon-btn" type="button" aria-label={t('关闭面板')} onClick={() => setToolDrawer(null)}>
                <CloseIcon />
              </button>
            </div>
            <FreeformStylePanel document={doc} onRestyle={restyleDeck} onImportFont={() => openFontImport(false)} />
          </aside>
        )}

        {toolDrawer === 'text' && (
          <aside
            className="freeform-drawer is-scroll"
            id="freeform-text-drawer"
            aria-label={t('文字')}
            data-testid="freeform-text-drawer"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              event.preventDefault()
              setToolDrawer(null)
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="freeform-text-tool"]')?.focus())
            }}
          >
            <div className="freeform-drawer-head">
              <h2>{t('文字')}</h2>
              <button className="icon-btn" type="button" aria-label={t('关闭面板')} onClick={() => setToolDrawer(null)}>
                <CloseIcon />
              </button>
            </div>
            <button
              className="accent freeform-drawer-upload"
              type="button"
              data-testid="insert-text"
              onClick={() => addTextPreset('box')}
            >
              <PlusIcon />
              {t('添加文本框')}
            </button>
            <div className="freeform-drawer-section">{t('默认文字样式')}</div>
            <div className="freeform-text-presets">
              {TEXT_PRESETS.filter((preset) => preset.id !== 'box').map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`freeform-text-preset is-${preset.id}`}
                  data-testid={preset.testId}
                  onClick={() => addTextPreset(preset.id)}
                >
                  {t(preset.label)}
                </button>
              ))}
            </div>
            <div className="freeform-drawer-section">{t('花字')}</div>
            <div className="freeform-text-styles">
              {TEXT_STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`freeform-text-style${presetOnDarkPage(preset) ? ' is-dark' : ''}`}
                  data-testid={`text-style-${preset.id}`}
                  style={{ background: preset.backdrop }}
                  onClick={() => applyTextStylePreset(preset)}
                >
                  <TextEffectSample text={getLang() === 'en' ? 'Wow' : '花字'} fontSize={30} textFill={preset.textFill} effect={preset.effect} />
                  <span className="freeform-text-style-name">{t(preset.name)}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {toolDrawer === 'elements' && (
          <aside
            className="freeform-drawer is-scroll"
            id="freeform-elements-drawer"
            aria-label={t('元素')}
            data-testid="freeform-elements-drawer"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              if (event.target instanceof HTMLInputElement && event.target.value) return
              event.preventDefault()
              setToolDrawer(null)
              requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="freeform-elements-tool"]')?.focus())
            }}
          >
            <div className="freeform-drawer-head">
              <h2>{t('元素')}</h2>
              <button className="icon-btn" type="button" aria-label={t('关闭面板')} onClick={() => setToolDrawer(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="freeform-drawer-section">{t('形状')}</div>
            <div className="freeform-element-tiles" role="group" aria-label={t('形状')}>
              {SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  className="freeform-element-tile"
                  data-testid={`insert-shape-${shape.id}`}
                  onClick={() => addShape(shape.id)}
                >
                  <ShapePreviewIcon shape={shape.id} />
                  <span>{t(shape.label)}</span>
                </button>
              ))}
            </div>
            <div className="freeform-drawer-section">{t('线条')}</div>
            <div className="freeform-element-tiles" role="group" aria-label={t('线条')}>
              {LINES.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  className="freeform-element-tile"
                  data-testid={`insert-line-${line.id}`}
                  onClick={() => addLine(line.id)}
                >
                  <ShapePreviewIcon shape={line.id} />
                  <span>{t(line.label)}</span>
                </button>
              ))}
            </div>
            <div className="freeform-drawer-section">{t('图标')}</div>
            <FreeformIconPicker onPick={pickIcon} />
          </aside>
        )}

        {toolDrawer === 'images' && (
          <aside
            className="freeform-drawer"
            id="freeform-images-drawer"
            aria-label={t('图片')}
            data-testid="freeform-images-drawer"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              if (event.target instanceof HTMLInputElement && event.target.value) return
              event.preventDefault()
              setToolDrawer(null)
            }}
          >
            <div className="freeform-drawer-head">
              <h2>{t('图片')}</h2>
              <button className="icon-btn" type="button" aria-label={t('关闭面板')} onClick={() => setToolDrawer(null)}>
                <CloseIcon />
              </button>
            </div>
            <button
              className="accent freeform-drawer-upload"
              type="button"
              data-testid="insert-image"
              onClick={() => imageInputRef.current?.click()}
            >
              <UploadIcon />
              {t('上传图片')}
            </button>
            <div className="freeform-drawer-section">{t('素材库')}</div>
            <AssetPanel
              ownerId={ownerId}
              onInsert={(asset) => void addImageFromAsset(asset)}
              onManage={() => navigate(routes.assets)}
            />
          </aside>
        )}

        {viewPrefs.pagesVisible && (
        <aside
          className="freeform-rail"
          id="freeform-page-list"
          aria-label={t('页面列表')}
          data-testid="freeform-page-strip"
        >
          <div className="freeform-rail-head">
            <h2>{t('{n} 页', { n: doc.slides.length })}</h2>
            <button
              type="button"
              className="icon-btn"
              data-testid="freeform-pages-collapse"
              aria-label={t('收起页面列表')}
              title={t('收起页面列表')}
              onClick={() => updateViewPrefs({ pagesVisible: false })}
            >
              <ChevronLeftIcon />
            </button>
          </div>
          <div
            ref={slideListRef}
            className="freeform-slide-list"
            role="list"
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
            {doc.slides.map((slide, index) => {
              const frame = thumbFrame(slide, compactPageStrip)
              const name = slideDisplayName(slide.name, index)
              const menuOpen = slideContextMenu?.slideId === slide.id && Boolean(slideContextMenu.fromButton)
              return (
              <div
                key={slide.id}
                className={`freeform-thumb-wrap${slide.id === activeSlide.id ? ' is-active' : ''}`}
                role="listitem"
              >
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
                  data-slide-id={slide.id}
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
                    const position = slideDropPosition(event)
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
                    const after = slideDropPosition(event) === 'after'
                    const targetIndex = slideDropTargetIndex(sourceId, slide.id, after)
                    if (targetIndex !== null) reorderSlide(sourceId, targetIndex)
                  }}
                  onContextMenu={(event) => onSlideThumbContextMenu(event, slide.id)}
                >
                  <FreeformSlidePreview
                    slide={slide}
                    frameWidth={frame.width}
                    frameHeight={frame.height}
                    className="freeform-thumb-art"
                    deferOffscreen={slide.id !== activeSlide.id}
                  />
                  <span className="freeform-thumb-caption">
                    <span
                      className="freeform-thumb-title"
                      data-testid="freeform-thumb-title"
                      title={name}
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        event.preventDefault()
                        beginSlideRename(slide.id)
                      }}
                    >
                      {name}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="freeform-thumb-menu"
                  data-testid="freeform-thumb-menu"
                  aria-label={t('{name} 的页面操作', { name })}
                  title={t('页面操作')}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={(event) => toggleSlideMenu(event, slide.id)}
                >
                  <MoreIcon />
                </button>
                {renamingSlideId === slide.id && (
                  <input
                    ref={slideRenameInputRef}
                    className="freeform-thumb-rename"
                    data-testid="freeform-thumb-rename"
                    aria-label={t('重命名页面')}
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
              )
            })}
          </div>
          <button
            className="freeform-add-page"
            type="button"
            onClick={addSlide}
          >
            <PlusIcon />
            <span>{t('新增页面')}</span>
          </button>
        </aside>
        )}

        <section className="freeform-stage-pane" aria-label={t('自由画布')}>
          {(imageCropSession || framingSession) && (
            <div className="freeform-stage-head is-session">
              {imageCropSession ? (
                <div
                  className="freeform-framing-head freeform-crop-head"
                  role="toolbar"
                  aria-label={t('图片裁剪')}
                >
                  <div
                    className="freeform-toolbar"
                    data-image-crop-control=""
                    style={{ position: 'relative', zIndex: 70 }}
                  >
                    <FreeformInsertMenu
                      isActive={isActive}
                      testId="freeform-image-crop-aspect"
                      label={t('比例')}
                      options={IMAGE_CROP_ASPECTS}
                      onSelect={applyImageCropAspect}
                      onEscape={() => { finishImageCrop() }}
                    />
                  </div>
                  <strong>{t('裁剪')}</strong>
                  <button
                    className="toolbar-primary"
                    type="button"
                    data-testid="freeform-image-crop-done"
                    onClick={() => { finishImageCrop() }}
                  >
                    {t('完成')}
                  </button>
                </div>
              ) : (
                <div className="freeform-framing-head" role="toolbar" aria-label={t('图片取景')}>
                  <button
                    className="ghost"
                    type="button"
                    data-testid="freeform-framing-cancel"
                    onClick={cancelImageFraming}
                  >
                    {t('取消')}
                  </button>
                  <strong>{t('调整取景')}</strong>
                  <button
                    className="toolbar-primary"
                    type="button"
                    data-testid="freeform-framing-done"
                    onClick={finishImageFraming}
                  >
                    {t('完成')}
                  </button>
                </div>
              )}
            </div>
          )}

          <FreeformContextToolbar
            suspended={hasImageEditSession}
            isActive={isActive}
            subject={contextSubject}
            resetKey={inspectorNumberResetKey}
            canAlign={canUseLogicalAlignment}
            canDistribute={selectionPaths.length >= 3}
            canGroup={selectionPaths.length >= 2}
            onStyle={(patch) => { updateSelectedStyle(patch) }}
            onProperty={(edit) => { commitSceneProperty(edit) }}
            onFontFamily={(fontFamily) => {
              if (fontFamily === IMPORT_FONT_OPTION) {
                openFontImport(true)
                return
              }
              if (selectedElement?.type === 'text') {
                void buildFontEmbedCSS(selectedElement.text, fontFamily, [selectedElement.fontWeight]).catch(() => undefined)
              }
              const from = selectedElement?.type === 'text' ? selectedElement.fontFamily : null
              if (updateSelectedStyle({ fontFamily }) && from && from !== fontFamily) setFontSwap({ from, to: fontFamily })
            }}
            onShapeFill={(fill) => { updateSelectedShapeFill(fill) }}
            onAlign={alignSelection}
            onDistribute={distributeSelection}
            onOrder={reorderSelection}
            onGroup={() => { groupSelection() }}
            onUngroup={() => { ungroupSelection() }}
            onCrop={() => { if (selectedPath) startImageCrop(selectedPath) }}
            onDuplicate={duplicateSelection}
            onToggleLock={toggleSelectionLock}
            onDelete={deleteSelection}
            onAdjustFraming={() => { if (selectedPath) startImageFraming(selectedPath) }}
            panelOpen={viewPrefs.panelOpen && panelTab === 'properties'}
            onTogglePanel={() => togglePanel('properties')}
          />

          <div
            ref={stageViewportRef}
            className={`freeform-stage-viewport${viewPrefs.rulersVisible ? ' has-rulers' : ''}${guideDrag ? ` guide-dragging-${guideDrag.axis}` : ''}`}
            onDragEnter={onStageFileDragEnter}
            onDragOver={onStageFileDragOver}
            onDragLeave={onStageFileDragLeave}
            onDrop={onStageFileDrop}
          >
            {rulerView && viewPrefs.rulersVisible && (
              <>
                <div
                  className="freeform-ruler freeform-ruler-x"
                  data-testid="freeform-ruler-x"
                  title={t('按住拖动可拉出竖向参考线')}
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
                  title={t('按住拖动可拉出横向参考线')}
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
                    '--freeform-artboard-inverse-scale': 1 / renderScale,
                  } as CSSProperties}
                >
                  <div
                    className="freeform-artwork-clip"
                    onPointerDown={onArtboardPointerDown}
                  >
                    <FreeformPageBackground
                      slide={activeSlide}
                      scopeGeneration={documentIdentityGenerationRef.current}
                      onDecodeReport={handleImageDecodeReport}
                    />
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
                          title={t('拖动参考线，拖出页面删除；双击移除')}
                          onPointerDown={(event) => guideDragPointerDown(event, guide.axis, guide.id)}
                          style={guideStyle(guide.axis, guide.position, renderScale)}
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
                        className={`freeform-ui-only freeform-guide-ghost freeform-guide-${guideDrag.axis}${guideDragValid ? '' : ' freeform-guide-invalid'}${guideDrag.target ? ' is-snapped' : ''}`}
                        data-testid="freeform-guide-dragging"
                        style={guideStyle(guideDrag.axis, guideDrag.position, renderScale)}
                      />
                    )}
                    {guideDrag && guideDragValid && (
                      <span
                        className={`freeform-ui-only freeform-guide-readout${guideDrag.target ? ' is-snapped' : ''}`}
                        data-testid="freeform-guide-readout"
                        style={guideDrag.axis === 'x'
                          ? { left: guideDrag.position + 6 / renderScale, top: 8 / renderScale, fontSize: 11 / renderScale }
                          : { left: 8 / renderScale, top: guideDrag.position + 6 / renderScale, fontSize: 11 / renderScale }}
                      >
                        {guideDrag.target === 'page-center'
                          ? t('居中 · {position}', { position: Math.round(guideDrag.position) })
                          : Math.round(guideDrag.position)}
                      </span>
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
                      aria-label={t('调整图片取景')}
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
                      onVertexPointerDown={onVertexPointerDown}
                      onVertexDoubleClick={onVertexDoubleClick}
                    />
                  )}
                </div>
              </div>
            )}
            </div>
            {fileDragActive && (
              <div className="freeform-drop-overlay" data-testid="freeform-drop-overlay" aria-hidden="true">
                <div><UploadIcon /><b>{t('松开，把图片放进这一页')}</b></div>
              </div>
            )}
          </div>
          {framingRenderTarget && (
            <div className="freeform-framing-zoom" role="group" aria-label={t('图片缩放')}>
              <button
                type="button"
                aria-label={t('缩小图片')}
                title={t('缩小图片')}
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
                aria-label={t('图片缩放比例')}
                onChange={(event) => updateImageFramingZoom(
                  Number(event.currentTarget.value) / 100,
                )}
              />
              <output>{Math.round(framingRenderTarget.target.framing.zoom * 100)}%</output>
              <button
                type="button"
                aria-label={t('放大图片')}
                title={t('放大图片')}
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

          {!imageCropSession && !framingSession && (
            <FreeformZoomControl
              zoomPercent={zoomPercent}
              canZoomOut={zoomPercent > MIN_ZOOM_PERCENT}
              canZoomIn={zoomPercent < MAX_ZOOM_PERCENT}
              onZoomOut={() => setZoomPercent((value) => clampZoomPercent(value - ZOOM_STEP))}
              onZoomIn={() => setZoomPercent((value) => clampZoomPercent(value + ZOOM_STEP))}
              onFit={() => setZoomPercent(DEFAULT_ZOOM_PERCENT)}
            />
          )}
        </section>

        {viewPrefs.panelOpen && (
        <FreeformRightPanel
          propertiesTabRef={propertiesTabRef}
          disabled={hasImageEditSession}
          activeTab={panelTab}
          onTabChange={setPanelTab}
          onClose={() => updateViewPrefs({ panelOpen: false })}
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
              <ol className="freeform-history-list" aria-label={t('编辑历史')}>
                {historyRows.map((row) => {
                  const { kind, index } = row
                  return kind === 'current' ? (
                    <li key={row.key}>
                      <div
                        className="freeform-history-item is-current"
                        data-testid="freeform-history-item"
                        data-history-kind="current"
                      >
                        <span className="freeform-history-label">{t(row.label)}</span>
                        <span className="freeform-history-state">{t('当前')}</span>
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
                        title={kind === 'past' ? t('撤销到这一步') : t('重做到这一步')}
                        onClick={() => jumpToHistoryState(kind, index)}
                      >
                        <span className="freeform-history-label">{t(row.label)}</span>
                        <span className="freeform-history-state">
                          {kind === 'past' ? t('撤销') : t('重做')}
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
            <span>{t('属性')}</span>
            {(selectedProperties || activeGroupPath.length > 0) && (
              <nav
                className="freeform-inspector-breadcrumb"
                aria-label={selectedProperties ? t('对象路径') : t('编辑范围')}
                data-testid={selectedProperties ? undefined : 'freeform-scope-breadcrumb'}
                title={(selectedProperties
                  ? [
                      ...selectedProperties.breadcrumbs.map(breadcrumbLabel),
                      layerLabel(selectedProperties.node.name),
                    ]
                  : scopeBreadcrumbs.map(breadcrumbLabel)
                ).join(' / ')}
              >
                {(selectedProperties?.breadcrumbs ?? scopeBreadcrumbs).map((breadcrumb, index) => (
                  <span key={scenePathKey(breadcrumb.path)} title={breadcrumbLabel(breadcrumb)}>
                    {index > 0 && <span className="freeform-inspector-breadcrumb-separator" aria-hidden="true">/</span>}
                    {breadcrumbLabel(breadcrumb)}
                  </span>
                ))}
                {selectedProperties && (
                  <span
                    className="freeform-inspector-breadcrumb-current"
                    title={layerLabel(selectedProperties.node.name)}
                  >
                    <span className="freeform-inspector-breadcrumb-separator" aria-hidden="true">/</span>
                    {layerLabel(selectedProperties.node.name)}
                  </span>
                )}
              </nav>
            )}
          </div>

          {liveSelection.length === 0 ? (
            <>
              <InspectorSection title={t('页面')} testId="inspector-page">
                <label className="field">
                  <span className="field-label">{t('页面名称')}</span>
                  <input
                    className="text-input"
                    value={isDefaultPageName(activeSlide.name)
                      ? slideDisplayName(activeSlide.name, activeSlideIndex)
                      : activeSlide.name}
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
                    label={t('背景')}
                    value={activeSlide.background}
                    modes={['solid', 'linear-gradient', 'radial-gradient', 'transparent', 'image']}
                    fallbackPaint={DEFAULT_PAGE_PAINT}
                    onChange={(background) => updatePageBackground(activeSlide.id, background as SlideBackground)}
                    onChooseImage={() => pageBackgroundInputRef.current?.click()}
                    onClearImage={() => updatePageBackground(activeSlide.id, { ...DEFAULT_PAGE_PAINT })}
                    onImageFitChange={(fit) => {
                      if (activeSlide.background.type !== 'image') return
                      updatePageBackground(activeSlide.id, { ...activeSlide.background, fit })
                    }}
                    onAdjustImageFraming={() => { startPageBackgroundFraming() }}
                    onResetImageFraming={() => {
                      if (activeSlide.background.type !== 'image' || !canResetPageFraming) return
                      updatePageBackground(activeSlide.id, {
                        ...activeSlide.background,
                        framing: createDefaultImageFraming(),
                      })
                    }}
                    imageFramingDisabled={!canAdjustPageFraming}
                    imageFramingDisabledReason={pageFramingDisabledReason ?? undefined}
                    imageFramingResetDisabled={!canResetPageFraming}
                  />
                </div>
                <input
                  ref={pageBackgroundInputRef}
                  className="freeform-file"
                  type="file"
                  accept="image/*"
                  data-testid="page-background-input"
                  onChange={(event) => { void handlePageBackgroundInput(event.currentTarget.files) }}
                />
              </InspectorSection>
            </>
          ) : (
            <>
              {effectiveLockedSelection && (
                <div
                  className="freeform-lock-banner"
                  data-testid="freeform-lock-banner"
                  role="note"
                  aria-label={t('锁定状态')}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="4" y="8" width="12" height="9" rx="2" />
                    <path d="M7 8V6a3 3 0 0 1 6 0v2" />
                  </svg>
                  <div className="freeform-lock-banner-copy">
                    <strong>{t('已锁定')}</strong>
                    <span>{t('锁定来源：{name}', { name: effectiveLockedSelection.unlockName })}</span>
                  </div>
                  <button
                    className="ghost freeform-lock-banner-action"
                    type="button"
                    aria-label={t('解锁 {name}', { name: effectiveLockedSelection.unlockName })}
                    title={t('解锁 {name}', { name: effectiveLockedSelection.unlockName })}
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
                    <span>{t('解锁')}</span>
                  </button>
                </div>
              )}

              {!effectiveLockedSelection && lockedDescendantSelection && (
                <div
                  className="freeform-lock-descendant-banner"
                  data-testid="freeform-lock-descendant-banner"
                  role="note"
                  aria-label={t('包含锁定图层')}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <rect x="4" y="8" width="12" height="9" rx="2" />
                    <path d="M7 8V6a3 3 0 0 1 6 0v2" />
                  </svg>
                  <div className="freeform-lock-banner-copy">
                    <strong>{t('包含锁定图层')}</strong>
                    <span>{t('锁定来源：{name}，请先在图层面板解锁', { name: lockedDescendantSelection.sourceName })}</span>
                  </div>
                </div>
              )}

              {!propertySelectionReadOnly && canUseLogicalAlignment && (
                <div
                  className="freeform-align-bar"
                  data-testid="freeform-align-bar"
                  role="toolbar"
                  aria-label={t('对齐与分布')}
                >
                  {ALIGN_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      className="align-bar-btn"
                      data-testid={`freeform-align-${action.testId}`}
                      aria-label={t(action.label)}
                      title={t(action.label)}
                      onClick={() => alignSelection(action.id)}
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true"><path d={action.icon} /></svg>
                    </button>
                  ))}
                  <span className="align-bar-separator" aria-hidden="true" />
                  <button
                    type="button"
                    className="align-bar-btn"
                    data-testid="freeform-distribute-h"
                    aria-label={t('水平均分')}
                    title={t('水平均分')}
                    disabled={selectionPaths.length < 3}
                    onClick={() => distributeSelection('horizontal')}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4v12M16 4v12M8.5 7h3v6h-3z" /></svg>
                  </button>
                  <button
                    type="button"
                    className="align-bar-btn"
                    data-testid="freeform-distribute-v"
                    aria-label={t('垂直均分')}
                    title={t('垂直均分')}
                    disabled={selectionPaths.length < 3}
                    onClick={() => distributeSelection('vertical')}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4h12M4 16h12M7 8.5h6v3H7z" /></svg>
                  </button>
                </div>
              )}

              {!propertySelectionReadOnly && liveSelection.length === 1 && selectedProperties && (
                <>
                  <InspectorSection title={t('位置与尺寸')} testId="inspector-geometry">
                    <div className="field-grid">
                      <label>
                        <span className="field-glyph" aria-hidden="true">{selectedProperties.kind === 'group' ? t('中心 X') : 'X'}</span>
                        <InspectorNumberInput
                          ariaLabel={selectedProperties.kind === 'group' ? t('中心 X') : 'X'}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.x}
                          onCommit={(value) => commitSceneProperty({ property: 'x', value })}
                        />
                      </label>
                      <label>
                        <span className="field-glyph" aria-hidden="true">{selectedProperties.kind === 'group' ? t('中心 Y') : 'Y'}</span>
                        <InspectorNumberInput
                          ariaLabel={selectedProperties.kind === 'group' ? t('中心 Y') : 'Y'}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.y}
                          onCommit={(value) => commitSceneProperty({ property: 'y', value })}
                        />
                      </label>
                      <label title={t('宽')}>
                        <span className="field-glyph" aria-hidden="true">W</span>
                        <InspectorNumberInput
                          ariaLabel={t('宽')}
                          min={Number.MIN_VALUE}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.width}
                          onCommit={(value) => commitSceneProperty({ property: 'width', value })}
                        />
                      </label>
                      <label title={t('高')}>
                        <span className="field-glyph" aria-hidden="true">H</span>
                        <InspectorNumberInput
                          ariaLabel={t('高')}
                          min={Number.MIN_VALUE}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.height}
                          onCommit={(value) => commitSceneProperty({ property: 'height', value })}
                        />
                      </label>
                      <label title={t('旋转')}>
                        <InspectorGlyph name="rotate" />
                        <InspectorNumberInput
                          ariaLabel={t('旋转')}
                          resetKey={inspectorNumberResetKey}
                          value={selectedProperties.rotation}
                          onCommit={(value) => commitSceneProperty({ property: 'rotation', value })}
                        />
                        <span className="field-suffix" aria-hidden="true">°</span>
                      </label>
                      {selectedProperties.kind === 'group' && (
                        <label title={t('缩放 %')}>
                          <span className="field-glyph" aria-hidden="true">%</span>
                          <InspectorNumberInput
                            ariaLabel={t('缩放 %')}
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
                        <div className="field-label with-gap">{t('形状')}</div>
                        <div className="seg stretch">
                          {SHAPES.map((shape) => (
                            <button
                              key={shape.id}
                              type="button"
                              className={selectedElement.shape === shape.id ? 'seg-btn on' : 'seg-btn'}
                              onClick={() => updateSelectedStyle({ shape: shape.id })}
                              title={t(shape.label)}
                            >
                              <ShapePreviewIcon shape={shape.id} className="seg-shape-icon" />
                              <span className="sr-only">{t(shape.label)}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </InspectorSection>

                  {isTextElement(selectedElement) && (
                    <InspectorSection title={t('文字')} testId="inspector-typography">
                      <label className="field">
                        <span className="field-label">{t('文本')}</span>
                        <textarea
                          className="freeform-inspector-text"
                          value={selectedElement.text}
                          onChange={(event) =>
                            updateSelectedContent({ text: event.currentTarget.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">{t('字体')}</span>
                        <Select
                          value={fontPickerValue(selectedElement.fontFamily)}
                          onChange={(fontFamily) => {
                            if (fontFamily === IMPORT_FONT_OPTION) {
                              openFontImport(true)
                              return
                            }
                            void buildFontEmbedCSS(
                              selectedElement.text,
                              fontFamily,
                              [selectedElement.fontWeight],
                            ).catch(() => undefined)
                            const from = selectedElement.fontFamily
                            if (updateSelectedStyle({ fontFamily }) && from !== fontFamily) setFontSwap({ from, to: fontFamily })
                          }}
                          title={t('字体')}
                          testId="freeform-font-select"
                          previewFonts
                          options={fontOptions(importedFonts, { current: selectedElement.fontFamily, withImport: true })}
                        />
                      </label>
                      {fontSwap && fontSwap.to === selectedElement.fontFamily && deckFamilies.has(fontSwap.from) && (
                        <button
                          type="button"
                          className="freeform-font-swap"
                          data-testid="freeform-font-swap"
                          title={t('把整套里用「{from}」的文字都换成「{to}」', { from: fontLabel(fontSwap.from), to: fontLabel(fontSwap.to) })}
                          onClick={() => {
                            restyleDeck({ fonts: { [fontSwap.from]: fontSwap.to } })
                            setFontSwap(null)
                          }}
                        >
                          {t('全部替换')}
                        </button>
                      )}
                      <div className="field-grid three">
                        <label title={t('字号')}>
                          <InspectorGlyph name="font-size" />
                          <InspectorNumberInput
                            ariaLabel={t('字号')}
                            min={Number.MIN_VALUE}
                            max={Number.MAX_VALUE}
                            resetKey={inspectorNumberResetKey}
                            value={selectedProperties.kind === 'leaf'
                              ? selectedProperties.fontSize ?? selectedElement.fontSize
                              : selectedElement.fontSize}
                            onCommit={(value) => commitSceneProperty({ property: 'fontSize', value })}
                          />
                        </label>
                        <label title={t('行高')}>
                          <InspectorGlyph name="line-height" />
                          <InspectorNumberInput
                            ariaLabel={t('行高')}
                            min={0.5}
                            max={4}
                            resetKey={inspectorNumberResetKey}
                            value={selectedElement.lineHeight ?? 1.18}
                            onCommit={(value) => updateSelectedStyle({ lineHeight: value })}
                          />
                        </label>
                        <label title={t('字距')}>
                          <InspectorGlyph name="letter-spacing" />
                          <InspectorNumberInput
                            ariaLabel={t('字距')}
                            min={-50}
                            max={200}
                            resetKey={inspectorNumberResetKey}
                            value={selectedElement.letterSpacing ?? 0}
                            onCommit={(value) => updateSelectedStyle({ letterSpacing: value })}
                          />
                        </label>
                      </div>
                      <div className="field-label with-gap">{t('对齐与字型')}</div>
                      <div className="text-style-row">
                      <div className="seg stretch">
                        {TEXT_ALIGN_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={selectedElement.align === option.id ? 'seg-btn on' : 'seg-btn'}
                            aria-label={t(option.label)}
                            title={t(option.label)}
                            aria-pressed={selectedElement.align === option.id}
                            onClick={() => updateSelectedStyle({ align: option.id })}
                          >
                            <svg className="seg-icon" viewBox="0 0 16 16" aria-hidden="true"><path d={option.icon} /></svg>
                          </button>
                        ))}
                      </div>
                      <div className="seg stretch">
                        <button
                          type="button"
                          className={selectedElement.fontWeight === 'bold' ? 'seg-btn on' : 'seg-btn'}
                          data-testid="text-weight-toggle"
                          aria-pressed={selectedElement.fontWeight === 'bold' ? 'true' : 'false'}
                          aria-label={t('粗体')}
                          title={t('粗体')}
                          onClick={() => updateSelectedStyle({
                            fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold',
                          })}
                        >
                          <b className="seg-glyph" aria-hidden="true">B</b>
                        </button>
                        <button
                          type="button"
                          className={selectedElement.italic ? 'seg-btn on' : 'seg-btn'}
                          data-testid="text-italic-toggle"
                          aria-pressed={selectedElement.italic ? 'true' : 'false'}
                          aria-label={t('斜体')}
                          title={t('斜体')}
                          onClick={() => updateSelectedStyle({ italic: !selectedElement.italic })}
                        >
                          <i className="seg-glyph" aria-hidden="true">I</i>
                        </button>
                        <button
                          type="button"
                          className={selectedElement.vertical ? 'seg-btn on' : 'seg-btn'}
                          data-testid="text-vertical-toggle"
                          aria-pressed={selectedElement.vertical ? 'true' : 'false'}
                          aria-label={t('竖排')}
                          title={t('竖排')}
                          onClick={() => updateSelectedStyle({ vertical: !selectedElement.vertical })}
                        >
                          <svg className="seg-icon" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M10.5 2.5v11M8 11l2.5 2.5L13 11M3 3.5h4M5 3.5v6.5" />
                          </svg>
                        </button>
                      </div>
                      </div>
                      <div className="field-label with-gap">{t('描边')}</div>
                      <div className="paint-row" data-testid="text-stroke-field">
                        <ColorPickerButton
                          label={t('描边颜色')}
                          color={selectedElement.stroke ?? '#18181b'}
                          onChange={(color) => updateSelectedStyle({
                            stroke: color,
                            strokeWidth: selectedElement.strokeWidth ?? 2,
                          })}
                        />
                        <input
                          className="paint-hex"
                          value={selectedElement.stroke ?? ''}
                          placeholder={t('无')}
                          onChange={(event) => {
                            if (!isHexColor(event.currentTarget.value)) return
                            updateSelectedStyle({
                              stroke: event.currentTarget.value,
                              strokeWidth: selectedElement.strokeWidth ?? 2,
                            })
                          }}
                          aria-label={t('描边 hex')}
                        />
                        <InspectorNumberInput
                          ariaLabel={t('描边宽度')}
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
                          className="ghost inspector-icon-btn"
                          data-testid="text-stroke-clear"
                          aria-label={t('清除描边')}
                          title={t('清除描边')}
                          onClick={() => updateSelectedStyle({ stroke: null, strokeWidth: null })}
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    </InspectorSection>
                  )}

                  {isTextElement(selectedElement) && (
                    <InspectorSection title={t('效果')} testId="inspector-text-effect">
                      <TextEffectField
                        effect={selectedElement.effect}
                        textColor={selectedElement.textFill.type === 'solid'
                          ? selectedElement.textFill.color
                          : paintFallbackColor(selectedElement.textFill)}
                        resetKey={inspectorNumberResetKey}
                        onChange={(effect) => updateSelectedStyle({ effect })}
                      />
                    </InspectorSection>
                  )}

                  {isTextElement(selectedElement) && (activeTextRange || (selectedElement.spans?.length ?? 0) > 0) && (
                    <InspectorSection title={t('文字片段')} testId="inspector-rich-spans">
                      {activeTextRange && (
                        <div className="rich-span-apply" data-testid="rich-span-apply">
                          <span className="rich-span-hint">
                            {t('已选 {n} 字', { n: activeTextRange.end - activeTextRange.start })}
                          </span>
                          <button
                            className="ghost"
                            type="button"
                            data-testid="rich-span-bold"
                            aria-pressed={selectedTextIsBold}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => restyleSelectedText(({ bold: _bold, ...rest }) => (
                              selectedTextIsBold ? rest : { ...rest, bold: true }
                            ))}
                          >
                            {t('加粗')}
                          </button>
                          <button
                            className="ghost"
                            type="button"
                            data-testid="rich-span-underline"
                            aria-pressed={selectedTextIsUnderlined}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => restyleSelectedText(({ underline: _underline, ...rest }) => (
                              selectedTextIsUnderlined ? rest : { ...rest, underline: true }
                            ))}
                          >
                            {t('下划线')}
                          </button>
                          <button
                            className="ghost"
                            type="button"
                            data-testid="rich-span-clear"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => restyleSelectedText(() => ({}))}
                          >
                            {t('清除样式')}
                          </button>
                          <div className="rich-span-swatches">
                            <span className="rich-span-label">{t('标色')}</span>
                            {RICH_SPAN_COLORS.map((color) => (
                              <button
                                key={color}
                                className="rich-span-swatch"
                                type="button"
                                aria-label={t('标色 {color}', { color })}
                                title={color}
                                style={{ background: color }}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => restyleSelectedText((style) => ({ ...style, color }))}
                              />
                            ))}
                          </div>
                          <div className="rich-span-swatches">
                            <span className="rich-span-label">{t('高亮')}</span>
                            {RICH_SPAN_HIGHLIGHTS.map((highlight) => (
                              <button
                                key={highlight}
                                className="rich-span-swatch is-highlight"
                                type="button"
                                aria-label={t('高亮 {color}', { color: highlight })}
                                title={highlight}
                                style={{ background: highlight }}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => restyleSelectedText((style) => ({ ...style, highlight }))}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedElement.spans && selectedElement.spans.length > 0 && (
                        <ul className="rich-span-list" data-testid="rich-span-list">
                          {selectedElement.spans.map((span, index) => (
                            <li key={`${span.start}-${span.end}-${index}`}>
                              <span className="rich-span-range" title={selectedElement.text.slice(span.start, span.end)}>
                                {selectedElement.text.slice(span.start, span.end)}
                              </span>
                              {span.bold && <span className="rich-span-chip">{t('加粗')}</span>}
                              {span.color && (
                                <span className="rich-span-chip" style={{ color: span.color }}>
                                  {t('标色')}
                                </span>
                              )}
                              {span.highlight && (
                                <span className="rich-span-chip is-highlight" style={{ background: span.highlight }}>
                                  {t('高亮')}
                                </span>
                              )}
                              {span.underline && <span className="rich-span-chip is-underline">{t('下划线')}</span>}
                              <button
                                className="draft-del"
                                type="button"
                                aria-label={t('删除文字片段')}
                                onClick={() => removeSelectedTextSpan(index)}
                              >
                                {t('删除')}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </InspectorSection>
                  )}

                  {(isTextElement(selectedElement) ||
                    isShapeElement(selectedElement) ||
                    isPathElement(selectedElement) ||
                    isImageElement(selectedElement)) && (
                    <InspectorSection title={t('填充')} testId="inspector-fill">
                      {isTextElement(selectedElement) && (
                        <div data-testid="text-fill-paint">
                          <PaintField
                            label={t('文字颜色')}
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
                              label={t('填充')}
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
                      {isPathElement(selectedElement) && (
                        <div data-testid="path-fill-paint">
                          <PaintField
                            label={t('填充')}
                            value={selectedElement.fill}
                            modes={['solid', 'linear-gradient', 'radial-gradient', 'transparent']}
                            fallbackPaint={DEFAULT_SHAPE_PAINT}
                            onChange={(fill) => updateSelectedStyle({ fill: fill as PathFill })}
                          />
                        </div>
                      )}
                      {isImageElement(selectedElement) && (
                        <>
                          <div className="field-label">{t('图片填充方式')}</div>
                          <div className="seg stretch">
                            {FITS.map((fit) => (
                              <button
                                key={fit.id}
                                type="button"
                                className={selectedElement.fit === fit.id ? 'seg-btn on' : 'seg-btn'}
                                data-testid={`paint-image-fit-${fit.id}`}
                                onClick={() => updateSelectedStyle({ fit: fit.id })}
                              >
                                {t(fit.label)}
                              </button>
                            ))}
                          </div>
                          <div className="inspector-actions">
                            <button
                              className="ghost"
                              type="button"
                              data-testid="freeform-crop-image"
                              aria-label={t('裁剪图片')}
                              title={canCropSelectedImage
                                ? t('裁剪图片')
                                : selectedFramingDisabledReason ?? undefined}
                              disabled={!canCropSelectedImage}
                              onClick={() => {
                                if (selectedPath) startImageCrop(selectedPath)
                              }}
                            >
                              {t('裁剪')}
                            </button>
                            <button
                              className="ghost"
                              type="button"
                              data-testid="freeform-reset-framing"
                              aria-label={t('重置图片取景')}
                              title={canResetSelectedFraming
                                ? t('重置图片取景')
                                : t('当前已经是默认取景')}
                              disabled={!canResetSelectedFraming}
                              onClick={resetSelectedImageFraming}
                            >
                              {t('重置取景')}
                            </button>
                            <button
                              className="ghost"
                              type="button"
                              data-testid="freeform-image-as-background"
                              onClick={setSelectedImageAsBackground}
                            >
                              {t('设为背景')}
                            </button>
                          </div>
                        </>
                      )}
                    </InspectorSection>
                  )}

                  {(isShapeElement(selectedElement) || isLineElement(selectedElement) || isPathElement(selectedElement)) && (
                    <InspectorSection title={t('描边')} testId="inspector-stroke">
                      {isLineElement(selectedElement) && (
                        <>
                          <div className="field-label">{t('线条')}</div>
                          <div className="seg stretch" data-testid="line-kind-seg">
                            {(['line', 'arrow'] as const).map((lineKind) => (
                              <button
                                key={lineKind}
                                type="button"
                                className={selectedElement.lineKind === lineKind ? 'seg-btn on' : 'seg-btn'}
                                onClick={() => updateSelectedStyle({ lineKind })}
                              >
                                {lineKind === 'line' ? t('直线') : t('箭头')}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="field-grid with-gap">
                        <div
                          className="stroke-color-field"
                          data-testid={isShapeElement(selectedElement)
                            ? 'shape-stroke-color'
                            : isPathElement(selectedElement) ? 'path-stroke-color' : 'line-stroke-color'}
                        >
                          <span className="stroke-color-label">{t('颜色')}</span>
                          <div className="color-field">
                            <span className="color-field-value">
                              {selectedElement.stroke === 'transparent' ? t('透明') : selectedElement.stroke.toUpperCase()}
                            </span>
                            <ColorPickerButton
                              label={isShapeElement(selectedElement)
                                ? t('形状描边颜色')
                                : isPathElement(selectedElement) ? t('图形描边颜色') : t('线条颜色')}
                              color={selectedElement.stroke}
                              onChange={(stroke) => updateSelectedStyle({ stroke })}
                            />
                          </div>
                        </div>
                        <label title={isLineElement(selectedElement) ? t('粗细') : t('描边宽')}>
                          <InspectorGlyph name="stroke" />
                          <InspectorNumberInput
                            ariaLabel={isLineElement(selectedElement) ? t('粗细') : t('描边宽')}
                            min={isLineElement(selectedElement) ? Number.MIN_VALUE : 0}
                            max={Number.MAX_VALUE}
                            resetKey={inspectorNumberResetKey}
                            value={selectedProperties.kind === 'leaf'
                              ? selectedProperties.strokeWidth ?? selectedElement.strokeWidth
                              : selectedElement.strokeWidth}
                            onCommit={(value) => commitSceneProperty({ property: 'strokeWidth', value })}
                          />
                        </label>
                      </div>
                      {isPathElement(selectedElement) && (
                        <>
                          <div className="field-grid with-gap">
                            <label title={t('虚线')}>
                              <InspectorGlyph name="dash" />
                              <InspectorNumberInput
                                ariaLabel={t('虚线')}
                                min={0}
                                max={Number.MAX_VALUE}
                                resetKey={inspectorNumberResetKey}
                                value={selectedElement.dash === undefined
                                  ? 0
                                  : selectedElement.dash * pathStrokeScale(selectedElement.viewBox, selectedElement.width, selectedElement.height)}
                                onCommit={(value) => updateSelectedStyle({
                                  // The panel shows page pixels; the path keeps viewBox units.
                                  dash: value > 0
                                    ? value / pathStrokeScale(selectedElement.viewBox, selectedElement.width, selectedElement.height)
                                    : null,
                                })}
                              />
                            </label>
                            <div className="inspector-actions">
                              <button
                                className="ghost"
                                type="button"
                                data-testid="path-dash-clear"
                                disabled={selectedElement.dash === undefined}
                                onClick={() => updateSelectedStyle({ dash: null })}
                              >
                                {t('实线')}
                              </button>
                            </div>
                          </div>
                          <div className="field-label with-gap">{t('线帽')}</div>
                          <div className="seg stretch">
                            {LINE_CAPS.map((cap) => (
                              <button
                                key={cap.id}
                                type="button"
                                className={(selectedElement.cap ?? 'round') === cap.id ? 'seg-btn on' : 'seg-btn'}
                                data-testid={`path-cap-${cap.id}`}
                                onClick={() => updateSelectedStyle({ cap: cap.id })}
                              >
                                {t(cap.label)}
                              </button>
                            ))}
                          </div>
                          <div className="field-label with-gap">{t('拐角')}</div>
                          <div className="seg stretch">
                            {PATH_JOINS.map((join) => (
                              <button
                                key={join.id}
                                type="button"
                                className={(selectedElement.join ?? 'round') === join.id ? 'seg-btn on' : 'seg-btn'}
                                data-testid={`path-join-${join.id}`}
                                onClick={() => updateSelectedStyle({ join: join.id })}
                              >
                                {t(join.label)}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {isLineElement(selectedElement) && (
                        <>
                          <div className="field-grid with-gap">
                            <label title={t('虚线')}>
                              <InspectorGlyph name="dash" />
                              <InspectorNumberInput
                                ariaLabel={t('虚线')}
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
                                {t('实线')}
                              </button>
                            </div>
                          </div>
                          <div className="field-label with-gap">{t('线帽')}</div>
                          <div className="seg stretch">
                            {LINE_CAPS.map((cap) => (
                              <button
                                key={cap.id}
                                type="button"
                                className={(selectedElement.cap ?? 'round') === cap.id ? 'seg-btn on' : 'seg-btn'}
                                data-testid={`line-cap-${cap.id}`}
                                onClick={() => updateSelectedStyle({ cap: cap.id })}
                              >
                                {t(cap.label)}
                              </button>
                            ))}
                          </div>
                          <div className="field-label with-gap">{t('端点')}</div>
                          <div className="field-grid with-gap">
                            {LINE_ENDPOINT_SIDES.map((side) => {
                              const active = side.id === 'start'
                                ? selectedElement.startCap ?? 'none'
                                : selectedElement.endCap
                                  ?? (selectedElement.lineKind === 'arrow' ? 'arrow' : 'none')
                              return (
                                <div key={side.id}>
                                  <div className="field-label">{t(side.label)}</div>
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
                                          {t(cap.label)}
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
                  <InspectorSection title={t('外观')} testId="inspector-appearance">
                    <div className="field-grid with-gap">
                      <label title={t('不透明度 %')}>
                        <InspectorGlyph name="opacity" />
                        <InspectorNumberInput
                          ariaLabel={t('不透明度 %')}
                          min={0}
                          max={100}
                          resetKey={inspectorNumberResetKey}
                          value={Math.round((selectedElement.opacity ?? 1) * 100)}
                          onCommit={(value) =>
                            updateSelectedStyle({ opacity: Math.round(value) / 100 })}
                        />
                        <span className="field-suffix" aria-hidden="true">%</span>
                      </label>
                      {isShapeElement(selectedElement) && selectedElement.shape === 'rect' && (
                        <label title={t('圆角')}>
                          <InspectorGlyph name="radius" />
                          <InspectorNumberInput
                            ariaLabel={t('圆角')}
                            min={0}
                            max={2000}
                            resetKey={inspectorNumberResetKey}
                            value={selectedElement.cornerRadius ?? 16}
                            onCommit={(value) => updateSelectedStyle({ cornerRadius: value })}
                          />
                        </label>
                      )}
                    </div>
                    <div className="field-label with-gap">{t('阴影')}</div>
                    <ShadowField
                      shadow={selectedElement.shadow}
                      resetKey={inspectorNumberResetKey}
                      onChange={(shadow) => updateSelectedStyle({ shadow })}
                    />
                    <div className="field-label with-gap">{t('混合模式')}</div>
                    <Select
                      value={selectedElement.blendMode ?? 'normal'}
                      onChange={(blendMode) => updateSelectedStyle({
                        blendMode: blendMode === 'normal' ? null : blendMode as BlendMode,
                      })}
                      title={t('混合模式')}
                      testId="freeform-blend-select"
                      options={BLEND_MODE_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
                    />
                    <div className="field-label with-gap">{t('滤镜')}</div>
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
                <InspectorSection title={t('排列')} testId="inspector-arrange">
                  <div className="field-label">{t('层级')}</div>
                  <div className="inspector-icon-row">
                    {LAYER_ORDER_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        className="ghost inspector-icon-btn"
                        type="button"
                        aria-label={t(action.label)}
                        title={t(action.label)}
                        onClick={() => reorderSelection(action.id)}
                      >
                        <svg viewBox="0 0 20 20" aria-hidden="true"><path d={action.icon} /></svg>
                      </button>
                    ))}
                  </div>
                </InspectorSection>
              )}

              {!propertySelectionReadOnly && liveSelection.length === 1 && (
                <InspectorSection title={t('删除')} testId="inspector-danger" tone="danger">
                  <button className="ghost inspector-delete" type="button" onClick={deleteSelection}>
                    {t('删除')}
                  </button>
                </InspectorSection>
              )}
            </>
          )}
        </FreeformRightPanel>
        )}
      </main>


      <TemplateGallery
        open={showTemplates}
        workspace='freeform'
        hasCurrentContent={draftId !== null || history.past.length > 0 || doc.slides.length > 1 || doc.slides.some((slide) => slide.nodes.length > 0)}
        currentIsSaved={ownerId !== null && !unsaved}
        onClose={() => setShowTemplates(false)}
        initialTemplateId={galleryTemplateId}
        onApply={applyFreeformTemplate}
      />

      {showMixedSizeWarning && (
        <div className="sheet-backdrop" onClick={() => setShowMixedSizeWarning(false)}>
          <div className="sheet freeform-warning-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-body">
              <h2>{t('包含不同尺寸页面')}</h2>
              <p className="form-note">
                {t('当前作品包含不同尺寸页面。ZIP 中的图片会保留各自页面尺寸，不会统一拉伸或裁剪。')}
              </p>
              <div className="sheet-foot">
                <button type="button" className="ghost" onClick={() => setShowMixedSizeWarning(false)}>
                  {t('取消')}
                </button>
                <button
                  type="button"
                  className="accent"
                  onClick={continueMixedSizeExport}
                  disabled={renderScale === null}
                >
                  {t('继续导出')}
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
          aria-label={t('画布操作')}
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
            {t('复制')}
            <MenuShortcut keys={shortcutLabel('C', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-duplicate"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); duplicateSelection() }}
          >
            {t('原位复制')}
            <MenuShortcut keys={shortcutLabel('D', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-cut"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); cutSelection() }}
          >
            {t('剪切')}
            <MenuShortcut keys={shortcutLabel('X', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-paste"
            disabled={!clipboard || clipboard.nodes.length === 0}
            onClick={() => { closeContextMenu(); pasteClipboard() }}
          >
            {t('粘贴')}
            <MenuShortcut keys={shortcutLabel('V', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-paste-in-place"
            disabled={!clipboard || clipboard.nodes.length === 0}
            onClick={() => { closeContextMenu(); pasteClipboard(true) }}
          >
            {t('原位粘贴')}
            <MenuShortcut keys={shortcutLabel('V', { mod: true, shift: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-delete"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); deleteSelection() }}
          >
            {t('删除')}
            <MenuShortcut keys={DELETE_KEY} />
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
            {t('上移一层')}
            <MenuShortcut keys={shortcutLabel(']', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-backward"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('backward') }}
          >
            {t('下移一层')}
            <MenuShortcut keys={shortcutLabel('[', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-front"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('front') }}
          >
            {t('置于顶层')}
            <MenuShortcut keys="]" />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-back"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); reorderSelection('back') }}
          >
            {t('移到底层')}
            <MenuShortcut keys="[" />
          </button>
          {menuSelectionIsImage && (
            <button
              type="button"
              role="menuitem"
              className="freeform-context-menu-item"
              data-testid="freeform-context-menu-as-background"
              disabled={menuSelectionAllLocked}
              onClick={() => { closeContextMenu(); setSelectedImageAsBackground() }}
            >
              {t('设为背景')}
            </button>
          )}
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-group"
            disabled={selectionPaths.length < 2}
            onClick={() => { closeContextMenu(); groupSelection() }}
          >
            {t('编组')}
            <MenuShortcut keys={shortcutLabel('G', { mod: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-ungroup"
            disabled={!menuSelectionHasGroup}
            onClick={() => { closeContextMenu(); ungroupSelection() }}
          >
            {t('解组')}
            <MenuShortcut keys={shortcutLabel('G', { mod: true, shift: true })} />
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
            {menuSelectionAllLocked ? t('解锁') : t('锁定')}
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
            {menuSelectionAllHidden ? t('取消隐藏') : t('隐藏')}
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
            {t('复制样式')}
            <MenuShortcut keys={shortcutLabel('C', { mod: true, alt: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-paste-style"
            disabled={!styleClipboard || !menuSelectionHasLeaf}
            onClick={() => { closeContextMenu(); pasteStyleToSelection() }}
          >
            {t('粘贴样式')}
            <MenuShortcut keys={shortcutLabel('V', { mod: true, alt: true })} />
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-context-menu-zoom-selection"
            disabled={selection.length === 0}
            onClick={() => { closeContextMenu(); zoomToSelectionBounds() }}
          >
            {t('缩放到选区')}
            <MenuShortcut keys={shortcutLabel('2', { shift: true })} />
          </button>
        </div>
      )}

      {slideContextMenu && slideMenuIndex >= 0 && (
        <div
          ref={slideContextMenuRef}
          className="freeform-context-menu"
          data-testid="freeform-slide-context-menu"
          role="menu"
          aria-label={t('页面操作')}
          style={{ left: slideContextMenu.x, top: slideContextMenu.y }}
          onKeyDown={(event) => {
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
            )
            const index = items.findIndex((item) => item === document.activeElement)
            let next: number | null = null
            if (event.key === 'ArrowDown') next = index + 1
            else if (event.key === 'ArrowUp') next = index < 0 ? items.length - 1 : index - 1
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = items.length - 1
            if (next !== null && items.length > 0) {
              event.preventDefault()
              event.stopPropagation()
              items[(next + items.length) % items.length].focus()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closeSlideMenu(true)
            } else if (event.key === 'Tab') {
              closeSlideMenu(false)
            }
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-rename"
            onClick={() => {
              const slideId = slideContextMenu.slideId
              closeSlideMenu(false)
              beginSlideRename(slideId)
            }}
          >
            {t('重命名此页')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-duplicate"
            disabled={doc.slides.length >= MAX_FREEFORM_SLIDES}
            onClick={() => {
              closeSlideMenu(true)
              duplicateSlide(slideContextMenu.slideId)
            }}
          >
            {t('复制此页')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-delete"
            disabled={doc.slides.length <= 1}
            onClick={() => {
              closeSlideMenu(true)
              deleteSlide(slideContextMenu.slideId)
            }}
          >
            {t('删除此页')}
          </button>
          <div className="freeform-context-menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-up"
            disabled={slideMenuIndex === 0}
            onClick={() => {
              closeSlideMenu(true)
              reorderSlide(slideContextMenu.slideId, slideMenuIndex - 1)
            }}
          >
            {t('上移一位')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-down"
            disabled={slideMenuIndex === doc.slides.length - 1}
            onClick={() => {
              closeSlideMenu(true)
              reorderSlide(slideContextMenu.slideId, slideMenuIndex + 1)
            }}
          >
            {t('下移一位')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-front"
            disabled={slideMenuIndex === 0}
            onClick={() => {
              closeSlideMenu(true)
              reorderSlide(slideContextMenu.slideId, 0)
            }}
          >
            {t('移到最前')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="freeform-context-menu-item"
            data-testid="freeform-slide-context-menu-back"
            disabled={slideMenuIndex === doc.slides.length - 1}
            onClick={() => {
              closeSlideMenu(true)
              reorderSlide(slideContextMenu.slideId, doc.slides.length - 1)
            }}
          >
            {t('移到最后')}
          </button>
        </div>
      )}
    </div>
    </DeckColorsContext.Provider>
  )
}
