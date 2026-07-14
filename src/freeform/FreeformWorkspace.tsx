import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import { DraftsPanel } from '../DraftsPanel'
import { Select } from '../Select'
import { deleteDraft, listDrafts, saveDraft, type Draft } from '../drafts'
import { downloadZip } from '../exportZip'
import { buildFontEmbedCSS } from '../fontEmbed'
import { downscaleDataUrl } from '../imageStore'
import { FONTS } from '../theme'
import { ToolbarDivider, ToolbarGroup, WorkspaceToolbar } from '../workspaces/WorkspaceToolbar'
import type { WorkspaceShellProps } from '../workspaces/types'
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
import { InspectorSection } from './InspectorSection'
import { createHistory, pushHistory, redo, undo, type HistoryState } from './history'
import {
  buildFreeformFontCSS,
  collectFreeformFontRequests,
} from './fontRequests'
import { ColorPickerButton, PaintField } from './PaintField'
import { PlainTextEditable } from './PlainTextEditable'
import {
  DEFAULT_PAGE_PAINT,
  DEFAULT_SHAPE_PAINT,
  DEFAULT_TEXT_PAINT,
  shapeFillToStyle,
  slideBackgroundToCss,
  textFillToStyle,
} from './paint'
import {
  filterLiveSelectionIds,
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
  FreeformShapeElement,
  FreeformSlide,
  FreeformTextElement,
  ShapeFill,
  SlideBackground,
} from './types'

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
  return doc.slides.find((slide) => slide.id === doc.activeSlideId) ?? doc.slides[0]
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

function cloneElementForPaste(element: FreeformElement, slide: FreeformSlide): FreeformElement {
  return {
    ...element,
    id: crypto.randomUUID(),
    x: Math.min(Math.max(0, element.x + 16), Math.max(0, slide.width - element.width)),
    y: Math.min(Math.max(0, element.y + 16), Math.max(0, slide.height - element.height)),
  }
}

