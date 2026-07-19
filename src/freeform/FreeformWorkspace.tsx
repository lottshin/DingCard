import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { toBlob } from 'html-to-image'
import { DraftsPanel } from '../DraftsPanel'
import { Select } from '../Select'
import { type Draft } from '../drafts'
import { downloadZip } from '../exportZip'
import { buildFontEmbedCSS } from '../fontEmbed'
import { downscaleDataUrl } from '../imageStore'
import { store } from '../storage'
import { FONTS } from '../theme'
import { OperationNotice } from '../workspaces/OperationNotice'
import { ToolbarDivider, ToolbarGroup, WorkspaceToolbar } from '../workspaces/WorkspaceToolbar'
import type { WorkspaceShellProps } from '../workspaces/types'
import { useImageLease } from '../workspaces/useImageLease'
import { MAX_EFFECTIVE_SCALE, MIN_EFFECTIVE_SCALE } from './constants'
import {
  createFreeformDocument,
  createImageElement,
  createLineElement,
  createShapeElement,
  createTextElement,
  freeformReducer,
} from './document'
import { FreeformInsertMenu } from './FreeformInsertMenu'
import { InspectorNumberInput } from './InspectorNumberInput'
import { FreeformLayersPanel } from './FreeformLayersPanel'
import { FreeformPageSizePopover } from './FreeformPageSizePopover'
import { FreeformRightPanel } from './FreeformRightPanel'
import {
  FreeformSceneNodeView,
  type SceneNodePointerState,
} from './FreeformSceneNodeView'
import {
  FreeformSelectionOverlay,
  type SelectionOverlayTarget,
  type SelectionOverlayInteraction,
} from './FreeformSelectionOverlay'
import { InspectorSection } from './InspectorSection'
import {
  createHistory,
  isLatestSaveForDraft,
  pushHistory,
  redo,
  undo,
  type HistoryState,
} from './history'
import {
  buildFreeformFontCSS,
  collectFreeformFontRequests,
} from './fontRequests'
import { collectFreeformImageSources } from './imageAssets'
import { ColorPickerButton, PaintField } from './PaintField'
import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
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
import { snapSceneDrag, type SnapLine } from './snapping'
import type {
  FreeformAction,
  ColorPaint,
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  FreeformLineElement,
  FreeformSceneNode,
  FreeformNodeContentPatch,
  FreeformNodeGeometryPatch,
  FreeformNodeStylePatch,
  FreeformShapeElement,
  FreeformSlide,
  FreeformTextElement,
  ScenePath,
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
} from './viewportScale'

const FIT_SCALE_EPSILON = 0.0001

const SHAPES: Array<{ id: FreeformShapeElement['shape']; label: string }> = [
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '圆形' },
  { id: 'triangle', label: '三角形' },
]

const LINES: Array<{ id: FreeformLineElement['lineKind']; label: string }> = [
  { id: 'line', label: '直线' },
  { id: 'arrow', label: '箭头' },
]

