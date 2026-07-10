import { PAGE_SIZE_MAX, PAGE_SIZE_MIN, pageSizePresets } from './constants'
import type { FreeformDocument, FreeformSlide } from './types'

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
    background: { type: 'solid', color: '#ffffff' },
    elements: [],
  }
}

export function createFreeformDocument(): FreeformDocument {
  const slide = createSlide()
  return {
    documentVersion: 1,
    activeSlideId: slide.id,
    slides: [slide],
  }
}
