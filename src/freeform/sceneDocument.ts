import {
  MAX_EFFECTIVE_SCALE,
  MAX_FREEFORM_SLIDES,
  MAX_SCENE_DEPTH,
  MAX_SCENE_NODES_PER_SLIDE,
  MIN_EFFECTIVE_SCALE,
} from './constants'
import { validatePageSize } from './document'
import {
  cloneImageFraming,
  createDefaultImageFraming,
  isValidImageFraming,
} from './imageFraming'
import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
  isHexColor,
  isValidPagePattern,
  isValidPagePatternSize,
  normalizeColorPaint,
} from './paint'
import {
  mapSceneLeaves,
  mapSceneLeavesAsync,
} from './sceneTree'
import type {
  AsyncSceneLeafMapper,
  SceneLeafMapper,
} from './sceneTree'
import { cloneGuides, normalizeSlideGuides } from './guides'
import type {
  FreeformChartSeries,
  BlendMode,
  ColorPaint,
  FreeformDocument,
  FreeformGroupNode,
  FreeformGuide,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlide,
  ImageFraming,
  LineEndpointCap,
  LinePoint,
  PathFill,
  QrErrorCorrectionLevel,
  QrModuleStyle,
  RichTextSpan,
  SceneFilter,
  ShadowPaint,
  ShapeFill,
  SlideBackground,
  TextEffect,
  TextList,
  TextVerticalAlign,
} from './types'
import { normalizeRichTextSpans, usesV16SpanStyles, usesV20SpanStyles } from './richText'
import { isValidTextEffect } from './textEffects'
import {
  cloneGradientStops,
  cloneLinePoints,
  clonePathViewBox,
  cloneSceneFilter,
  cloneShadowPaint,
  isV7Shape,
  isV21Shape,
  isValidBlendMode,
  isValidBubbleTailX,
  isValidCornerRadius,
  isValidDash,
  isValidFillRule,
  isValidLetterSpacing,
  isValidLineCap,
  isValidLineEndpointCap,
  isValidLineHeight,
  isValidLineJoin,
  isValidOpacity,
  isValidPathDash,
  isValidPathStrokeWidth,
  isValidShape,
  isValidStarInnerRatio,
  isValidTextStrokeWidth,
  isTextList,
  isTextVerticalAlign,
  isValidParagraphSpacing,
} from './appearance'
import { isValidPathData } from './pathData'
import { isValidQrEcl, isValidQrLogoSrc, isValidQrModuleStyle, isValidQrPayload, isValidQrQuietZone } from './qrCode'
import {
  CHART_POINTS_MAX,
  isValidChartBarMode,
  isValidChartKind,
  isValidChartLabel,
  isValidChartSeries,
  isValidChartSeriesList,
  type ChartBarMode,
} from './charts'
import { isValidTableCellText, isValidTableColWidths, isValidTableCols, isValidTableRows } from './tables'
import { isValidTimelineItems, type TimelineItem } from './timeline'

type UnknownRecord = Record<string, unknown>

interface SceneValidationState {
  ids: Set<string>
  count: number
}

interface MigratedSlideCandidate {
  sourceId: string
  sourceIndex: number
  slide: Omit<FreeformSlide, 'id'>
}

type StrictDocumentVersion = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37

const DOCUMENT_KEYS = new Set(['documentVersion', 'slides', 'activeSlideId'])
const SLIDE_KEYS = new Set(['id', 'name', 'width', 'height', 'background', 'nodes'])
const SLIDE_GUIDE_OPTIONAL_KEYS = new Set(['guides'])
const SOLID_PAINT_KEYS = new Set(['type', 'color'])
const GRADIENT_PAINT_KEYS = new Set(['type', 'from', 'to', 'angle'])
const GRADIENT_STOPS_PAINT_KEYS = new Set(['type', 'stops', 'angle'])
const RADIAL_STOPS_PAINT_KEYS = new Set(['type', 'stops'])
const TRANSPARENT_PAINT_KEYS = new Set(['type'])
const PATTERN_PAINT_KEYS = new Set(['type', 'color', 'patternColor', 'pattern', 'size'])
const IMAGE_FILL_V3_KEYS = new Set(['type', 'src', 'fit'])
const IMAGE_FILL_V4_KEYS = new Set(['type', 'src', 'fit', 'framing'])
const GROUP_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'rotation', 'scale', 'children',
])
const TEXT_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'text', 'fontSize', 'fontFamily', 'textFill', 'align', 'fontWeight',
])
const IMAGE_NODE_V3_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'src', 'alt', 'fit',
])
const IMAGE_NODE_V4_KEYS = new Set([...IMAGE_NODE_V3_KEYS, 'framing'])
const SHAPE_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'shape', 'fill', 'stroke', 'strokeWidth',
])
const LINE_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'lineKind', 'stroke', 'strokeWidth',
])
const PATH_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'd', 'viewBox', 'fill', 'stroke', 'strokeWidth',
])
const QRCODE_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'payload', 'dark', 'light',
])
const CHART_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'chartKind', 'labels', 'values', 'accent',
])
// v26 moves the values and colour onto series entries.
const CHART_NODE_KEYS_V26 = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'chartKind', 'labels', 'series',
])
const TABLE_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'rows', 'cols', 'cells',
])
// Column weights are optional from v35 on (see TABLE_OPTIONAL_V35_KEYS).

const TIMELINE_NODE_KEYS = new Set([
  'id', 'name', 'locked', 'hidden', 'type', 'x', 'y', 'width', 'height', 'rotation',
  'scale', 'items',
])
const TIMELINE_OPTIONAL_V36_KEYS = new Set(['accent', 'opacity', 'shadow', 'filter', 'blendMode'])
const TIMELINE_OPTIONAL_V37_KEYS = new Set(['accent', 'horizontal', 'ink', 'opacity', 'shadow', 'filter', 'blendMode'])

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function hasExactKeys(value: UnknownRecord, expected: ReadonlySet<string>): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFit(value: unknown): value is 'cover' | 'contain' {
  return value === 'cover' || value === 'contain'
}

function cloneStrictColorPaint(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): ColorPaint | null {
  if (!isRecord(value)) return null
  if (
    value.type === 'solid'
    && hasExactKeys(value, SOLID_PAINT_KEYS)
    && isHexColor(value.color)
  ) {
    return { type: 'solid', color: value.color }
  }
  if (
    value.type === 'linear-gradient' &&
    hasExactKeys(value, GRADIENT_PAINT_KEYS) &&
    isHexColor(value.from) &&
    isHexColor(value.to) &&
    isFiniteNumber(value.angle)
  ) {
    return {
      type: 'linear-gradient',
      from: value.from,
      to: value.to,
      angle: value.angle,
    }
  }
  // The multi-stop variant is v8-only; older input versions must reject it.
  if (
    inputVersion >= 8 &&
    value.type === 'linear-gradient' &&
    hasExactKeys(value, GRADIENT_STOPS_PAINT_KEYS)
  ) {
    const stops = cloneGradientStops(value.stops)
    if (stops && isFiniteNumber(value.angle)) {
      return {
        type: 'linear-gradient',
        stops,
        angle: value.angle,
      }
    }
  }
  // The centered radial variant is v12-only; older input versions must reject it.
  if (
    inputVersion >= 12 &&
    value.type === 'radial-gradient' &&
    hasExactKeys(value, RADIAL_STOPS_PAINT_KEYS)
  ) {
    const stops = cloneGradientStops(value.stops)
    if (stops) return { type: 'radial-gradient', stops }
  }
  return null
}