const FITS: Array<{ id: 'cover' | 'contain'; label: string }> = [
  { id: 'cover', label: '填满' },
  { id: 'contain', label: '适应' },
]

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
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT)
  const [fitScale, setFitScale] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
  const [showMixedSizeWarning, setShowMixedSizeWarning] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [operationNotice, setOperationNotice] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  const [activeInteraction, setActiveInteraction] = useState<SelectionOverlayInteraction>(null)
  const activeInteractionRef = useRef<SelectionOverlayInteraction>(null)
  const renderScale = calculateRenderScale(fitScale, zoomPercent)
  const selectionPaths = useMemo(
    () => normalizeSceneSelection(activeSlide.nodes, activeGroupPath, requestedSelectionPaths),
    [activeGroupPath, activeSlide.nodes, requestedSelectionPaths],
  )
  const selection = useMemo(
    () => selectionPaths.map((path) => path[path.length - 1]),
    [selectionPaths],
  )
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
  const marqueePointerIdRef = useRef<number | null>(null)
  const propertiesTabRef = useRef<HTMLButtonElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const shapeFillInputRef = useRef<HTMLInputElement>(null)
  const shapeFillOperationTokensRef = useRef(new Map<string, symbol>())
  const previousUserId = useRef<string | null>(user?.id ?? null)
  const documentIdentityGenerationRef = useRef(0)
  const inspectorNumberResetGenerationRef = useRef(0)
  const currentDocumentRef = useRef(doc)
  const currentDraftIdRef = useRef(draftId)
  const currentUserIdRef = useRef<string | null>(user?.id ?? null)
  const draftListGenerationRef = useRef(0)
  const saveGenerationRef = useRef(0)
  const saveInFlightRef = useRef(false)

  selectedElementIds.current = selection
  currentDocumentRef.current = doc
  currentDraftIdRef.current = draftId
  currentUserIdRef.current = user?.id ?? null

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
    selectionPaths.length > 1 &&
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
  const showLockedOperationNotice = useCallback(() => {
    setOperationNotice(LOCKED_OPERATION_NOTICE)
  }, [])
  const blockDocumentMutationDuringInteraction = useCallback(() => {
    if (!activeInteractionRef.current && marqueePointerIdRef.current === null) return false
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

  useEffect(() => {
    const nextUserId = user?.id ?? null
    const userChanged = previousUserId.current !== nextUserId
    if (userChanged) {
      previousUserId.current = nextUserId
      documentIdentityGenerationRef.current += 1
      shapeFillOperationTokensRef.current.clear()
      draftListGenerationRef.current += 1
      saveGenerationRef.current += 1
      setDrafts([])
      updateDraftId(null)
      setSavedAt(null)
      setShowDrafts(false)
      setOperationNotice(null)
    }

    if (user) {
      void loadDrafts(user.id)
    } else {
      draftListGenerationRef.current += 1
      setDrafts([])
    }

    return () => {
      draftListGenerationRef.current += 1
    }
  }, [loadDrafts, updateDraftId, user])

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

  const applyAction = useCallback((action: FreeformAction) => {
    if (blockDocumentMutationDuringInteraction()) return false
    const start = currentDocumentRef.current
    const next = freeformReducer(start, action)
    if (Object.is(next, start)) return false
    currentDocumentRef.current = next
    setHistory((current) => {
      if (Object.is(current.current, start)) return pushHistory(current, next)
      const rebased = freeformReducer(current.current, action)
      currentDocumentRef.current = rebased
      return Object.is(rebased, current.current) ? current : pushHistory(current, rebased)
    })
    setSavedAt(null)
    return true
  }, [blockDocumentMutationDuringInteraction])

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

  function beginShapeFillOperation(slideId: string, path: ScenePath) {
    const key = `${slideId}:${scenePathKey(path)}`
    const token = Symbol(key)
    shapeFillOperationTokensRef.current.set(key, token)
    return { key, token }
  }

  function updateSelectedShapeFill(fill: ShapeFill): boolean {
    if (!selectedPath) return false
    const operation = beginShapeFillOperation(activeSlide.id, selectedPath)
    const changed = updateSelectedStyle({ fill })
    if (shapeFillOperationTokensRef.current.get(operation.key) === operation.token) {
      shapeFillOperationTokensRef.current.delete(operation.key)
    }
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
    setHistory((current) => {
      const next = freeformReducer(current.current, action)
      currentDocumentRef.current = next
      return Object.is(next, current.current) ? current : { ...current, current: next }
    })
  }, [])

  const commitLiveEdit = useCallback((startDocument: FreeformDocument) => {
    setHistory((current) => {
      if (Object.is(current.current, startDocument)) return current
      return {
        past: [...current.past, startDocument],
        current: current.current,
        future: [],
      }
    })
    setSavedAt(null)
  }, [])

  function selectSlide(slideId: string) {
    if (blockDocumentMutationDuringInteraction()) return
    replaceCurrent({ type: 'slide/select', slideId })
    setSelection([])
  }

  function addSlide() {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/add-after-active' })
    setSelection([])
  }

  function duplicateSlide() {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/duplicate', slideId: activeSlide.id })
    setSelection([])
  }

  function deleteSlide() {
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/delete', slideId: activeSlide.id })
    setSelection([])
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
        fill: { type: 'image', src, fit: 'cover' },
      })
    } finally {
      if (shapeFillOperationTokensRef.current.get(operation.key) === operation.token) {
        shapeFillOperationTokensRef.current.delete(operation.key)
      }
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

  function pasteClipboard() {
    if (!clipboard || clipboard.nodes.length === 0) return
    if (blockDocumentMutationDuringInteraction()) return
    const targetParentWorld = sceneParentWorldMatrix(activeSlide.nodes, activeGroupPath)
    const inverseTarget = targetParentWorld ? invert(targetParentWorld) : null
    if (!targetParentWorld || !inverseTarget) return
    const offset = translation(16, 16)
    const pasted = cloneSceneNodes(clipboard.nodes).flatMap((node) => {
      const localMatrix = multiply(
        inverseTarget,
        multiply(offset, multiply(clipboard.sourceParentWorld, sceneNodeLocalMatrix(node))),
      )
      const transformed = sceneNodeWithLocalMatrix(node, localMatrix)
      return transformed ? [transformed] : []
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
    })
    if (changed) {
      setSelection(pasted.map((node) => node.id))
    } else if (
      effectiveLockedSelection ||
      effectiveSceneState(activeSlide.nodes, activeGroupPath)?.locked
    ) {
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
    if (selectedNodes.length < 2) return
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

    const left = Math.min(...entries.map(({ bounds }) => bounds.x))
    const right = Math.max(...entries.map(({ bounds }) => bounds.x + bounds.width))
    const top = Math.min(...entries.map(({ bounds }) => bounds.y))
    const bottom = Math.max(...entries.map(({ bounds }) => bounds.y + bounds.height))
    const horizontalCenter = (left + right) / 2
    const verticalCenter = (top + bottom) / 2
    applyAction({
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
    })
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
    applyAction({ type: 'node/update-geometry', slideId: activeSlide.id, updates })
  }

  function applySlideSize(width: number, height: number) {
    if (activeSlide.width === width && activeSlide.height === height) return
    if (blockDocumentMutationDuringInteraction()) return
    applyAction({ type: 'slide/resize', slideId: activeSlide.id, width, height })
  }

  function undoDocument() {
    if (blockDocumentMutationDuringInteraction()) return
    inspectorNumberResetGenerationRef.current += 1
    setHistory((current) => undo(current))
    setSavedAt(null)
  }

  function redoDocument() {
    if (blockDocumentMutationDuringInteraction()) return
    inspectorNumberResetGenerationRef.current += 1
    setHistory((current) => redo(current))
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
      const isDocumentShortcut = (
        ((event.ctrlKey || event.metaKey) && ['z', 'y', 'c', 'v', 'g'].includes(key)) ||
        [
          'arrowleft',
          'arrowright',
          'arrowup',
          'arrowdown',
          'delete',
          'backspace',
          'escape',
          'enter',
        ].includes(key)
      )
      if ((activeInteractionRef.current || marqueePointerIdRef.current !== null) && isDocumentShortcut) {
        event.preventDefault()
        return
      }
      if (isTypingTarget(event.target)) return
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

  function onSceneNodePointerDown(
    event: React.PointerEvent<HTMLDivElement>,
    leaf: FreeformElement,
    hitPath: ScenePath,
    state: SceneNodePointerState,
  ) {
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
    const directPath = directChildPathForScope(activeSlide.nodes, activeGroupPath, hitPath)
    const directNode = directPath
      ? findNodeAtPath(activeSlide.nodes, directPath)
      : undefined
    if (!directPath || directNode?.type !== 'group') return
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

  function beginMovePointerDown(
    event: React.PointerEvent,
    primaryId: string,
    requestedIds?: readonly string[],
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
    const startDocument = currentDocumentRef.current
    const startSlide = startDocument.slides.find((slide) => slide.id === activeSlide.id)
    const startChildren = startSlide
      ? getChildrenAtPath(startSlide.nodes, activeGroupPath)
      : undefined
    if (!startSlide || !startChildren) return
    const currentSelection = selectedElementIds.current
    const draggingIds = requestedIds && requestedIds.length > 0
      ? [...requestedIds]
      : currentSelection.includes(primaryId) ? currentSelection : [primaryId]
    const directIds = new Set(startChildren.map((node) => node.id))
    if (draggingIds.some((id) => !directIds.has(id))) return
    if (!currentSelection.includes(primaryId)) setSelection([primaryId])

    const interactionScale = renderScale
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    activeInteractionRef.current = 'move'
    setActiveInteraction('move')

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const rawDx = (moveEvent.clientX - startX) / interactionScale
      const rawDy = (moveEvent.clientY - startY) / interactionScale
      const snap = snapSceneDrag(
        startSlide,
        startSlide.nodes,
        activeGroupPath,
        draggingIds,
        rawDx,
        rawDy,
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
      setHistory((current) => {
        const next = freeformReducer(current.current, {
          type: 'node/update-geometry',
          slideId: startSlide.id,
          updates: patches.map(({ nodeId, patch }) => ({
            path: [...activeGroupPath, nodeId],
            patch,
          })),
        })
        currentDocumentRef.current = next
        return Object.is(next, current.current) ? current : { ...current, current: next }
      })
    }

    const cleanupDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setSnapLines([])
      setActiveInteraction(null)
    }
    const finishDrag = () => {
      cleanupDrag()
      commitLiveEdit(startDocument)
    }
    const cancelDrag = () => {
      cleanupDrag()
      currentDocumentRef.current = startDocument
      setHistory((current) => Object.is(current.current, startDocument)
        ? current
        : { ...current, current: startDocument })
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

  function artboardPointFromClient(clientX: number, clientY: number) {
    const point = rawArtboardPointFromClient(clientX, clientY)
    return point ? {
      x: clamp(point.x, 0, activeSlide.width),
      y: clamp(point.y, 0, activeSlide.height),
    } : null
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
      if (startLeaf && startLeafWorld && inverseLeafWorld && startLeafLocal) {
        const localDelta = transformVector(inverseLeafWorld, worldDelta)
        const worldScale = decomposeSimilarity(startLeafWorld)?.scale ?? 1
        const width = Math.max(40 / worldScale, startLeaf.width + localDelta.x)
        const height = Math.max(40 / worldScale, startLeaf.height + localDelta.y)
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
    }

    const cleanupResize = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setSnapLines([])
      setActiveInteraction(null)
    }

    const finishResize = () => {
      cleanupResize()
      commitLiveEdit(startDocument)
    }

    const cancelResize = () => {
      cleanupResize()
      currentDocumentRef.current = startDocument
      setHistory((current) =>
        Object.is(current.current, startDocument)
          ? current
          : { ...current, current: startDocument },
      )
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
      const degrees = ((angle - startAngle) * 180) / Math.PI
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
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onBlur)
      activeInteractionRef.current = null
      setActiveInteraction(null)
    }
    const finish = () => {
      cleanup()
      commitLiveEdit(startDocument)
    }
    const cancel = () => {
      cleanup()
      currentDocumentRef.current = startDocument
      setHistory((current) => Object.is(current.current, startDocument)
        ? current
        : { ...current, current: startDocument })
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
      if (saveIsCurrent) updateDraftId(saved.id)
      if (saveIsCurrent && store.remote && saved.mode === 'freeform-slide') {
        setHistory((current) => (
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

  function openDraft(draft: Draft) {
    if (draft.mode !== 'freeform-slide') return
    if (blockDocumentMutationDuringInteraction()) return
    documentIdentityGenerationRef.current += 1
    shapeFillOperationTokensRef.current.clear()
    saveGenerationRef.current += 1
    setHistory(createHistory(draft.document))
    setSelection([])
    updateDraftId(draft.id)
    setSavedAt(draft.updatedAt)
    setShowDrafts(false)
  }

  async function removeDraft(id: string) {
    if (!user) return
    if (blockDocumentMutationDuringInteraction()) return
    try {
      if (store.remote) await retainImagesNow()
      if (blockDocumentMutationDuringInteraction()) return
      await store.drafts.remove(user.id, id)
      if (currentUserIdRef.current !== user.id) return
      if (id === currentDraftIdRef.current) {
        documentIdentityGenerationRef.current += 1
        shapeFillOperationTokensRef.current.clear()
        saveGenerationRef.current += 1
        updateDraftId(null)
        setSavedAt(null)
      }
      void refreshDrafts()
    } catch (error) {
      if (currentUserIdRef.current === user.id) {
        showOperationError(error, '草稿删除失败，请稍后重试')
      }
    }
  }

  return (
    <div
      className="freeform-workspace"
      aria-label="自由编辑工作区"
      data-history-depth={history.past.length}
    >
      <WorkspaceToolbar
        testId="freeform-toolbar"
        label="自由编辑工具栏"
        className="freeform-toolbar"
      >
        <ToolbarGroup>
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
            onClick={() => {
              if (!user) {
                requestAuth()
                return
              }
              setShowDrafts(true)
            }}
          >
            草稿{user && drafts.length ? ` · ${drafts.length}` : ''}
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
          <div className="freeform-slide-list">
            {doc.slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={slide.id === activeSlide.id ? 'freeform-thumb on' : 'freeform-thumb'}
                aria-current={slide.id === activeSlide.id ? 'page' : undefined}
                onClick={() => selectSlide(slide.id)}
              >
                <span
                  className="freeform-thumb-art"
                  style={{
                    aspectRatio: `${slide.width} / ${slide.height}`,
                    background: slideBackgroundToCss(slide.background),
                  }}
                />
                <span className="freeform-thumb-caption">
                  <span className="freeform-thumb-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="freeform-thumb-title">{slide.name}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="freeform-rail-actions">
            <button className="ghost" type="button" onClick={duplicateSlide}>
              复制页面
            </button>
            <button className="ghost" type="button" onClick={deleteSlide} disabled={doc.slides.length <= 1}>
              删除页面
            </button>
          </div>
        </aside>

        <section className="freeform-stage-pane" aria-label="自由画布">
          <div className="freeform-stage-head">
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
          </div>

          <div
            ref={stageScrollRef}
            className="freeform-stage-scroll"
            aria-busy={renderScale === null}
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
                        className={`freeform-ui-only freeform-snap-line freeform-snap-line-${line.axis}`}
                        data-testid="freeform-snap-line"
                        style={line.axis === 'x' ? { left: line.position } : { top: line.position }}
                      />
                    ))}
                  </div>
                  <FreeformSelectionOverlay
                    nodes={activeSlide.nodes}
                    selectedPaths={selectionPaths}
                    renderScale={renderScale}
                    activeInteraction={activeInteraction}
                    interactive={!effectiveLockedSelection && !lockedDescendantSelection}
                    onMovePointerDown={(event, target) => beginMovePointerDown(
                      event,
                      target.nodeIds[0],
                      target.nodeIds,
                    )}
                    onResizePointerDown={onResizePointerDown}
                    onRotatePointerDown={onRotatePointerDown}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <FreeformRightPanel
          propertiesTabRef={propertiesTabRef}
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
                    modes={['solid', 'linear-gradient', 'transparent']}
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
                            modes={['solid', 'linear-gradient']}
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
                              modes={['solid', 'linear-gradient', 'image']}
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
                                onClick={() => updateSelectedStyle({ fit: fit.id })}
                              >
                                {fit.label}
                              </button>
                            ))}
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
                          <div className="seg stretch">
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
                          className="color-field"
                          data-testid={isShapeElement(selectedElement) ? 'shape-stroke-color' : 'line-stroke-color'}
                        >
                          <span>{isShapeElement(selectedElement) ? '描边' : '颜色'}</span>
                          <ColorPickerButton
                            label={isShapeElement(selectedElement) ? '形状描边颜色' : '线条颜色'}
                            color={selectedElement.stroke}
                            onChange={(stroke) => updateSelectedStyle({ stroke })}
                          />
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
        />
      )}

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
    </div>
  )
}
