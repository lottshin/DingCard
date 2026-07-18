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
} from './paint'
import {
  buildScenePathIndex,
  canApplySceneAction,
  cloneSceneNodes,
  cloneSceneNodesAtPath,
  createSceneGroup,
  deleteSceneNodes,
  insertSceneChildren,
  isValidSceneColorPaint,
  isValidSceneShapeFill,
  reorderNodesAtPath,
  scenePathKey,
  ungroupSceneGroups,
  updateNodeAtPath,
  updateNodesAtPaths,
  validateSceneNodesForMutation,
  validateSelectionForParent,
  walkScene,
} from './sceneTree'
import type {
  ColorPaint,
  FreeformAction,
  FreeformActionV3,
  FreeformDocument,
  FreeformDocumentV3,
  FreeformElement,
  FreeformImageElement,
  FreeformLineElement,
  FreeformNodeContentPatch,
  FreeformNodeGeometryPatch,
  FreeformNodeStylePatch,
  FreeformSceneLeaf,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformSlide,
  FreeformSlideV3,
  FreeformTextElement,
  ScenePath,
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
    documentVersion: 3,
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
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  )
}

function cloneColorPaint(paint: ColorPaint): ColorPaint {
  return paint.type === 'solid'
    ? { type: 'solid', color: paint.color }
    : { type: 'linear-gradient', from: paint.from, to: paint.to, angle: paint.angle }
}

function cloneShapeFill(fill: ShapeFill): ShapeFill {
  return fill.type === 'image'
    ? { type: 'image', src: fill.src, fit: fill.fit }
    : cloneColorPaint(fill)
}

function cloneSlideBackground(background: SlideBackground): SlideBackground {
  return background.type === 'transparent'
    ? { type: 'transparent' }
    : cloneColorPaint(background)
}

function validSlideBackground(value: unknown): value is SlideBackground {
  if (isRecord(value) && value.type === 'transparent') {
    return hasExactKeys(value, new Set(['type']))
  }
  return isValidSceneColorPaint(value)
}

function withSlideV3(
  document: FreeformDocumentV3,
  slideId: string,
  update: (slide: FreeformSlideV3) => FreeformSlideV3,
): FreeformDocumentV3 {
  const index = document.slides.findIndex((slide) => slide.id === slideId)
  if (index < 0) return document
  const slide = document.slides[index]
  const nextSlide = update(slide)
  if (nextSlide === slide) return document
  const slides = [...document.slides]
  slides[index] = nextSlide
  return { ...document, slides }
}

