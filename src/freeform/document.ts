import { randomId } from '../uid'
import {
  MAX_FREEFORM_SLIDES,
  PAGE_SIZE_MAX,
  PAGE_SIZE_MIN,
  pageSizePresets,
} from './constants'
import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
  isHexColor,
  isValidPagePattern,
  isValidPagePatternSize,
} from './paint'
import {
  cloneImageFraming,
  createDefaultImageFraming,
  imageFramingEquals,
  isValidImageFraming,
} from './imageFraming'
import {
  buildScenePathIndex,
  canApplySceneAction,
  cloneSceneNodes,
  copySceneNodeValues,
  cloneSceneNodesAtPath,
  createSceneGroup,
  deleteSceneNodes,
  insertSceneChildren,
  isValidSceneColorPaint,
  isValidScenePathFill,
  isValidSceneShapeFill,
  reorderNodesAboveAtPath,
  reorderNodesAtPath,
  scenePathKey,
  ungroupSceneGroups,
  updateNodeAtPath,
  updateNodesAtPaths,
  validateSceneNodesForMutation,
  validateSelectionForParent,
  walkScene,
} from './sceneTree'
import { effectiveSceneState } from './sceneSelection'
import { guidesEqual, normalizeSlideGuides } from './guides'
import { normalizeRichTextSpans, remapRichTextSpans, scaleSpanFontSizes } from './richText'
import {
  clonePathViewBox,
  cloneSceneFilter,
  cloneShadowPaint,
  gradientStopsEquals,
  isValidBlendMode,
  isValidBubbleTailX,
  isValidCornerRadius,
  isValidDash,
  isValidFillRule,
  isValidLineCap,
  isValidLineEndpointCap,
  isValidLineJoin,
  cloneLinePoints,
  isValidLineHeight,
  isValidLetterSpacing,
  isValidOpacity,
  isValidPathDash,
  isValidPathStrokeWidth,
  isValidShape,
  isValidStarInnerRatio,
  isValidTextStrokeWidth,
  isTextList,
  isTextVerticalAlign,
  isValidParagraphSpacing,
  pathViewBoxEquals,
  sceneFilterEquals,
  shadowPaintEquals,
} from './appearance'
import { isValidPathData } from './pathData'
import { QR_DARK_DEFAULT, QR_LIGHT_DEFAULT, isValidQrEcl, isValidQrLogoSrc, isValidQrModuleStyle, isValidQrPayload, isValidQrQuietZone } from './qrCode'
import { CHART_ACCENT_DEFAULT, CHART_POINTS_MAX, isValidChartBarMode, isValidChartKind, isValidChartLabel, isValidChartSeriesList } from './charts'
import { isValidTableCells, isValidTableColWidths, isValidTableCols, isValidTableRows } from './tables'
import { isValidTimelineItems, timelineItemsSame } from './timeline'
import { isProgressKind, isValidProgressLabel, isValidProgressValue } from './progress'
import { isValidTextEffect, textEffectsEqual } from './textEffects'
import { restyleDocument } from './restyle'
import type {  FreeformChartSeries,
  ColorPaint,
  FreeformAction,
  FreeformDocument,
  FreeformElement,
  FreeformImageCropPatch,
  FreeformImageElement,
  FreeformLineElement,
  FreeformNodeContentPatch,
  FreeformNodeGeometryPatch,
  FreeformNodeStylePatch,
  FreeformPathElement,
  FreeformQrCodeElement,
  FreeformChartElement,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformSlide,
  FreeformTableElement,
  FreeformTextElement,
  FreeformTimelineElement,
  FreeformTimelineItem,
  FreeformProgressElement,
  CornerRadii,
  ImageFraming,
  LinePoint,
  PathFill,
  PathViewBox,
  TextAlign,
  RichTextSpan,
  SceneFilter,
  ScenePath,
  ShadowPaint,
  TextEffect,
  ShapeFill,
  SlideBackground,
} from './types'

export { pageSizePresets }

export type PageSizeValidation =
  | { ok: true }
  | { ok: false; message: string }

export function validatePageSize(width: number, height: number): PageSizeValidation {
  const ok =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= PAGE_SIZE_MIN &&
    height >= PAGE_SIZE_MIN &&
    width <= PAGE_SIZE_MAX &&
    height <= PAGE_SIZE_MAX

  return ok ? { ok: true } : { ok: false, message: '页面尺寸必须在 128 到 4096 px 之间' }
}

interface CreateSlideInput {
  width?: number
  height?: number
  inheritFrom?: FreeformSlide
}

export function createSlide(input: CreateSlideInput = {}): FreeformSlide {
  const preset = pageSizePresets[1]
  const width = input.inheritFrom?.width ?? input.width ?? preset.width
  const height = input.inheritFrom?.height ?? input.height ?? preset.height

  return {
    id: randomId(),
    name: 'Page 1',
    width,
    height,
    background: { ...DEFAULT_PAGE_PAINT },
    nodes: [],
  }
}

export function createFreeformDocument(): FreeformDocument {
  const slide = createSlide()
  return {
    documentVersion: 43,
    activeSlideId: slide.id,
    slides: [slide],
  }
}

function centerBox(slide: FreeformSlide, width: number, height: number) {
  return {
    x: Math.round((slide.width - width) / 2),
    y: Math.round((slide.height - height) / 2),
    width,
    height,
  }
}

export function createTextElement(slide: FreeformSlide): FreeformTextElement {
  return {
    id: randomId(),
    name: '文本',
    locked: false,
    hidden: false,
    type: 'text',
    ...centerBox(slide, Math.min(520, Math.round(slide.width * 0.55)), 150),
    rotation: 0,
    scale: 1,
    text: '双击编辑文本',
    fontSize: 48,
    fontFamily: 'PingFang SC, Microsoft YaHei, system-ui, sans-serif',
    textFill: { ...DEFAULT_TEXT_PAINT },
    align: 'left',
    fontWeight: 'bold',
  }
}

export function createImageElement(
  slide: FreeformSlide,
  src: string,
  alt = '图片',
): FreeformImageElement {
  return {
    id: randomId(),
    name: '图片',
    locked: false,
    hidden: false,
    type: 'image',
    ...centerBox(slide, Math.min(560, Math.round(slide.width * 0.58)), 360),
    rotation: 0,
    scale: 1,
    src,
    alt,
    fit: 'cover',
    framing: createDefaultImageFraming(),
  }
}

export function createShapeElement(
  slide: FreeformSlide,
  shape: FreeformShapeElement['shape'],
): FreeformShapeElement {
  return {
    id: randomId(),
    name: '形状',
    locked: false,
    hidden: false,
    type: 'shape',
    ...centerBox(slide, 360, 240),
    rotation: 0,
    scale: 1,
    shape,
    fill: { ...DEFAULT_SHAPE_PAINT },
    stroke: '#c2410c',
    strokeWidth: 0,
  }
}

export function createLineElement(
  slide: FreeformSlide,
  lineKind: FreeformLineElement['lineKind'],
): FreeformLineElement {
  return {
    id: randomId(),
    name: lineKind === 'arrow' ? '箭头' : '直线',
    locked: false,
    hidden: false,
    type: 'line',
    lineKind,
    ...centerBox(slide, Math.min(520, Math.round(slide.width * 0.55)), 80),
    rotation: 0,
    scale: 1,
    stroke: '#18181b',
    strokeWidth: 6,
  }
}

export interface CreatePathInput {
  name: string
  d: string
  viewBox: PathViewBox
  /** The box's longer side in px; the other follows the viewBox's aspect. */
  size: number
  stroke?: string
  strokeWidth?: number
  fill?: PathFill
}

/** A path node centred on the page, its box matching the drawing's aspect. */
export function createPathElement(slide: FreeformSlide, input: CreatePathInput): FreeformPathElement {
  const aspect = input.viewBox.width / input.viewBox.height
  const width = aspect >= 1 ? input.size : Math.round(input.size * aspect)
  const height = aspect >= 1 ? Math.round(input.size / aspect) : input.size
  return {
    id: randomId(),
    name: input.name,
    locked: false,
    hidden: false,
    type: 'path',
    ...centerBox(slide, Math.max(1, width), Math.max(1, height)),
    rotation: 0,
    scale: 1,
    d: input.d,
    viewBox: { ...input.viewBox },
    fill: input.fill ?? { type: 'transparent' },
    stroke: input.stroke ?? '#18181b',
    strokeWidth: input.strokeWidth ?? 2,
  }
}

export function createChartElement(slide: FreeformSlide): FreeformChartElement {
  return {
    id: randomId(),
    name: '图表',
    locked: false,
    hidden: false,
    type: 'chart',
    ...centerBox(slide, 480, 320),
    rotation: 0,
    scale: 1,
    chartKind: 'bar',
    labels: ['一月', '二月', '三月', '四月'],
    series: [{ values: [4, 7, 5, 9], color: CHART_ACCENT_DEFAULT }],
  }
}

export function createTableElement(slide: FreeformSlide): FreeformTableElement {
  return {
    id: randomId(),
    name: '表格',
    locked: false,
    hidden: false,
    type: 'table',
    ...centerBox(slide, 480, 320),
    rotation: 0,
    scale: 1,
    rows: 3,
    cols: 3,
    cells: ['项目', '本月', '上月', '阅读', '1.2万', '9800', '涨粉', '320', '210'],
  }
}

export function createTimelineElement(slide: FreeformSlide): FreeformTimelineElement {
  return {
    id: randomId(),
    name: '时间线',
    locked: false,
    hidden: false,
    type: 'timeline',
    ...centerBox(slide, 480, 420),
    rotation: 0,
    scale: 1,
    items: [
      { label: '3 月', text: '注册账号，发出第一篇笔记' },
      { label: '6 月', text: '接到第一单商单合作' },
      { label: '9 月', text: '粉丝破万，开始做系列内容' },
      { label: '12 月', text: '工作室成立，全职做内容' },
    ],
  }
}

export function createProgressElement(slide: FreeformSlide): FreeformProgressElement {
  return {
    id: randomId(),
    name: '进度',
    locked: false,
    hidden: false,
    type: 'progress',
    ...centerBox(slide, 480, 96),
    rotation: 0,
    scale: 1,
    progressKind: 'bar',
    value: 65,
  }
}

export function createQrCodeElement(slide: FreeformSlide, payload = 'https://dingcard.app'): FreeformQrCodeElement {
  return {
    id: randomId(),
    name: '二维码',
    locked: false,
    hidden: false,
    type: 'qrcode',
    ...centerBox(slide, 240, 240),
    rotation: 0,
    scale: 1,
    payload,
    dark: QR_DARK_DEFAULT,
    light: QR_LIGHT_DEFAULT,
  }
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: UnknownRecord, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key))
}

function hasExactKeys(value: UnknownRecord, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function validScenePath(value: unknown): value is ScenePath {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((part) => typeof part === 'string' && part.length > 0)
  )
}

function validContainerPath(value: unknown): value is ScenePath {
  return (
    Array.isArray(value) &&
    value.every((part) => typeof part === 'string' && part.length > 0)
  )
}

function paintEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!isRecord(left) || !isRecord(right)) return false
  // Multi-stop gradients carry an array; compare the stops by value.
  if (Array.isArray(left.stops) || Array.isArray(right.stops)) {
    return (
      left.type === right.type &&
      left.angle === right.angle &&
      gradientStopsEquals(left.stops as never, right.stops as never)
    )
  }
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  )
}

function cloneColorPaint(paint: ColorPaint): ColorPaint {
  if (paint.type === 'solid') return { type: 'solid', color: paint.color }
  if (paint.type === 'radial-gradient') {
    return { type: 'radial-gradient', stops: paint.stops.map((stop) => ({ ...stop })) }
  }
  if ('stops' in paint) {
    return {
      type: 'linear-gradient',
      stops: paint.stops.map((stop) => ({ ...stop })),
      angle: paint.angle,
    }
  }
  return { type: 'linear-gradient', from: paint.from, to: paint.to, angle: paint.angle }
}

