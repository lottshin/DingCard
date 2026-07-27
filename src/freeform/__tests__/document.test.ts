import { describe, expect, it } from 'vitest'
import {
  createFreeformDocument,
  createImageElement,
  createLineElement,
  createShapeElement,
  createSlide,
  createTextElement,
  freeformReducer,
  pageSizePresets,
  reduceFreeformDocument,
  validatePageSize,
} from '../document'
import { SCENE_EPSILON } from '../sceneTransform'
import type {
  FreeformDocument,
  FreeformImageElement,
  FreeformSceneNode,
  FreeformShapeElement,
  ImageFraming,
} from '../types'

function framing(overrides: Partial<ImageFraming> = {}): ImageFraming {
  return { focusX: 0.5, focusY: 0.5, zoom: 1, ...overrides }
}

function documentWith(nodes: FreeformSceneNode[]): FreeformDocument {
  const document = createFreeformDocument()
  return {
    ...document,
    slides: [{ ...document.slides[0], nodes }],
  }
}

describe('freeform document', () => {
  it('creates a default 3:4 document', () => {
    const doc = createFreeformDocument()

    expect(doc.slides).toHaveLength(1)
    expect(doc.slides[0].width).toBe(1080)
    expect(doc.slides[0].height).toBe(1440)
    expect(doc.activeSlideId).toBe(doc.slides[0].id)
  })

  it('creates v4 documents and strict leaves with independent image framing', () => {
    const doc = createFreeformDocument()

    expect(doc.documentVersion).toBe(4)
    expect(doc.slides[0].nodes).toEqual([])
    expect(doc.slides[0].background).toEqual({ type: 'solid', color: '#ffffff' })

    const text = createTextElement(doc.slides[0])
    const image = createImageElement(doc.slides[0], '/image.png')
    const secondImage = createImageElement(doc.slides[0], '/second-image.png')
    const shape = createShapeElement(doc.slides[0], 'rect')
    const line = createLineElement(doc.slides[0], 'arrow')

    expect(text.textFill).toEqual({ type: 'solid', color: '#18181b' })
    expect(image.framing).toEqual(framing())
    expect(secondImage.framing).toEqual(framing())
    expect(image.framing).not.toBe(secondImage.framing)
    expect([text, image, shape, line].map((leaf) => ({
      name: leaf.name,
      locked: leaf.locked,
      hidden: leaf.hidden,
      scale: leaf.scale,
    }))).toEqual([
      { name: '文本', locked: false, hidden: false, scale: 1 },
      { name: '图片', locked: false, hidden: false, scale: 1 },
      { name: '形状', locked: false, hidden: false, scale: 1 },
      { name: '箭头', locked: false, hidden: false, scale: 1 },
    ])
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

  it('updates standalone framing atomically, owns payloads, and ignores epsilon-equal values', () => {
    const image = createImageElement(createSlide(), 'img:photo')
    image.framing = framing({ focusX: 0.25, focusY: 0.7, zoom: 2 })
    const document = documentWith([image])
    const equalFraming = framing({
      focusX: image.framing.focusX + SCENE_EPSILON / 2,
      focusY: image.framing.focusY,
      zoom: image.framing.zoom,
    })

    expect(reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{ path: [image.id], patch: { framing: equalFraming } }],
    })).toBe(document)

    const nextFraming = framing({ focusX: 0.8, focusY: 0.3, zoom: 3 })
    const updated = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{ path: [image.id], patch: { framing: nextFraming } }],
    })
    nextFraming.focusX = 0.1

    expect((updated.slides[0].nodes[0] as FreeformImageElement).framing).toEqual(
      framing({ focusX: 0.8, focusY: 0.3, zoom: 3 }),
    )
    expect((updated.slides[0].nodes[0] as FreeformImageElement).framing).not.toBe(nextFraming)

    expect(reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{
        path: [image.id],
        patch: { fit: 'contain', framing: framing({ focusX: 2 }) },
      }],
    })).toBe(document)
  })

  it('resets framing only when a standalone source actually changes', () => {
    const image = createImageElement(createSlide(), 'img:old', 'Old alt')
    image.fit = 'contain'
    image.framing = framing({ focusX: 0.2, focusY: 0.8, zoom: 2.5 })
    const document = documentWith([image])

    const altOnly = reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId: document.activeSlideId,
      updates: [{ path: [image.id], patch: { alt: 'New alt' } }],
    })
    expect(altOnly.slides[0].nodes[0]).toMatchObject({
      src: 'img:old',
      alt: 'New alt',
      fit: 'contain',
      framing: image.framing,
    })

    const fitOnly = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{ path: [image.id], patch: { fit: 'cover' } }],
    })
    expect(fitOnly.slides[0].nodes[0]).toMatchObject({
      src: 'img:old',
      fit: 'cover',
      framing: image.framing,
    })

    const replaced = reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId: document.activeSlideId,
      updates: [{ path: [image.id], patch: { src: 'img:new' } }],
    })
    expect(replaced.slides[0].nodes[0]).toMatchObject({
      src: 'img:new',
      alt: 'Old alt',
      fit: 'contain',
      framing: framing(),
    })

    expect(reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId: document.activeSlideId,
      updates: [{ path: [image.id], patch: { src: 'img:old' } }],
    })).toBe(document)
  })

  it('distinguishes shape framing edits, source replacement, and first image fill', () => {
    const imageShape = createShapeElement(createSlide(), 'ellipse')
    imageShape.fill = {
      type: 'image',
      src: 'img:old-fill',
      fit: 'contain',
      framing: framing({ focusX: 0.2, focusY: 0.7, zoom: 2 }),
    }
    const colorShape = createShapeElement(createSlide(), 'rect')
    const document = documentWith([imageShape, colorShape])

    const equalFill = {
      type: 'image' as const,
      src: imageShape.fill.src,
      fit: imageShape.fill.fit,
      framing: { ...imageShape.fill.framing },
    }
    expect(reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{ path: [imageShape.id], patch: { fill: equalFill } }],
    })).toBe(document)

    const reframed = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{
        path: [imageShape.id],
        patch: {
          fill: {
            ...equalFill,
            framing: framing({ focusX: 0.8, focusY: 0.4, zoom: 3 }),
          },
        },
      }],
    })
    expect((reframed.slides[0].nodes[0] as FreeformShapeElement).fill).toMatchObject({
      src: 'img:old-fill',
      fit: 'contain',
      framing: framing({ focusX: 0.8, focusY: 0.4, zoom: 3 }),
    })

    const replaced = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{
        path: [imageShape.id],
        patch: {
          fill: {
            type: 'image',
            src: 'img:new-fill',
            fit: 'cover',
            framing: framing({ focusX: 0.1, zoom: 4 }),
          },
        },
      }],
    })
    expect((replaced.slides[0].nodes[0] as FreeformShapeElement).fill).toEqual({
      type: 'image',
      src: 'img:new-fill',
      fit: 'contain',
      framing: framing(),
    })

    const firstFill = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.activeSlideId,
      updates: [{
        path: [colorShape.id],
        patch: {
          fill: {
            type: 'image',
            src: 'img:first-fill',
            fit: 'contain',
            framing: framing({ focusY: 0.2, zoom: 2 }),
          },
        },
      }],
    })
    expect((firstFill.slides[0].nodes[1] as FreeformShapeElement).fill).toEqual({
      type: 'image',
      src: 'img:first-fill',
      fit: 'cover',
      framing: framing(),
    })
  })
})