function cloneStrictSlideBackground(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): SlideBackground | null {
  if (
    isRecord(value)
    && value.type === 'transparent'
    && hasExactKeys(value, TRANSPARENT_PAINT_KEYS)
  ) {
    return { type: 'transparent' }
  }
  // A patterned page is v32-only; older input versions must reject it.
  if (isRecord(value) && value.type === 'pattern') {
    if (
      inputVersion < 32
      || !hasExactKeys(value, PATTERN_PAINT_KEYS)
      || !isHexColor(value.color)
      || !isHexColor(value.patternColor)
      || !isValidPagePattern(value.pattern)
      || !isValidPagePatternSize(value.size)
    ) {
      return null
    }
    return {
      type: 'pattern',
      color: value.color,
      patternColor: value.patternColor,
      pattern: value.pattern,
      size: value.size,
    }
  }
  // A picture background is v16-only; older input versions must reject it.
  if (isRecord(value) && value.type === 'image') {
    if (
      inputVersion < 16
      || !hasExactKeys(value, IMAGE_FILL_V4_KEYS)
      || typeof value.src !== 'string'
      || !isFit(value.fit)
      || !isValidImageFraming(value.framing)
    ) {
      return null
    }
    return {
      type: 'image',
      src: value.src,
      fit: value.fit,
      framing: cloneImageFraming(value.framing as ImageFraming),
    }
  }
  return cloneStrictColorPaint(value, inputVersion)
}

function cloneStrictShapeFill(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): ShapeFill | null {
  // The no-fill variant is v11-only; older input versions must reject it.
  if (isRecord(value) && value.type === 'transparent') {
    if (inputVersion < 11 || !hasExactKeys(value, TRANSPARENT_PAINT_KEYS)) return null
    return { type: 'transparent' }
  }
  if (isRecord(value) && value.type === 'image') {
    const expectedKeys = inputVersion >= 4 ? IMAGE_FILL_V4_KEYS : IMAGE_FILL_V3_KEYS
    if (
      !hasExactKeys(value, expectedKeys)
      || typeof value.src !== 'string'
      || !isFit(value.fit)
      || (inputVersion >= 4 && !isValidImageFraming(value.framing))
    ) {
      return null
    }
    return {
      type: 'image',
      src: value.src,
      fit: value.fit,
      framing: inputVersion >= 4
        ? cloneImageFraming(value.framing as ImageFraming)
        : createDefaultImageFraming(),
    }
  }
  return cloneStrictColorPaint(value, inputVersion)
}

function cloneStrictPathFill(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): PathFill | null {
  if (isRecord(value) && value.type === 'transparent') {
    return hasExactKeys(value, TRANSPARENT_PAINT_KEYS) ? { type: 'transparent' } : null
  }
  // Picture fills on paths arrived with v19; older input versions must reject
  // them. The image payload is validated exactly like a shape's picture fill.
  if (isRecord(value) && value.type === 'image') {
    if (inputVersion < 19) return null
    const image = cloneStrictShapeFill(value, inputVersion)
    return image !== null && image.type === 'image' ? image : null
  }
  return cloneStrictColorPaint(value, inputVersion)
}

function normalizeNodeState(
  value: UnknownRecord,
): { id: string; name: string; locked: boolean; hidden: boolean } | null {
  if (
    !isNonBlankString(value.id) ||
    typeof value.name !== 'string' ||
    typeof value.locked !== 'boolean' ||
    typeof value.hidden !== 'boolean'
  ) {
    return null
  }
  return {
    id: value.id,
    name: value.name,
    locked: value.locked,
    hidden: value.hidden,
  }
}

const TEXT_OPTIONAL_V5_KEYS = new Set(['spans'])
const BASE_OPTIONAL_V6_KEYS = new Set(['opacity', 'shadow'])
const TEXT_OPTIONAL_V6_KEYS = new Set(['spans', 'lineHeight', 'letterSpacing', 'italic', 'opacity', 'shadow'])
const SHAPE_OPTIONAL_V6_KEYS = new Set(['cornerRadius', 'opacity', 'shadow'])
const BASE_OPTIONAL_V7_KEYS = new Set(['opacity', 'shadow', 'filter', 'blendMode'])
const TEXT_OPTIONAL_V7_KEYS = new Set([
  'spans', 'lineHeight', 'letterSpacing', 'italic', 'opacity', 'shadow', 'filter', 'blendMode',
])
const SHAPE_OPTIONAL_V7_KEYS = new Set(['cornerRadius', 'opacity', 'shadow', 'filter', 'blendMode'])
const LINE_OPTIONAL_V7_KEYS = new Set(['opacity', 'shadow', 'filter', 'blendMode', 'dash', 'cap'])
const BASE_OPTIONAL_V8_KEYS = BASE_OPTIONAL_V7_KEYS
const TEXT_OPTIONAL_V8_KEYS = new Set([
  'spans', 'lineHeight', 'letterSpacing', 'italic', 'opacity', 'shadow', 'filter', 'blendMode',
  'stroke', 'strokeWidth',
])
const SHAPE_OPTIONAL_V8_KEYS = SHAPE_OPTIONAL_V7_KEYS
const LINE_OPTIONAL_V8_KEYS = LINE_OPTIONAL_V7_KEYS
const BASE_OPTIONAL_V9_KEYS = BASE_OPTIONAL_V8_KEYS
const TEXT_OPTIONAL_V9_KEYS = new Set([
  'spans', 'lineHeight', 'letterSpacing', 'italic', 'vertical', 'opacity', 'shadow', 'filter',
  'blendMode', 'stroke', 'strokeWidth',
])
const IMAGE_OPTIONAL_V28_KEYS = new Set([...BASE_OPTIONAL_V9_KEYS, 'cornerRadius'])
const IMAGE_OPTIONAL_V29_KEYS = new Set([...IMAGE_OPTIONAL_V28_KEYS, 'stroke', 'strokeWidth'])
const TEXT_OPTIONAL_V17_KEYS = new Set([...TEXT_OPTIONAL_V9_KEYS, 'effect'])
const TEXT_OPTIONAL_V20_KEYS = new Set([...TEXT_OPTIONAL_V17_KEYS, 'verticalAlign', 'paragraphSpacing', 'list'])
const SHAPE_OPTIONAL_V9_KEYS = SHAPE_OPTIONAL_V8_KEYS
const SHAPE_OPTIONAL_V21_KEYS = new Set([...SHAPE_OPTIONAL_V9_KEYS, 'starInnerRatio', 'bubbleTailX'])
const LINE_OPTIONAL_V9_KEYS = LINE_OPTIONAL_V8_KEYS
const LINE_OPTIONAL_V13_KEYS = new Set([...LINE_OPTIONAL_V9_KEYS, 'startCap', 'endCap'])
const LINE_OPTIONAL_V14_KEYS = new Set([...LINE_OPTIONAL_V13_KEYS, 'points'])
const QRCODE_OPTIONAL_V23_KEYS = new Set(['ecl', 'moduleStyle', 'opacity', 'shadow', 'filter', 'blendMode'])
const QRCODE_OPTIONAL_V25_KEYS = new Set([...QRCODE_OPTIONAL_V23_KEYS, 'logoSrc'])
const QRCODE_OPTIONAL_V30_KEYS = new Set([...QRCODE_OPTIONAL_V25_KEYS, 'quietZone'])
const CHART_OPTIONAL_V24_KEYS = new Set(['showValues', 'opacity', 'shadow', 'filter', 'blendMode'])
const CHART_OPTIONAL_V27_KEYS = new Set([...CHART_OPTIONAL_V24_KEYS, 'barMode'])
const CHART_OPTIONAL_V31_KEYS = new Set([...CHART_OPTIONAL_V27_KEYS, 'showLegend'])
const CHART_OPTIONAL_V33_KEYS = new Set([...CHART_OPTIONAL_V31_KEYS, 'showTicks'])
const TABLE_OPTIONAL_V34_KEYS = new Set(['headerRow', 'striped', 'opacity', 'shadow', 'filter', 'blendMode'])
const TABLE_OPTIONAL_V35_KEYS = new Set([...TABLE_OPTIONAL_V34_KEYS, 'ink', 'headerFill', 'stripeFill', 'colWidths'])
const PATH_OPTIONAL_V15_KEYS = new Set([
  'opacity', 'shadow', 'filter', 'blendMode', 'dash', 'cap', 'join', 'fillRule',
])