function withSlideNodesV3(
  document: FreeformDocumentV3,
  slideId: string,
  update: (nodes: FreeformSceneNode[]) => FreeformSceneNode[],
): FreeformDocumentV3 {
  return withSlideV3(document, slideId, (slide) => {
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

const CONTENT_KEYS = new Set(['text', 'src', 'alt'])
const STYLE_KEYS = new Set([
  'fontSize',
  'fontFamily',
  'textFill',
  'align',
  'fontWeight',
  'fit',
  'shape',
  'fill',
  'stroke',
  'strokeWidth',
  'lineKind',
])
const GEOMETRY_KEYS = new Set(['x', 'y', 'width', 'height', 'rotation', 'scale'])

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
    return {
      ok: true,
      node: text === node.text ? node : { ...node, text },
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
    return {
      ok: true,
      node: src === node.src && alt === node.alt ? node : { ...node, src, alt },
    }
  }
  return { ok: false, node }
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
    const allowed = new Set(['fontSize', 'fontFamily', 'textFill', 'align', 'fontWeight'])
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    if ('textFill' in patch && !isValidSceneColorPaint(patch.textFill)) {
      return { ok: false, node }
    }
    const next = {
      ...node,
      ...('fontSize' in patch ? { fontSize: patch.fontSize as number } : {}),
      ...('fontFamily' in patch ? { fontFamily: patch.fontFamily as string } : {}),
      ...('textFill' in patch
        ? { textFill: cloneColorPaint(patch.textFill as ColorPaint) }
        : {}),
      ...('align' in patch ? { align: patch.align as typeof node.align } : {}),
      ...('fontWeight' in patch ? { fontWeight: patch.fontWeight as typeof node.fontWeight } : {}),
    }
    const same = keys.every((key) =>
      key === 'textFill'
        ? paintEquals(node.textFill, next.textFill)
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    )
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'image') {
    if (keys.some((key) => key !== 'fit')) return { ok: false, node }
    const next = { ...node, fit: patch.fit as typeof node.fit }
    return { ok: true, node: next.fit === node.fit ? node : next }
  }
  if (node.type === 'shape') {
    const allowed = new Set(['shape', 'fill', 'stroke', 'strokeWidth'])
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    if ('fill' in patch && !isValidSceneShapeFill(patch.fill)) {
      return { ok: false, node }
    }
    const next = {
      ...node,
      ...('shape' in patch ? { shape: patch.shape as typeof node.shape } : {}),
      ...('fill' in patch ? { fill: cloneShapeFill(patch.fill as ShapeFill) } : {}),
      ...('stroke' in patch ? { stroke: patch.stroke as string } : {}),
      ...('strokeWidth' in patch ? { strokeWidth: patch.strokeWidth as number } : {}),
    }
    const same = keys.every((key) =>
      key === 'fill'
        ? paintEquals(node.fill, next.fill)
        : (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    )
    return { ok: true, node: same ? node : next }
  }
  if (node.type === 'line') {
    const allowed = new Set(['lineKind', 'stroke', 'strokeWidth'])
    if (!keys.every((key) => allowed.has(key))) return { ok: false, node }
    const next = {
      ...node,
      ...('lineKind' in patch ? { lineKind: patch.lineKind as typeof node.lineKind } : {}),
      ...('stroke' in patch ? { stroke: patch.stroke as string } : {}),
      ...('strokeWidth' in patch ? { strokeWidth: patch.strokeWidth as number } : {}),
    }
    const same = keys.every(
      (key) =>
        (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
    )
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
  const same = keys.every(
    (key) => (node as unknown as UnknownRecord)[key] === (next as unknown as UnknownRecord)[key],
  )
  return { ok: true, node: same ? node : next }
}

type NodeUpdateCategory = 'content' | 'style' | 'geometry'

function reduceNodeUpdateBatch(
  document: FreeformDocumentV3,
  slideId: string,
  category: NodeUpdateCategory,
  updates: unknown,
): FreeformDocumentV3 {
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
  return withSlideNodesV3(document, slideId, () => nodes)
}

function defaultSceneNodeName(element: FreeformElement): string {
  if (element.type === 'text') return '文本'
  if (element.type === 'image') return '图片'
  if (element.type === 'shape') return '形状'
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
    image: ['src', 'alt', 'fit'],
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
    return {
      ...base,
      type: 'image',
      src: element.src as string,
      alt: element.alt as string,
      fit: element.fit as 'cover' | 'contain',
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

function applyLegacyElementPatch(
  node: FreeformSceneNode,
  patch: unknown,
): NodePatchResult {
  if (node.type === 'group' || !isRecord(patch)) return { ok: false, node }
  const allowedByType: Record<FreeformSceneLeaf['type'], ReadonlySet<string>> = {
    text: new Set(['x', 'y', 'width', 'height', 'rotation', 'text', 'fontSize', 'fontFamily', 'textFill', 'align', 'fontWeight']),
    image: new Set(['x', 'y', 'width', 'height', 'rotation', 'src', 'alt', 'fit']),
    shape: new Set(['x', 'y', 'width', 'height', 'rotation', 'shape', 'fill', 'stroke', 'strokeWidth']),
    line: new Set(['x', 'y', 'width', 'height', 'rotation', 'lineKind', 'stroke', 'strokeWidth']),
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
  document: FreeformDocumentV3,
  slideId: string,
  mutation: { ok: true; nodes: FreeformSceneNode[] } | { ok: false },
): FreeformDocumentV3 {
  return mutation.ok
    ? withSlideNodesV3(document, slideId, () => mutation.nodes)
    : document
}

/**
 * Final v3 reducer boundary. Every accepted node mutation passes
 * typed permission classification, runtime patch whitelists, and complete
 * scene validation before a new document snapshot is returned.
 */
export function reduceFreeformDocumentV3(
  document: FreeformDocumentV3,
  action: FreeformActionV3,
): FreeformDocumentV3 {
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
        const nextSlide: FreeformSlideV3 = {
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
        const duplicate: FreeformSlideV3 = {
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
      case 'slide/update': {
        if (!isRecord(action.patch) || !hasOnlyKeys(action.patch, new Set(['name', 'background']))) {
          return document
        }
        if ('name' in action.patch && typeof action.patch.name !== 'string') return document
        if ('background' in action.patch && !validSlideBackground(action.patch.background)) {
          return document
        }
        return withSlideV3(document, action.slideId, (slide) => {
          const name = action.patch.name ?? slide.name
          const background = action.patch.background ?? slide.background
          if (name === slide.name && paintEquals(background, slide.background)) return slide
          return {
            ...slide,
            name,
            background: cloneSlideBackground(background),
          }
        })
      }
      case 'slide/resize': {
        if (!validatePageSize(action.width, action.height).ok) return document
        return withSlideV3(document, action.slideId, (slide) =>
          slide.width === action.width && slide.height === action.height
            ? slide
            : { ...slide, width: action.width, height: action.height },
        )
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
        return withSlideNodesV3(document, action.slideId, (nodes) =>
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
        return withSlideNodesV3(document, action.slideId, () => nodes)
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
        return withSlideNodesV3(document, action.slideId, () => nodes)
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
        return reduceFreeformDocumentV3(document, {
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

/** Shipping reducer alias: the runtime document is v3 from this task onward. */
export function freeformReducer(
  document: FreeformDocument,
  action: FreeformAction,
): FreeformDocument {
  return reduceFreeformDocumentV3(document, action)
}