/** Deep vertex-list equality for line style patches (arrays never compare by reference). */
function linePointsEqual(
  left: LinePoint[] | undefined,
  right: LinePoint[] | undefined,
): boolean {
  if (left === right) return true
  if (!left || !right || left.length !== right.length) return false
  return left.every((point, index) => point.x === right[index].x && point.y === right[index].y)
}

function cloneShapeFill(fill: ShapeFill): ShapeFill {
  if (fill.type === 'transparent') return { type: 'transparent' }
  return fill.type === 'image'
    ? {
        type: 'image',
        src: fill.src,
        fit: fill.fit,
        framing: cloneImageFraming(fill.framing),
      }
    : cloneColorPaint(fill)
}

function clonePathFill(fill: PathFill): PathFill {
  if (fill.type === 'transparent') return { type: 'transparent' }
  if (fill.type === 'image') {
    return {
      type: 'image',
      src: fill.src,
      fit: fill.fit,
      framing: cloneImageFraming(fill.framing),
    }
  }
  return cloneColorPaint(fill)
}

function shapeFillEquals(left: ShapeFill, right: ShapeFill): boolean {
  if (left === right) return true
  if (left.type !== right.type) return false
  if (left.type === 'image' && right.type === 'image') {
    return left.src === right.src
      && left.fit === right.fit
      && imageFramingEquals(left.framing, right.framing)
  }
  return paintEquals(left, right)
}

function cloneSlideBackground(background: SlideBackground): SlideBackground {
  if (background.type === 'transparent') return { type: 'transparent' }
  if (background.type === 'image') {
    return {
      type: 'image',
      src: background.src,
      fit: background.fit,
      framing: cloneImageFraming(background.framing),
    }
  }
  if (background.type === 'pattern') {
    return {
      type: 'pattern',
      color: background.color,
      patternColor: background.patternColor,
      pattern: background.pattern,
      size: background.size,
    }
  }
  return cloneColorPaint(background)
}

const IMAGE_BACKGROUND_KEYS = new Set(['type', 'src', 'fit', 'framing'])

function validSlideBackground(value: unknown): value is SlideBackground {
  if (isRecord(value) && value.type === 'transparent') {
    return hasExactKeys(value, new Set(['type']))
  }
  // A patterned page (v32): a flat base with one repeating motif over it.
  if (isRecord(value) && value.type === 'pattern') {
    return hasExactKeys(value, new Set(['type', 'color', 'patternColor', 'pattern', 'size']))
      && isHexColor(value.color)
      && isHexColor(value.patternColor)
      && isValidPagePattern(value.pattern)
      && isValidPagePatternSize(value.size)
  }
  // A picture filling the page (v16), framed like an image node.
  if (isRecord(value) && value.type === 'image') {
    return hasExactKeys(value, IMAGE_BACKGROUND_KEYS)
      && typeof value.src === 'string'
      && (value.fit === 'cover' || value.fit === 'contain')
      && isValidImageFraming(value.framing)
  }
  return isValidSceneColorPaint(value)
}

function slideBackgroundEquals(left: SlideBackground, right: SlideBackground): boolean {
  if (left.type === 'image' || right.type === 'image') {
    return left.type === 'image' && right.type === 'image'
      && left.src === right.src
      && left.fit === right.fit
      && imageFramingEquals(left.framing, right.framing)
  }
  if (left.type === 'pattern' || right.type === 'pattern') {
    return left.type === 'pattern' && right.type === 'pattern'
      && left.color === right.color
      && left.patternColor === right.patternColor
      && left.pattern === right.pattern
      && left.size === right.size
  }
  return paintEquals(left, right)
}

function withSlide(
  document: FreeformDocument,
  slideId: string,
  update: (slide: FreeformSlide) => FreeformSlide,
): FreeformDocument {
  const index = document.slides.findIndex((slide) => slide.id === slideId)
  if (index < 0) return document
  const slide = document.slides[index]
  const nextSlide = update(slide)
  if (nextSlide === slide) return document
  const slides = [...document.slides]
  slides[index] = nextSlide
  return { ...document, slides }
}

function withSlideNodes(
  document: FreeformDocument,
  slideId: string,
  update: (nodes: FreeformSceneNode[]) => FreeformSceneNode[],
): FreeformDocument {
  return withSlide(document, slideId, (slide) => {
    const nodes = update(slide.nodes)
    return nodes === slide.nodes ? slide : { ...slide, nodes }
  })
}

function sceneNodeIdSet(nodes: readonly FreeformSceneNode[]): Set<string> {
  const ids = new Set<string>()
  walkScene(nodes, (node) => ids.add(node.id))
  return ids
}

interface NodePatchResult {
  ok: boolean
  node: FreeformSceneNode
  /** Why the patch refused, in the agent's words; absent when it applies. */
  reason?: string
}

const CONTENT_KEYS = new Set(['text', 'src', 'alt', 'd', 'viewBox', 'payload', 'labels', 'series', 'rows', 'cols', 'cells', 'colWidths', 'items', 'value', 'label'])
const STYLE_KEYS = new Set([
  'effect',
  'fontSize',
  'fontFamily',
  'textFill',
  'align',
  'fontWeight',
  'verticalAlign',
  'paragraphSpacing',
  'list',
  'spans',
  'lineHeight',
  'letterSpacing',
  'italic',
  'vertical',
  'cornerRadius',
  'starInnerRatio',
  'bubbleTailX',
  'strokeDash',
  'cornerRadii',
  'dark',
  'light',
  'ecl',
  'moduleStyle',
  'logoSrc',
  'quietZone',
  'chartKind',
  'progressKind',
  'accent',
  'showValues',
  'showLegend',
  'showTicks',
  'headerRow',
  'striped',
  'ink',
  'headerFill',
  'stripeFill',
  'horizontal',
  'barMode',
  'trackFill',
  'opacity',
  'shadow',
  'filter',
  'blendMode',
  'dash',
  'cap',
  'join',
  'fillRule',
  'startCap',
  'endCap',
  'fit',
  'framing',
  'shape',
  'fill',
  'stroke',
  'strokeWidth',
  'lineKind',
  'points',
])
const GEOMETRY_KEYS = new Set(['x', 'y', 'width', 'height', 'rotation', 'scale', 'flipX', 'flipY'])
const IMAGE_CROP_ACTION_KEYS = new Set(['type', 'slideId', 'path', 'patch'])
const IMAGE_CROP_PATCH_KEYS = new Set(['x', 'y', 'width', 'height', 'framing'])

const TEXT_APPEARANCE_KEYS = new Set([
  'lineHeight', 'letterSpacing', 'italic', 'vertical', 'opacity', 'shadow', 'filter', 'blendMode',
  'stroke', 'strokeWidth', 'effect',
])
const SHAPE_APPEARANCE_KEYS = new Set(['cornerRadius', 'starInnerRatio', 'bubbleTailX', 'strokeDash', 'cornerRadii', 'opacity', 'shadow', 'filter', 'blendMode'])
const IMAGE_APPEARANCE_KEYS = new Set(['cornerRadius', 'stroke', 'strokeWidth', 'opacity', 'shadow', 'filter', 'blendMode'])
const QRCODE_APPEARANCE_KEYS = new Set(['ecl', 'moduleStyle', 'logoSrc', 'quietZone', 'opacity', 'shadow', 'filter', 'blendMode'])
const CHART_APPEARANCE_KEYS = new Set(['showValues', 'showLegend', 'showTicks', 'barMode', 'ink', 'opacity', 'shadow', 'filter', 'blendMode'])
const TABLE_APPEARANCE_KEYS = new Set(['headerRow', 'striped', 'ink', 'headerFill', 'stripeFill', 'opacity', 'shadow', 'filter', 'blendMode'])
const TIMELINE_APPEARANCE_KEYS = new Set(['accent', 'horizontal', 'ink', 'opacity', 'shadow', 'filter', 'blendMode'])
const PROGRESS_APPEARANCE_KEYS = new Set(['progressKind', 'accent', 'trackFill', 'ink', 'opacity', 'shadow', 'filter', 'blendMode'])
const LINE_APPEARANCE_KEYS = new Set([
  'opacity', 'shadow', 'filter', 'blendMode', 'dash', 'cap', 'startCap', 'endCap',
])
// A path's dash is checked on its own: viewBox units allow dashes under 1.
const PATH_APPEARANCE_KEYS = new Set([
  'opacity', 'shadow', 'filter', 'blendMode', 'cap', 'join', 'fillRule',
])

