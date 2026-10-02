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
import { normalizeRichTextSpans, remapRichTextSpans } from './richText'
import {
  clonePathViewBox,
  cloneSceneFilter,
  cloneShadowPaint,
  gradientStopsEquals,
  isValidBlendMode,
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
  isValidTextStrokeWidth,
  pathViewBoxEquals,
  sceneFilterEquals,
  shadowPaintEquals,
} from './appearance'
import { isValidPathData } from './pathData'
import { isValidTextEffect, textEffectsEqual } from './textEffects'
import { restyleDocument } from './restyle'
import type {
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
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformSlide,
  FreeformTextElement,
  ImageFraming,
  LinePoint,
  PathFill,
  PathViewBox,
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
    id: crypto.randomUUID(),
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
    documentVersion: 17,
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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
  return fill.type === 'transparent' ? { type: 'transparent' } : cloneColorPaint(fill)
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
  return cloneColorPaint(background)
}

const IMAGE_BACKGROUND_KEYS = new Set(['type', 'src', 'fit', 'framing'])

function validSlideBackground(value: unknown): value is SlideBackground {
  if (isRecord(value) && value.type === 'transparent') {
    return hasExactKeys(value, new Set(['type']))
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
}

const CONTENT_KEYS = new Set(['text', 'src', 'alt', 'd', 'viewBox'])
const STYLE_KEYS = new Set([
  'effect',
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
  'cornerRadius',
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
const GEOMETRY_KEYS = new Set(['x', 'y', 'width', 'height', 'rotation', 'scale'])
const IMAGE_CROP_ACTION_KEYS = new Set(['type', 'slideId', 'path', 'patch'])
const IMAGE_CROP_PATCH_KEYS = new Set(['x', 'y', 'width', 'height', 'framing'])

const TEXT_APPEARANCE_KEYS = new Set([
  'lineHeight', 'letterSpacing', 'italic', 'vertical', 'opacity', 'shadow', 'filter', 'blendMode',
  'stroke', 'strokeWidth', 'effect',
])
const SHAPE_APPEARANCE_KEYS = new Set(['cornerRadius', 'opacity', 'shadow', 'filter', 'blendMode'])
const BASE_APPEARANCE_KEYS = new Set(['opacity', 'shadow', 'filter', 'blendMode'])
const LINE_APPEARANCE_KEYS = new Set([
  'opacity', 'shadow', 'filter', 'blendMode', 'dash', 'cap', 'startCap', 'endCap',
])
// A path's dash is checked on its own: viewBox units allow dashes under 1.
const PATH_APPEARANCE_KEYS = new Set([
  'opacity', 'shadow', 'filter', 'blendMode', 'cap', 'join', 'fillRule',
])

/** Validate every v6 appearance key present on a style patch; false rejects. */
function validAppearancePatch(patch: UnknownRecord, fields: ReadonlySet<string>): boolean {
  for (const key of fields) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (key === 'opacity') {
      if (!isValidOpacity(value)) return false
    } else if (key === 'shadow') {
      if (value !== null && !cloneShadowPaint(value)) return false
    } else if (key === 'lineHeight') {
      if (value !== null && !isValidLineHeight(value)) return false
    } else if (key === 'letterSpacing') {
      if (value !== null && !isValidLetterSpacing(value)) return false
    } else if (key === 'italic') {
      if (typeof value !== 'boolean') return false
    } else if (key === 'vertical') {
      if (typeof value !== 'boolean') return false
    } else if (key === 'cornerRadius') {
      if (value !== null && !isValidCornerRadius(value)) return false
    } else if (key === 'filter') {
      if (value !== null && !cloneSceneFilter(value)) return false
    } else if (key === 'blendMode') {
      if (value !== null && !isValidBlendMode(value)) return false
    } else if (key === 'dash') {
      if (value !== null && !isValidDash(value)) return false
    } else if (key === 'cap') {
      if (!isValidLineCap(value)) return false
    } else if (key === 'join') {
      if (!isValidLineJoin(value)) return false
    } else if (key === 'fillRule') {
      if (!isValidFillRule(value)) return false
    } else if (key === 'startCap' || key === 'endCap') {
      if (value !== null && !isValidLineEndpointCap(value)) return false
    } else if (key === 'stroke') {
      if (value !== null && !isHexColor(value)) return false
    } else if (key === 'strokeWidth') {
      if (value !== null && !isValidTextStrokeWidth(value)) return false
    } else if (key === 'effect') {
      if (value !== null && !isValidTextEffect(value)) return false
    }
  }
  return true
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
    if (value === null || ((key === 'italic' || key === 'vertical') && value === false)) {
      const { [key]: _removed, ...rest } = next
      next = rest
      continue
    }
    next = {
      ...next,
      [key]: key === 'shadow'
        ? cloneShadowPaint(value)
        : key === 'filter'
          ? cloneSceneFilter(value)
          : key === 'effect'
            ? { ...(value as TextEffect) }
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
  if (!isRecord(patch) || !hasOnlyKeys(patch, CONTENT_KEYS) || Object.keys(patch).length === 0) {
    return { ok: false, node }
  }
  const record = patch as unknown as UnknownRecord
  if (node.type === 'text') {
    if (Object.keys(record).some((key) => key !== 'text') || typeof record.text !== 'string') {
      return { ok: false, node }
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
    if (
      Object.keys(record).some((key) => key !== 'src' && key !== 'alt') ||
      ('src' in record && typeof record.src !== 'string') ||
      ('alt' in record && typeof record.alt !== 'string')
    ) {
      return { ok: false, node }
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
  if (node.type === 'path') {
    if (
      Object.keys(record).some((key) => key !== 'd' && key !== 'viewBox') ||
      ('d' in record && !isValidPathData(record.d))
    ) {
      return { ok: false, node }
    }
    let viewBox = node.viewBox
    if ('viewBox' in record) {
      const cloned = clonePathViewBox(record.viewBox)
      if (!cloned) return { ok: false, node }
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
  return { ok: false, node }
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
  })
}

function applyStylePatch(
  node: FreeformSceneNode,
  patch: FreeformNodeStylePatch,
): NodePatchResult {
  if (!isRecord(patch) || !hasOnlyKeys(patch, STYLE_KEYS) || Object.keys(patch).length === 0) {
    return { ok: false, node }
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
    ])
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    if ('textFill' in patch && !isValidSceneColorPaint(patch.textFill)) {
      return { ok: false, node }
    }
    let spansPatch: RichTextSpan[] | undefined
    if ('spans' in patch) {
      const normalized = normalizeRichTextSpans(patch.spans, node.text.length)
      if (!normalized) return { ok: false, node }
      spansPatch = normalized
    }
    if (!validAppearancePatch(patch, TEXT_APPEARANCE_KEYS)) return { ok: false, node }
    const base = {
      ...node,
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
    if (
      keys.some((key) => key !== 'fit'
        && key !== 'framing'
        && key !== 'opacity'
        && key !== 'shadow'
        && key !== 'filter'
        && key !== 'blendMode')
    ) {
      return { ok: false, node }
    }
    if (
      ('fit' in patch && patch.fit !== 'cover' && patch.fit !== 'contain')
      || ('framing' in patch && !isValidImageFraming(patch.framing))
      || !validAppearancePatch(patch, BASE_APPEARANCE_KEYS)
    ) {
      return { ok: false, node }
    }
    const fit = 'fit' in patch ? patch.fit as typeof node.fit : node.fit
    const framing = 'framing' in patch
      ? patch.framing as ImageFraming
      : node.framing
    const next = withAppearancePatch({
      ...node,
      fit,
      framing: 'framing' in patch ? cloneImageFraming(framing) : node.framing,
    }, patch, BASE_APPEARANCE_KEYS)
    if (
      fit === node.fit
      && imageFramingEquals(framing, node.framing)
      && appearanceKeysSame(node, next, patch, BASE_APPEARANCE_KEYS)
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
      'opacity',
      'shadow',
      'filter',
      'blendMode',
    ])
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    if ('shape' in patch && !isValidShape(patch.shape)) return { ok: false, node }
    if ('fill' in patch && !isValidSceneShapeFill(patch.fill)) {
      return { ok: false, node }
    }
    // Shape strokes stay plain color strings; `null` clears only text outlines.
    if ('stroke' in patch && typeof patch.stroke !== 'string') return { ok: false, node }
    if (
      'strokeWidth' in patch
      && (typeof patch.strokeWidth !== 'number' || !Number.isFinite(patch.strokeWidth))
    ) {
      return { ok: false, node }
    }
    if (!validAppearancePatch(patch, SHAPE_APPEARANCE_KEYS)) return { ok: false, node }
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
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    if ('lineKind' in patch && patch.lineKind !== 'line' && patch.lineKind !== 'arrow') {
      return { ok: false, node }
    }
    // Line strokes stay plain color strings; `null` clears only text outlines.
    if ('stroke' in patch && typeof patch.stroke !== 'string') return { ok: false, node }
    if (
      'strokeWidth' in patch
      && (typeof patch.strokeWidth !== 'number' || !Number.isFinite(patch.strokeWidth))
    ) {
      return { ok: false, node }
    }
    // Vertex lists must stay inside the node box; a bad list rejects the patch.
    let points: LinePoint[] | undefined
    if ('points' in patch) {
      const cloned = cloneLinePoints(patch.points, node.width, node.height)
      if (!cloned) return { ok: false, node }
      points = cloned
    }
    if (!validAppearancePatch(patch, LINE_APPEARANCE_KEYS)) return { ok: false, node }
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
  if (node.type === 'path') {
    const allowed = new Set(['fill', 'stroke', 'strokeWidth', 'dash', ...PATH_APPEARANCE_KEYS])
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    // Paths fill with a color paint or nothing; their strokes are hex colors.
    if ('fill' in patch && !isValidScenePathFill(patch.fill)) return { ok: false, node }
    if ('stroke' in patch && !isHexColor(patch.stroke)) return { ok: false, node }
    if ('strokeWidth' in patch && !isValidPathStrokeWidth(patch.strokeWidth)) {
      return { ok: false, node }
    }
    if ('dash' in patch && patch.dash !== null && !isValidPathDash(patch.dash)) {
      return { ok: false, node }
    }
    if (!validAppearancePatch(patch, PATH_APPEARANCE_KEYS)) return { ok: false, node }
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
          ? paintEquals(node.fill, next.fill)
          : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    ) && appearanceKeysSame(node, next, patch, PATH_APPEARANCE_KEYS)
    return { ok: true, node: same ? node : next }
  }
  return { ok: false, node }
}

function applyGeometryPatch(
  node: FreeformSceneNode,
  patch: FreeformNodeGeometryPatch,
): NodePatchResult {
  if (!isRecord(patch) || !hasOnlyKeys(patch, GEOMETRY_KEYS) || Object.keys(patch).length === 0) {
    return { ok: false, node }
  }
  const record = patch as unknown as UnknownRecord
  const keys = Object.keys(record)
  if (node.type === 'group' && keys.some((key) => key === 'width' || key === 'height')) {
    return { ok: false, node }
  }
  const values = Object.values(record)
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return { ok: false, node }
  }
  const scale = 'scale' in record ? (record.scale as number) : node.scale
  if (scale <= 0) return { ok: false, node }
  if (node.type !== 'group') {
    const width = 'width' in record ? (record.width as number) : node.width
    const height = 'height' in record ? (record.height as number) : node.height
    if (width <= 0 || height <= 0) return { ok: false, node }
  }
  const next = {
    ...node,
    ...('x' in patch ? { x: patch.x as number } : {}),
    ...('y' in patch ? { y: patch.y as number } : {}),
    ...('rotation' in patch ? { rotation: patch.rotation as number } : {}),
    ...('scale' in patch ? { scale: patch.scale as number } : {}),
    ...(node.type !== 'group' && 'width' in patch ? { width: patch.width as number } : {}),
    ...(node.type !== 'group' && 'height' in patch ? { height: patch.height as number } : {}),
  } as FreeformSceneNode
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
    if (!scaled) return { ok: false, node }
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
      align: element.align as 'left' | 'center' | 'right',
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
        const id = action.slideId ?? crypto.randomUUID()
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
        const id = action.duplicateSlideId ?? crypto.randomUUID()
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