/** Exact required keys plus an optional-key whitelist (null = exact only). */
function hasKeysWithOptionals(
  value: UnknownRecord,
  required: ReadonlySet<string>,
  optional: ReadonlySet<string> | null,
): boolean {
  const keys = Object.keys(value)
  if (!optional) return hasExactKeys(value, required)
  const requiredSeen = keys.filter((key) => !optional.has(key))
  if (requiredSeen.length !== required.size) return false
  if (!requiredSeen.every((key) => required.has(key))) return false
  return keys.every((key) => required.has(key) || optional.has(key))
}

function optionalKeysFor(
  type: string,
  inputVersion: StrictDocumentVersion,
): ReadonlySet<string> | null {
  if (inputVersion <= 4) return null
  if (inputVersion === 5) return type === 'text' ? TEXT_OPTIONAL_V5_KEYS : null
  if (inputVersion === 6) {
    if (type === 'text') return TEXT_OPTIONAL_V6_KEYS
    if (type === 'shape') return SHAPE_OPTIONAL_V6_KEYS
    if (type === 'image' || type === 'line') return BASE_OPTIONAL_V6_KEYS
    return null
  }
  if (inputVersion === 7) {
    if (type === 'text') return TEXT_OPTIONAL_V7_KEYS
    if (type === 'shape') return SHAPE_OPTIONAL_V7_KEYS
    if (type === 'line') return LINE_OPTIONAL_V7_KEYS
    if (type === 'image') return BASE_OPTIONAL_V7_KEYS
    return null
  }
  if (inputVersion === 8) {
    if (type === 'text') return TEXT_OPTIONAL_V8_KEYS
    if (type === 'shape') return SHAPE_OPTIONAL_V8_KEYS
    if (type === 'line') return LINE_OPTIONAL_V8_KEYS
    if (type === 'image') return BASE_OPTIONAL_V8_KEYS
    return null
  }
  if (type === 'text') {
    if (inputVersion >= 20) return TEXT_OPTIONAL_V20_KEYS
    return inputVersion >= 17 ? TEXT_OPTIONAL_V17_KEYS : TEXT_OPTIONAL_V9_KEYS
  }
  if (type === 'shape') return inputVersion >= 21 ? SHAPE_OPTIONAL_V21_KEYS : SHAPE_OPTIONAL_V9_KEYS
  if (type === 'qrcode') {
    if (inputVersion >= 30) return QRCODE_OPTIONAL_V30_KEYS
    return inputVersion >= 25 ? QRCODE_OPTIONAL_V25_KEYS : QRCODE_OPTIONAL_V23_KEYS
  }
  if (type === 'chart') {
    if (inputVersion >= 33) return CHART_OPTIONAL_V33_KEYS
    if (inputVersion >= 31) return CHART_OPTIONAL_V31_KEYS
    return inputVersion >= 27 ? CHART_OPTIONAL_V27_KEYS : CHART_OPTIONAL_V24_KEYS
  }
  if (type === 'table') return inputVersion >= 35 ? TABLE_OPTIONAL_V35_KEYS : TABLE_OPTIONAL_V34_KEYS
  if (type === 'timeline') return inputVersion >= 37 ? TIMELINE_OPTIONAL_V37_KEYS : TIMELINE_OPTIONAL_V36_KEYS
  if (type === 'line') {
    if (inputVersion >= 14) return LINE_OPTIONAL_V14_KEYS
    if (inputVersion >= 13) return LINE_OPTIONAL_V13_KEYS
    return LINE_OPTIONAL_V9_KEYS
  }
  if (type === 'image') {
    if (inputVersion >= 29) return IMAGE_OPTIONAL_V29_KEYS
    return inputVersion >= 28 ? IMAGE_OPTIONAL_V28_KEYS : BASE_OPTIONAL_V9_KEYS
  }
  if (type === 'path') return PATH_OPTIONAL_V15_KEYS
  return null
}

function hasStrictNodeKeys(
  value: UnknownRecord,
  inputVersion: StrictDocumentVersion,
): boolean {
  if (value.type === 'group') return hasExactKeys(value, GROUP_NODE_KEYS)
  if (value.type === 'text') {
    return hasKeysWithOptionals(value, TEXT_NODE_KEYS, optionalKeysFor('text', inputVersion))
  }
  if (value.type === 'image') {
    return hasKeysWithOptionals(
      value,
      inputVersion >= 4 ? IMAGE_NODE_V4_KEYS : IMAGE_NODE_V3_KEYS,
      optionalKeysFor('image', inputVersion),
    )
      && (inputVersion >= 28 || !('cornerRadius' in value))
      && (inputVersion >= 29 || !('stroke' in value || 'strokeWidth' in value))
  }
  if (value.type === 'shape') {
    return hasKeysWithOptionals(value, SHAPE_NODE_KEYS, optionalKeysFor('shape', inputVersion))
  }
  if (value.type === 'line') {
    return hasKeysWithOptionals(value, LINE_NODE_KEYS, optionalKeysFor('line', inputVersion))
  }
  // Path nodes are v15-only; older input versions reject them.
  if (value.type === 'path') {
    return inputVersion >= 15
      && hasKeysWithOptionals(value, PATH_NODE_KEYS, optionalKeysFor('path', inputVersion))
  }
  // QR code nodes are v22-only; older input versions reject them.
  if (value.type === 'qrcode') {
    return inputVersion >= 22
      && hasKeysWithOptionals(value, QRCODE_NODE_KEYS, optionalKeysFor('qrcode', inputVersion))
      && (inputVersion >= 23 || !('moduleStyle' in value))
      && (inputVersion >= 25 || !('logoSrc' in value))
      && (inputVersion >= 30 || !('quietZone' in value))
  }
  // Chart nodes are v24-only; older input versions reject them.
  if (value.type === 'chart') {
    if (inputVersion < 24) return false
    const required = inputVersion >= 26 ? CHART_NODE_KEYS_V26 : CHART_NODE_KEYS
    return hasKeysWithOptionals(value, required, optionalKeysFor('chart', inputVersion))
      && (inputVersion >= 27 || !('barMode' in value))
      && (inputVersion >= 30 || value.chartKind !== 'radar')
      && (inputVersion >= 31 || !('showLegend' in value))
      && (inputVersion >= 33 || !('showTicks' in value))
  }
  // Table nodes are v34-only; older input versions reject them.
  if (value.type === 'table') {
    if (inputVersion < 34) return false
    return hasKeysWithOptionals(value, TABLE_NODE_KEYS, optionalKeysFor('table', inputVersion))
  }
  // Timeline nodes are v36-only.
  if (value.type === 'timeline') {
    if (inputVersion < 36) return false
    return hasKeysWithOptionals(value, TIMELINE_NODE_KEYS, optionalKeysFor('timeline', inputVersion))
  }
  return false
}