type Alignment = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom'
type Distribution = 'horizontal' | 'vertical'
type MarqueeState = { startX: number; startY: number; currentX: number; currentY: number }

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
  const [selection, setSelection] = useState<string[]>([])
  const [clipboard, setClipboard] = useState<FreeformElement[]>([])
  const [previewScale, setPreviewScale] = useState(0.5)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null)
  const [showMixedSizeWarning, setShowMixedSizeWarning] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])

  const artboardRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const shapeFillInputRef = useRef<HTMLInputElement>(null)
  const previousUserId = useRef<string | null>(user?.id ?? null)

  selectedElementIds.current = selection

  const liveSelection = useMemo(
    () => filterLiveSelectionIds(activeSlide.elements, selection),
    [activeSlide.elements, selection],
  )
  const selectedElement = useMemo(
    () => activeSlide.elements.find((element) => element.id === liveSelection[0]),
    [activeSlide.elements, liveSelection],
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

  const refreshDrafts = useCallback(() => {
    setDrafts(user ? listDrafts(user.id) : [])
  }, [user])

  useEffect(() => {
    const nextUserId = user?.id ?? null
    setDrafts(user ? listDrafts(user.id) : [])

    if (previousUserId.current !== nextUserId) {
      previousUserId.current = nextUserId
      setDraftId(null)
      setSavedAt(null)
      setShowDrafts(false)
    }
  }, [user])

  useEffect(() => {
    const liveIds = new Set(activeSlide.elements.map((element) => element.id))
    setSelection((ids) => ids.filter((id) => liveIds.has(id)))
  }, [activeSlide.id, activeSlide.elements])

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
    setHistory((current) => {
      const next = freeformReducer(current.current, action)
      if (Object.is(next, current.current)) return current
      return pushHistory(current, next)
    })
    setSavedAt(null)
  }, [])

  const replaceCurrent = useCallback((action: FreeformAction) => {
    setHistory((current) => ({
      ...current,
      current: freeformReducer(current.current, action),
    }))
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
    applyAction({ type: 'element/add', slideId: activeSlide.id, element })
    setSelection([element.id])
  }

  function addShape(shape: FreeformShapeElement['shape']) {
    const element = createShapeElement(activeSlide, shape)
    applyAction({ type: 'element/add', slideId: activeSlide.id, element })
    setSelection([element.id])
  }

  function addLine(lineKind: FreeformLineElement['lineKind']) {
    const element = createLineElement(activeSlide, lineKind)
    applyAction({ type: 'element/add', slideId: activeSlide.id, element })
    setSelection([element.id])
  }

  async function addImageFromFile(file: File) {
    const raw = await readFileAsDataUrl(file)
    const src = await downscaleDataUrl(raw, 1800)
    const element = createImageElement(activeSlide, src, file.name)
    applyAction({ type: 'element/add', slideId: activeSlide.id, element })
    setSelection([element.id])
  }

  async function handleImageInput(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    await addImageFromFile(file)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  async function fillSelectedShapeFromFile(file: File) {
    if (!isShapeElement(selectedElement)) return
    const raw = await readFileAsDataUrl(file)
    const src = await downscaleDataUrl(raw, 1800)
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
    await fillSelectedShapeFromFile(file)
    if (shapeFillInputRef.current) shapeFillInputRef.current.value = ''
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
    applyAction({ type: 'element/delete', slideId: activeSlide.id, elementIds: selection })
    setSelection([])
  }

  function copySelection() {
    if (selection.length === 0) return
    const selected = activeSlide.elements.filter((element) => selection.includes(element.id))
    setClipboard(selected.map((element) => ({ ...element })))
  }

  function pasteClipboard() {
    if (clipboard.length === 0) return
    const pasted = clipboard.map((element) => cloneElementForPaste(element, activeSlide))
    setHistory((current) => {
      const next = pasted.reduce(
        (docSoFar, element) =>
          freeformReducer(docSoFar, {
            type: 'element/add',
            slideId: activeSlide.id,
            element,
          }),
        current.current,
      )
      return pushHistory(current, next)
    })
    setSelection(pasted.map((element) => element.id))
    setSavedAt(null)
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
    const selectedElements = activeSlide.elements.filter((element) => selection.includes(element.id))
    if (selectedElements.length < 2) return

    const left = Math.min(...selectedElements.map((element) => element.x))
    const right = Math.max(...selectedElements.map((element) => element.x + element.width))
    const top = Math.min(...selectedElements.map((element) => element.y))
    const bottom = Math.max(...selectedElements.map((element) => element.y + element.height))
    const horizontalCenter = Math.round((left + right) / 2)
    const verticalCenter = Math.round((top + bottom) / 2)

    setHistory((current) => {
      const next = selectedElements.reduce((docSoFar, element) => {
        const patch: Partial<FreeformElement> =
          alignment === 'left'
            ? { x: left }
            : alignment === 'h-center'
              ? { x: horizontalCenter - Math.round(element.width / 2) }
              : alignment === 'right'
                ? { x: right - element.width }
                : alignment === 'top'
                  ? { y: top }
                  : alignment === 'v-center'
                    ? { y: verticalCenter - Math.round(element.height / 2) }
                    : { y: bottom - element.height }

        return freeformReducer(docSoFar, {
          type: 'element/update',
          slideId: activeSlide.id,
          elementId: element.id,
          patch,
        })
      }, current.current)

      return pushHistory(current, next)
    })
    setSavedAt(null)
  }

  function distributeSelection(distribution: Distribution) {
    const selectedElements = activeSlide.elements.filter((element) => selection.includes(element.id))
    if (selectedElements.length < 3) return

    const sorted = [...selectedElements].sort((a, b) =>
      distribution === 'horizontal' ? a.x - b.x : a.y - b.y,
    )
    const first = sorted[0]
    const last = sorted[sorted.length - 1]

    const start = distribution === 'horizontal' ? first.x : first.y
    const end =
      distribution === 'horizontal' ? last.x + last.width : last.y + last.height
    const totalSize = sorted.reduce(
      (sum, element) => sum + (distribution === 'horizontal' ? element.width : element.height),
      0,
    )
    const gap = (end - start - totalSize) / (sorted.length - 1)

    setHistory((current) => {
      let cursor = start
      const next = sorted.reduce((docSoFar, element) => {
        const patch: Partial<FreeformElement> =
          distribution === 'horizontal' ? { x: Math.round(cursor) } : { y: Math.round(cursor) }
        cursor += (distribution === 'horizontal' ? element.width : element.height) + gap

        return freeformReducer(docSoFar, {
          type: 'element/update',
          slideId: activeSlide.id,
          elementId: element.id,
          patch,
        })
      }, current.current)

      return pushHistory(current, next)
    })
    setSavedAt(null)
  }

  function applySlideSize(width: number, height: number) {
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

    const elementById = new Map(activeSlide.elements.map((element) => [element.id, element]))
    const patches = moveElementsWithinSlide(activeSlide, activeSlide.elements, selectedIds, dx, dy).filter(
      ({ elementId, patch }) => {
        const element = elementById.get(elementId)
        return element && (element.x !== patch.x || element.y !== patch.y)
      },
    )

    if (patches.length === 0) return

    setHistory((current) => {
      const next = patches.reduce(
        (docSoFar, { elementId, patch }) =>
          freeformReducer(docSoFar, {
            type: 'element/update',
            slideId: activeSlide.id,
            elementId,
            patch,
          }),
        current.current,
      )

      if (Object.is(next, current.current)) return current
      return pushHistory(current, next)
    })
    setSavedAt(null)
  }

  useEffect(() => {
    if (!isActive) return
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
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

  function onElementPointerDown(event: React.PointerEvent, element: FreeformElement) {
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
    const startElements = activeSlide.elements
    const startX = event.clientX
    const startY = event.clientY

    const onMove = (moveEvent: PointerEvent) => {
      const rawDx = Math.round((moveEvent.clientX - startX) / previewScale)
      const rawDy = Math.round((moveEvent.clientY - startY) / previewScale)
      const snap = snapDrag(activeSlide, startElements, draggingIds, rawDx, rawDy)
      const patches = moveElementsWithinSlide(activeSlide, startElements, draggingIds, snap.dx, snap.dy)
      setSnapLines(snap.lines)
      setHistory((current) => {
        const next = patches.reduce(
          (docSoFar, { elementId, patch }) =>
            freeformReducer(docSoFar, {
              type: 'element/update',
              slideId: activeSlide.id,
              elementId,
              patch,
            }),
          current.current,
        )

        return {
          ...current,
          current: next,
        }
      })
    }

    const cleanupDrag = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
      setSnapLines([])
    }

    const finishDrag = () => {
      cleanupDrag()
      commitLiveEdit(startDocument)
    }

    const onUp = () => finishDrag()
    const onCancel = () => finishDrag()

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
  }

  function artboardPointFromClient(clientX: number, clientY: number) {
    const artboard = artboardRef.current
    if (!artboard) return null
    const bounds = artboard.getBoundingClientRect()
    return {
      x: Math.round(clamp((clientX - bounds.left) / previewScale, 0, activeSlide.width)),
      y: Math.round(clamp((clientY - bounds.top) / previewScale, 0, activeSlide.height)),
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

      setSelection(getElementsInMarquee(activeSlide.elements, rect))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onResizePointerDown(event: React.PointerEvent, element: FreeformElement) {
    event.preventDefault()
    event.stopPropagation()
    setSelection([element.id])

    const startDocument = doc
    const startX = event.clientX
    const startY = event.clientY
    const startW = element.width
    const startH = element.height

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / previewScale
      const dy = (moveEvent.clientY - startY) / previewScale
      const width = Math.round(clamp(startW + dx, 40, activeSlide.width - element.x))
      const height = Math.round(clamp(startH + dy, 40, activeSlide.height - element.y))
      replaceCurrent({
        type: 'element/update',
        slideId: activeSlide.id,
        elementId: element.id,
        patch: { width, height },
      })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      commitLiveEdit(startDocument)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
    if (doc.slides.length === 0) return
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
    if (hasMixedSlideSizes(doc.slides)) {
      setShowMixedSizeWarning(true)
      return
    }
    void exportAllSlides()
  }

  function continueMixedSizeExport() {
    setShowMixedSizeWarning(false)
    void exportAllSlides()
  }

  function handleSaveDraft() {
    if (!user) {
      requestAuth()
      return
    }
    const saved = saveDraft(user.id, {
      id: draftId ?? undefined,
      mode: 'freeform-slide',
      document: doc,
    })
    setDraftId(saved.id)
    setSavedAt(saved.updatedAt)
    refreshDrafts()
  }

  function openDraft(draft: Draft) {
    if (draft.mode !== 'freeform-slide') return
    setHistory(createHistory(draft.document))
    setSelection([])
    setDraftId(draft.id)
    setSavedAt(draft.updatedAt)
    setShowDrafts(false)
  }

  function removeDraft(id: string) {
    if (!user) return
    deleteDraft(user.id, id)
    if (id === draftId) setDraftId(null)
    refreshDrafts()
  }

  return (
    <div className="freeform-workspace" aria-label="自由编辑工作区">
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
            <span className="freeform-page-meta" data-testid="freeform-slide-meta">
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
          <button className="bar-btn" type="button" onClick={handleSaveDraft}>
            保存草稿
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
          <button className="bar-btn" type="button" onClick={requestExportAllSlides} disabled={exporting}>
            {exportProgress ? `导出 ${exportProgress.current}/${exportProgress.total}` : '打包导出'}
          </button>
          <button
            className="toolbar-primary"
            type="button"
            data-testid="freeform-primary-export"
            onClick={exportCurrentSlide}
            disabled={exporting}
          >
            {exporting ? '导出中…' : '导出当前页'}
          </button>
        </ToolbarGroup>
      </WorkspaceToolbar>

      <main className="freeform-main">
        <aside className="freeform-rail" aria-label="页面列表">
          <div className="freeform-panel-head">
            <span>页面</span>
            <button className="mini-btn" type="button" onClick={addSlide}>
              新增页面
            </button>
          </div>
          <div className="freeform-slide-list">
            {doc.slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={slide.id === activeSlide.id ? 'freeform-thumb on' : 'freeform-thumb'}
                onClick={() => selectSlide(slide.id)}
              >
                <span
                  className="freeform-thumb-art"
                  style={{
                    aspectRatio: `${slide.width} / ${slide.height}`,
                    background: slideBackgroundToCss(slide.background),
                  }}
                />
                <span className="freeform-thumb-title">
                  {index + 1}. {slide.name}
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
                onClick={() => setPreviewScale((scale) => Math.max(0.2, Number((scale - 0.1).toFixed(2))))}
              >
                −
              </button>
              <button className="zoom-value" type="button" onClick={() => setPreviewScale(0.5)}>
                {Math.round(previewScale * 100)}%
              </button>
              <button
                className="zoom-btn"
                type="button"
                onClick={() => setPreviewScale((scale) => Math.min(1.2, Number((scale + 0.1).toFixed(2))))}
              >
                +
              </button>
            </div>
          </div>

          <div className="freeform-stage-scroll">
            <div
              className="freeform-stage-box"
              style={{
                width: activeSlide.width * previewScale,
                height: activeSlide.height * previewScale,
              }}
            >
              <div
                ref={artboardRef}
                className="freeform-artboard"
                data-testid="freeform-canvas"
                onPointerDown={onArtboardPointerDown}
                style={{
                  width: activeSlide.width,
                  height: activeSlide.height,
                  transform: `scale(${previewScale})`,
                  background: slideBackgroundToCss(activeSlide.background),
                }}
              >
                {activeSlide.elements.map((element) => (
                  <div
                    key={element.id}
                    className={selection.includes(element.id) ? 'freeform-element selected' : 'freeform-element'}
                    data-testid="freeform-element"
                    data-selected={selection.includes(element.id) ? 'true' : 'false'}
                    onPointerDown={(event) => onElementPointerDown(event, element)}
                    style={{
                      left: element.x,
                      top: element.y,
                      width: element.width,
                      height: element.height,
                      transform: `rotate(${element.rotation}deg)`,
                    }}
                  >
                    <FreeformElementContent
                      element={element}
                      onTextChange={(text) => updateElement(element.id, { text })}
                      onTextFocus={() => setSelection([element.id])}
                    />
                    {selection.includes(element.id) && (
                      <>
                        <span className="freeform-ui-only element-outline" />
                        <button
                          className="freeform-ui-only element-drag"
                          type="button"
                          aria-label="移动对象"
                          title="拖拽移动"
                          onPointerDown={(event) => onElementPointerDown(event, element)}
                        />
                        <button
                          className="freeform-ui-only element-resize"
                          type="button"
                          aria-label="调整大小"
                          onPointerDown={(event) => onResizePointerDown(event, element)}
                        />
                      </>
                    )}
                  </div>
                ))}
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
            </div>
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
                <button type="button" className="accent" onClick={continueMixedSizeExport}>
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

interface FreeformElementContentProps {
  element: FreeformElement
  onTextChange: (text: string) => void
  onTextFocus: () => void
}

function FreeformElementContent({ element, onTextChange, onTextFocus }: FreeformElementContentProps) {
  if (element.type === 'text') {
    return (
      <PlainTextEditable
        className="freeform-textbox"
        ariaLabel="文本内容"
        value={element.text}
        onFocus={onTextFocus}
        onChange={onTextChange}
        style={{
          fontFamily: element.fontFamily,
          fontSize: element.fontSize,
          ...textFillToStyle(element.textFill),
          textAlign: element.align,
          fontWeight: element.fontWeight,
        }}
      />
    )
  }

  if (element.type === 'image') {
    return (
      <img
        className="freeform-image"
        src={element.src}
        alt={element.alt}
        draggable={false}
        style={{ objectFit: element.fit }}
      />
    )
  }

  if (element.type === 'line') {
    const markerId = `arrow-${element.id}`
    return (
      <svg
        className="freeform-line"
        data-testid={element.lineKind === 'arrow' ? 'freeform-arrow' : 'freeform-line'}
        viewBox={`0 0 ${element.width} ${element.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {element.lineKind === 'arrow' && (
          <defs>
            <marker
              id={markerId}
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill={element.stroke} />
            </marker>
          </defs>
        )}
        <line
          x1={element.strokeWidth}
          y1={element.height / 2}
          x2={element.width - element.strokeWidth * 2}
          y2={element.height / 2}
          stroke={element.stroke}
          strokeWidth={element.strokeWidth}
          strokeLinecap="round"
          markerEnd={element.lineKind === 'arrow' ? `url(#${markerId})` : undefined}
        />
      </svg>
    )
  }

  return (
    <div
      className={`freeform-shape shape-${element.shape}`}
      data-testid={element.fill.type === 'image' ? 'freeform-shape-image-fill' : 'freeform-shape'}
      style={{
        ...shapeFillToStyle(element.fill),
        borderColor: element.stroke,
        borderWidth: element.strokeWidth,
      }}
    />
  )
}
