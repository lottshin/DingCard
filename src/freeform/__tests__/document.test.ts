import { describe, expect, it } from 'vitest'
import {
  createFreeformDocument,
  createSlide,
  createTextElement,
  freeformReducer,
  pageSizePresets,
  validatePageSize,
} from '../document'

describe('freeform document', () => {
  it('creates a default 3:4 document', () => {
    const doc = createFreeformDocument()

    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0].width).toBe(1080)
    expect(doc.slides[0].height).toBe(1440)
    expect(doc.activeSlideId).toBe(doc.slides[0].id)
  })

  it('creates v2 documents with shared paint defaults', () => {
    const doc = createFreeformDocument()

    expect(doc.documentVersion).toBe(2)
    expect(doc.slides[0].background).toEqual({ type: 'solid', color: '#ffffff' })

    const text = createTextElement(doc.slides[0])

    expect(text.textFill).toEqual({ type: 'solid', color: '#18181b' })
    expect('color' in text).toBe(false)
  })

  it('creates new slides by inheriting current size', () => {
    const current = createSlide({ width: 1920, height: 1080 })
    const next = createSlide({ inheritFrom: current })

    expect(next.width).toBe(1920)
    expect(next.height).toBe(1080)
  })

  it('validates custom pixel sizes', () => {
    expect(validatePageSize(128, 128).ok).toBe(true)
    expect(validatePageSize(4096, 4096).ok).toBe(true)
    expect(validatePageSize(127, 1080).ok).toBe(false)
    expect(validatePageSize(5000, 1080).ok).toBe(false)
  })

  it('exposes required presets', () => {
    expect(pageSizePresets.map((p) => p.ratio)).toEqual(['1:1', '3:4', '4:3', '9:16', '16:9'])
  })

  it('adds a slide that inherits active slide size', () => {
    const doc = createFreeformDocument()
    const resized = freeformReducer(doc, {
      type: 'slide/resize',
      slideId: doc.activeSlideId,
      width: 1920,
      height: 1080,
    })

    const next = freeformReducer(resized, { type: 'slide/add-after-active' })

    expect(next.slides).toHaveLength(2)
    expect(next.slides[1].width).toBe(1920)
    expect(next.slides[1].height).toBe(1080)
    expect(next.activeSlideId).toBe(next.slides[1].id)
  })

  it('changes only the requested slide size', () => {
    const doc = freeformReducer(createFreeformDocument(), { type: 'slide/add-after-active' })
    const firstSlideId = doc.slides[0].id
    const secondSlideId = doc.slides[1].id

    const next = freeformReducer(doc, {
      type: 'slide/resize',
      slideId: secondSlideId,
      width: 1080,
      height: 1920,
    })

    expect(next.slides.find((slide) => slide.id === firstSlideId)?.height).toBe(1440)
    expect(next.slides.find((slide) => slide.id === secondSlideId)?.height).toBe(1920)
  })

  it('keeps document identity when resizing a slide to its current size', () => {
    const doc = createFreeformDocument()

    const next = freeformReducer(doc, {
      type: 'slide/resize',
      slideId: doc.activeSlideId,
      width: doc.slides[0].width,
      height: doc.slides[0].height,
    })

    expect(next).toBe(doc)
  })
})
