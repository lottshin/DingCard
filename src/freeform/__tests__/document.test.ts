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
import { SCENE_EPSILON, sceneNodesBoundsInParent } from '../sceneTransform'
import type {
  FreeformAction,
  FreeformDocument,
  FreeformGroupNode,
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

function groupWith(
  id: string,
  children: FreeformSceneNode[],
  overrides: Partial<FreeformGroupNode> = {},
): FreeformGroupNode {
  return {
    id,
    name: `Group ${id}`,
    locked: false,
    hidden: false,
    type: 'group',
    x: 200,
    y: 180,
    rotation: 0,
    scale: 1,
    children,
    ...overrides,
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

  it('updates image crop geometry and framing atomically while owning the framing payload', () => {
    const image = createImageElement(createSlide(), 'img:photo', 'Photo')
    Object.assign(image, {
      x: 30,
      y: 40,
      width: 180,
      height: 120,
      rotation: 17,
      scale: 1.25,
      fit: 'cover',
      framing: framing({ focusX: 0.25, focusY: 0.7, zoom: 2 }),
    })
    const document = documentWith([image])
    const nextFraming = framing({ focusX: 0.8, focusY: 0.3, zoom: 3 })
    const action: FreeformAction = {
      type: 'node/update-image-crop',
      slideId: document.activeSlideId,
      path: [image.id],
      patch: {
        x: 120,
        y: 160,
        width: 240,
        height: 180,
        framing: nextFraming,
      },
    }

    const updated = reduceFreeformDocument(document, action)
    nextFraming.focusX = 0.1

    expect(updated).not.toBe(document)
    expect(updated.slides[0].nodes[0]).toMatchObject({
      id: image.id,
      type: 'image',
      x: 120,
      y: 160,
      width: 240,
      height: 180,
      framing: framing({ focusX: 0.8, focusY: 0.3, zoom: 3 }),
      rotation: 17,
      scale: 1.25,
      src: 'img:photo',
      alt: 'Photo',
      fit: 'cover',
    })
    expect((updated.slides[0].nodes[0] as FreeformImageElement).framing).not.toBe(nextFraming)

    const same = reduceFreeformDocument(updated, {
      type: 'node/update-image-crop',
      slideId: updated.activeSlideId,
      path: [image.id],
      patch: {
        x: 120,
        y: 160,
        width: 240,
        height: 180,
        framing: framing({ focusX: 0.8, focusY: 0.3, zoom: 3 }),
      },
    })
    expect(same).toBe(updated)
  })

  it('recenters every affected ancestor once after updating a nested image crop', () => {
    const image = createImageElement(createSlide(), 'img:nested', 'Nested photo')
    Object.assign(image, {
      id: 'nested-image',
      x: -70,
      y: -45,
      width: 140,
      height: 90,
      rotation: 13,
      scale: 0.8,
      framing: framing({ focusX: 0.3, focusY: 0.6, zoom: 1.5 }),
    })
    const innerSibling = createShapeElement(createSlide(), 'rect')
    Object.assign(innerSibling, { id: 'inner-sibling', x: 90, y: 25, rotation: -9, scale: 1.1 })
    const outerSibling = createShapeElement(createSlide(), 'ellipse')
    Object.assign(outerSibling, { id: 'outer-sibling', x: 170, y: -30, rotation: 6, scale: 0.7 })
    const inner = groupWith('inner', [image, innerSibling], {
      x: -110,
      y: 80,
      rotation: 21,
      scale: 1.2,
    })
    const outer = groupWith('outer', [inner, outerSibling], {
      x: 430,
      y: 360,
      rotation: -14,
      scale: 0.9,
    })
    const document = documentWith([outer])

    const updated = reduceFreeformDocument(document, {
      type: 'node/update-image-crop',
      slideId: document.activeSlideId,
      path: ['outer', 'inner', 'nested-image'],
      patch: {
        x: 180,
        y: 130,
        width: 260,
        height: 190,
        framing: framing({ focusX: 0.75, focusY: 0.2, zoom: 3.25 }),
      },
    })

    expect(updated).not.toBe(document)
    const updatedOuter = updated.slides[0].nodes[0] as FreeformGroupNode
    const updatedInner = updatedOuter.children.find((node) => node.id === 'inner') as FreeformGroupNode
    const updatedImage = updatedInner.children.find(
      (node) => node.id === 'nested-image',
    ) as FreeformImageElement
    const innerBounds = sceneNodesBoundsInParent(updatedInner.children)
    const outerBounds = sceneNodesBoundsInParent(updatedOuter.children)

    expect(updatedInner.x).not.toBe(inner.x)
    expect(updatedInner.y).not.toBe(inner.y)
    expect(updatedOuter.x).not.toBe(outer.x)
    expect(updatedOuter.y).not.toBe(outer.y)
    expect(innerBounds).not.toBeNull()
    expect(outerBounds).not.toBeNull()
    expect(innerBounds!.x + innerBounds!.width / 2).toBeCloseTo(0, 6)
    expect(innerBounds!.y + innerBounds!.height / 2).toBeCloseTo(0, 6)
    expect(outerBounds!.x + outerBounds!.width / 2).toBeCloseTo(0, 6)
    expect(outerBounds!.y + outerBounds!.height / 2).toBeCloseTo(0, 6)
    expect(updatedOuter).toMatchObject({ rotation: -14, scale: 0.9 })
    expect(updatedInner).toMatchObject({ rotation: 21, scale: 1.2 })
    expect(updatedImage).toMatchObject({
      width: 260,
      height: 190,
      src: 'img:nested',
      alt: 'Nested photo',
      framing: framing({ focusX: 0.75, focusY: 0.2, zoom: 3.25 }),
    })
    expect(updatedImage.rotation).toBeCloseTo(13, 10)
    expect(updatedImage.scale).toBeCloseTo(0.8, 10)
  })

  it('rejects malformed, unauthorized, hidden, and non-image crop actions atomically', () => {
    const visible = createImageElement(createSlide(), 'img:visible')
    visible.id = 'visible'
    const locked = createImageElement(createSlide(), 'img:locked')
    Object.assign(locked, { id: 'locked', locked: true })
    const hidden = createImageElement(createSlide(), 'img:hidden')
    Object.assign(hidden, { id: 'hidden', hidden: true })
    const lockedChild = createImageElement(createSlide(), 'img:locked-child')
    lockedChild.id = 'locked-child'
    const hiddenChild = createImageElement(createSlide(), 'img:hidden-child')
    hiddenChild.id = 'hidden-child'
    const shape = createShapeElement(createSlide(), 'rect')
    shape.id = 'shape'
    const document = documentWith([
      visible,
      locked,
      hidden,
      groupWith('locked-parent', [lockedChild], { locked: true }),
      groupWith('hidden-parent', [hiddenChild], { hidden: true }),
      shape,
    ])
    const validPatch = {
      x: 100,
      y: 120,
      width: 260,
      height: 180,
      framing: framing({ focusX: 0.7, focusY: 0.2, zoom: 2.5 }),
    }
    const action = (path: readonly string[], patch: unknown = validPatch): FreeformAction => ({
      type: 'node/update-image-crop',
      slideId: document.activeSlideId,
      path,
      patch,
    } as FreeformAction)
    const invalidActions: Array<[string, FreeformAction]> = [
      ['non-image target', action(['shape'])],
      ['unknown path', action(['missing'])],
      ['empty path', action([])],
      ['locked target', action(['locked'])],
      ['locked ancestor', action(['locked-parent', 'locked-child'])],
      ['hidden target', action(['hidden'])],
      ['hidden ancestor', action(['hidden-parent', 'hidden-child'])],
      ['extra action key', { ...action(['visible']), extension: true } as unknown as FreeformAction],
      ['missing slideId', {
        type: 'node/update-image-crop',
        path: ['visible'],
        patch: validPatch,
      } as unknown as FreeformAction],
      ['extra patch key', action(['visible'], { ...validPatch, rotation: 4 })],
      ['missing patch key', action(['visible'], {
        x: validPatch.x,
        y: validPatch.y,
        width: validPatch.width,
        framing: validPatch.framing,
      })],
      ['non-finite x', action(['visible'], { ...validPatch, x: Number.NaN })],
      ['non-finite y', action(['visible'], { ...validPatch, y: Number.POSITIVE_INFINITY })],
      ['non-finite width', action(['visible'], { ...validPatch, width: Number.NEGATIVE_INFINITY })],
      ['non-finite height', action(['visible'], { ...validPatch, height: Number.NaN })],
      ['zero width', action(['visible'], { ...validPatch, width: 0 })],
      ['negative height', action(['visible'], { ...validPatch, height: -1 })],
      ['framing extra key', action(['visible'], {
        ...validPatch,
        framing: { ...validPatch.framing, extension: true },
      })],
      ['framing missing key', action(['visible'], {
        ...validPatch,
        framing: { focusX: 0.5, focusY: 0.5 },
      })],
      ['focusX below range', action(['visible'], {
        ...validPatch,
        framing: framing({ focusX: -0.01 }),
      })],
      ['focusY above range', action(['visible'], {
        ...validPatch,
        framing: framing({ focusY: 1.01 }),
      })],
      ['zoom below range', action(['visible'], {
        ...validPatch,
        framing: framing({ zoom: 0.99 }),
      })],
      ['zoom above range', action(['visible'], {
        ...validPatch,
        framing: framing({ zoom: 4.01 }),
      })],
      ['non-finite focus', action(['visible'], {
        ...validPatch,
        framing: framing({ focusX: Number.NaN }),
      })],
      ['non-finite zoom', action(['visible'], {
        ...validPatch,
        framing: framing({ zoom: Number.POSITIVE_INFINITY }),
      })],
    ]

    for (const [label, invalidAction] of invalidActions) {
      expect(reduceFreeformDocument(document, invalidAction), label).toBe(document)
    }
  })

  it('keeps the original document when crop validation throws after geometry is prepared', () => {
    const image = createImageElement(createSlide(), 'img:photo')
    image.id = 'image'
    const document = documentWith([image])
    const originalImage = {
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      framing: { ...image.framing },
    }
    const throwingPatch = {
      x: 140,
      y: 160,
      width: 280,
      height: 200,
      get framing(): ImageFraming {
        throw new Error('framing validation failed')
      },
    }
    const action = {
      type: 'node/update-image-crop',
      slideId: document.activeSlideId,
      path: ['image'],
      patch: throwingPatch,
    } as unknown as FreeformAction

    expect(() => reduceFreeformDocument(document, action)).not.toThrow()
    expect(reduceFreeformDocument(document, action)).toBe(document)
    expect(document.slides[0].nodes[0]).toBe(image)
    expect(image).toMatchObject(originalImage)
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
