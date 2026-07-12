import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toBlob, toPng } from 'html-to-image'
import { AuthModal } from '../AuthModal'
import { DraftsPanel } from '../DraftsPanel'
import { Select } from '../Select'
import { current as currentUser, logout as authLogout, type User } from '../auth'
import { deleteDraft, listDrafts, saveDraft, type Draft } from '../drafts'
import { downloadZip } from '../exportZip'
import { buildFontEmbedCSS } from '../fontEmbed'
import { downscaleDataUrl } from '../imageStore'
import { FONTS } from '../theme'
import { useAppTheme } from '../useAppTheme'
import {
  createFreeformDocument,
  createImageElement,
  createLineElement,
  createShapeElement,
  createTextElement,
  freeformReducer,
  pageSizePresets,
  validatePageSize,
} from './document'
import { createHistory, pushHistory, redo, undo, type HistoryState } from './history'
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
import { getElementsInMarquee, moveElementsWithinSlide, type Rect } from './selection'
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

function textElementsOf(slides: FreeformSlide[]): FreeformTextElement[] {
  return slides.flatMap((slide) =>
    slide.elements.filter((element): element is FreeformTextElement => element.type === 'text'),
  )
}

function freeformTextForFonts(slides: FreeformSlide[]): string {
  return textElementsOf(slides).map((element) => element.text).join('\n')
}

