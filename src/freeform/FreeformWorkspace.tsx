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
import {
  createFreeformDocument,
  createImageElement,
  createLineElement,
  createShapeElement,
  createTextElement,
  freeformReducer,
} from './document'
import { FreeformInsertMenu } from './FreeformInsertMenu'
import { FreeformPageSizePopover } from './FreeformPageSizePopover'
import {
  FreeformSceneNodeView,
  type SceneNodePointerState,
} from './FreeformSceneNodeView'
import {
  FreeformSelectionOverlay,
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
  fallbackScenePath,
  normalizeSceneSelection,
  sceneLogicalBounds,
} from './sceneSelection'
import { cloneSceneNodes, findNodeAtPath, getChildrenAtPath, scenePathKey } from './sceneTree'
import {
  getElementsInMarquee,
  moveElementsWithinSlide,
  type Rect,
} from './selection'
import { snapDrag, type SnapLine } from './snapping'
import type {
  FreeformAction,
  ColorPaint,
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  FreeformLineElement,
  FreeformSceneNode,
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

function offsetNodeForPaste(node: FreeformSceneNode, slide: FreeformSlide): FreeformSceneNode {
  if (node.type === 'group') return { ...node, x: node.x + 16, y: node.y + 16 }
  return {
    ...node,
    x: Math.min(Math.max(0, node.x + 16), Math.max(0, slide.width - node.width)),
    y: Math.min(Math.max(0, node.y + 16), Math.max(0, slide.height - node.height)),
  }
}

type Alignment = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom'
type Distribution = 'horizontal' | 'vertical'
type MarqueeState = { startX: number; startY: number; currentX: number; currentY: number }

function operationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
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
  const rootElements = useMemo(
    () => activeSlide.nodes.filter(
      (node): node is FreeformElement => node.type !== 'group' && !node.hidden,
    ),
    [activeSlide.nodes],
  )
  const selectedElementIds = useRef<string[]>([])
  const [activeGroupPath, setActiveGroupPath] = useState<ScenePath>([])
  const [requestedSelectionPaths, setRequestedSelectionPaths] = useState<ScenePath[]>([])
  const [clipboard, setClipboard] = useState<FreeformSceneNode[]>([])
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
    setRequestedSelectionPaths((currentPaths) => {
      const currentIds = normalizeSceneSelection(
        activeSlide.nodes,
        activeGroupPath,
        currentPaths,
      ).map((path) => path[path.length - 1])
      const nextIds = typeof update === 'function' ? update(currentIds) : update
      return nextIds.map((id) => [...activeGroupPath, id])
    })
  }, [activeGroupPath, activeSlide.nodes])

  const stageScrollRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const shapeFillInputRef = useRef<HTMLInputElement>(null)
  const previousUserId = useRef<string | null>(user?.id ?? null)
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
    const nextParentPath = fallbackScenePath(activeSlide.nodes, activeGroupPath)
    if (scenePathKey(nextParentPath) !== scenePathKey(activeGroupPath)) {
      setActiveGroupPath(nextParentPath)
    }
    setRequestedSelectionPaths((current) => {
      const next = normalizeSceneSelection(activeSlide.nodes, nextParentPath, current)
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [activeGroupPath, activeSlide.id, activeSlide.nodes])

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
  }, [])

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
    replaceCurrent({ type: 'slide/select', slideId })
    setSelection([])
  }

  function addSlide() {
    applyAction({ type: 'slide/add-after-active' })
    setSelection([])
  }

  function duplicateSlide() {
    applyAction({ type: 'slide/duplicate', slideId: activeSlide.id })
    setSelection([])
  }

  function deleteSlide() {
    applyAction({ type: 'slide/delete', slideId: activeSlide.id })
    setSelection([])
  }

  function addText() {
    const element = createTextElement(activeSlide)
    if (applyAction({ type: 'element/add', slideId: activeSlide.id, element })) {
      setSelection([element.id])
    }
  }

  function addShape(shape: FreeformShapeElement['shape']) {
    const element = createShapeElement(activeSlide, shape)
    if (applyAction({ type: 'element/add', slideId: activeSlide.id, element })) {
      setSelection([element.id])
    }
  }

  function addLine(lineKind: FreeformLineElement['lineKind']) {
    const element = createLineElement(activeSlide, lineKind)
    if (applyAction({ type: 'element/add', slideId: activeSlide.id, element })) {
      setSelection([element.id])
    }
  }

  async function addImageFromFile(file: File) {
    if (store.remote) await retainImagesNow()
    const raw = await readFileAsDataUrl(file)
    const downscaled = await downscaleDataUrl(raw, 1800)
    const src = await store.images.put(downscaled)
    const element = createImageElement(activeSlide, src, file.name)
    if (applyAction({ type: 'element/add', slideId: activeSlide.id, element })) {
      setSelection([element.id])
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
    if (!isShapeElement(selectedElement)) return
    if (store.remote) await retainImagesNow()
    const raw = await readFileAsDataUrl(file)
    const downscaled = await downscaleDataUrl(raw, 1800)
    const src = await store.images.put(downscaled)
    applyAction({
      type: 'element/update',
      slideId: activeSlide.id,
      elementId: selectedElement.id,
      patch: { fill: { type: 'image', src, fit: 'cover' } },
    })
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

  function updateElement(elementId: string, patch: Partial<FreeformElement>) {
    applyAction({ type: 'element/update', slideId: activeSlide.id, elementId, patch })
  }

  function updateSelected(patch: Partial<FreeformElement>) {
    if (!selectedElement) return
    updateElement(selectedElement.id, patch)
  }

  function deleteSelection() {
    if (selection.length === 0) return
    if (applyAction({ type: 'element/delete', slideId: activeSlide.id, elementIds: selection })) {
      setSelection([])
    }
  }

  function copySelection() {
    if (selection.length === 0) return
    const children = getChildrenAtPath(activeSlide.nodes, activeGroupPath) ?? []
    const selected = children.filter((node) => selection.includes(node.id))
    setClipboard(structuredClone(selected))
  }

  function pasteClipboard() {
    if (clipboard.length === 0) return
    const pasted = cloneSceneNodes(clipboard).map((node) => offsetNodeForPaste(node, activeSlide))
    if (applyAction({
      type: 'node/insert-children',
      slideId: activeSlide.id,
      parentPath: activeGroupPath,
      nodes: pasted,
    })) {
      setSelection(pasted.map((node) => node.id))
    }
  }

  function reorderSelection(direction: 'forward' | 'backward' | 'front' | 'back') {
    if (selection.length === 0) return
    applyAction({
      type: 'element/reorder',
      slideId: activeSlide.id,
      elementIds: selection,
      direction,
    })
  }

  function alignSelection(alignment: Alignment) {
    const selectedElements = rootElements.filter((element) => selection.includes(element.id))
    if (selectedElements.length < 2) return
    const entries = selectedElements.flatMap((element) => {
      const path = [...activeGroupPath, element.id]
      const bounds = sceneLogicalBounds(activeSlide.nodes, path)
      return bounds ? [{ element, path, bounds }] : []
    })
    if (entries.length !== selectedElements.length) return

    const left = Math.min(...entries.map(({ bounds }) => bounds.x))
    const right = Math.max(...entries.map(({ bounds }) => bounds.x + bounds.width))
    const top = Math.min(...entries.map(({ bounds }) => bounds.y))
    const bottom = Math.max(...entries.map(({ bounds }) => bounds.y + bounds.height))
    const horizontalCenter = Math.round((left + right) / 2)
    const verticalCenter = Math.round((top + bottom) / 2)
    applyAction({
      type: 'node/update-geometry',
      slideId: activeSlide.id,
      updates: entries.map(({ element, path, bounds }) => {
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
        return { path, patch: { x: element.x + dx, y: element.y + dy } }
      }),
    })
  }

  function distributeSelection(distribution: Distribution) {
    const selectedElements = rootElements.filter((element) => selection.includes(element.id))
    if (selectedElements.length < 3) return

    const entries = selectedElements.flatMap((element) => {
      const path = [...activeGroupPath, element.id]
      const bounds = sceneLogicalBounds(activeSlide.nodes, path)
      return bounds ? [{ element, path, bounds }] : []
    })
    if (entries.length !== selectedElements.length) return
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
    const updates = sorted.map(({ element, path, bounds }) => {
      const delta = cursor - (distribution === 'horizontal' ? bounds.x : bounds.y)
      cursor += (distribution === 'horizontal' ? bounds.width : bounds.height) + gap
      return {
        path,
        patch: distribution === 'horizontal'
          ? { x: element.x + delta }
          : { y: element.y + delta },
      }
    })
    applyAction({ type: 'node/update-geometry', slideId: activeSlide.id, updates })
  }

  function applySlideSize(width: number, height: number) {
    if (activeSlide.width === width && activeSlide.height === height) return
    applyAction({ type: 'slide/resize', slideId: activeSlide.id, width, height })
  }

  function undoDocument() {
    setHistory((current) => undo(current))
    setSavedAt(null)
  }

  function redoDocument() {
    setHistory((current) => redo(current))
    setSavedAt(null)
  }

  function nudgeSelection(dx: number, dy: number) {
    const selectedIds = selectedElementIds.current
    if (selectedIds.length === 0) return

    const elementById = new Map(rootElements.map((element) => [element.id, element]))
    const patches = moveElementsWithinSlide(activeSlide, rootElements, selectedIds, dx, dy).filter(
      ({ elementId, patch }) => {
        const element = elementById.get(elementId)
        return element && (element.x !== patch.x || element.y !== patch.y)
      },
    )

    if (patches.length === 0) return
    applyAction({
      type: 'node/update-geometry',
      slideId: activeSlide.id,
      updates: patches.map(({ elementId, patch }) => ({
        path: [...activeGroupPath, elementId],
        patch,
      })),
    })
  }

  useEffect(() => {
    if (!isActive) return
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isDocumentShortcut = (
        ((event.ctrlKey || event.metaKey) && ['z', 'y', 'c', 'v'].includes(key)) ||
        [
          'arrowleft',
          'arrowright',
          'arrowup',
          'arrowdown',
          'delete',
          'backspace',
          'escape',
        ].includes(key)
      )
      if (activeInteractionRef.current && isDocumentShortcut) {
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
      if (event.key === 'Escape') setSelection([])
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

  function onElementPointerDown(event: React.PointerEvent, element: FreeformElement) {
    if (renderScale === null) return
    if (element.locked || element.hidden) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      return
    }
    const interactionScale = renderScale
    const pointerId = event.pointerId
    if (event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      setSelection((ids) =>
        ids.includes(element.id) ? ids.filter((id) => id !== element.id) : [...ids, element.id],
      )
      return
    }
    if (isTypingTarget(event.target)) {
      setSelection([element.id])
      return
    }
    event.preventDefault()
    event.stopPropagation()
    blurActiveTypingTarget()
    const currentSelection = selectedElementIds.current
    const draggingIds = currentSelection.includes(element.id) ? currentSelection : [element.id]
    if (!currentSelection.includes(element.id)) {
      setSelection([element.id])
    }

    const startDocument = doc
    const startElements = rootElements
    const startX = event.clientX
    const startY = event.clientY
    activeInteractionRef.current = 'move'
    setActiveInteraction('move')

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const rawDx = Math.round((moveEvent.clientX - startX) / interactionScale)
      const rawDy = Math.round((moveEvent.clientY - startY) / interactionScale)
      const snap = snapDrag(activeSlide, startElements, draggingIds, rawDx, rawDy)
      const patches = moveElementsWithinSlide(activeSlide, startElements, draggingIds, snap.dx, snap.dy)
      setSnapLines(snap.lines)
      setHistory((current) => {
        const next = freeformReducer(current.current, {
          type: 'node/update-geometry',
          slideId: activeSlide.id,
          updates: patches.map(({ elementId, patch }) => ({
            path: [...activeGroupPath, elementId],
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
      setHistory((current) =>
        Object.is(current.current, startDocument)
          ? current
          : { ...current, current: startDocument },
      )
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

  function artboardPointFromClient(clientX: number, clientY: number) {
    const artboard = artboardRef.current
    if (!artboard || renderScale === null) return null
    const bounds = artboard.getBoundingClientRect()
    return {
      x: Math.round(clamp((clientX - bounds.left) / renderScale, 0, activeSlide.width)),
      y: Math.round(clamp((clientY - bounds.top) / renderScale, 0, activeSlide.height)),
    }
  }

  function onArtboardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const start = artboardPointFromClient(event.clientX, event.clientY)
    if (!start) return

    event.preventDefault()
    blurActiveTypingTarget()
    setSelection([])
    setMarquee({
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
    })

    const onMove = (moveEvent: PointerEvent) => {
      const current = artboardPointFromClient(moveEvent.clientX, moveEvent.clientY)
      if (!current) return
      setMarquee((value) =>
        value ? { ...value, currentX: current.x, currentY: current.y } : value,
      )
    }

    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)

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

      setSelection(getElementsInMarquee(
        rootElements.filter((element) => !element.locked),
        rect,
      ))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onResizePointerDown(event: React.PointerEvent, element: FreeformElement) {
    if (renderScale === null) return
    if (element.locked || element.hidden) {
      event.preventDefault()
      event.stopPropagation()
      blurActiveTypingTarget()
      return
    }
    const interactionScale = renderScale
    const pointerId = event.pointerId
    event.preventDefault()
    event.stopPropagation()
    setSelection([element.id])

    const startDocument = doc
    const startX = event.clientX
    const startY = event.clientY
    const startW = element.width * element.scale
    const startH = element.height * element.scale
    activeInteractionRef.current = 'resize'
    setActiveInteraction('resize')

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return
      const dx = (moveEvent.clientX - startX) / interactionScale
      const dy = (moveEvent.clientY - startY) / interactionScale
      const visualLeft = element.x + (element.width - startW) / 2
      const visualTop = element.y + (element.height - startH) / 2
      const visualRight = visualLeft + startW
      const visualBottom = visualTop + startH
      const visualWidth = startW + clamp(dx, 40 - startW, activeSlide.width - visualRight)
      const visualHeight = startH + clamp(dy, 40 - startH, activeSlide.height - visualBottom)
      const width = visualWidth / element.scale
      const height = visualHeight / element.scale
      const widthDelta = width - element.width
      const heightDelta = height - element.height
      const x = element.x + ((element.scale - 1) * widthDelta) / 2
      const y = element.y + ((element.scale - 1) * heightDelta) / 2
      replaceCurrent({
        type: 'element/update',
        slideId: activeSlide.id,
        elementId: element.id,
        patch: { x, y, width, height },
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
    if (hasMixedSlideSizes(doc.slides)) {
      setShowMixedSizeWarning(true)
      return
    }
    void exportAllSlides()
  }

  function continueMixedSizeExport() {
    if (renderScale === null) return
    setShowMixedSizeWarning(false)
    void exportAllSlides()
  }

  async function handleSaveDraft() {
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
    saveGenerationRef.current += 1
    setHistory(createHistory(draft.document))
    setSelection([])
    updateDraftId(draft.id)
    setSavedAt(draft.updatedAt)
    setShowDrafts(false)
  }

  async function removeDraft(id: string) {
    if (!user) return
    try {
      if (store.remote) await retainImagesNow()
      await store.drafts.remove(user.id, id)
      if (currentUserIdRef.current !== user.id) return
      if (id === currentDraftIdRef.current) {
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
                    elements={rootElements.filter((element) => !element.locked)}
                    selectedIds={liveSelection}
                    renderScale={renderScale}
                    activeInteraction={activeInteraction}
                    onMovePointerDown={onElementPointerDown}
                    onResizePointerDown={onResizePointerDown}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="freeform-inspector" aria-label="属性面板">
          <div className="freeform-panel-head">
            <span>属性</span>
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
              {liveSelection.length === 1 && selectedElement && (
                <>
                  <InspectorSection title="位置与尺寸" testId="inspector-geometry">
                    <div className="field-grid">
                      <label>
                        X
                        <input
                          type="number"
                          value={selectedElement.x}
                          onChange={(event) => updateSelected({ x: Number(event.currentTarget.value) })}
                        />
                      </label>
                      <label>
                        Y
                        <input
                          type="number"
                          value={selectedElement.y}
                          onChange={(event) => updateSelected({ y: Number(event.currentTarget.value) })}
                        />
                      </label>
                      <label>
                        宽
                        <input
                          type="number"
                          min="1"
                          value={selectedElement.width}
                          onChange={(event) => updateSelected({ width: Number(event.currentTarget.value) })}
                        />
                      </label>
                      <label>
                        高
                        <input
                          type="number"
                          min="1"
                          value={selectedElement.height}
                          onChange={(event) => updateSelected({ height: Number(event.currentTarget.value) })}
                        />
                      </label>
                      <label>
                        旋转
                        <input
                          type="number"
                          value={selectedElement.rotation}
                          onChange={(event) => updateSelected({ rotation: Number(event.currentTarget.value) })}
                        />
                      </label>
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
                              onClick={() => updateElement(selectedElement.id, { shape: shape.id })}
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
                            updateElement(selectedElement.id, { text: event.currentTarget.value })
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
                            updateElement(selectedElement.id, { fontFamily })
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
                          <input
                            type="number"
                            min="8"
                            max="240"
                            value={selectedElement.fontSize}
                            onChange={(event) =>
                              updateElement(selectedElement.id, {
                                fontSize: Number(event.currentTarget.value),
                              })
                            }
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
                            onClick={() => updateElement(selectedElement.id, { align })}
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
                              updateElement(selectedElement.id, { textFill: textFill as ColorPaint })
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
                                updateElement(selectedElement.id, { fill: fill as ShapeFill })
                              }
                              onChooseImage={() => shapeFillInputRef.current?.click()}
                              onClearImage={() =>
                                updateElement(selectedElement.id, { fill: { ...DEFAULT_SHAPE_PAINT } })
                              }
                              onImageFitChange={(fit) => {
                                if (selectedElement.fill.type !== 'image') return
                                updateElement(selectedElement.id, {
                                  fill: { ...selectedElement.fill, fit },
                                })
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
                                onClick={() => updateElement(selectedElement.id, { fit: fit.id })}
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
                                onClick={() => updateElement(selectedElement.id, { lineKind })}
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
                            onChange={(stroke) => updateElement(selectedElement.id, { stroke })}
                          />
                        </div>
                        <label>
                          {isShapeElement(selectedElement) ? '描边宽' : '粗细'}
                          <input
                            type="number"
                            min={isShapeElement(selectedElement) ? 0 : 1}
                            max={isLineElement(selectedElement) ? 40 : undefined}
                            value={selectedElement.strokeWidth}
                            onChange={(event) =>
                              updateElement(selectedElement.id, {
                                strokeWidth: Number(event.currentTarget.value),
                              })
                            }
                          />
                        </label>
                      </div>
                    </InspectorSection>
                  )}
                </>
              )}

              <InspectorSection title="排列" testId="inspector-arrange">
                {liveSelection.length > 1 && (
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

              {liveSelection.length === 1 && (
                <InspectorSection title="删除" testId="inspector-danger" tone="danger">
                  <button className="ghost inspector-delete" type="button" onClick={deleteSelection}>
                    删除
                  </button>
                </InspectorSection>
              )}
            </>
          )}
        </aside>
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