/** Four corner radii, each within the uniform radius's own range (v42). */
function validCornerRadii(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const radii = value as Record<string, unknown>
  const keys = Object.keys(radii)
  if (keys.length !== 4 || !['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].every((key) => keys.includes(key))) return false
  return isValidCornerRadius(radii.topLeft) && isValidCornerRadius(radii.topRight)
    && isValidCornerRadius(radii.bottomRight) && isValidCornerRadius(radii.bottomLeft)
}

/** The first appearance key whose value rejects, with the rule it broke; null when all pass. */
function appearanceProblemKey(patch: UnknownRecord, fields: ReadonlySet<string>): string | null {
  const problem = (key: string, rule: string) => `样式键 ${key} 的值不合法：${rule}`
  for (const key of fields) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (key === 'opacity') {
      if (!isValidOpacity(value)) return problem('opacity', '必须是 0–1 的数')
    } else if (key === 'shadow') {
      if (value !== null && !cloneShadowPaint(value)) return problem('shadow', '必须是 { color, blur, offsetX, offsetY }（或传 null 清除）')
    } else if (key === 'lineHeight') {
      if (value !== null && !isValidLineHeight(value)) return problem('lineHeight', '必须是 0.5–4 的行高倍数（或传 null 恢复默认）')
    } else if (key === 'letterSpacing') {
      if (value !== null && !isValidLetterSpacing(value)) return problem('letterSpacing', '必须是 -50–200 的像素字距（或传 null 恢复默认）')
    } else if (key === 'italic') {
      if (typeof value !== 'boolean') return problem('italic', '必须是 true 或 false')
    } else if (key === 'vertical') {
      if (typeof value !== 'boolean') return problem('vertical', '必须是 true 或 false')
    } else if (key === 'cornerRadius') {
      if (value !== null && !isValidCornerRadius(value)) return problem('cornerRadius', '必须是 0–2000 的像素圆角（或传 null 恢复直角）')
    } else if (key === 'strokeDash') {
      if (value !== null && !isValidDash(value)) return problem('strokeDash', '必须是 1–500 的虚线长度（或传 null 恢复实线）')
    } else if (key === 'cornerRadii') {
      if (value !== null && !validCornerRadii(value)) return problem('cornerRadii', '必须是 { topLeft, topRight, bottomRight, bottomLeft }（各 0–2000，或传 null 恢复统一圆角）')
    } else if (key === 'starInnerRatio') {
      if (value !== null && !isValidStarInnerRatio(value)) return problem('starInnerRatio', '必须是 0.15–0.85 的五角星内径比（或传 null 恢复 0.38）')
    } else if (key === 'bubbleTailX') {
      if (value !== null && !isValidBubbleTailX(value)) return problem('bubbleTailX', '必须是 0.05–0.95 的尾巴位置（或传 null 恢复 0.5）')
    } else if (key === 'dark' || key === 'light') {
      if (value !== null && !isHexColor(value)) return problem(key, '必须是 #RRGGBB（或传 null 恢复默认）')
    } else if (key === 'ecl') {
      if (value !== null && !isValidQrEcl(value)) return problem('ecl', `必须是 ${['L', 'M', 'Q', 'H'].join(' / ')} 之一（或传 null 恢复 M）`)
    } else if (key === 'moduleStyle') {
      if (value !== null && !isValidQrModuleStyle(value)) return problem('moduleStyle', `必须是 ${['square', 'rounded', 'dot'].join(' / ')} 之一（或传 null 恢复方块）`)
    } else if (key === 'logoSrc') {
      if (value !== null && !isValidQrLogoSrc(value)) return problem('logoSrc', '必须是图片地址或 img: 引用（或传 null 移除）')
    } else if (key === 'quietZone') {
      if (value !== null && !isValidQrQuietZone(value)) return problem('quietZone', '必须是 0–4 的码边距模块数（或传 null 恢复 2）')
    } else if (key === 'chartKind') {
      if (!isValidChartKind(value)) return problem('chartKind', `必须是 ${['bar', 'ring', 'line', 'radar'].join(' / ')} 之一`)
    } else if (key === 'progressKind') {
      if (!isProgressKind(value)) return problem('progressKind', `必须是 ${['bar', 'ring'].join(' / ')} 之一`)
    } else if (key === 'accent') {
      if (value !== null && !isHexColor(value)) return problem('accent', '必须是 #RRGGBB（或传 null 恢复默认色）')
    } else if (key === 'showValues') {
      if (value !== null && value !== true) return problem('showValues', '必须是 true（或传 null 关闭）')
    } else if (key === 'showLegend') {
      if (value !== null && typeof value !== 'boolean') return problem('showLegend', '必须是 true / false（或传 null 恢复自动）')
    } else if (key === 'showTicks') {
      if (value !== null && typeof value !== 'boolean') return problem('showTicks', '必须是 true / false（或传 null 恢复显示）')
    } else if (key === 'headerRow' || key === 'striped') {
      if (value !== null && typeof value !== 'boolean') return problem(key, '必须是 true / false（或传 null 恢复默认）')
    } else if (key === 'horizontal') {
      if (value !== null && typeof value !== 'boolean') return problem('horizontal', '必须是 true / false（或传 null / false 恢复竖排）')
    } else if (key === 'ink' || key === 'headerFill' || key === 'stripeFill' || key === 'trackFill') {
      if (value !== null && !isHexColor(value)) return problem(key, '必须是 #RRGGBB（或传 null 恢复默认）')
    } else if (key === 'barMode') {
      if (value !== null && !isValidChartBarMode(value)) return problem('barMode', `必须是 ${['grouped', 'stacked', 'percent'].join(' / ')} 之一（或传 null 恢复并排）`)
    } else if (key === 'filter') {
      if (value !== null && !cloneSceneFilter(value, true)) return problem('filter', '必须是 { brightness?, contrast?, saturation?, blur?, hue?, grayscale?, sepia? } 至少一键（或传 null 清除）')
    } else if (key === 'blendMode') {
      if (value !== null && !isValidBlendMode(value)) return problem('blendMode', '必须是已知的混合模式之一（或传 null 恢复正常）')
    } else if (key === 'dash') {
      if (value !== null && !isValidDash(value)) return problem('dash', '必须是大于 0 的虚线长度（或传 null 恢复实线）')
    } else if (key === 'cap') {
      if (!isValidLineCap(value)) return problem('cap', `必须是 ${['round', 'butt', 'square'].join(' / ')} 之一`)
    } else if (key === 'join') {
      if (!isValidLineJoin(value)) return problem('join', `必须是 ${['round', 'miter', 'bevel'].join(' / ')} 之一`)
    } else if (key === 'fillRule') {
      if (!isValidFillRule(value)) return problem('fillRule', `必须是 ${['nonzero', 'evenodd'].join(' / ')} 之一`)
    } else if (key === 'startCap' || key === 'endCap') {
      if (value !== null && !isValidLineEndpointCap(value)) return problem(key, `必须是 ${['none', 'arrow', 'dot'].join(' / ')} 之一（或传 null 恢复跟随 lineKind）`)
    } else if (key === 'stroke') {
      if (value !== null && !isHexColor(value)) return problem('stroke', '必须是 #RRGGBB（或传 null 清除）')
    } else if (key === 'strokeWidth') {
      if (value !== null && !isValidTextStrokeWidth(value)) return problem('strokeWidth', '必须是 0.5–100 的像素宽度（或传 null 清除）')
    } else if (key === 'effect') {
      if (value !== null && !isValidTextEffect(value)) return problem('effect', '必须是合法的文字效果对象（或传 null 去掉）')
    }
  }
  return null
}

/**
 * Apply validated v6 appearance patch keys onto a styled node. `null` (and
 * `italic: false`) removes the stored key, restoring the respective default.
 */
function withAppearancePatch<T extends object>(
  base: T,
  patch: UnknownRecord,
  fields: ReadonlySet<string>,
): T {
  let next: UnknownRecord = { ...(base as unknown as UnknownRecord) }
  for (const key of fields) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === null || ((key === 'italic' || key === 'vertical' || key === 'horizontal') && value === false)) {
      const { [key]: _removed, ...rest } = next
      next = rest
      continue
    }
    next = {
      ...next,
      [key]: key === 'shadow'
        ? cloneShadowPaint(value)
        : key === 'filter'
          ? cloneSceneFilter(value, true)
          : key === 'effect'
            ? { ...(value as TextEffect) }
            : key === 'cornerRadii'
              ? { ...(value as CornerRadii) }
              : value,
    }
  }
  return next as T
}

/** No-op check for the appearance keys present on a style patch. */
function appearanceKeysSame(
  node: FreeformSceneLeaf,
  next: FreeformSceneLeaf,
  patch: UnknownRecord,
  fields: ReadonlySet<string>,
): boolean {
  const nodeRecord = node as unknown as UnknownRecord
  const nextRecord = next as unknown as UnknownRecord
  for (const key of fields) {
    if (!(key in patch)) continue
    if (key === 'shadow') {
      if (
        !shadowPaintEquals(
          nodeRecord.shadow as ShadowPaint | undefined,
          nextRecord.shadow as ShadowPaint | undefined,
        )
      ) {
        return false
      }
    } else if (key === 'filter') {
      if (
        !sceneFilterEquals(
          nodeRecord.filter as SceneFilter | undefined,
          nextRecord.filter as SceneFilter | undefined,
        )
      ) {
        return false
      }
    } else if (key === 'effect') {
      if (!textEffectsEqual(nodeRecord.effect as TextEffect | undefined, nextRecord.effect as TextEffect | undefined)) return false
    } else if (nodeRecord[key] !== nextRecord[key]) {
      return false
    }
  }
  return true
}

function applyContentPatch(
  node: FreeformSceneNode,
  patch: FreeformNodeContentPatch,
): NodePatchResult {
  if (!isRecord(patch) || !hasOnlyKeys(patch, CONTENT_KEYS)) {
    return { ok: false, node, reason: `内容键必须是这些之一：${[...CONTENT_KEYS].join(' / ')}` }
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, node, reason: '内容键至少要写一个' }
  }
  const record = patch as unknown as UnknownRecord
  if (node.type === 'text') {
    if (Object.keys(record).some((key) => key !== 'text')) {
      return { ok: false, node, reason: `text 的内容只接受 text，收到不允许的键：${Object.keys(record).filter((key) => key !== 'text').join('、')}` }
    }
    if (typeof record.text !== 'string') {
      return { ok: false, node, reason: 'text 的内容必须是字符串' }
    }
    const text = record.text
    if (text === node.text) return { ok: true, node }
    const remapped = remapRichTextSpans(node.spans, node.text, text)
    const { spans: _previousSpans, ...rest } = node
    return {
      ok: true,
      node: remapped ? { ...rest, text, spans: remapped } : { ...rest, text },
    }
  }
  if (node.type === 'image') {
    const unexpected = Object.keys(record).filter((key) => key !== 'src' && key !== 'alt')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `image 的内容只接受 src / alt，收到不允许的键：${unexpected.join('、')}` }
    }
    if (('src' in record && typeof record.src !== 'string') || ('alt' in record && typeof record.alt !== 'string')) {
      return { ok: false, node, reason: 'image 的 src 和 alt 都必须是字符串' }
    }
    const src = 'src' in record ? (record.src as string) : node.src
    const alt = 'alt' in record ? (record.alt as string) : node.alt
    const sourceChanged = src !== node.src
    return {
      ok: true,
      node: !sourceChanged && alt === node.alt
        ? node
        : {
            ...node,
            src,
            alt,
            framing: sourceChanged ? createDefaultImageFraming() : node.framing,
          },
    }
  }
  if (node.type === 'chart') {
    const patchKeys = Object.keys(record)
    const unexpected = patchKeys.filter((key) => key !== 'labels' && key !== 'series')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `chart 的内容只接受 labels / series，收到不允许的键：${unexpected.join('、')}` }
    }
    const labels = 'labels' in record ? record.labels as unknown : node.labels
    if (!Array.isArray(labels) || labels.length === 0 || labels.length > CHART_POINTS_MAX
      || !labels.every(isValidChartLabel)) {
      return { ok: false, node, reason: `labels 必须是 1–${CHART_POINTS_MAX} 个 1–24 字符的字符串` }
    }
    const series = 'series' in record ? record.series as unknown : node.series
    if (!isValidChartSeriesList(series, labels.length)) {
      return { ok: false, node, reason: `series 必须是 1–3 个 { name?, values: [≥0 数值 × ${labels.length}], color: #RRGGBB }，values 长度要和 labels 一致` }
    }
    const same = ('labels' in record || 'series' in record)
      && (node.labels.length === labels.length
        && node.labels.every((label, index) => label === labels[index])
        && node.series.length === (series as FreeformChartSeries[]).length
        && node.series.every((entry, index) => {
          const next = (series as FreeformChartSeries[])[index]
          return entry.color === next.color
            && entry.name === next.name
            && entry.values.every((value, valueIndex) => value === next.values[valueIndex])
        }))
    return {
      ok: true,
      node: same ? node : {
        ...node,
        labels: (labels as string[]).map((label) => label),
        series: (series as FreeformChartSeries[]).map((entry) => ({
          values: [...entry.values],
          color: entry.color,
          ...('name' in entry ? { name: entry.name } : {}),
        })),
      },
    }
  }
  if (node.type === 'table') {
    const patchKeys = Object.keys(record)
    const unexpected = patchKeys.filter((key) => key !== 'rows' && key !== 'cols' && key !== 'cells' && key !== 'colWidths')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `table 的内容只接受 rows / cols / cells / colWidths，收到不允许的键：${unexpected.join('、')}` }
    }
    const rows = 'rows' in record ? record.rows : node.rows
    const cols = 'cols' in record ? record.cols : node.cols
    if (!isValidTableRows(rows) || !isValidTableCols(cols)) {
      return { ok: false, node, reason: 'rows 必须是 2–12、cols 必须是 1–6 的整数' }
    }
    // A bare rows/cols change resizes the grid: every cell that still has a
    // place keeps its text, the new places start empty.
    let cells: unknown = 'cells' in record ? record.cells : undefined
    if (cells === undefined) {
      const resized: string[] = []
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          resized.push(row < node.rows && col < node.cols ? node.cells[row * node.cols + col] : '')
        }
      }
      cells = resized
    }
    if (!isValidTableCells(cells as readonly string[], rows, cols)) {
      return { ok: false, node, reason: `cells 必须正好是 rows × cols（${rows} × ${cols}）个 1–24 字符的字符串（按行展开）` }
    }
    const nextCells = cells as string[]
    // Column weights follow the grid: a given set must match the new column
    // count, a resize without one remaps the kept columns and gives a new
    // column an even share.
    let colWidths: number[] | undefined
    if ('colWidths' in record) {
      if (!isValidTableColWidths(record.colWidths, cols)) {
        return { ok: false, node, reason: `colWidths 必须正好是 ${cols} 个大于 0 的数（与新列数一致）` }
      }
      colWidths = [...(record.colWidths as number[])]
    } else if (node.colWidths !== undefined && node.cols !== cols) {
      const remapped: number[] = []
      for (let col = 0; col < cols; col += 1) remapped.push(col < node.cols ? node.colWidths[col] : 1)
      colWidths = remapped
    } else if (node.colWidths !== undefined) {
      colWidths = [...node.colWidths]
    }
    const colWidthsSame = (node.colWidths === undefined && colWidths === undefined)
      || (node.colWidths !== undefined && colWidths !== undefined
        && node.colWidths.length === colWidths.length
        && node.colWidths.every((weight, index) => weight === colWidths[index]))
    const same = patchKeys.length > 0
      && node.rows === rows
      && node.cols === cols
      && node.cells.length === nextCells.length
      && node.cells.every((cell, index) => cell === nextCells[index])
      && colWidthsSame
    return {
      ok: true,
      node: same ? node : {
        ...node,
        rows,
        cols,
        cells: [...nextCells],
        ...(colWidths !== undefined ? { colWidths } : {}),
      },
    }
  }
  if (node.type === 'timeline') {
    const unexpected = Object.keys(record).filter((key) => key !== 'items')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `timeline 的内容只接受 items（整体替换），收到不允许的键：${unexpected.join('、')}` }
    }
    if ('items' in record) {
      if (!isValidTimelineItems(record.items)) {
        return { ok: false, node, reason: 'items 必须是 2–8 个 { label?(1–12 字), text(1–48 字) }，整体替换' }
      }
      const items = (record.items as FreeformTimelineItem[]).map((item) => ({
        text: item.text,
        ...('label' in item ? { label: item.label } : {}),
      }))
      const same = timelineItemsSame(node.items, items)
      return {
        ok: true,
        node: same ? node : { ...node, items },
      }
    }
    return { ok: true, node }
  }
  if (node.type === 'progress') {
    const unexpected = Object.keys(record).filter((key) => key !== 'value' && key !== 'label')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `progress 的内容只接受 value / label，收到不允许的键：${unexpected.join('、')}` }
    }
    if ('value' in record && !isValidProgressValue(record.value)) {
      return { ok: false, node, reason: 'value 必须是 0–100 的数，最多一位小数（如 65、42.5）' }
    }
    // An empty label clears the goal's name; anything else is its 1–12
    // character name.
    if (
      'label' in record
      && (typeof record.label !== 'string' || (record.label !== '' && !isValidProgressLabel(record.label)))
    ) {
      return { ok: false, node, reason: 'label 必须是 1–12 个字的字符串，传 "" 清除' }
    }
    const same =
      (!('value' in record) || record.value === node.value)
      && (!('label' in record) || (record.label === '' ? undefined : record.label) === node.label)
    if (same) return { ok: true, node }
    const next = {
      ...node,
      ...('value' in record ? { value: record.value as number } : {}),
      ...('label' in record && record.label !== '' ? { label: record.label as string } : {}),
    }
    if ('label' in record && record.label === '') delete next.label
    return { ok: true, node: next }
  }
  if (node.type === 'qrcode') {
    const unexpected = Object.keys(record).filter((key) => key !== 'payload')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `qrcode 的内容只接受 payload，收到不允许的键：${unexpected.join('、')}` }
    }
    if (!isValidQrPayload(record.payload)) {
      return { ok: false, node, reason: 'payload 必须是 1–512 个字符的文字或 URL' }
    }
    const payload = record.payload as string
    return { ok: true, node: payload === node.payload ? node : { ...node, payload } }
  }
  if (node.type === 'path') {
    const unexpected = Object.keys(record).filter((key) => key !== 'd' && key !== 'viewBox')
    if (unexpected.length > 0) {
      return { ok: false, node, reason: `path 的内容只接受 d / viewBox，收到不允许的键：${unexpected.join('、')}` }
    }
    if ('d' in record && !isValidPathData(record.d)) {
      return { ok: false, node, reason: 'd 必须是合法的 SVG 路径（以 M 开头，最长 20000 字符）' }
    }
    let viewBox = node.viewBox
    if ('viewBox' in record) {
      const cloned = clonePathViewBox(record.viewBox)
      if (!cloned) {
        return { ok: false, node, reason: 'viewBox 必须是 { x, y, width(>0), height(>0) }' }
      }
      viewBox = cloned
    }
    const d = 'd' in record ? (record.d as string) : node.d
    return {
      ok: true,
      node: d === node.d && pathViewBoxEquals(viewBox, node.viewBox)
        ? node
        : { ...node, d, viewBox },
    }
  }
  return {
    ok: false,
    node,
    reason: `${node.type} 节点没有可改的内容字段（内容只属于 text / image / chart / table / timeline / progress / qrcode / path）`,
  }
}

