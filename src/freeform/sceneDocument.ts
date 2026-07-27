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
import type {
  ColorPaint,
  FreeformDocument,
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlide,
  ImageFraming,
  ShapeFill,
  SlideBackground,
} from './types'

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

type StrictDocumentVersion = 3 | 4

const DOCUMENT_KEYS = new Set(['documentVersion', 'slides', 'activeSlideId'])
const SLIDE_KEYS = new Set(['id', 'name', 'width', 'height', 'background', 'nodes'])
const SOLID_PAINT_KEYS = new Set(['type', 'color'])
const GRADIENT_PAINT_KEYS = new Set(['type', 'from', 'to', 'angle'])
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

function cloneStrictColorPaint(value: unknown): ColorPaint | null {
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
  return null
}

function cloneStrictSlideBackground(value: unknown): SlideBackground | null {
  if (
    isRecord(value)
    && value.type === 'transparent'
    && hasExactKeys(value, TRANSPARENT_PAINT_KEYS)
  ) {
    return { type: 'transparent' }
  }
  return cloneStrictColorPaint(value)
}

function cloneStrictShapeFill(
  value: unknown,
  inputVersion: StrictDocumentVersion,
): ShapeFill | null {
  if (isRecord(value) && value.type === 'image') {
    const expectedKeys = inputVersion === 4 ? IMAGE_FILL_V4_KEYS : IMAGE_FILL_V3_KEYS
    if (
      !hasExactKeys(value, expectedKeys)
      || typeof value.src !== 'string'
      || !isFit(value.fit)
      || (inputVersion === 4 && !isValidImageFraming(value.framing))
    ) {
      return null
    }
    return {
      type: 'image',
      src: value.src,
      fit: value.fit,
      framing: inputVersion === 4
        ? cloneImageFraming(value.framing as ImageFraming)
        : createDefaultImageFraming(),
    }
  }
  return cloneStrictColorPaint(value)
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

function hasStrictNodeKeys(
  value: UnknownRecord,
  inputVersion: StrictDocumentVersion,
): boolean {
  if (value.type === 'group') return hasExactKeys(value, GROUP_NODE_KEYS)
  if (value.type === 'text') return hasExactKeys(value, TEXT_NODE_KEYS)
  if (value.type === 'image') {
    return hasExactKeys(value, inputVersion === 4 ? IMAGE_NODE_V4_KEYS : IMAGE_NODE_V3_KEYS)
  }
  if (value.type === 'shape') return hasExactKeys(value, SHAPE_NODE_KEYS)
  if (value.type === 'line') return hasExactKeys(value, LINE_NODE_KEYS)
  return false
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
    const textFill = cloneStrictColorPaint(value.textFill)
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
    return {
      ...geometry,
      type: 'text',
      text: value.text,
      fontSize: value.fontSize,
      fontFamily: value.fontFamily,
      textFill,
      align: value.align,
      fontWeight: value.fontWeight,
    }
  }

  if (value.type === 'image') {
    if (
      typeof value.src !== 'string'
      || typeof value.alt !== 'string'
      || !isFit(value.fit)
      || (inputVersion === 4 && !isValidImageFraming(value.framing))
    ) {
      return null
    }
    return {
      ...geometry,
      type: 'image',
      src: value.src,
      alt: value.alt,
      fit: value.fit,
      framing: inputVersion === 4
        ? cloneImageFraming(value.framing as ImageFraming)
        : createDefaultImageFraming(),
    }
  }

  if (value.type === 'shape') {
    const fill = cloneStrictShapeFill(value.fill, inputVersion)
    if (
      (value.shape !== 'rect' && value.shape !== 'ellipse' && value.shape !== 'triangle') ||
      !fill ||
      typeof value.stroke !== 'string' ||
      !isFiniteNumber(value.strokeWidth)
    ) {
      return null
    }
    return {
      ...geometry,
      type: 'shape',
      shape: value.shape,
      fill,
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
      ...geometry,
      type: 'line',
      lineKind: value.lineKind,
      stroke: value.stroke,
      strokeWidth: value.strokeWidth,
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
    !hasExactKeys(value, SLIDE_KEYS) ||
    !isNonBlankString(value.id) ||
    typeof value.name !== 'string' ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    !validatePageSize(value.width, value.height).ok ||
    !Array.isArray(value.nodes)
  ) {
    return null
  }

  const background = cloneStrictSlideBackground(value.background)
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
    documentVersion: 4,
    slides,
    activeSlideId: value.activeSlideId,
  }
}

/** Strictly validates a historical v3 document and migrates it to owned v4 data. */
export function migrateFreeformDocumentV3ToV4(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 3)
}

/** Strictly validates and clones an already-v4 document. */
export function normalizeFreeformDocumentV4(value: unknown): FreeformDocument | null {
  return normalizeStrictDocument(value, 4)
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
 * through the strict v4 validator before returning it.
 */
export function migrateLegacyFreeformDocumentToV4(value: unknown): FreeformDocument | null {
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
  const candidate: FreeformDocument = {
    documentVersion: 4,
    slides,
    activeSlideId: slides[activeIndex >= 0 ? activeIndex : 0].id,
  }
  return normalizeFreeformDocumentV4(candidate)
}

/** Normalize any supported freeform document version to a fresh v4 object. */
export function normalizeFreeformDocument(value: unknown): FreeformDocument | null {
  if (!isRecord(value)) return null
  if (value.documentVersion === 4) return normalizeFreeformDocumentV4(value)
  if (value.documentVersion === 3) return migrateFreeformDocumentV3ToV4(value)
  if (value.documentVersion === 1 || value.documentVersion === 2) {
    return migrateLegacyFreeformDocumentToV4(value)
  }
  return null
}

function copySlideBackgroundValue(background: SlideBackground): SlideBackground {
  if (background.type === 'transparent') return { type: 'transparent' }
  if (background.type === 'solid') return { type: 'solid', color: background.color }
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
    documentVersion: 4,
    activeSlideId: document.activeSlideId,
    slides: document.slides.map((slide) => ({
      id: slide.id,
      name: slide.name,
      width: slide.width,
      height: slide.height,
      background: copySlideBackgroundValue(slide.background),
      nodes: mapSceneLeaves(slide.nodes, mapper),
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
  })))

  return {
    documentVersion: 4,
    activeSlideId: document.activeSlideId,
    slides,
  }
}