function firstFreeformFontFamily(slides: FreeformSlide[]): string | null {
  return textElementsOf(slides).find((element) => element.fontFamily.trim().length > 0)?.fontFamily ?? null
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

export function FreeformWorkspace() {
  const [history, setHistory] = useState<HistoryState<FreeformDocument>>(() =>
    createHistory(createFreeformDocument()),
  )
  const doc = history.current
  const activeSlide = activeSlideOf(doc)
  const selectedElementIds = useRef<string[]>([])
  const [selection, setSelection] = useState<string[]>([])
  const [clipboard, setClipboard] = useState<FreeformElement[]>([])
  const [previewScale, setPreviewScale] = useState(0.5)
  const [widthDraft, setWidthDraft] = useState(String(activeSlide.width))
  const [heightDraft, setHeightDraft] = useState(String(activeSlide.height))
  const [sizeError, setSizeError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [showMixedSizeWarning, setShowMixedSizeWarning] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  const [appTheme, toggleAppTheme] = useAppTheme()
  const [user, setUser] = useState<User | null>(() => currentUser())

  const artboardRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const shapeFillInputRef = useRef<HTMLInputElement>(null)

  selectedElementIds.current = selection

  const selectedElement = useMemo(
    () => activeSlide.elements.find((element) => element.id === selection[0]),
    [activeSlide.elements, selection],
  )

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0
  const marqueeRect = marquee ? toRect(marquee) : null

  const refreshDrafts = useCallback(() => {
    setDrafts(user ? listDrafts(user.id) : [])
  }, [user])

  useEffect(() => {
    refreshDrafts()
  }, [refreshDrafts])

  useEffect(() => {
    setWidthDraft(String(activeSlide.width))
    setHeightDraft(String(activeSlide.height))
    setSizeError(null)
  }, [activeSlide.id, activeSlide.width, activeSlide.height])

  useEffect(() => {
    const liveIds = new Set(activeSlide.elements.map((element) => element.id))
    setSelection((ids) => ids.filter((id) => liveIds.has(id)))
  }, [activeSlide.id, activeSlide.elements])

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
    const validation = validatePageSize(width, height)
    if (!validation.ok) {
      setSizeError(validation.message)
      return
    }
    setSizeError(null)
    applyAction({ type: 'slide/resize', slideId: activeSlide.id, width, height })
  }

  function applyCustomSize() {
    applySlideSize(Number(widthDraft), Number(heightDraft))
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

  async function renderSlideNode(slide: FreeformSlide): Promise<string | null> {
    const node = artboardRef.current
    if (!node) return null
    return toPng(node, {
      pixelRatio: 1,
      width: slide.width,
      height: slide.height,
      style: {
        transform: 'none',
      },
      filter: (element) =>
        !(element instanceof HTMLElement && element.classList.contains('freeform-ui-only')),
    })
  }

  async function renderSlideBlob(slide: FreeformSlide, fontEmbedCSS?: string): Promise<Blob | null> {
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

  async function freeformFontEmbedOnce(slides: FreeformSlide[]): Promise<string | undefined> {
    const fontFamily = firstFreeformFontFamily(slides)
    if (!fontFamily) return undefined
    try {
      return await buildFontEmbedCSS(freeformTextForFonts(slides), fontFamily)
    } catch {
      return undefined
    }
  }

  async function exportCurrentSlide() {
    setExporting(true)
    try {
      setSelection([])
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const fontCSS = await freeformFontEmbedOnce(doc.slides)
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
    const originalSlideId = activeSlide.id
    try {
      setSelection([])
      const urls: string[] = []
      for (const slide of doc.slides) {
        replaceCurrent({ type: 'slide/select', slideId: slide.id })
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const url = await renderSlideNode(slide)
        if (url) urls.push(url)
      }
      if (urls.length > 0) {
        const stamp = new Date().toISOString().slice(0, 10)
        await downloadZip(urls, `freeform-slides-${stamp}.zip`, {
          fileNameForIndex: (index) => slidePngName(index),
        })
      }
    } finally {
      replaceCurrent({ type: 'slide/select', slideId: originalSlideId })
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
      setShowAuth(true)
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

  function handleLogout() {
    authLogout()
    setUser(null)
    setDraftId(null)
    setDrafts([])
  }

  return (
    <div className="freeform-workspace" aria-label="自由编辑工作区">
      <header className="freeform-topbar">
        <div className="freeform-title">
          <strong>自由编辑</strong>
          <span data-testid="freeform-slide-size">
            {doc.slides.length} 页 · {activeSlide.width}×{activeSlide.height}px
            {savedAt ? ' · 已保存' : ''}
          </span>
        </div>

        <div className="freeform-toolbar" aria-label="插入工具">
          <button className="bar-btn" type="button" onClick={addText}>
            文本框
          </button>
          <button className="bar-btn" type="button" onClick={() => imageInputRef.current?.click()}>
            图片
          </button>
          <input
            ref={imageInputRef}
            className="freeform-file"
            type="file"
            accept="image/*"
            onChange={(event) => handleImageInput(event.currentTarget.files)}
          />
          {SHAPES.map((shape) => (
            <button
              key={shape.id}
              className="bar-btn"
              type="button"
              onClick={() => addShape(shape.id)}
            >
              {shape.label}
            </button>
          ))}
          <button className="bar-btn" type="button" onClick={() => addLine('line')}>
            直线
          </button>
          <button className="bar-btn" type="button" onClick={() => addLine('arrow')}>
            箭头
          </button>
        </div>

        <div className="freeform-spacer" />

        <button className="bar-btn" type="button" onClick={undoDocument} disabled={!canUndo}>
          撤销
        </button>
        <button className="bar-btn" type="button" onClick={redoDocument} disabled={!canRedo}>
          重做
        </button>
        <button
          className="bar-icon"
          type="button"
          onClick={toggleAppTheme}
          title={appTheme === 'dark' ? '切换到浅色' : '切换到深色'}
          aria-label="切换深浅色"
        >
          {appTheme === 'dark' ? '☀' : '☾'}
        </button>
        <button className="bar-btn" type="button" onClick={handleSaveDraft}>
          保存草稿
        </button>
        <button
          className="bar-btn"
          type="button"
          onClick={() => (user ? setShowDrafts(true) : setShowAuth(true))}
        >
          草稿{user && drafts.length ? ` · ${drafts.length}` : ''}
        </button>
        <button className="bar-btn" type="button" onClick={requestExportAllSlides} disabled={exporting}>
          打包导出
        </button>
        <button className="bar-primary" type="button" onClick={exportCurrentSlide} disabled={exporting}>
          {exporting ? '导出中…' : '导出当前页'}
        </button>
        {user ? (
          <button className="bar-user" type="button" onClick={handleLogout} title="点击退出登录">
            <span className="bar-user-dot">{user.username.slice(0, 1)}</span>
          </button>
        ) : (
          <button className="bar-btn accent-outline" type="button" onClick={() => setShowAuth(true)}>
            登录
          </button>
        )}
      </header>

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
            <div className="freeform-size-bar" aria-label="页面尺寸">
              {pageSizePresets.map((preset) => (
                <button
                  key={preset.ratio}
                  type="button"
                  className={
                    activeSlide.width === preset.width && activeSlide.height === preset.height
                      ? 'size-preset on'
                      : 'size-preset'
                  }
                  onClick={() => applySlideSize(preset.width, preset.height)}
                >
                  {preset.ratio}
                </button>
              ))}
              <label className="size-input">
                宽
                <input
                  aria-label="宽度 px"
                  type="number"
                  min="128"
                  max="4096"
                  value={widthDraft}
                  onChange={(event) => setWidthDraft(event.currentTarget.value)}
                />
              </label>
              <label className="size-input">
                高
                <input
                  aria-label="高度 px"
                  type="number"
                  min="128"
                  max="4096"
                  value={heightDraft}
                  onChange={(event) => setHeightDraft(event.currentTarget.value)}
                />
              </label>
              <button className="mini-btn" type="button" onClick={applyCustomSize}>
                应用尺寸
              </button>
            </div>
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
          {sizeError && <div className="freeform-error">{sizeError}</div>}

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
            {selection.length > 0 && (
              <button className="mini-btn danger" type="button" onClick={deleteSelection}>
                删除
              </button>
            )}
          </div>

          <div className="inspector-section">
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
          </div>

          {selectedElement ? (
            <>
              <div className="inspector-section">
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
              </div>

              {isTextElement(selectedElement) && (
                <div className="inspector-section">
                  <label className="field">
                    <span className="field-label">文本</span>
                    <textarea
                      className="freeform-inspector-text"
                      value={selectedElement.text}
                      onChange={(event) => updateElement(selectedElement.id, { text: event.currentTarget.value })}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">字体</span>
                    <Select
                      value={selectedElement.fontFamily}
                      onChange={(fontFamily) => updateElement(selectedElement.id, { fontFamily })}
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
                          updateElement(selectedElement.id, { fontSize: Number(event.currentTarget.value) })
                        }
                      />
                    </label>
                  </div>
                  <div className="field with-gap" data-testid="text-fill-paint">
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
                </div>
              )}

              {isImageElement(selectedElement) && (
                <div className="inspector-section">
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
                </div>
              )}

              {isShapeElement(selectedElement) && (
                <div className="inspector-section">
                  <div className="field-label">形状</div>
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
                  <div className="field with-gap" data-testid="shape-fill-paint">
                    <PaintField
                      label="填充"
                      value={selectedElement.fill}
                      modes={['solid', 'linear-gradient', 'image']}
                      fallbackPaint={DEFAULT_SHAPE_PAINT}
                      onChange={(fill) => updateElement(selectedElement.id, { fill: fill as ShapeFill })}
                      onChooseImage={() => shapeFillInputRef.current?.click()}
                      onClearImage={() =>
                        updateElement(selectedElement.id, { fill: { ...DEFAULT_SHAPE_PAINT } })
                      }
                      onImageFitChange={(fit) => {
                        if (selectedElement.fill.type !== 'image') return
                        updateElement(selectedElement.id, { fill: { ...selectedElement.fill, fit } })
                      }}
                    />
                  </div>
                  <div className="field-grid with-gap">
                    <div className="color-field" data-testid="shape-stroke-color">
                      <span>描边</span>
                      <ColorPickerButton
                        label="形状描边颜色"
                        color={selectedElement.stroke}
                        onChange={(stroke) => updateElement(selectedElement.id, { stroke })}
                      />
                    </div>
                    <label>
                      描边宽
                      <input
                        type="number"
                        min="0"
                        value={selectedElement.strokeWidth}
                        onChange={(event) =>
                          updateElement(selectedElement.id, { strokeWidth: Number(event.currentTarget.value) })
                        }
                      />
                    </label>
                  </div>
                  <input
                    ref={shapeFillInputRef}
                    className="freeform-file"
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleShapeFillInput(event.currentTarget.files)}
                  />
                </div>
              )}

              {isLineElement(selectedElement) && (
                <div className="inspector-section">
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
                  <div className="field-grid with-gap">
                    <div className="color-field" data-testid="line-stroke-color">
                      <span>颜色</span>
                      <ColorPickerButton
                        label="线条颜色"
                        color={selectedElement.stroke}
                        onChange={(stroke) => updateElement(selectedElement.id, { stroke })}
                      />
                    </div>
                    <label>
                      粗细
                      <input
                        type="number"
                        min="1"
                        max="40"
                        value={selectedElement.strokeWidth}
                        onChange={(event) =>
                          updateElement(selectedElement.id, { strokeWidth: Number(event.currentTarget.value) })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}

              {selection.length > 1 && (
                <div className="inspector-section">
                  <div className="field-label">对齐</div>
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
                    <button className="ghost" type="button" onClick={() => distributeSelection('horizontal')}>
                      水平均分
                    </button>
                    <button className="ghost" type="button" onClick={() => distributeSelection('vertical')}>
                      垂直均分
                    </button>
                  </div>
                </div>
              )}

              <div className="inspector-section">
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
              </div>
            </>
          ) : (
            <div className="inspector-empty">
              选择画布上的对象后，可以编辑位置、尺寸、颜色和图片填充。
            </div>
          )}
        </aside>
      </main>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={(nextUser) => {
            setUser(nextUser)
            setShowAuth(false)
          }}
        />
      )}

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