function richTextSpansEqual(
  a: RichTextSpan[] | undefined,
  b: RichTextSpan[] | undefined,
): boolean {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((span, index) => {
    const other = b[index]
    return span.start === other.start
      && span.end === other.end
      && span.bold === other.bold
      && span.color === other.color
      && span.highlight === other.highlight
      && span.underline === other.underline
      && span.strike === other.strike
      && span.fontSize === other.fontSize
  })
}

const TEXT_ALIGNS: ReadonlySet<string> = new Set(['left', 'center', 'right', 'justify'])

/**
 * The v20 layout keys of a text style patch, applied: `'top'` / `null`
 * puts the lines back at the top, `null` / `0` clears paragraph spacing,
 * `null` makes a list plain paragraphs again. Null when a value is invalid.
 */
function withTextLayoutPatch(node: FreeformTextElement, patch: FreeformNodeStylePatch): FreeformTextElement | null {
  let next: FreeformTextElement = node
  if ('verticalAlign' in patch) {
    const value = patch.verticalAlign
    if (value !== null && value !== 'top' && !isTextVerticalAlign(value)) return null
    const { verticalAlign: _drop, ...without } = next
    next = value === null || value === 'top' ? without : { ...without, verticalAlign: value }
  }
  if ('paragraphSpacing' in patch) {
    const value = patch.paragraphSpacing
    if (value !== null && value !== 0 && !isValidParagraphSpacing(value)) return null
    const { paragraphSpacing: _drop, ...without } = next
    next = value === null || value === 0 ? without : { ...without, paragraphSpacing: value as number }
  }
  if ('list' in patch) {
    const value = patch.list
    if (value !== null && !isTextList(value)) return null
    const { list: _drop, ...without } = next
    next = value === null ? without : { ...without, list: value }
  }
  return next
}

/** Why a style patch's keys don't fit the node type; lists what it takes. */
function styleKeyReason(type: string, allowed: Iterable<string>, keys: readonly string[]): string {
  const allowedSet = allowed instanceof Set ? allowed : new Set(allowed)
  const unexpected = keys.filter((key) => !allowedSet.has(key))
  return `${type} 的样式只接受 ${[...allowedSet].join(' / ')}，收到不允许的键：${unexpected.join('、')}`
}