/** Clone the version-gated base appearance fields; null rejects. */
function cloneStrictAppearance(
  value: UnknownRecord,
  inputVersion: StrictDocumentVersion,
): { opacity?: number; shadow?: ShadowPaint; filter?: SceneFilter; blendMode?: BlendMode } | null {
  const out: { opacity?: number; shadow?: ShadowPaint; filter?: SceneFilter; blendMode?: BlendMode } = {}
  if ('opacity' in value) {
    if (!isValidOpacity(value.opacity)) return null
    out.opacity = value.opacity
  }
  if ('shadow' in value) {
    const shadow = cloneShadowPaint(value.shadow)
    if (!shadow) return null
    out.shadow = shadow
  }
  if ('filter' in value) {
    const filter = cloneSceneFilter(value.filter, inputVersion >= 18)
    if (!filter) return null
    out.filter = filter
  }
  if ('blendMode' in value) {
    if (!isValidBlendMode(value.blendMode)) return null
    out.blendMode = value.blendMode
  }
  return inputVersion >= 6 || Object.keys(out).length === 0 ? out : null
}

function normalizeStrictSceneNode(
  value: unknown,
  depth: number,
  ancestorScale: number,
  state: SceneValidationState,
  inputVersion: StrictDocumentVersion,
): FreeformSceneNode | null {
  if (
    !isRecord(value)
    || depth > MAX_SCENE_DEPTH
    || !hasStrictNodeKeys(value, inputVersion)
  ) {
    return null
  }

  const nodeState = normalizeNodeState(value)
  if (!nodeState || state.ids.has(nodeState.id)) return null
  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.rotation) ||
    !isFiniteNumber(value.scale) ||
    value.scale <= 0
  ) {
    return null
  }

  const effectiveScale = ancestorScale * value.scale
  if (
    !Number.isFinite(effectiveScale) ||
    effectiveScale < MIN_EFFECTIVE_SCALE ||
    effectiveScale > MAX_EFFECTIVE_SCALE
  ) {
    return null
  }

  state.ids.add(nodeState.id)
  state.count += 1
  if (state.count > MAX_SCENE_NODES_PER_SLIDE) return null

  if (value.type === 'group') {
    if (!Array.isArray(value.children) || value.children.length === 0) return null
    const children: FreeformSceneNode[] = []
    for (const child of value.children) {
      const normalized = normalizeStrictSceneNode(
        child,
        depth + 1,
        effectiveScale,
        state,
        inputVersion,
      )
      if (!normalized) return null
      children.push(normalized)
    }
    const group: FreeformGroupNode = {
      ...nodeState,
      type: 'group',
      x: value.x,
      y: value.y,
      rotation: value.rotation,
      scale: value.scale,
      children,
    }
    return group
  }

  if (
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    return null
  }

  const geometry = {
    ...nodeState,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
    scale: value.scale,
  }

  if (value.type === 'text') {
    const textFill = cloneStrictColorPaint(value.textFill, inputVersion)
    if (
      typeof value.text !== 'string' ||
      !isFiniteNumber(value.fontSize) ||
      typeof value.fontFamily !== 'string' ||
      !textFill ||
      (value.align !== 'left' && value.align !== 'center' && value.align !== 'right'
        && !(value.align === 'justify' && inputVersion >= 20)) ||
      (value.fontWeight !== 'normal' && value.fontWeight !== 'bold')
    ) {
      return null
    }
    // Version-gated optional keys (rejected by the key check on older
    // versions); spans must be canonical and non-empty when present.
    let spans: RichTextSpan[] | undefined
    if ('spans' in value) {
      const normalized = normalizeRichTextSpans(value.spans, value.text.length)
      if (!normalized || normalized.length === 0) return null
      // Highlighted and underlined spans are v16-only; struck and sized ones v20-only.
      if (inputVersion < 16 && usesV16SpanStyles(normalized)) return null
      if (inputVersion < 20 && usesV20SpanStyles(normalized)) return null
      spans = normalized
    }
    if (inputVersion >= 6) {
      if ('lineHeight' in value && !isValidLineHeight(value.lineHeight)) return null
      if ('letterSpacing' in value && !isValidLetterSpacing(value.letterSpacing)) return null
      if ('italic' in value && value.italic !== true) return null
    }
    if (inputVersion >= 8) {
      if ('stroke' in value && !isHexColor(value.stroke)) return null
      if ('strokeWidth' in value && !isValidTextStrokeWidth(value.strokeWidth)) return null
    }
    if (inputVersion >= 9) {
      if ('vertical' in value && value.vertical !== true) return null
    }
    if ('effect' in value && !isValidTextEffect(value.effect)) return null
    // (The key check keeps these to v20 input.)
    if ('verticalAlign' in value && !isTextVerticalAlign(value.verticalAlign)) return null
    if ('paragraphSpacing' in value && !isValidParagraphSpacing(value.paragraphSpacing)) return null
    if ('list' in value && !isTextList(value.list)) return null
    const appearance = cloneStrictAppearance(value, inputVersion)
    if (!appearance) return null
    return {
      ...geometry,
      type: 'text',
      text: value.text,
      ...(spans ? { spans } : {}),
      fontSize: value.fontSize,
      fontFamily: value.fontFamily,
      textFill,
      align: value.align,
      fontWeight: value.fontWeight,
      ...('lineHeight' in value ? { lineHeight: value.lineHeight as number } : {}),
      ...('letterSpacing' in value ? { letterSpacing: value.letterSpacing as number } : {}),
      ...('italic' in value ? { italic: true as const } : {}),
      ...('vertical' in value ? { vertical: true as const } : {}),
      ...('stroke' in value ? { stroke: value.stroke as string } : {}),
      ...('strokeWidth' in value ? { strokeWidth: value.strokeWidth as number } : {}),
      ...('effect' in value ? { effect: { ...(value.effect as TextEffect) } } : {}),
      ...('verticalAlign' in value ? { verticalAlign: value.verticalAlign as TextVerticalAlign } : {}),
      ...('paragraphSpacing' in value ? { paragraphSpacing: value.paragraphSpacing as number } : {}),
      ...('list' in value ? { list: value.list as TextList } : {}),
      ...appearance,
    }
  }

  if (value.type === 'image') {
    if (
      typeof value.src !== 'string'
      || typeof value.alt !== 'string'
      || !isFit(value.fit)
      || (inputVersion >= 4 && !isValidImageFraming(value.framing))
    ) {
      return null
    }
    // Image corner radius is v28-only; older input versions reject it.
    if (inputVersion >= 28 && 'cornerRadius' in value && !isValidCornerRadius(value.cornerRadius)) {
      return null
    }
    // The image frame (stroke colour + width) is v29-only.
    if (inputVersion >= 29) {
      if ('stroke' in value && !isHexColor(value.stroke)) return null
      if ('strokeWidth' in value && !isValidTextStrokeWidth(value.strokeWidth)) return null
    }
    const imageAppearance = cloneStrictAppearance(value, inputVersion)
    if (!imageAppearance) return null
    return {
      ...geometry,
      type: 'image',
      src: value.src,
      alt: value.alt,
      fit: value.fit,
      framing: inputVersion >= 4
        ? cloneImageFraming(value.framing as ImageFraming)
        : createDefaultImageFraming(),
      ...('cornerRadius' in value ? { cornerRadius: value.cornerRadius as number } : {}),
      ...('stroke' in value ? { stroke: value.stroke as string } : {}),
      ...('strokeWidth' in value ? { strokeWidth: value.strokeWidth as number } : {}),
      ...imageAppearance,
    }
  }

  if (value.type === 'shape') {
    const fill = cloneStrictShapeFill(value.fill, inputVersion)
    if (
      !isValidShape(value.shape) ||
      (inputVersion < 7 && isV7Shape(value.shape)) ||
      (inputVersion < 21 && isV21Shape(value.shape)) ||
      !fill ||
      typeof value.stroke !== 'string' ||
      !isFiniteNumber(value.strokeWidth)
    ) {
      return null
    }
    if (inputVersion >= 6 && 'cornerRadius' in value && !isValidCornerRadius(value.cornerRadius)) {
      return null
    }
    // Parametric shape fields are v21-only; older input versions reject them.
    if (inputVersion >= 21) {
      if ('starInnerRatio' in value && !isValidStarInnerRatio(value.starInnerRatio)) return null
      if ('bubbleTailX' in value && !isValidBubbleTailX(value.bubbleTailX)) return null
    } else if ('starInnerRatio' in value || 'bubbleTailX' in value) {
      return null
    }
    const shapeAppearance = cloneStrictAppearance(value, inputVersion)
    if (!shapeAppearance) return null
    return {
      ...geometry,
      type: 'shape',
      shape: value.shape,
      fill,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
      ...('cornerRadius' in value ? { cornerRadius: value.cornerRadius as number } : {}),
      ...('starInnerRatio' in value ? { starInnerRatio: value.starInnerRatio as number } : {}),
      ...('bubbleTailX' in value ? { bubbleTailX: value.bubbleTailX as number } : {}),
      ...shapeAppearance,
    }
  }

  if (value.type === 'line') {
    if (
      (value.lineKind !== 'line' && value.lineKind !== 'arrow') ||
      typeof value.stroke !== 'string' ||
      !isFiniteNumber(value.strokeWidth)
    ) {
      return null
    }
    if (inputVersion >= 7) {
      if ('dash' in value && !isValidDash(value.dash)) return null
      if ('cap' in value && !isValidLineCap(value.cap)) return null
    }
    // Endpoint decorations are v13-only; older input versions reject them.
    if (inputVersion >= 13) {
      if ('startCap' in value && !isValidLineEndpointCap(value.startCap)) return null
      if ('endCap' in value && !isValidLineEndpointCap(value.endCap)) return null
    }
    // Polyline vertices are v14-only; older input versions reject them.
    let points: LinePoint[] | undefined
    if (inputVersion >= 14 && 'points' in value) {
      const cloned = cloneLinePoints(value.points, geometry.width, geometry.height)
      if (!cloned) return null
      points = cloned
    }
    const lineAppearance = cloneStrictAppearance(value, inputVersion)
    if (!lineAppearance) return null
    return {
      ...geometry,
      type: 'line',
      lineKind: value.lineKind,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
      ...('dash' in value ? { dash: value.dash as number } : {}),
      ...('cap' in value ? { cap: value.cap as 'round' | 'butt' | 'square' } : {}),
      ...('startCap' in value ? { startCap: value.startCap as LineEndpointCap } : {}),
      ...('endCap' in value ? { endCap: value.endCap as LineEndpointCap } : {}),
      ...(points ? { points } : {}),
      ...lineAppearance,
    }
  }

  if (value.type === 'path') {
    const viewBox = clonePathViewBox(value.viewBox)
    const fill = cloneStrictPathFill(value.fill, inputVersion)
    if (
      !isValidPathData(value.d) ||
      !viewBox ||
      !fill ||
      !isHexColor(value.stroke) ||
      !isValidPathStrokeWidth(value.strokeWidth)
    ) {
      return null
    }
    if ('dash' in value && !isValidPathDash(value.dash)) return null
    if ('cap' in value && !isValidLineCap(value.cap)) return null
    if ('join' in value && !isValidLineJoin(value.join)) return null
    if ('fillRule' in value && !isValidFillRule(value.fillRule)) return null
    const pathAppearance = cloneStrictAppearance(value, inputVersion)
    if (!pathAppearance) return null
    return {
      ...geometry,
      type: 'path',
      d: value.d,
      viewBox,
      fill,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
      ...('dash' in value ? { dash: value.dash as number } : {}),
      ...('cap' in value ? { cap: value.cap as 'round' | 'butt' | 'square' } : {}),
      ...('join' in value ? { join: value.join as 'round' | 'miter' | 'bevel' } : {}),
      ...('fillRule' in value ? { fillRule: value.fillRule as 'nonzero' | 'evenodd' } : {}),
      ...pathAppearance,
    }
  }

  if (value.type === 'chart') {
    if (inputVersion >= 26) {
      if (!isValidChartKind(value.chartKind) || !Array.isArray(value.labels)) return null
      // The radar kind is v30-only; older input versions reject it.
      if (inputVersion < 30 && value.chartKind === 'radar') return null
      const labels = value.labels as unknown[]
      if (!labels.every(isValidChartLabel) || labels.length === 0 || labels.length > CHART_POINTS_MAX) return null
      if (!isValidChartSeriesList(value.series, labels.length)) return null
      // Bar stacking is v27-only; older input versions reject it.
      if ('barMode' in value) {
        if (inputVersion < 27 || !isValidChartBarMode(value.barMode)) return null
      }
      // The legend switch is v31-only; older input versions reject it.
      if ('showLegend' in value) {
        if (inputVersion < 31 || typeof value.showLegend !== 'boolean') return null
      }
      // The axis-tick switch is v33-only; older input versions reject it.
      if ('showTicks' in value) {
        if (inputVersion < 33 || typeof value.showTicks !== 'boolean') return null
      }
      const chartAppearance = cloneStrictAppearance(value, inputVersion)
      if (!chartAppearance) return null
      return {
        ...geometry,
        type: 'chart',
        chartKind: value.chartKind,
        labels: labels.map((label) => label as string),
        series: (value.series as FreeformChartSeries[]).map((entry) => ({
          values: [...entry.values],
          color: entry.color,
          ...('name' in entry ? { name: entry.name } : {}),
        })),
        ...('showValues' in value ? { showValues: true } : {}),
        ...('barMode' in value ? { barMode: value.barMode as ChartBarMode } : {}),
        ...('showLegend' in value ? { showLegend: value.showLegend as boolean } : {}),
        ...('showTicks' in value ? { showTicks: value.showTicks as boolean } : {}),
        ...chartAppearance,
      }
    }
    // v24–v25 carried one series on the element itself; it moves onto a
    // single coloured series entry.
    if (
      !isValidChartKind(value.chartKind) ||
      !isValidChartSeries(value.labels, value.values) ||
      !isHexColor(value.accent)
    ) {
      return null
    }
    const chartAppearance = cloneStrictAppearance(value, inputVersion)
    if (!chartAppearance) return null
    return {
      ...geometry,
      type: 'chart',
      chartKind: value.chartKind,
      labels: (value.labels as string[]).map((label) => label),
      series: [{ values: (value.values as number[]).map((value_) => value_), color: value.accent }],
      ...('showValues' in value ? { showValues: true } : {}),
      ...chartAppearance,
    }
  }

  if (value.type === 'qrcode') {
    if (!isValidQrPayload(value.payload) || !isHexColor(value.dark) || !isHexColor(value.light)) {
      return null
    }
    if ('ecl' in value && !isValidQrEcl(value.ecl)) return null
    // Module styles are v23-only; older input versions reject them.
    if ('moduleStyle' in value) {
      if (inputVersion < 23 || !isValidQrModuleStyle(value.moduleStyle)) return null
    }
    // A centred logo is v25-only; older input versions reject it.
    if ('logoSrc' in value) {
      if (inputVersion < 25 || !isValidQrLogoSrc(value.logoSrc)) return null
    }
    // The quiet zone is v30-only; older input versions reject it.
    if ('quietZone' in value) {
      if (inputVersion < 30 || !isValidQrQuietZone(value.quietZone)) return null
    }
    const qrAppearance = cloneStrictAppearance(value, inputVersion)
    if (!qrAppearance) return null
    return {
      ...geometry,
      type: 'qrcode',
      payload: value.payload,
      dark: value.dark,
      light: value.light,
      ...('ecl' in value ? { ecl: value.ecl as QrErrorCorrectionLevel } : {}),
      ...('moduleStyle' in value ? { moduleStyle: value.moduleStyle as QrModuleStyle } : {}),
      ...('logoSrc' in value ? { logoSrc: value.logoSrc as string } : {}),
      ...('quietZone' in value ? { quietZone: value.quietZone as number } : {}),
      ...qrAppearance,
    }
  }

  // Table nodes are v34-only: rows × cols of short cell texts, an optional
  // bold header row, optional zebra stripes, and v35 color overrides.
  if (value.type === 'table') {
    if (inputVersion < 34) return null
    if (!isValidTableRows(value.rows) || !isValidTableCols(value.cols)) return null
    if (!Array.isArray(value.cells) || !value.cells.every(isValidTableCellText)) return null
    if (value.cells.length !== value.rows * value.cols) return null
    if ('headerRow' in value && typeof value.headerRow !== 'boolean') return null
    if ('striped' in value && typeof value.striped !== 'boolean') return null
    // The color overrides are v35-only; older input versions reject them.
    if ('ink' in value && (inputVersion < 35 || !isHexColor(value.ink))) return null
    if ('headerFill' in value && (inputVersion < 35 || !isHexColor(value.headerFill))) return null
    if ('stripeFill' in value && (inputVersion < 35 || !isHexColor(value.stripeFill))) return null
    // Column weights are v35-only too, one positive weight per column.
    if ('colWidths' in value && (inputVersion < 35 || !isValidTableColWidths(value.colWidths, value.cols))) return null
    const tableAppearance = cloneStrictAppearance(value, inputVersion)
    if (!tableAppearance) return null
    return {
      ...geometry,
      type: 'table',
      rows: value.rows,
      cols: value.cols,
      cells: (value.cells as string[]).map((cell) => cell),
      ...('headerRow' in value ? { headerRow: value.headerRow as boolean } : {}),
      ...('striped' in value ? { striped: value.striped as boolean } : {}),
      ...('ink' in value ? { ink: value.ink as string } : {}),
      ...('headerFill' in value ? { headerFill: value.headerFill as string } : {}),
      ...('stripeFill' in value ? { stripeFill: value.stripeFill as string } : {}),
      ...('colWidths' in value ? { colWidths: (value.colWidths as number[]).map((weight) => weight) } : {}),
      ...tableAppearance,
    }
  }

  // Timeline nodes are v36-only: 2–8 labelled entries on a spine, with an
  // optional accent colour; v37 adds the horizontal layout and the text ink.
  if (value.type === 'timeline') {
    if (inputVersion < 36) return null
    if (!isValidTimelineItems(value.items)) return null
    if ('accent' in value && !isHexColor(value.accent)) return null
    if (inputVersion >= 37) {
      if ('horizontal' in value && typeof value.horizontal !== 'boolean') return null
      if ('ink' in value && !isHexColor(value.ink)) return null
    }
    const timelineAppearance = cloneStrictAppearance(value, inputVersion)
    if (!timelineAppearance) return null
    return {
      ...geometry,
      type: 'timeline',
      items: (value.items as TimelineItem[]).map((item) => ({
        text: item.text,
        ...('label' in item ? { label: item.label } : {}),
      })),
      ...('accent' in value ? { accent: value.accent as string } : {}),
      ...(inputVersion >= 37 && 'horizontal' in value ? { horizontal: value.horizontal as boolean } : {}),
      ...(inputVersion >= 37 && 'ink' in value ? { ink: value.ink as string } : {}),
      ...timelineAppearance,
    }
  }

  return null
}

