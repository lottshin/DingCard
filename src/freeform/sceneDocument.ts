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
  BlendMode,
  ColorPaint,
  FreeformDocument,
  FreeformGroupNode,
  FreeformGuide,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlide,
  ImageFraming,
  RichTextSpan,
  SceneFilter,
  ShadowPaint,
  ShapeFill,
  SlideBackground,
} from './types'
import { normalizeRichTextSpans } from './richText'
import {
  cloneGradientStops,
  cloneSceneFilter,
  cloneShadowPaint,
  isV7Shape,
  isValidBlendMode,
  isValidCornerRadius,
  isValidDash,
  isValidLetterSpacing,
  isValidLineCap,
  isValidLineHeight,
  isValidOpacity,
  isValidShape,
  isValidTextStrokeWidth,
} from './appearance'

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

type StrictDocumentVersion = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

const DOCUMENT_KEYS = new Set(['documentVersion', 'slides', 'activeSlideId'])
const SLIDE_KEYS = new Set(['id', 'name', 'width', 'height', 'background', 'nodes'])
const SLIDE_GUIDE_OPTIONAL_KEYS = new Set(['guides'])
const SOLID_PAINT_KEYS = new Set(['type', 'color'])
const GRADIENT_PAINT_KEYS = new Set(['type', 'from', 'to', 'angle'])
const GRADIENT_STOPS_PAINT_KEYS = new Set(['type', 'stops', 'angle'])
const RADIAL_STOPS_PAINT_KEYS = new Set(['type', 'stops'])
const TRANSPARENT_PAINT_KEYS = new Set(['type'])
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
const SHAPE_OPTIONAL_V9_KEYS = SHAPE_OPTIONAL_V8_KEYS
const LINE_OPTIONAL_V9_KEYS = LINE_OPTIONAL_V8_KEYS

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
  if (type === 'text') return TEXT_OPTIONAL_V9_KEYS
  if (type === 'shape') return SHAPE_OPTIONAL_V9_KEYS
  if (type === 'line') return LINE_OPTIONAL_V9_KEYS
  if (type === 'image') return BASE_OPTIONAL_V9_KEYS
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
  }
  if (value.type === 'shape') {
    return hasKeysWithOptionals(value, SHAPE_NODE_KEYS, optionalKeysFor('shape', inputVersion))
  }
  if (value.type === 'line') {
    return hasKeysWithOptionals(value, LINE_NODE_KEYS, optionalKeysFor('line', inputVersion))
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
    const filter = cloneSceneFilter(value.filter)
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
      (value.align !== 'left' && value.align !== 'center' && value.align !== 'right') ||
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
      ...imageAppearance,
    }
  }

  if (value.type === 'shape') {
    const fill = cloneStrictShapeFill(value.fill, inputVersion)
    if (
      !isValidShape(value.shape) ||
      (inputVersion < 7 && isV7Shape(value.shape)) ||
      !fill ||
      typeof value.stroke !== 'string' ||
      !isFiniteNumber(value.strokeWidth)
    ) {
      return null
    }
    if (inputVersion >= 6 && 'cornerRadius' in value && !isValidCornerRadius(value.cornerRadius)) {
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
      ...lineAppearance,
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
    documentVersion: 12,
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

/** Normalize any supported freeform document version to a fresh v12 object. */
export function normalizeFreeformDocument(value: unknown): FreeformDocument | null {
  if (!isRecord(value)) return null
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
  if (background.type === 'solid') return { type: 'solid', color: background.color }
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
    documentVersion: 12,
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
    documentVersion: 12,
    activeSlideId: document.activeSlideId,
    slides,
  }
}