function applyStylePatch(
  node: FreeformSceneNode,
  patch: FreeformNodeStylePatch,
): NodePatchResult {
  if (!isRecord(patch) || !hasOnlyKeys(patch, STYLE_KEYS)) {
    return { ok: false, node, reason: `样式键必须是这些之一：${[...STYLE_KEYS].join(' / ')}` }
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, node, reason: '样式键至少要写一个' }
  }
  const keys = Object.keys(patch)
  if (node.type === 'text') {
    const allowed = new Set([
      'fontSize',
      'fontFamily',
      'textFill',
      'align',
      'fontWeight',
      'spans',
      'lineHeight',
      'letterSpacing',
      'italic',
      'vertical',
      'opacity',
      'shadow',
      'filter',
      'blendMode',
      'stroke',
      'strokeWidth',
      'effect',
      'verticalAlign',
      'paragraphSpacing',
      'list',
    ])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('text', allowed, keys) }
    }
    if ('textFill' in patch && !isValidSceneColorPaint(patch.textFill)) {
      return { ok: false, node, reason: 'textFill 必须是 ColorPaint（纯色 #RRGGBB 或渐变）' }
    }
    if ('align' in patch && !TEXT_ALIGNS.has(patch.align as string)) {
      return { ok: false, node, reason: `align 必须是 ${[...TEXT_ALIGNS].join(' / ')} 之一` }
    }
    let spansPatch: RichTextSpan[] | undefined
    if ('spans' in patch) {
      const normalized = normalizeRichTextSpans(patch.spans, node.text.length)
      if (!normalized) {
        return { ok: false, node, reason: `spans 必须是 text 内的字符区间 [{ start, end, … }]：0 ≤ start < end ≤ ${node.text.length}，按 start 排序不重叠，至少含一种样式（传 [] 清空）` }
      }
      spansPatch = normalized
    }
    const appearanceProblem = appearanceProblemKey(patch, TEXT_APPEARANCE_KEYS)
    if (appearanceProblem) return { ok: false, node, reason: appearanceProblem }
    const laidOut = withTextLayoutPatch(node, patch)
    if (!laidOut) {
      return { ok: false, node, reason: '文字样式放不下这个文本框：检查 fontSize / lineHeight / letterSpacing / paragraphSpacing 的范围' }
    }
    // A new size for the whole text takes the words sized on their own along, in proportion.
    const scaledSpans = 'fontSize' in patch && !('spans' in patch) && typeof patch.fontSize === 'number' && node.fontSize > 0
      ? scaleSpanFontSizes(node.spans, patch.fontSize / node.fontSize)
      : node.spans
    const base = {
      ...laidOut,
      ...(scaledSpans !== node.spans && scaledSpans ? { spans: scaledSpans } : {}),
      ...('fontSize' in patch ? { fontSize: patch.fontSize as number } : {}),
      ...('fontFamily' in patch ? { fontFamily: patch.fontFamily as string } : {}),
      ...('textFill' in patch
        ? { textFill: cloneColorPaint(patch.textFill as ColorPaint) }
        : {}),
      ...('align' in patch ? { align: patch.align as typeof node.align } : {}),
      ...('fontWeight' in patch ? { fontWeight: patch.fontWeight as typeof node.fontWeight } : {}),
    }
    const { spans: _baseSpans, ...baseWithoutSpans } = base
    const spansApplied: FreeformTextElement = spansPatch === undefined
      ? base
      : spansPatch.length === 0
        ? baseWithoutSpans
        : { ...base, spans: spansPatch }
    const next = withAppearancePatch(spansApplied, patch, TEXT_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      TEXT_APPEARANCE_KEYS.has(key)
        ? true
        : key === 'textFill'
          ? paintEquals(node.textFill, next.textFill)
          : key === 'spans'
            ? richTextSpansEqual(node.spans, next.spans)
            : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, TEXT_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'image') {
    const allowed = new Set(['fit', 'framing', ...IMAGE_APPEARANCE_KEYS])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('image', allowed, keys) }
    }
    if ('fit' in patch && patch.fit !== 'cover' && patch.fit !== 'contain') {
      return { ok: false, node, reason: 'fit 必须是 cover / contain' }
    }
    if ('framing' in patch && !isValidImageFraming(patch.framing)) {
      return { ok: false, node, reason: 'framing 必须是 { focusX(0–1), focusY(0–1), zoom(1–4) }' }
    }
    const appearanceProblem = appearanceProblemKey(patch, IMAGE_APPEARANCE_KEYS)
    if (appearanceProblem) return { ok: false, node, reason: appearanceProblem }
    const fit = 'fit' in patch ? patch.fit as typeof node.fit : node.fit
    const framing = 'framing' in patch
      ? patch.framing as ImageFraming
      : node.framing
    const next = withAppearancePatch({
      ...node,
      fit,
      framing: 'framing' in patch ? cloneImageFraming(framing) : node.framing,
    }, patch, IMAGE_APPEARANCE_KEYS)
    if (
      fit === node.fit
      && imageFramingEquals(framing, node.framing)
      && appearanceKeysSame(node, next, patch, IMAGE_APPEARANCE_KEYS)
    ) {
      return { ok: true, node }
    }
    return { ok: true, node: next }
  }
  if (node.type === 'shape') {
    const allowed = new Set([
      'shape',
      'fill',
      'stroke',
      'strokeWidth',
      'cornerRadius',
      'starInnerRatio',
      'bubbleTailX',
      'strokeDash',
      'cornerRadii',
      'opacity',
      'shadow',
      'filter',
      'blendMode',
    ])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('shape', allowed, keys) }
    }
    if ('shape' in patch && !isValidShape(patch.shape)) {
      return { ok: false, node, reason: 'shape 必须是 rect / ellipse / triangle / diamond / pentagon / star / hexagon / heart / bubble 之一' }
    }
    if ('fill' in patch && !isValidSceneShapeFill(patch.fill)) {
      return { ok: false, node, reason: 'fill 必须是 ColorPaint、{ type: \'transparent\' } 或 { type: \'image\', src, fit, framing }' }
    }
    // Shape strokes stay plain color strings; `null` clears only text outlines.
    if ('stroke' in patch && typeof patch.stroke !== 'string') {
      return { ok: false, node, reason: 'shape 的 stroke 必须是 #RRGGBB 颜色字符串' }
    }
    if (
      'strokeWidth' in patch
      && (typeof patch.strokeWidth !== 'number' || !Number.isFinite(patch.strokeWidth))
    ) {
      return { ok: false, node, reason: 'strokeWidth 必须是数字' }
    }
    const appearanceProblem = appearanceProblemKey(patch, SHAPE_APPEARANCE_KEYS)
    if (appearanceProblem) return { ok: false, node, reason: appearanceProblem }
    let fill = node.fill
    if ('fill' in patch) {
      const incoming = patch.fill as ShapeFill
      if (incoming.type !== 'image') {
        fill = cloneShapeFill(incoming)
      } else if (node.fill.type !== 'image') {
        fill = {
          type: 'image',
          src: incoming.src,
          fit: 'cover',
          framing: createDefaultImageFraming(),
        }
      } else if (incoming.src !== node.fill.src) {
        fill = {
          type: 'image',
          src: incoming.src,
          fit: node.fill.fit,
          framing: createDefaultImageFraming(),
        }
      } else {
        fill = cloneShapeFill(incoming)
      }
    }
    const base = {
      ...node,
      ...('shape' in patch ? { shape: patch.shape as typeof node.shape } : {}),
      ...('fill' in patch ? { fill } : {}),
      ...('stroke' in patch ? { stroke: patch.stroke as string } : {}),
      ...('strokeWidth' in patch ? { strokeWidth: patch.strokeWidth as number } : {}),
    }
    const next = withAppearancePatch(base, patch, SHAPE_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      SHAPE_APPEARANCE_KEYS.has(key)
        ? true
        : key === 'fill'
          ? shapeFillEquals(node.fill, next.fill)
          : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, SHAPE_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'line') {
    const allowed = new Set([
      'lineKind', 'stroke', 'strokeWidth', 'opacity', 'shadow', 'filter', 'blendMode', 'dash', 'cap',
      'startCap', 'endCap', 'points',
    ])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('line', allowed, keys) }
    }
    if ('lineKind' in patch && patch.lineKind !== 'line' && patch.lineKind !== 'arrow') {
      return { ok: false, node, reason: 'lineKind 必须是 line / arrow' }
    }
    // Line strokes stay plain color strings; `null` clears only text outlines.
    if ('stroke' in patch && typeof patch.stroke !== 'string') {
      return { ok: false, node, reason: 'line 的 stroke 必须是 #RRGGBB 颜色字符串' }
    }
    if (
      'strokeWidth' in patch
      && (typeof patch.strokeWidth !== 'number' || !Number.isFinite(patch.strokeWidth))
    ) {
      return { ok: false, node, reason: 'strokeWidth 必须是数字' }
    }
    // Vertex lists must stay inside the node box; a bad list rejects the patch.
    let points: LinePoint[] | undefined
    if ('points' in patch) {
      const cloned = cloneLinePoints(patch.points, node.width, node.height)
      if (!cloned) {
        return { ok: false, node, reason: `points 必须是 2–64 个 { x, y }，坐标都要落在节点盒内（0 ≤ x ≤ ${node.width}、0 ≤ y ≤ ${node.height}）` }
      }
      points = cloned
    }
    const appearanceProblem = appearanceProblemKey(patch, LINE_APPEARANCE_KEYS)
    if (appearanceProblem) return { ok: false, node, reason: appearanceProblem }
    const next = withAppearancePatch({
      ...node,
      ...('lineKind' in patch ? { lineKind: patch.lineKind as typeof node.lineKind } : {}),
      ...('stroke' in patch ? { stroke: patch.stroke as string } : {}),
      ...('strokeWidth' in patch ? { strokeWidth: patch.strokeWidth as number } : {}),
      ...(points ? { points } : {}),
    }, patch, LINE_APPEARANCE_KEYS)
    const same = keys.every(
      (key) =>
        LINE_APPEARANCE_KEYS.has(key)
          || (key === 'points'
            ? linePointsEqual(node.points, points)
            : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key]),
    ) && appearanceKeysSame(node, next, patch, LINE_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'chart') {
    const allowed = new Set([
      'chartKind', 'accent', 'showValues', 'barMode', 'showLegend', 'showTicks',
      ...CHART_APPEARANCE_KEYS,
    ])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('chart', allowed, keys) }
    }
    if ('chartKind' in patch && !isValidChartKind(patch.chartKind)) {
      return { ok: false, node, reason: 'chartKind 必须是 bar / ring / line / radar 之一' }
    }
    if ('accent' in patch && patch.accent !== null && !isHexColor(patch.accent)) {
      return { ok: false, node, reason: 'accent 必须是 #RRGGBB（或传 null 恢复 #1d4ed8）' }
    }
    const appearanceProblem = appearanceProblemKey(patch, CHART_APPEARANCE_KEYS)
    if (appearanceProblem) return { ok: false, node, reason: appearanceProblem }
    // accent recolours every series at once (a v24 habit kept replayable);
    // `null` restores the default blue on each of them.
    const accent = 'accent' in patch
      ? (patch.accent === null ? CHART_ACCENT_DEFAULT : patch.accent as string)
      : null
    const base = {
      ...node,
      ...(accent !== null ? { series: node.series.map((entry) => ({ ...entry, color: accent })) } : {}),
      ...('chartKind' in patch ? { chartKind: patch.chartKind as typeof node.chartKind } : {}),
    }
    const next = withAppearancePatch(base, patch, CHART_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      CHART_APPEARANCE_KEYS.has(key)
        ? true
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, CHART_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'table') {
    const allowed = new Set(['headerRow', 'striped', 'ink', 'headerFill', 'stripeFill', ...TABLE_APPEARANCE_KEYS])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('table', allowed, keys) }
    }
    const tableProblem = appearanceProblemKey(patch, TABLE_APPEARANCE_KEYS)
    if (tableProblem) return { ok: false, node, reason: tableProblem }
    const next = withAppearancePatch(node, patch, TABLE_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      TABLE_APPEARANCE_KEYS.has(key)
        ? true
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, TABLE_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'timeline') {
    const allowed = new Set(['accent', 'horizontal', 'ink', ...TIMELINE_APPEARANCE_KEYS])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('timeline', allowed, keys) }
    }
    if ('accent' in patch && patch.accent !== null && !isHexColor(patch.accent)) {
      return { ok: false, node, reason: 'accent 必须是 #RRGGBB（或传 null 恢复蓝）' }
    }
    const timelineProblem = appearanceProblemKey(patch, TIMELINE_APPEARANCE_KEYS)
    if (timelineProblem) return { ok: false, node, reason: timelineProblem }
    const next = withAppearancePatch(node, patch, TIMELINE_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      TIMELINE_APPEARANCE_KEYS.has(key)
        ? true
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, TIMELINE_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'progress') {
    const allowed = new Set(['progressKind', 'accent', 'trackFill', ...PROGRESS_APPEARANCE_KEYS])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('progress', allowed, keys) }
    }
    if ('accent' in patch && patch.accent !== null && !isHexColor(patch.accent)) {
      return { ok: false, node, reason: 'accent 必须是 #RRGGBB（或传 null 恢复蓝）' }
    }
    if ('trackFill' in patch && patch.trackFill !== null && !isHexColor(patch.trackFill)) {
      return { ok: false, node, reason: 'trackFill 必须是 #RRGGBB（或传 null 恢复按进度色铺 14% 浅底）' }
    }
    const progressProblem = appearanceProblemKey(patch, PROGRESS_APPEARANCE_KEYS)
    if (progressProblem) return { ok: false, node, reason: progressProblem }
    const next = withAppearancePatch(node, patch, PROGRESS_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      PROGRESS_APPEARANCE_KEYS.has(key)
        ? true
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, PROGRESS_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'qrcode') {
    const allowed = new Set([
      'dark', 'light', 'ecl', 'moduleStyle', 'logoSrc', 'quietZone',
      ...QRCODE_APPEARANCE_KEYS,
    ])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('qrcode', allowed, keys) }
    }
    if ('dark' in patch && patch.dark !== null && !isHexColor(patch.dark)) {
      return { ok: false, node, reason: 'dark 必须是 #RRGGBB（或传 null 恢复默认）' }
    }
    if ('light' in patch && patch.light !== null && !isHexColor(patch.light)) {
      return { ok: false, node, reason: 'light 必须是 #RRGGBB（或传 null 恢复默认）' }
    }
    const qrcodeProblem = appearanceProblemKey(patch, QRCODE_APPEARANCE_KEYS)
    if (qrcodeProblem) return { ok: false, node, reason: qrcodeProblem }
    // dark/light are required fields: `null` restores their defaults instead
    // of removing them.
    const dark = 'dark' in patch
      ? (patch.dark === null ? QR_DARK_DEFAULT : patch.dark as string)
      : node.dark
    const light = 'light' in patch
      ? (patch.light === null ? QR_LIGHT_DEFAULT : patch.light as string)
      : node.light
    // A logo is optional: `withAppearancePatch` removes it on `null`.
    const next = withAppearancePatch({ ...node, dark, light }, patch, QRCODE_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      QRCODE_APPEARANCE_KEYS.has(key)
        ? true
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, QRCODE_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'path') {
    const allowed = new Set(['fill', 'stroke', 'strokeWidth', 'dash', ...PATH_APPEARANCE_KEYS])
    if (!keys.every((key) => allowed.has(key))) {
      return { ok: false, node, reason: styleKeyReason('path', allowed, keys) }
    }
    // Path fills are colors, nothing, or (v19) pictures; strokes are hex colors.
    if ('fill' in patch && !isValidScenePathFill(patch.fill)) {
      return { ok: false, node, reason: 'fill 必须是 ColorPaint、{ type: \'transparent\' } 或 { type: \'image\', src, fit, framing }' }
    }
    if ('stroke' in patch && !isHexColor(patch.stroke)) {
      return { ok: false, node, reason: 'stroke 必须是 #RRGGBB' }
    }
    if ('strokeWidth' in patch && !isValidPathStrokeWidth(patch.strokeWidth)) {
      return { ok: false, node, reason: 'strokeWidth 必须是 0–10000 的 viewBox 单位（0 即不描边）' }
    }
    if ('dash' in patch && patch.dash !== null && !isValidPathDash(patch.dash)) {
      return { ok: false, node, reason: 'dash 必须是大于 0 的 viewBox 单位虚线长度（或传 null 恢复实线）' }
    }
    const pathProblem = appearanceProblemKey(patch, PATH_APPEARANCE_KEYS)
    if (pathProblem) return { ok: false, node, reason: pathProblem }
    const { dash: _previousDash, ...undashed } = node
    const base: FreeformPathElement = {
      ...('dash' in patch ? undashed : node),
      ...('fill' in patch ? { fill: clonePathFill(patch.fill as PathFill) } : {}),
      ...('stroke' in patch ? { stroke: patch.stroke as string } : {}),
      ...('strokeWidth' in patch ? { strokeWidth: patch.strokeWidth as number } : {}),
      // `null` restores a solid stroke.
      ...('dash' in patch && patch.dash !== null ? { dash: patch.dash as number } : {}),
    }
    const next = withAppearancePatch(base, patch, PATH_APPEARANCE_KEYS)
    const same = keys.every((key) =>
      PATH_APPEARANCE_KEYS.has(key)
        ? true
        : key === 'fill'
          ? shapeFillEquals(
              node.fill as ShapeFill,
              next.fill as ShapeFill,
            )
          : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, PATH_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  return {
    ok: false,
    node,
    reason: `${node.type} 节点没有可改的样式字段（组没有自己的样式；样式属于 text / image / shape / line / path / qrcode / chart / table / timeline / progress）`,
  }
}

function applyGeometryPatch(
  node: FreeformSceneNode,
  patch: FreeformNodeGeometryPatch,
): NodePatchResult {
  if (!isRecord(patch) || !hasOnlyKeys(patch, GEOMETRY_KEYS)) {
    return { ok: false, node, reason: `几何键只接受 ${[...GEOMETRY_KEYS].join(' / ')}` }
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, node, reason: '几何键至少要写一个' }
  }
  const record = patch as unknown as UnknownRecord
  const keys = Object.keys(record)
  if (node.type === 'group' && keys.some((key) => key === 'width' || key === 'height')) {
    return { ok: false, node, reason: '组没有自己的 width / height（由子节点撑开）' }
  }
  // Mirror flips are v40 and only exist on image / shape / path; `false` clears.
  const flippable = node.type === 'image' || node.type === 'shape' || node.type === 'path'
  for (const key of ['flipX', 'flipY'] as const) {
    if (!(key in record)) continue
    if (!flippable) {
      return { ok: false, node, reason: `flipX / flipY 只用于 image / shape / path（${node.type} 不能翻转）` }
    }
    if (typeof record[key] !== 'boolean') {
      return { ok: false, node, reason: `${key} 必须是 true / false（true 翻转，false 恢复）` }
    }
  }
  const values = keys
    .filter((key) => key !== 'flipX' && key !== 'flipY')
    .map((key) => record[key])
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return { ok: false, node, reason: '几何值必须都是有限数字' }
  }
  const scale = 'scale' in record ? (record.scale as number) : node.scale
  if (scale <= 0) {
    return { ok: false, node, reason: 'scale 必须大于 0' }
  }
  if (node.type !== 'group') {
    const width = 'width' in record ? (record.width as number) : node.width
    const height = 'height' in record ? (record.height as number) : node.height
    if (width <= 0 || height <= 0) {
      return { ok: false, node, reason: 'width 和 height 必须都大于 0' }
    }
  }
  // Set or clear the mirrors: `true` keeps the flag, `false` drops it.
  const flipOf = (key: 'flipX' | 'flipY') => (
    key in record
      ? (record[key] ? { [key]: true as const } : { [key]: undefined })
      : {}
  )
  const next = {
    ...node,
    ...('x' in patch ? { x: patch.x as number } : {}),
    ...('y' in patch ? { y: patch.y as number } : {}),
    ...('rotation' in patch ? { rotation: patch.rotation as number } : {}),
    ...('scale' in patch ? { scale: patch.scale as number } : {}),
    ...(node.type !== 'group' && 'width' in patch ? { width: patch.width as number } : {}),
    ...(node.type !== 'group' && 'height' in patch ? { height: patch.height as number } : {}),
    ...flipOf('flipX'),
    ...flipOf('flipY'),
  } as FreeformSceneNode
  if (flippable) {
    if ('flipX' in record && !record.flipX) delete (next as Partial<Record<'flipX' | 'flipY', boolean>>).flipX
    if ('flipY' in record && !record.flipY) delete (next as Partial<Record<'flipX' | 'flipY', boolean>>).flipY
  }
  // Resizing a polyline stretches its vertices with the box (Figma semantics);
  // a vertex list that no longer fits the new box rejects the whole patch.
  if (
    node.type === 'line'
    && node.points
    && ('width' in patch || 'height' in patch)
  ) {
    const line = next as FreeformLineElement
    const scaled = cloneLinePoints(
      node.points.map((point) => ({
        x: 'width' in patch ? point.x * (line.width / node.width) : point.x,
        y: 'height' in patch ? point.y * (line.height / node.height) : point.y,
      })),
      line.width,
      line.height,
    )
    if (!scaled) {
      return { ok: false, node, reason: '改 width / height 后顶点装不进新的节点盒：把 points 一起调整，或先去掉 points' }
    }
    return { ok: true, node: { ...line, points: scaled } }
  }
  const same = keys.every(
    (key) => (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
  )
  return { ok: true, node: same ? node : next }
}