function normalizeStrictSlide(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): FreeformSlide | null {
  if (
    !isRecord(value) ||
    !(inputVersion >= 10
      ? hasKeysWithOptionals(value, SLIDE_KEYS, SLIDE_GUIDE_OPTIONAL_KEYS)
      : hasExactKeys(value, SLIDE_KEYS)) ||
    !isNonBlankString(value.id) ||
    typeof value.name !== 'string' ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    !validatePageSize(value.width, value.height).ok ||
    !Array.isArray(value.nodes)
  ) {
    return null
  }
  // Guides are a v10-only optional key on pages.
  let guides: FreeformGuide[] | null = []
  if ('guides' in value) {
    if (inputVersion < 10) return null
    guides = normalizeSlideGuides(value.guides, value.width, value.height)
    if (!guides) return null
  }

  const background = cloneStrictSlideBackground(value.background, inputVersion)
  if (!background) return null

  const state: SceneValidationState = { ids: new Set(), count: 0 }
  const nodes: FreeformSceneNode[] = []
  for (const node of value.nodes) {
    const normalized = normalizeStrictSceneNode(node, 1, 1, state, inputVersion)
    if (!normalized) return null
    nodes.push(normalized)
  }

  return {
    id: value.id,
    name: value.name,
    width: value.width,
    height: value.height,
    background,
    nodes,
    ...(guides && guides.length > 0 ? { guides } : {}),
  }
}

