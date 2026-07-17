import {
  MAX_EFFECTIVE_SCALE,
  MAX_FREEFORM_SLIDES,
  MAX_SCENE_DEPTH,
  MAX_SCENE_NODES_PER_SLIDE,
  MIN_EFFECTIVE_SCALE,
} from './constants'
import { validatePageSize } from './document'
import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
  isHexColor,
  normalizeColorPaint,
} from './paint'
import type {
  ColorPaint,
  FreeformDocumentV3,
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformSlideV3,
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
  slide: Omit<FreeformSlideV3, 'id'>
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFit(value: unknown): value is 'cover' | 'contain' {
  return value === 'cover' || value === 'contain'
}

function cloneStrictColorPaint(value: unknown): ColorPaint | null {
  if (!isRecord(value)) return null
  if (value.type === 'solid' && isHexColor(value.color)) {
    return { type: 'solid', color: value.color }
  }
  if (
    value.type === 'linear-gradient' &&
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
  if (isRecord(value) && value.type === 'transparent') {
    return { type: 'transparent' }
  }
  return cloneStrictColorPaint(value)
}

function cloneStrictShapeFill(value: unknown): ShapeFill | null {
  if (isRecord(value) && value.type === 'image') {
    return typeof value.src === 'string' && isFit(value.fit)
      ? { type: 'image', src: value.src, fit: value.fit }
      : null
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

function normalizeStrictSceneNode(
  value: unknown,
  depth: number,
  ancestorScale: number,
  state: SceneValidationState,
): FreeformSceneNode | null {
  if (!isRecord(value) || depth > MAX_SCENE_DEPTH) return null

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
      const normalized = normalizeStrictSceneNode(child, depth + 1, effectiveScale, state)
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
    if (typeof value.src !== 'string' || typeof value.alt !== 'string' || !isFit(value.fit)) {
      return null
    }
    return {
      ...geometry,
      type: 'image',
      src: value.src,
      alt: value.alt,
      fit: value.fit,
    }
  }

  if (value.type === 'shape') {
    const fill = cloneStrictShapeFill(value.fill)
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

function normalizeStrictSlide(value: unknown): FreeformSlideV3 | null {
  if (
    !isRecord(value) ||
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
    const normalized = normalizeStrictSceneNode(node, 1, 1, state)
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

/**
 * Strictly validates and clones an already-v3 document. Any invalid field
 * rejects the complete document; styles never fall back on this path.
 */
export function normalizeFreeformDocumentV3(value: unknown): FreeformDocumentV3 | null {
  if (
    !isRecord(value) ||
    value.documentVersion !== 3 ||
    !Array.isArray(value.slides) ||
    value.slides.length === 0 ||
    value.slides.length > MAX_FREEFORM_SLIDES ||
    typeof value.activeSlideId !== 'string'
  ) {
    return null
  }

  const slides: FreeformSlideV3[] = []
  const slideIds = new Set<string>()
  for (const rawSlide of value.slides) {
    const slide = normalizeStrictSlide(rawSlide)
    if (!slide || slideIds.has(slide.id)) return null
    slideIds.add(slide.id)
    slides.push(slide)
  }

  if (!slideIds.has(value.activeSlideId)) return null
  return {
    documentVersion: 3,
    slides,
    activeSlideId: value.activeSlideId,
  }
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
    return { type: 'image', src: value.src, fit: value.fit }
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
 * through the strict v3 validator before returning it.
 */
export function migrateLegacyFreeformDocumentToV3(value: unknown): FreeformDocumentV3 | null {
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
  const candidate: FreeformDocumentV3 = {
    documentVersion: 3,
    slides,
    activeSlideId: slides[activeIndex >= 0 ? activeIndex : 0].id,
  }
  return normalizeFreeformDocumentV3(candidate)
}

/** Normalize any supported freeform document version to a fresh v3 object. */
export function normalizeFreeformDocumentToV3(value: unknown): FreeformDocumentV3 | null {
  if (!isRecord(value)) return null
  if (value.documentVersion === 3) return normalizeFreeformDocumentV3(value)
  if (value.documentVersion === 1 || value.documentVersion === 2) {
    return migrateLegacyFreeformDocumentToV3(value)
  }
  return null
}