type NodeUpdateCategory = 'content' | 'style' | 'geometry'

function reduceNodeUpdateBatch(
  document: FreeformDocument,
  slideId: string,
  category: NodeUpdateCategory,
  updates: unknown,
): FreeformDocument {
  const slide = document.slides.find((candidate) => candidate.id === slideId)
  if (!slide || !Array.isArray(updates) || updates.length === 0) return document

  const paths: ScenePath[] = []
  const seenPaths = new Set<string>()
  for (const update of updates) {
    if (!isRecord(update) || !validScenePath(update.path) || !isRecord(update.patch)) {
      return document
    }
    const key = scenePathKey(update.path)
    if (seenPaths.has(key)) return document
    seenPaths.add(key)
    paths.push(update.path)
  }
  let pathIndex: ReturnType<typeof buildScenePathIndex>
  try {
    pathIndex = buildScenePathIndex(slide.nodes)
  } catch {
    return document
  }
  if (!canApplySceneAction(slide.nodes, { kind: category, paths }, pathIndex)) return document

  const updaters = new Map<
    string,
    (node: FreeformSceneNode) => FreeformSceneNode
  >()
  let invalidPatch = false
  for (const update of updates as Array<{ path: ScenePath; patch: UnknownRecord }>) {
    const key = scenePathKey(update.path)
    const node = pathIndex.get(key)?.node
    if (!node) return document
    const result: NodePatchResult =
      category === 'content'
        ? applyContentPatch(node, update.patch as FreeformNodeContentPatch)
        : category === 'style'
          ? applyStylePatch(node, update.patch as FreeformNodeStylePatch)
          : applyGeometryPatch(node, update.patch as FreeformNodeGeometryPatch)
    if (!result.ok) return document
    if (result.node === node) continue
    updaters.set(key, (current) => {
      const currentResult: NodePatchResult =
        category === 'content'
          ? applyContentPatch(current, update.patch as FreeformNodeContentPatch)
          : category === 'style'
            ? applyStylePatch(current, update.patch as FreeformNodeStylePatch)
            : applyGeometryPatch(current, update.patch as FreeformNodeGeometryPatch)
      if (!currentResult.ok) {
        invalidPatch = true
        return current
      }
      return currentResult.node
    })
  }
  if (updaters.size === 0) return document

  const nodes = updateNodesAtPaths(slide.nodes, updaters, {
    recenterChangedGroups: category === 'geometry',
  })
  if (!nodes || invalidPatch || nodes === slide.nodes) return document
  if (validateSceneNodesForMutation(nodes)) return document
  return withSlideNodes(document, slideId, () => nodes)
}

/**
 * Why a node-update action would not apply, in the reader's words — the
 * first reason its own checks hit: an unknown slide, an unknown path, a
 * locked node, or the first patch the node refused (the patch functions'
 * `reason`). `null` when the batch applies cleanly or the action is not a
 * node update; post-mutation rejections are too rare to mirror here.
 */
export function describeFreeformActionRejection(
  document: FreeformDocument,
  action: unknown,
): string | null {
  if (!isRecord(action)) return null
  const type = action.type
  if (type === 'document/find-replace') {
    if (typeof action.find !== 'string' || action.find === '') return 'find 为空串：要给出要找的文字'
    if (typeof action.replace !== 'string') return 'replace 必须是字符串（可以是空串，表示删掉这些字）'
    if (action.slideId !== undefined
      && (typeof action.slideId !== 'string' || !document.slides.some((slide) => slide.id === action.slideId))) {
      return `找不到这一页：${String(action.slideId)}`
    }
    return null
  }
  if (
    type !== 'node/update-content'
    && type !== 'node/update-style'
    && type !== 'node/update-geometry'
  ) {
    return null
  }
  const category: NodeUpdateCategory = type === 'node/update-content'
    ? 'content'
    : type === 'node/update-style'
      ? 'style'
      : 'geometry'
  if (typeof action.slideId !== 'string') return `${type} 的 slideId 必须是字符串`
  const slide = document.slides.find((candidate) => candidate.id === action.slideId)
  if (!slide) {
    const known = document.slides.map((entry) => entry.id).join('、')
    return `找不到这一页：${action.slideId}（文档里有：${known}）`
  }
  if (!Array.isArray(action.updates) || action.updates.length === 0) {
    return `${type} 的 updates 必须是非空的 [{ path, patch }] 数组`
  }
  const paths: ScenePath[] = []
  const seen = new Set<string>()
  for (const update of action.updates) {
    if (!isRecord(update)) return 'updates 里的每一项必须是 { path, patch } 对象'
    if (!validScenePath(update.path)) {
      return `path 必须是节点 id 的字符串数组，收到 ${JSON.stringify(update.path) ?? String(update.path)}（用 inspect_document 拿节点 id 和路径）`
    }
    const key = scenePathKey(update.path)
    if (seen.has(key)) return `updates 里有重复的 path：${JSON.stringify(update.path)}`
    seen.add(key)
    paths.push(update.path)
    if (!isRecord(update.patch)) return 'patch 必须是对象'
  }
  let pathIndex: ReturnType<typeof buildScenePathIndex>
  try {
    pathIndex = buildScenePathIndex(slide.nodes)
  } catch {
    return null
  }
  if (!canApplySceneAction(slide.nodes, { kind: category, paths }, pathIndex)) {
    for (const path of paths) {
      const target = pathIndex.get(scenePathKey(path))
      if (!target) return `路径找不到节点：${JSON.stringify(path)}（用 inspect_document 拿节点 id 和路径）`
      if (target.effectiveLocked) return `「${target.node.name}」被锁定（locked），不能编辑`
      if (category === 'geometry' && target.subtreeLocked) {
        return `「${target.node.name}」在锁定的组里，不能改几何`
      }
    }
    return '这个节点更新不被允许'
  }
  for (const update of action.updates as Array<{ path: ScenePath; patch: UnknownRecord }>) {
    const node = pathIndex.get(scenePathKey(update.path))?.node
    if (!node) return `路径找不到节点：${JSON.stringify(update.path)}`
    const result: NodePatchResult =
      category === 'content'
        ? applyContentPatch(node, update.patch as FreeformNodeContentPatch)
        : category === 'style'
          ? applyStylePatch(node, update.patch as FreeformNodeStylePatch)
          : applyGeometryPatch(node, update.patch as FreeformNodeGeometryPatch)
    if (!result.ok) return result.reason ?? '补丁未通过校验'
  }
  return null
}