function normalizeStrictDocument(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): FreeformDocument | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, DOCUMENT_KEYS) ||
    value.documentVersion !== inputVersion ||
    !Array.isArray(value.slides) ||
    value.slides.length === 0 ||
    value.slides.length > MAX_FREEFORM_SLIDES ||
    typeof value.activeSlideId !== 'string'
  ) {
    return null
  }

  const slides: FreeformSlide[] = []
  const slideIds = new Set<string>()
  for (const rawSlide of value.slides) {
    const slide = normalizeStrictSlide(rawSlide, inputVersion)
    if (!slide || slideIds.has(slide.id)) return null
    slideIds.add(slide.id)
    slides.push(slide)
  }

  if (!slideIds.has(value.activeSlideId)) return null
  return {
    documentVersion: 37,
    slides,
    activeSlideId: value.activeSlideId,
  }
}

/** Strictly validates a historical v3 document and migrates it to current data. */
export function migrateFreeformDocumentV3ToV9(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 3)
}

/** Strictly validates an already-v4 document (v4 text can never carry spans). */
export function normalizeFreeformDocumentV4(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 4)
}

/** Strictly validates an already-v5 document (v5 leaves can never carry appearance fields). */
export function normalizeFreeformDocumentV5(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 5)
}

/** Strictly validates an already-v6 document (v6 leaves can never carry v7 fields). */
export function normalizeFreeformDocumentV6(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 6)
}

/** Strictly validates an already-v7 document (v7 leaves can never carry v8 fields). */
export function normalizeFreeformDocumentV7(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 7)
}

/** Strictly validates and clones an already-v8 document (v8 text can never be vertical). */
export function normalizeFreeformDocumentV8(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 8)
}

/** Strictly validates and clones an already-v9 document (v9 pages can never carry guides). */
export function normalizeFreeformDocumentV9(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 9)
}

/** Strictly validates and clones an already-v10 document. */
export function normalizeFreeformDocumentV10(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 10)
}

/** Strictly validates and clones an already-v11 document. */
export function normalizeFreeformDocumentV11(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 11)
}

/** Strictly validates and clones an already-v12 document. */
export function normalizeFreeformDocumentV12(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 12)
}

/** Strictly validates and clones an already-v13 document. */
export function normalizeFreeformDocumentV13(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 13)
}

/** Strictly validates and clones an already-v14 document. */
export function normalizeFreeformDocumentV14(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 14)
}

/** Strictly validates and clones an already-v15 document. */
export function normalizeFreeformDocumentV15(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 15)
}

