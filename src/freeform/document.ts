import { PAGE_SIZE_MAX, PAGE_SIZE_MIN, pageSizePresets } from './constants'
import { DEFAULT_PAGE_PAINT, DEFAULT_SHAPE_PAINT, DEFAULT_TEXT_PAINT } from './paint'
import type {
  FreeformAction,
  FreeformDocument,
  FreeformElement,
  FreeformImageElement,
  FreeformLineElement,
  FreeformShapeElement,
  FreeformSlide,
  FreeformTextElement,
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
    elements: [],
  }
}

export function createFreeformDocument(): FreeformDocument {
  const slide = createSlide()
  return {
    documentVersion: 2,
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
    type: 'text',
    ...centerBox(slide, Math.min(520, Math.round(slide.width * 0.55)), 150),
    rotation: 0,
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
    type: 'image',
    ...centerBox(slide, Math.min(560, Math.round(slide.width * 0.58)), 360),
    rotation: 0,
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
    type: 'shape',
    ...centerBox(slide, 360, 240),
    rotation: 0,
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
    type: 'line',
    lineKind,
    ...centerBox(slide, Math.min(520, Math.round(slide.width * 0.55)), 80),
    rotation: 0,
    stroke: '#18181b',
    strokeWidth: 6,
  }
}

function withSlide(
  document: FreeformDocument,
  slideId: string,
  update: (slide: FreeformSlide) => FreeformSlide,
): FreeformDocument {
  return {
    ...document,
    slides: document.slides.map((slide) => (slide.id === slideId ? update(slide) : slide)),
  }
}

function cloneSlide(slide: FreeformSlide): FreeformSlide {
  return {
    ...slide,
    id: crypto.randomUUID(),
    name: `${slide.name} copy`,
    background: { ...slide.background },
    elements: slide.elements.map((element) => ({ ...element })),
  }
}

function reorderElements(
  elements: FreeformElement[],
  elementIds: string[],
  direction: 'forward' | 'backward' | 'front' | 'back',
): FreeformElement[] {
  const selected = new Set(elementIds)
  if (selected.size === 0) return elements

  if (direction === 'front') {
    return [...elements.filter((element) => !selected.has(element.id)), ...elements.filter((element) => selected.has(element.id))]
  }
  if (direction === 'back') {
    return [...elements.filter((element) => selected.has(element.id)), ...elements.filter((element) => !selected.has(element.id))]
  }

  const next = [...elements]
  if (direction === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) {
      if (selected.has(next[i].id) && !selected.has(next[i + 1].id)) {
        ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (selected.has(next[i].id) && !selected.has(next[i - 1].id)) {
        ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      }
    }
  }
  return next
}

export function freeformReducer(document: FreeformDocument, action: FreeformAction): FreeformDocument {
  switch (action.type) {
    case 'slide/add-after-active': {
      const activeIndex = document.slides.findIndex((slide) => slide.id === document.activeSlideId)
      const activeSlide = document.slides[activeIndex] ?? document.slides[0]
      const slide = {
        ...createSlide({ inheritFrom: activeSlide }),
        name: `Page ${document.slides.length + 1}`,
      }
      const insertAt = activeIndex >= 0 ? activeIndex + 1 : document.slides.length
      return {
        ...document,
        activeSlideId: slide.id,
        slides: [
          ...document.slides.slice(0, insertAt),
          slide,
          ...document.slides.slice(insertAt),
        ],
      }
    }
    case 'slide/duplicate': {
      const index = document.slides.findIndex((slide) => slide.id === action.slideId)
      if (index < 0) return document
      const slide = cloneSlide(document.slides[index])
      return {
        ...document,
        activeSlideId: slide.id,
        slides: [
          ...document.slides.slice(0, index + 1),
          slide,
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
        activeSlideId:
          document.activeSlideId === action.slideId ? fallback.id : document.activeSlideId,
        slides,
      }
    }
    case 'slide/select':
      return document.slides.some((slide) => slide.id === action.slideId)
        ? { ...document, activeSlideId: action.slideId }
        : document
    case 'slide/update':
      return withSlide(document, action.slideId, (slide) => ({
        ...slide,
        ...action.patch,
      }))
    case 'slide/resize':
      if (!validatePageSize(action.width, action.height).ok) return document
      return withSlide(document, action.slideId, (slide) => ({
        ...slide,
        width: action.width,
        height: action.height,
      }))
    case 'element/add':
      return withSlide(document, action.slideId, (slide) => ({
        ...slide,
        elements: [...slide.elements, action.element],
      }))
    case 'element/update':
      return withSlide(document, action.slideId, (slide) => ({
        ...slide,
        elements: slide.elements.map((element) =>
          element.id === action.elementId ? ({ ...element, ...action.patch } as FreeformElement) : element,
        ),
      }))
    case 'element/delete': {
      const selected = new Set(action.elementIds)
      return withSlide(document, action.slideId, (slide) => ({
        ...slide,
        elements: slide.elements.filter((element) => !selected.has(element.id)),
      }))
    }
    case 'element/reorder':
      return withSlide(document, action.slideId, (slide) => ({
        ...slide,
        elements: reorderElements(slide.elements, action.elementIds, action.direction),
      }))
    default:
      return document
  }
}