function reduceImageCropUpdate(
  document: FreeformDocument,
  action: Extract<FreeformAction, { type: 'node/update-image-crop' }>,
): FreeformDocument {
  if (
    !isRecord(action) ||
    !hasExactKeys(action, IMAGE_CROP_ACTION_KEYS) ||
    typeof action.slideId !== 'string' ||
    !validScenePath(action.path) ||
    !isRecord(action.patch) ||
    !hasExactKeys(action.patch, IMAGE_CROP_PATCH_KEYS)
  ) {
    return document
  }

  const slide = document.slides.find((candidate) => candidate.id === action.slideId)
  if (!slide) return document

  let pathIndex: ReturnType<typeof buildScenePathIndex>
  try {
    pathIndex = buildScenePathIndex(slide.nodes)
  } catch {
    return document
  }
  const paths = [action.path]
  if (
    !canApplySceneAction(slide.nodes, { kind: 'geometry', paths }, pathIndex) ||
    !canApplySceneAction(slide.nodes, { kind: 'style', paths }, pathIndex)
  ) {
    return document
  }
  const state = effectiveSceneState(slide.nodes, action.path)
  if (!state || state.hidden) return document

  const node = pathIndex.get(scenePathKey(action.path))?.node
  if (!node || node.type !== 'image') return document

  const patch = action.patch as FreeformImageCropPatch
  const geometryResult = applyGeometryPatch(node, {
    x: patch.x,
    y: patch.y,
    width: patch.width,
    height: patch.height,
  })
  if (!geometryResult.ok) return document
  const styleResult = applyStylePatch(geometryResult.node, {
    framing: patch.framing,
  })
  if (!styleResult.ok || styleResult.node === node) return document

  const nodes = updateNodesAtPaths(
    slide.nodes,
    new Map([[scenePathKey(action.path), () => styleResult.node]]),
    { recenterChangedGroups: true },
  )
  if (!nodes || nodes === slide.nodes || validateSceneNodesForMutation(nodes)) return document
  return withSlideNodes(document, action.slideId, () => nodes)
}

function defaultSceneNodeName(element: FreeformElement): string {
  if (element.type === 'text') return '文本'
  if (element.type === 'image') return '图片'
  if (element.type === 'shape') return '形状'
  if (element.type === 'path') return '图形'
  if (element.type === 'qrcode') return '二维码'
  if (element.type === 'chart') return '图表'
  if (element.type === 'table') return '表格'
  if (element.type === 'timeline') return '时间线'
  if (element.type === 'progress') return '进度'
  return element.lineKind === 'arrow' ? '箭头' : '直线'
}

function adaptLegacyElement(element: unknown): FreeformSceneLeaf | null {
  if (!isRecord(element)) return null
  const sceneStateKeys = ['name', 'locked', 'hidden', 'scale']
  const sceneStateKeyCount = sceneStateKeys.filter((key) => key in element).length
  if (sceneStateKeyCount !== 0 && sceneStateKeyCount !== sceneStateKeys.length) return null
  const hasSceneState = sceneStateKeyCount === sceneStateKeys.length
  const commonKeys = [
    'id',
    'type',
    'x',
    'y',
    'width',
    'height',
    'rotation',
    ...sceneStateKeys,
  ]
  const typeKeys: Record<string, string[]> = {
    text: [
      'text',
      'fontSize',
      'fontFamily',
      'textFill',
      'align',
      'fontWeight',
    ],
    image: ['src', 'alt', 'fit', 'framing'],
    shape: ['shape', 'fill', 'stroke', 'strokeWidth'],
    line: ['lineKind', 'stroke', 'strokeWidth'],
  }
  if (typeof element.type !== 'string' || !(element.type in typeKeys)) return null
  if (!hasOnlyKeys(element, new Set([...commonKeys, ...typeKeys[element.type]]))) return null

  const base = {
    id: element.id as string,
    name: hasSceneState
      ? (element.name as string)
      : defaultSceneNodeName(element as unknown as FreeformElement),
    locked: hasSceneState ? (element.locked as boolean) : false,
    hidden: hasSceneState ? (element.hidden as boolean) : false,
    x: element.x as number,
    y: element.y as number,
    width: element.width as number,
    height: element.height as number,
    rotation: element.rotation as number,
    scale: hasSceneState ? (element.scale as number) : 1,
  }
  if (element.type === 'text') {
    if (!isValidSceneColorPaint(element.textFill)) return null
    return {
      ...base,
      type: 'text',
      text: element.text as string,
      fontSize: element.fontSize as number,
      fontFamily: element.fontFamily as string,
      textFill: cloneColorPaint(element.textFill as ColorPaint),
      align: element.align as TextAlign,
      fontWeight: element.fontWeight as 'normal' | 'bold',
    }
  }
  if (element.type === 'image') {
    if (!isValidImageFraming(element.framing)) return null
    return {
      ...base,
      type: 'image',
      src: element.src as string,
      alt: element.alt as string,
      fit: element.fit as 'cover' | 'contain',
      framing: cloneImageFraming(element.framing),
    }
  }
  if (element.type === 'shape') {
    if (!isValidSceneShapeFill(element.fill)) return null
    return {
      ...base,
      type: 'shape',
      shape: element.shape as 'rect' | 'ellipse' | 'triangle',
      fill: cloneShapeFill(element.fill as ShapeFill),
      stroke: element.stroke as string,
      strokeWidth: element.strokeWidth as number,
    }
  }
  return {
    ...base,
    type: 'line',
    lineKind: element.lineKind as 'line' | 'arrow',
    stroke: element.stroke as string,
    strokeWidth: element.strokeWidth as number,
  }
}

function pickPatch(source: UnknownRecord, keys: ReadonlySet<string>): UnknownRecord {
  const result: UnknownRecord = {}
  for (const key of Object.keys(source)) {
    if (keys.has(key)) result[key] = source[key]
  }
  return result
}

/**
 * Legacy root-leaf patch adapter retained only for reducer and migration tests.
 * Shipping workspace mutations use path-based node actions.
 */
function applyLegacyElementPatch(
  node: FreeformSceneNode,
  patch: unknown,
): NodePatchResult {
  if (node.type === 'group' || !isRecord(patch)) return { ok: false, node }
  const allowedByType: Record<FreeformSceneLeaf['type'], ReadonlySet<string>> = {
    text: new Set(['x', 'y', 'width', 'height', 'rotation', 'text', 'fontSize', 'fontFamily', 'textFill', 'align', 'fontWeight']),
    image: new Set([
      'x', 'y', 'width', 'height', 'rotation', 'src', 'alt', 'fit', 'framing',
    ]),
    shape: new Set(['x', 'y', 'width', 'height', 'rotation', 'shape', 'fill', 'stroke', 'strokeWidth']),
    line: new Set(['x', 'y', 'width', 'height', 'rotation', 'lineKind', 'stroke', 'strokeWidth']),
    path: new Set(['x', 'y', 'width', 'height', 'rotation']),
    qrcode: new Set(['x', 'y', 'width', 'height', 'rotation']),
    chart: new Set(['x', 'y', 'width', 'height', 'rotation']),
    table: new Set(['x', 'y', 'width', 'height', 'rotation']),
    timeline: new Set(['x', 'y', 'width', 'height', 'rotation']),
    progress: new Set(['x', 'y', 'width', 'height', 'rotation']),
  }
  if (!hasOnlyKeys(patch, allowedByType[node.type])) return { ok: false, node }
  if (Object.keys(patch).length === 0) return { ok: true, node }

  let current: FreeformSceneNode = node
  const geometry = pickPatch(patch, GEOMETRY_KEYS)
  const content = pickPatch(patch, CONTENT_KEYS)
  const style = pickPatch(patch, STYLE_KEYS)
  for (const [category, categoryPatch] of [
    ['geometry', geometry],
    ['content', content],
    ['style', style],
  ] as const) {
    if (Object.keys(categoryPatch).length === 0) continue
    const result: NodePatchResult =
      category === 'geometry'
        ? applyGeometryPatch(current, categoryPatch as FreeformNodeGeometryPatch)
        : category === 'content'
          ? applyContentPatch(current, categoryPatch as FreeformNodeContentPatch)
          : applyStylePatch(current, categoryPatch as FreeformNodeStylePatch)
    if (!result.ok) return { ok: false, node }
    current = result.node
  }
  return { ok: true, node: current }
}

function validIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => typeof id === 'string' && id.length > 0)
  )
}

const INSERTED_SLIDE_KEYS = new Set(['id', 'name', 'width', 'height', 'background', 'nodes', 'guides'])

/** A page handed to slide/insert, checked like a loaded one and copied so the deck owns it; null when it isn't valid. */
function ownedSlide(value: unknown): FreeformSlide | null {
  if (!isRecord(value) || !hasOnlyKeys(value, INSERTED_SLIDE_KEYS)) return null
  const { id, name, width, height, background, nodes } = value
  if (typeof id !== 'string' || id.trim().length === 0 || typeof name !== 'string') return null
  if (typeof width !== 'number' || typeof height !== 'number' || !validatePageSize(width, height).ok) return null
  if (!validSlideBackground(background) || !Array.isArray(nodes)) return null
  if (validateSceneNodesForMutation(nodes as FreeformSceneNode[])) return null
  const guides = 'guides' in value ? normalizeSlideGuides(value.guides, width, height) : []
  if (!guides) return null
  return {
    id,
    name,
    width,
    height,
    background: cloneSlideBackground(background),
    nodes: copySceneNodeValues(nodes as FreeformSceneNode[]),
    ...(guides.length > 0 ? { guides } : {}),
  }
}

function applyMutationToSlide(
  document: FreeformDocument,
  slideId: string,
  mutation: { ok: true; nodes: FreeformSceneNode[] } | { ok: false },
): FreeformDocument {
  return mutation.ok
    ? withSlideNodes(document, slideId, () => mutation.nodes)
    : document
}

/**
 * Current reducer boundary. Every accepted node mutation passes
 * typed permission classification, runtime patch whitelists, and complete
 * scene validation before a new document snapshot is returned.
 */