/** Strictly validates and clones an already-v16 document. */
export function normalizeFreeformDocumentV16(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 16)
}

/** Strictly validates and clones an already-v17 document. */
export function normalizeFreeformDocumentV17(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 17)
}

/** Strictly validates and clones an already-v18 document. */
export function normalizeFreeformDocumentV18(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 18)
}

/** Strictly validates and clones an already-v19 document. */
export function normalizeFreeformDocumentV19(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 19)
}

/** Strictly validates and clones an already-v20 document. */
export function normalizeFreeformDocumentV20(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 20)
}

/** Strictly validates and clones an already-v21 document (the current version). */
export function normalizeFreeformDocumentV21(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 21)
}

/** Strictly validates an already-v22 document (v22 adds the qrcode element). */
export function normalizeFreeformDocumentV22(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 22)
}

/** Strictly validates an already-v23 document (v23 adds QR module styles). */
export function normalizeFreeformDocumentV23(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 23)
}

/** Strictly validates an already-v24 document (v24 adds the chart element). */
export function normalizeFreeformDocumentV24(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 24)
}

/** Strictly validates an already-v25 document (v25 adds QR code logos). */
export function normalizeFreeformDocumentV25(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 25)
}

/** Strictly validates an already-v26 document (v26 moves charts onto series). */
export function normalizeFreeformDocumentV26(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 26)
}

/** Strictly validates an already-v27 document (v27 adds bar stacking modes). */
export function normalizeFreeformDocumentV27(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 27)
}

/** Strictly validates an already-v28 document (v28 adds image corner radius). */
export function normalizeFreeformDocumentV28(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 28)
}

/** Strictly validates an already-v29 document (v29 adds the image frame). */
export function normalizeFreeformDocumentV29(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 29)
}

/** Strictly validates an already-v30 document (v30 adds the radar chart). */
export function normalizeFreeformDocumentV30(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 30)
}

/** Strictly validates an already-v31 document (v31 adds the chart legend switch). */
export function normalizeFreeformDocumentV31(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 31)
}

/** Strictly validates an already-v32 document (v32 adds the patterned page). */
export function normalizeFreeformDocumentV32(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 32)
}

/** Strictly validates an already-v33 document (v33 adds the axis-tick switch). */
export function normalizeFreeformDocumentV33(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 33)
}

/** Strictly validates an already-v34 document (v34 adds the table element). */
export function normalizeFreeformDocumentV34(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 34)
}

/** Strictly validates an already-v35 document (v35 adds the table colours and column widths). */
export function normalizeFreeformDocumentV35(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 35)
}

/** Strictly validates an already-v36 document (v36 adds the timeline element). */
export function normalizeFreeformDocumentV36(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 36)
}

/** Strictly validates an already-v37 document (v37 adds the horizontal timeline and its ink). */
export function normalizeFreeformDocumentV37(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 37)
}

function cloneLegacyBackground(value: unknown): SlideBackground {
  if (isRecord(value) && value.type === 'transparent') return { type: 'transparent' }
  const paint = normalizeColorPaint(value, DEFAULT_PAGE_PAINT)
  return { ...paint }
}

function cloneLegacyShapeFill(value: unknown): ShapeFill {
  if (
    isRecord(value) &&
    value.type === 'image' &&
    typeof value.src === 'string' &&
    isFit(value.fit)
  ) {
    return {
      type: 'image',
      src: value.src,
      fit: value.fit,
      framing: createDefaultImageFraming(),
    }
  }
  const paint = normalizeColorPaint(value, DEFAULT_SHAPE_PAINT)
  return { ...paint }
}

function cloneLegacyTextFill(value: UnknownRecord): ColorPaint {
  const candidate = isRecord(value.textFill)
    ? value.textFill
    : typeof value.color === 'string'
      ? { type: 'solid', color: value.color }
      : undefined
  const paint = normalizeColorPaint(candidate, DEFAULT_TEXT_PAINT)
  return { ...paint }
}

function defaultLegacyNodeName(value: UnknownRecord): string {
  if (value.type === 'text') return '文本'
  if (value.type === 'image') return '图片'
  if (value.type === 'shape') return '形状'
  return value.lineKind === 'arrow' ? '箭头' : '直线'
}

function normalizeLegacyElement(value: unknown): FreeformSceneLeaf | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    !isFiniteNumber(value.rotation)
  ) {
    return null
  }

  const state = {
    id: value.id,
    name: defaultLegacyNodeName(value),
    locked: false,
    hidden: false,
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
    scale: 1,
  }

  if (value.type === 'text') {
    if (
      typeof value.text !== 'string' ||
      !isFiniteNumber(value.fontSize) ||
      typeof value.fontFamily !== 'string'
    ) {
      return null
    }
    return {
      ...state,
      type: 'text',
      text: value.text,
      fontSize: value.fontSize,
      fontFamily: value.fontFamily,
      textFill: cloneLegacyTextFill(value),
      align: value.align === 'center' || value.align === 'right' ? value.align : 'left',
      fontWeight: value.fontWeight === 'bold' ? 'bold' : 'normal',
    }
  }

  if (value.type === 'image') {
    if (typeof value.src !== 'string') return null
    return {
      ...state,
      type: 'image',
      src: value.src,
      alt: typeof value.alt === 'string' ? value.alt : 'Image',
      fit: isFit(value.fit) ? value.fit : 'cover',
      framing: createDefaultImageFraming(),
    }
  }

  if (value.type === 'shape') {
    if (
      (value.shape !== 'rect' && value.shape !== 'ellipse' && value.shape !== 'triangle') ||
      typeof value.stroke !== 'string' ||
      !isFiniteNumber(value.strokeWidth)
    ) {
      return null
    }
    return {
      ...state,
      type: 'shape',
      shape: value.shape,
      fill: cloneLegacyShapeFill(value.fill),
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
    }
  }

  if (value.type === 'line') {
    if (
      (value.lineKind !== 'line' && value.lineKind !== 'arrow') ||
      typeof value.stroke !== 'string' ||
      !isFiniteNumber(value.strokeWidth)
    ) {
      return null
    }
    return {
      ...state,
      type: 'line',
      lineKind: value.lineKind,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
    }
  }

  return null
}

function deterministicId(
  sourceId: string,
  fallbackBase: string,
  used: Set<string>,
  reservedSourceIds: ReadonlySet<string>,
): string {
  if (sourceId.trim().length > 0 && !used.has(sourceId)) {
    used.add(sourceId)
    return sourceId
  }

  let candidate = fallbackBase
  let suffix = 1
  while (used.has(candidate) || reservedSourceIds.has(candidate)) {
    candidate = `${fallbackBase}-${suffix}`
    suffix += 1
  }
  used.add(candidate)
  return candidate
}

function migrateLegacySlide(value: unknown, sourceIndex: number): MigratedSlideCandidate | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    !validatePageSize(value.width, value.height).ok ||
    !Array.isArray(value.elements)
  ) {
    return null
  }

  const candidates = value.elements
    .map((element, nodeIndex) => ({ nodeIndex, node: normalizeLegacyElement(element) }))
    .filter(
      (candidate): candidate is { nodeIndex: number; node: FreeformSceneLeaf } =>
        candidate.node !== null,
    )
  const reservedSourceIds = new Set(
    candidates
      .map(({ node }) => node.id)
      .filter((id) => id.trim().length > 0),
  )
  const used = new Set<string>()
  const nodes = candidates.map(({ nodeIndex, node }) => ({
    ...node,
    id: deterministicId(
      node.id,
      `legacy-node-${sourceIndex}-${nodeIndex}`,
      used,
      reservedSourceIds,
    ),
  }))

  return {
    sourceId: value.id,
    sourceIndex,
    slide: {
      name: value.name,
      width: value.width,
      height: value.height,
      background: cloneLegacyBackground(value.background),
      nodes,
    },
  }
}

/**
 * Tolerantly migrates a v1/v2 flat document, then passes the complete result
 * through the strict v9 validator before returning it.
 */
export function migrateLegacyFreeformDocumentToV9(value: unknown): FreeformDocument | null {
  if (
    !isRecord(value) ||
    (value.documentVersion !== 1 && value.documentVersion !== 2) ||
    !Array.isArray(value.slides) ||
    value.slides.length === 0 ||
    value.slides.length > MAX_FREEFORM_SLIDES ||
    typeof value.activeSlideId !== 'string'
  ) {
    return null
  }

  for (const rawSlide of value.slides) {
    if (
      isRecord(rawSlide) &&
      Array.isArray(rawSlide.elements) &&
      rawSlide.elements.length > MAX_SCENE_NODES_PER_SLIDE
    ) {
      return null
    }
  }

  const candidates = value.slides
    .map((slide, index) => migrateLegacySlide(slide, index))
    .filter((slide): slide is MigratedSlideCandidate => slide !== null)
  if (candidates.length === 0) return null

  const reservedSourceIds = new Set(
    candidates
      .map(({ sourceId }) => sourceId)
      .filter((id) => id.trim().length > 0),
  )
  const used = new Set<string>()
  const slides = candidates.map(({ sourceId, sourceIndex, slide }) => ({
    ...slide,
    id: deterministicId(
      sourceId,
      `legacy-slide-${sourceIndex}`,
      used,
      reservedSourceIds,
    ),
  }))
  const activeIndex = candidates.findIndex(({ sourceId }) => sourceId === value.activeSlideId)
  // A v9-shaped input handed to the strict reader, which upgrades it to current.
  const candidate = {
    documentVersion: 9,
    slides,
    activeSlideId: slides[activeIndex >= 0 ? activeIndex : 0].id,
  }
  return normalizeFreeformDocumentV9(candidate)
}

/** Normalize any supported freeform document version to a fresh v21 object. */
export function normalizeFreeformDocument(value: unknown): FreeformDocument | null {
  if (!isRecord(value)) return null
  if (value.documentVersion === 37) return normalizeFreeformDocumentV37(value)
  if (value.documentVersion === 36) return normalizeFreeformDocumentV36(value)
  if (value.documentVersion === 35) return normalizeFreeformDocumentV35(value)
  if (value.documentVersion === 34) return normalizeFreeformDocumentV34(value)
  if (value.documentVersion === 33) return normalizeFreeformDocumentV33(value)
  if (value.documentVersion === 32) return normalizeFreeformDocumentV32(value)
  if (value.documentVersion === 31) return normalizeFreeformDocumentV31(value)
  if (value.documentVersion === 30) return normalizeFreeformDocumentV30(value)
  if (value.documentVersion === 29) return normalizeFreeformDocumentV29(value)
  if (value.documentVersion === 28) return normalizeFreeformDocumentV28(value)
  if (value.documentVersion === 27) return normalizeFreeformDocumentV27(value)
  if (value.documentVersion === 26) return normalizeFreeformDocumentV26(value)
  if (value.documentVersion === 25) return normalizeFreeformDocumentV25(value)
  if (value.documentVersion === 24) return normalizeFreeformDocumentV24(value)
  if (value.documentVersion === 23) return normalizeFreeformDocumentV23(value)
  if (value.documentVersion === 22) return normalizeFreeformDocumentV22(value)
  if (value.documentVersion === 21) return normalizeFreeformDocumentV21(value)
  if (value.documentVersion === 20) return normalizeFreeformDocumentV20(value)
  if (value.documentVersion === 19) return normalizeFreeformDocumentV19(value)
  if (value.documentVersion === 18) return normalizeFreeformDocumentV18(value)
  if (value.documentVersion === 17) return normalizeFreeformDocumentV17(value)
  if (value.documentVersion === 16) return normalizeFreeformDocumentV16(value)
  if (value.documentVersion === 15) return normalizeFreeformDocumentV15(value)
  if (value.documentVersion === 14) return normalizeFreeformDocumentV14(value)
  if (value.documentVersion === 13) return normalizeFreeformDocumentV13(value)
  if (value.documentVersion === 12) return normalizeFreeformDocumentV12(value)
  if (value.documentVersion === 11) return normalizeFreeformDocumentV11(value)
  if (value.documentVersion === 10) return normalizeFreeformDocumentV10(value)
  if (value.documentVersion === 9) return normalizeFreeformDocumentV9(value)
  if (value.documentVersion === 8) return normalizeFreeformDocumentV8(value)
  if (value.documentVersion === 7) return normalizeFreeformDocumentV7(value)
  if (value.documentVersion === 6) return normalizeFreeformDocumentV6(value)
  if (value.documentVersion === 5) return normalizeFreeformDocumentV5(value)
  if (value.documentVersion === 4) return normalizeFreeformDocumentV4(value)
  if (value.documentVersion === 3) return migrateFreeformDocumentV3ToV9(value)
  if (value.documentVersion === 1 || value.documentVersion === 2) {
    return migrateLegacyFreeformDocumentToV9(value)
  }
  return null
}

function copySlideBackgroundValue(background: SlideBackground): SlideBackground {
  if (background.type === 'transparent') return { type: 'transparent' }
  if (background.type === 'image') {
    return {
      type: 'image',
      src: background.src,
      fit: background.fit,
      framing: cloneImageFraming(background.framing),
    }
  }
  if (background.type === 'solid') return { type: 'solid', color: background.color }
  if (background.type === 'pattern') {
    return {
      type: 'pattern',
      color: background.color,
      patternColor: background.patternColor,
      pattern: background.pattern,
      size: background.size,
    }
  }
  if (background.type === 'radial-gradient') {
    return { type: 'radial-gradient', stops: background.stops.map((stop) => ({ ...stop })) }
  }
  if ('stops' in background) {
    return {
      type: 'linear-gradient',
      stops: background.stops.map((stop) => ({ ...stop })),
      angle: background.angle,
    }
  }
  return {
    type: 'linear-gradient',
    from: background.from,
    to: background.to,
    angle: background.angle,
  }
}

/** Map all current leaves into a fresh document without changing page structure. */
export function mapFreeformDocumentLeaves(
  document: FreeformDocument,
  mapper: SceneLeafMapper,
): FreeformDocument {
  return {
    documentVersion: 37,
    activeSlideId: document.activeSlideId,
    slides: document.slides.map((slide) => ({
      id: slide.id,
      name: slide.name,
      width: slide.width,
      height: slide.height,
      background: copySlideBackgroundValue(slide.background),
      nodes: mapSceneLeaves(slide.nodes, mapper),
      ...(slide.guides ? { guides: cloneGuides(slide.guides) } : {}),
    })),
  }
}

/**
 * Async leaf mapping. Work happens only on owned clones, so a rejection
 * leaves the source untouched and no partially mapped document is returned.
 */
export async function mapFreeformDocumentLeavesAsync(
  document: FreeformDocument,
  mapper: AsyncSceneLeafMapper,
): Promise<FreeformDocument> {
  const slides = await Promise.all(document.slides.map(async (slide) => ({
    id: slide.id,
    name: slide.name,
    width: slide.width,
    height: slide.height,
    background: copySlideBackgroundValue(slide.background),
    nodes: await mapSceneLeavesAsync(slide.nodes, mapper),
    ...(slide.guides ? { guides: cloneGuides(slide.guides) } : {}),
  })))

  return {
    documentVersion: 37,
    activeSlideId: document.activeSlideId,
    slides,
  }
}