export function reduceFreeformDocument(
  document: FreeformDocument,
  action: FreeformAction,
): FreeformDocument {
  try {
    switch (action.type) {
      case 'slide/add-after-active': {
        if (document.slides.length >= MAX_FREEFORM_SLIDES) return document
        const activeIndex = document.slides.findIndex(
          (slide) => slide.id === document.activeSlideId,
        )
        if (activeIndex < 0) return document
        const id = action.slideId ?? randomId()
        if (
          typeof id !== 'string' ||
          id.trim().length === 0 ||
          document.slides.some((slide) => slide.id === id)
        ) {
          return document
        }
        const active = document.slides[activeIndex]
        const nextSlide: FreeformSlide = {
          id,
          name: `Page ${document.slides.length + 1}`,
          width: active.width,
          height: active.height,
          background: cloneSlideBackground(active.background),
          nodes: [],
        }
        return {
          ...document,
          activeSlideId: id,
          slides: [
            ...document.slides.slice(0, activeIndex + 1),
            nextSlide,
            ...document.slides.slice(activeIndex + 1),
          ],
        }
      }
      case 'slide/duplicate': {
        if (document.slides.length >= MAX_FREEFORM_SLIDES) return document
        const index = document.slides.findIndex((slide) => slide.id === action.slideId)
        if (index < 0) return document
        const id = action.duplicateSlideId ?? randomId()
        if (
          typeof id !== 'string' ||
          id.trim().length === 0 ||
          document.slides.some((slide) => slide.id === id)
        ) {
          return document
        }
        const source = document.slides[index]
        const nodes = cloneSceneNodes(source.nodes, action.nodeIdFactory)
        const sourceNodeIds = sceneNodeIdSet(source.nodes)
        const duplicateNodeIds = sceneNodeIdSet(nodes)
        if (
          validateSceneNodesForMutation(nodes) ||
          [...duplicateNodeIds].some((nodeId) => sourceNodeIds.has(nodeId))
        ) {
          return document
        }
        const duplicate: FreeformSlide = {
          ...source,
          id,
          name: `${source.name} copy`,
          background: cloneSlideBackground(source.background),
          nodes,
        }
        return {
          ...document,
          activeSlideId: id,
          slides: [
            ...document.slides.slice(0, index + 1),
            duplicate,
            ...document.slides.slice(index + 1),
          ],
        }
      }
      case 'slide/insert': {
        if (!Array.isArray(action.slides) || action.slides.length === 0) return document
        if (action.afterSlideId !== undefined && action.replaceSlideId !== undefined) return document
        const replacing = action.replaceSlideId !== undefined
        const anchorId = action.replaceSlideId ?? action.afterSlideId ?? document.activeSlideId
        const anchor = document.slides.findIndex((slide) => slide.id === anchorId)
        if (anchor < 0) return document
        const kept = replacing ? document.slides.filter((_, index) => index !== anchor) : document.slides
        if (kept.length + action.slides.length > MAX_FREEFORM_SLIDES) return document
        const ids = new Set(kept.map((slide) => slide.id))
        const inserted: FreeformSlide[] = []
        for (const value of action.slides) {
          const slide = ownedSlide(value)
          if (!slide || ids.has(slide.id)) return document
          ids.add(slide.id)
          inserted.push(slide)
        }
        const at = replacing ? anchor : anchor + 1
        return {
          ...document,
          activeSlideId: inserted[0].id,
          slides: [...kept.slice(0, at), ...inserted, ...kept.slice(at)],
        }
      }
      case 'slide/delete': {
        if (document.slides.length <= 1) return document
        const index = document.slides.findIndex((slide) => slide.id === action.slideId)
        if (index < 0) return document
        const slides = document.slides.filter((slide) => slide.id !== action.slideId)
        const fallback = slides[Math.min(index, slides.length - 1)]
        return {
          ...document,
          slides,
          activeSlideId:
            document.activeSlideId === action.slideId ? fallback.id : document.activeSlideId,
        }
      }
      case 'slide/select': {
        if (
          action.slideId === document.activeSlideId ||
          !document.slides.some((slide) => slide.id === action.slideId)
        ) {
          return document
        }
        return { ...document, activeSlideId: action.slideId }
      }
      case 'slide/reorder': {
        if (!Number.isInteger(action.targetIndex) || action.targetIndex < 0) return document
        const index = document.slides.findIndex((slide) => slide.id === action.slideId)
        if (index < 0) return document
        const targetIndex = Math.min(action.targetIndex, document.slides.length - 1)
        if (targetIndex === index) return document
        const slides = [...document.slides]
        const [moved] = slides.splice(index, 1)
        slides.splice(targetIndex, 0, moved)
        return { ...document, slides }
      }
      case 'document/restyle':
        return restyleDocument(document, action)
      case 'document/find-replace': {
        const find = isRecord(action) && typeof action.find === 'string' ? action.find : ''
        if (find === '') return document
        const replace = isRecord(action) && typeof action.replace === 'string' ? action.replace : ''
        const only = isRecord(action) && typeof action.slideId === 'string' ? action.slideId : null
        let changed = false
        const slides = document.slides.map((slide) => {
          if (only !== null && slide.id !== only) return slide
          let slideChanged = false
          const nodes = slide.nodes.map((leaf) => {
            if (leaf.type !== 'text' || !leaf.text.includes(find)) return leaf
            const text = leaf.text.split(find).join(replace)
            if (text === leaf.text) return leaf
            slideChanged = true
            // The spans follow the words they colour, exactly as typing does.
            const remapped = remapRichTextSpans(leaf.spans, leaf.text, text)
            const { spans: _previousSpans, ...rest } = leaf
            return remapped ? { ...rest, text, spans: remapped } : { ...rest, text }
          })
          if (!slideChanged) return slide
          changed = true
          return { ...slide, nodes }
        })
        return changed ? { ...document, slides } : document
      }
      case 'slide/update': {
        if (!isRecord(action.patch) || !hasOnlyKeys(action.patch, new Set(['name', 'background']))) {
          return document
        }
        if ('name' in action.patch && typeof action.patch.name !== 'string') return document
        if ('background' in action.patch && !validSlideBackground(action.patch.background)) {
          return document
        }
        return withSlide(document, action.slideId, (slide) => {
          const name = action.patch.name ?? slide.name
          const background = action.patch.background ?? slide.background
          if (name === slide.name && slideBackgroundEquals(background, slide.background)) return slide
          return {
            ...slide,
            name,
            background: cloneSlideBackground(background),
          }
        })
      }
      case 'slide/resize': {
        if (!validatePageSize(action.width, action.height).ok) return document
        return withSlide(document, action.slideId, (slide) =>
          slide.width === action.width && slide.height === action.height
            ? slide
            : { ...slide, width: action.width, height: action.height },
        )
      }
      case 'guides/set': {
        if (!Array.isArray(action.guides)) return document
        return withSlide(document, action.slideId, (slide) => {
          const guides = normalizeSlideGuides(action.guides, slide.width, slide.height)
          if (!guides) return slide
          if (guides.length === 0) {
            if (!slide.guides) return slide
            const { guides: _removed, ...rest } = slide
            return rest
          }
          if (slide.guides && guidesEqual(slide.guides, guides)) return slide
          return { ...slide, guides }
        })
      }
      case 'node/set-locked':
      case 'node/set-hidden':
      case 'node/rename': {
        if (!validScenePath(action.path)) return document
        if (
          (action.type === 'node/set-locked' && typeof action.locked !== 'boolean') ||
          (action.type === 'node/set-hidden' && typeof action.hidden !== 'boolean') ||
          (action.type === 'node/rename' && typeof action.name !== 'string')
        ) {
          return document
        }
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        if (!slide || !canApplySceneAction(slide.nodes, { kind: 'metadata', paths: [action.path] })) {
          return document
        }
        return withSlideNodes(document, action.slideId, (nodes) =>
          updateNodeAtPath(nodes, action.path, (node) => {
            if (action.type === 'node/set-locked') {
              return node.locked === action.locked ? node : { ...node, locked: action.locked }
            }
            if (action.type === 'node/set-hidden') {
              return node.hidden === action.hidden ? node : { ...node, hidden: action.hidden }
            }
            return node.name === action.name ? node : { ...node, name: action.name }
          }),
        )
      }
      case 'node/update-content':
        return reduceNodeUpdateBatch(document, action.slideId, 'content', action.updates)
      case 'node/update-style':
        return reduceNodeUpdateBatch(document, action.slideId, 'style', action.updates)
      case 'node/update-geometry':
        return reduceNodeUpdateBatch(document, action.slideId, 'geometry', action.updates)
      case 'node/update-image-crop':
        return reduceImageCropUpdate(document, action)
      case 'node/delete': {
        if (!validContainerPath(action.parentPath) || !validIdList(action.nodeIds)) return document
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        return slide
          ? applyMutationToSlide(
              document,
              action.slideId,
              deleteSceneNodes(slide.nodes, action.parentPath, action.nodeIds),
            )
          : document
      }
      case 'node/reorder': {
        if (
          !validContainerPath(action.parentPath) ||
          !validIdList(action.nodeIds) ||
          !['forward', 'backward', 'front', 'back'].includes(action.direction)
        ) {
          return document
        }
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        if (!slide) return document
        const selection = validateSelectionForParent(
          slide.nodes,
          action.parentPath,
          action.nodeIds,
        )
        if (
          !selection.ok ||
          !canApplySceneAction(slide.nodes, {
            kind: 'structure',
            paths: selection.selectedNodes.map((node) => [...action.parentPath, node.id]),
          })
        ) {
          return document
        }
        const nodes = reorderNodesAtPath(
          slide.nodes,
          action.parentPath,
          action.nodeIds,
          action.direction,
        )
        if (nodes === slide.nodes || validateSceneNodesForMutation(nodes)) return document
        return withSlideNodes(document, action.slideId, () => nodes)
      }
      case 'node/reorder-above': {
        if (
          !validContainerPath(action.parentPath) ||
          !validIdList(action.nodeIds) ||
          typeof action.targetNodeId !== 'string' ||
          action.targetNodeId.length === 0 ||
          action.nodeIds.includes(action.targetNodeId)
        ) {
          return document
        }
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        if (!slide) return document
        const selection = validateSelectionForParent(
          slide.nodes,
          action.parentPath,
          action.nodeIds,
        )
        if (
          !selection.ok ||
          !selection.children.some((node) => node.id === action.targetNodeId) ||
          !canApplySceneAction(slide.nodes, {
            kind: 'structure',
            paths: selection.selectedNodes.map((node) => [...action.parentPath, node.id]),
          })
        ) {
          return document
        }
        const nodes = reorderNodesAboveAtPath(
          slide.nodes,
          action.parentPath,
          action.nodeIds,
          action.targetNodeId,
        )
        if (nodes === slide.nodes || validateSceneNodesForMutation(nodes)) return document
        return withSlideNodes(document, action.slideId, () => nodes)
      }
      case 'node/clone': {
        if (!validContainerPath(action.parentPath) || !validIdList(action.nodeIds)) return document
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        return slide
          ? applyMutationToSlide(
              document,
              action.slideId,
              cloneSceneNodesAtPath(
                slide.nodes,
                action.parentPath,
                action.nodeIds,
                action.idFactory,
              ),
            )
          : document
      }
      case 'node/insert-children': {
        if (!validContainerPath(action.parentPath) || !Array.isArray(action.nodes)) return document
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        return slide
          ? applyMutationToSlide(
              document,
              action.slideId,
              insertSceneChildren(slide.nodes, action.parentPath, action.nodes, action.index),
            )
          : document
      }
      case 'group/create': {
        if (!validContainerPath(action.parentPath) || !validIdList(action.nodeIds)) return document
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        return slide
          ? applyMutationToSlide(
              document,
              action.slideId,
              createSceneGroup(slide.nodes, action.parentPath, action.nodeIds, {
                id: action.groupId,
                name: action.name,
              }),
            )
          : document
      }
      case 'group/ungroup': {
        if (
          !validContainerPath(action.parentPath) ||
          !validIdList(action.groupIds) ||
          (action.mode !== 'one-level' && action.mode !== 'all-level')
        ) {
          return document
        }
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        return slide
          ? applyMutationToSlide(
              document,
              action.slideId,
              ungroupSceneGroups(
                slide.nodes,
                action.parentPath,
                action.groupIds,
                action.mode,
              ),
            )
          : document
      }
      case 'element/add': {
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        if (!slide) return document
        const node = adaptLegacyElement(action.element)
        if (!node) return document
        return applyMutationToSlide(
          document,
          action.slideId,
          insertSceneChildren(slide.nodes, [], [node]),
        )
      }
      case 'element/update': {
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        if (!slide || typeof action.elementId !== 'string') return document
        const node = slide.nodes.find((candidate) => candidate.id === action.elementId)
        if (
          !node ||
          node.type === 'group' ||
          !canApplySceneAction(slide.nodes, { kind: 'geometry', paths: [[node.id]] })
        ) {
          return document
        }
        const patched = applyLegacyElementPatch(node, action.patch)
        if (!patched.ok || patched.node === node) return document
        const nodes = updateNodeAtPath(slide.nodes, [node.id], () => patched.node)
        if (validateSceneNodesForMutation(nodes)) return document
        return withSlideNodes(document, action.slideId, () => nodes)
      }
      case 'element/delete': {
        if (!validIdList(action.elementIds)) return document
        const slide = document.slides.find((candidate) => candidate.id === action.slideId)
        return slide
          ? applyMutationToSlide(
              document,
              action.slideId,
              deleteSceneNodes(slide.nodes, [], action.elementIds),
            )
          : document
      }
      case 'element/reorder': {
        return reduceFreeformDocument(document, {
          type: 'node/reorder',
          slideId: action.slideId,
          parentPath: [],
          nodeIds: action.elementIds,
          direction: action.direction,
        })
      }
      default:
        return document
    }
  } catch {
    return document
  }
}

/** Shipping reducer alias. */
export function freeformReducer(
  document: FreeformDocument,
  action: FreeformAction,
): FreeformDocument {
  return reduceFreeformDocument(document, action)
}

/** @deprecated Use reduceFreeformDocument. */
