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
  FreeformTextElement,
  ImageFraming,
  RichTextSpan,
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

  it('creates v7 documents and strict leaves with independent image framing', () => {
    const doc = createFreeformDocument()

    expect(doc.documentVersion).toBe(7)
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
    let result: FreeformDocument | undefined

    expect(() => {
      result = reduceFreeformDocument(document, action)
    }).not.toThrow()
    expect(result).toBe(document)
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

describe('rich text spans', () => {
  function textNodeWith(id: string, text: string, spans?: RichTextSpan[]): FreeformTextElement {
    const element = createTextElement(createSlide())
    return { ...element, id, text, ...(spans ? { spans } : {}) }
  }

  it('applies a wholesale spans patch to text nodes', () => {
    const document = documentWith([textNodeWith('text-1', '黑体标题正文六字')])
    const updated = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId: document.slides[0].id,
      updates: [{ path: ['text-1'], patch: { spans: [{ start: 0, end: 2, bold: true }] } }],
    })
    const node = updated.slides[0].nodes[0] as FreeformTextElement
    expect(node.spans).toEqual([{ start: 0, end: 2, bold: true }])
    expect(updated).not.toBe(document)
  })

  it('ignores invalid spans patches, clears spans with an empty array, and keeps no-ops stable', () => {
    const document = documentWith([
      textNodeWith('text-1', '黑体标题正文六字', [{ start: 0, end: 2, bold: true }]),
    ])
    const slideId = document.slides[0].id

    const invalid = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId,
      updates: [{
        path: ['text-1'],
        patch: { spans: [{ start: 0, end: 3, bold: true }, { start: 2, end: 5, bold: true }] },
      }],
    })
    expect(invalid).toBe(document)

    const same = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId,
      updates: [{ path: ['text-1'], patch: { spans: [{ start: 0, end: 2, bold: true }] } }],
    })
    expect(same).toBe(document)

    const cleared = reduceFreeformDocument(document, {
      type: 'node/update-style',
      slideId,
      updates: [{ path: ['text-1'], patch: { spans: [] } }],
    })
    expect((cleared.slides[0].nodes[0] as FreeformTextElement).spans).toBeUndefined()
  })

  it('remaps spans across plain text edits', () => {
    const document = documentWith([
      textNodeWith('text-1', '黑体标题正文六字', [{ start: 2, end: 6, bold: true }]),
    ])
    const slideId = document.slides[0].id

    const shrunk = reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId,
      updates: [{ path: ['text-1'], patch: { text: '黑体标正文六字' } }],
    })
    expect((shrunk.slides[0].nodes[0] as FreeformTextElement).spans)
      .toEqual([{ start: 2, end: 5, bold: true }])

    const appended = reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId,
      updates: [{ path: ['text-1'], patch: { text: '黑体标题正文六字尾巴' } }],
    })
    expect((appended.slides[0].nodes[0] as FreeformTextElement).spans)
      .toEqual([{ start: 2, end: 6, bold: true }])

    const replaced = reduceFreeformDocument(document, {
      type: 'node/update-content',
      slideId,
      updates: [{ path: ['text-1'], patch: { text: '完全不同的文本' } }],
    })
    expect((replaced.slides[0].nodes[0] as FreeformTextElement).spans).toBeUndefined()
  })
})

describe('v6 appearance patches', () => {
  const shadow = { color: '#101828', blur: 24, offsetX: 0, offsetY: 8 }
  const slideIdOf = (document: FreeformDocument) => document.slides[0].id
  const stylePatch = (
    document: FreeformDocument,
    path: string[],
    patch: Record<string, unknown>,
  ) => reduceFreeformDocument(document, {
    type: 'node/update-style',
    slideId: slideIdOf(document),
    updates: [{ path, patch }],
  })

  it('applies text appearance patches and keeps no-op patches stable', () => {
    const document = documentWith([{ ...createTextElement(createSlide()), id: 'text-1' }])

    const styled = stylePatch(document, ['text-1'], {
      lineHeight: 1.4,
      letterSpacing: 2,
      italic: true,
      opacity: 0.85,
      shadow,
    })
    const node = styled.slides[0].nodes[0] as FreeformTextElement
    expect(node.lineHeight).toBe(1.4)
    expect(node.letterSpacing).toBe(2)
    expect(node.italic).toBe(true)
    expect(node.opacity).toBe(0.85)
    expect(node.shadow).toEqual(shadow)
    expect(node.shadow).not.toBe(shadow)

    const noop = stylePatch(styled, ['text-1'], {
      lineHeight: 1.4,
      letterSpacing: 2,
      italic: true,
      opacity: 0.85,
      shadow,
    })
    expect(noop).toBe(styled)
  })

  it('clears appearance keys with null and italic with false', () => {
    const document = documentWith([{
      ...createTextElement(createSlide()),
      id: 'text-1',
      lineHeight: 1.4,
      letterSpacing: 2,
      italic: true,
      opacity: 0.85,
      shadow,
    }])

    const cleared = stylePatch(document, ['text-1'], {
      lineHeight: null,
      letterSpacing: null,
      italic: false,
      shadow: null,
    })
    const node = cleared.slides[0].nodes[0] as FreeformTextElement
    expect('lineHeight' in node).toBe(false)
    expect('letterSpacing' in node).toBe(false)
    expect('italic' in node).toBe(false)
    expect('shadow' in node).toBe(false)
    expect(node.opacity).toBe(0.85)

    const clearedAgain = stylePatch(cleared, ['text-1'], {
      lineHeight: null,
      letterSpacing: null,
      italic: false,
      shadow: null,
    })
    expect(clearedAgain).toBe(cleared)
  })

  it('applies shape corner radius and image/line opacity and shadows', () => {
    const document = documentWith([
      { ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' },
      { ...createImageElement(createSlide(), 'img:photo'), id: 'image-1' },
      { ...createLineElement(createSlide(), 'arrow'), id: 'line-1' },
    ])

    const shape = stylePatch(document, ['shape-1'], { cornerRadius: 32, opacity: 0.6, shadow })
    const shapeNode = shape.slides[0].nodes[0] as FreeformShapeElement
    expect(shapeNode.cornerRadius).toBe(32)
    expect(shapeNode.opacity).toBe(0.6)
    expect(shapeNode.shadow).toEqual(shadow)

    const image = stylePatch(document, ['image-1'], { opacity: 0.9, shadow })
    const imageNode = image.slides[0].nodes[1] as FreeformImageElement
    expect(imageNode.opacity).toBe(0.9)
    expect(imageNode.shadow).toEqual(shadow)

    const line = stylePatch(document, ['line-1'], { opacity: 0.75, shadow })
    const lineNode = line.slides[0].nodes[2]
    expect(lineNode.type).toBe('line')
    if (lineNode.type === 'line') {
      expect(lineNode.opacity).toBe(0.75)
      expect(lineNode.shadow).toEqual(shadow)
    }
  })

  it('ignores out-of-range and type-mismatched appearance patches', () => {
    const document = documentWith([
      { ...createTextElement(createSlide()), id: 'text-1' },
      { ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' },
    ])

    const invalid: Array<[string[], Record<string, unknown>]> = [
      [['text-1'], { opacity: 1.5 }],
      [['text-1'], { lineHeight: 0.4 }],
      [['text-1'], { letterSpacing: 201 }],
      [['text-1'], { italic: 'yes' }],
      [['text-1'], { shadow: { color: '#101828', blur: 24, offsetX: 0 } }],
      [['text-1'], { shadow: { ...shadow, blur: 401 } }],
      [['text-1'], { cornerRadius: 8 }],
      [['shape-1'], { cornerRadius: -1 }],
      [['shape-1'], { lineHeight: 1.5 }],
    ]
    for (const [path, patch] of invalid) {
      expect(stylePatch(document, path, patch)).toBe(document)
    }
  })
})

describe('v7 appearance patches', () => {
  const filter = { brightness: 1.1, saturation: 1.4, blur: 6 }
  const slideIdOf = (document: FreeformDocument) => document.slides[0].id
  const stylePatch = (
    document: FreeformDocument,
    path: string[],
    patch: Record<string, unknown>,
  ) => reduceFreeformDocument(document, {
    type: 'node/update-style',
    slideId: slideIdOf(document),
    updates: [{ path, patch }],
  })

  it('applies filter and blend mode patches and keeps no-ops stable', () => {
    const document = documentWith([{ ...createTextElement(createSlide()), id: 'text-1' }])

    const styled = stylePatch(document, ['text-1'], { filter, blendMode: 'multiply' })
    const node = styled.slides[0].nodes[0] as FreeformTextElement
    expect(node.filter).toEqual(filter)
    expect(node.filter).not.toBe(filter)
    expect(node.blendMode).toBe('multiply')

    const noop = stylePatch(styled, ['text-1'], { filter, blendMode: 'multiply' })
    expect(noop).toBe(styled)

    const cleared = stylePatch(styled, ['text-1'], { filter: null, blendMode: null })
    const clearedNode = cleared.slides[0].nodes[0] as FreeformTextElement
    expect('filter' in clearedNode).toBe(false)
    expect('blendMode' in clearedNode).toBe(false)
    expect(stylePatch(cleared, ['text-1'], { filter: null, blendMode: null })).toBe(cleared)
  })

  it('applies line dash and cap patches and clears dash with null', () => {
    const document = documentWith([{ ...createLineElement(createSlide(), 'line'), id: 'line-1' }])

    const styled = stylePatch(document, ['line-1'], { dash: 18, cap: 'butt' })
    const node = styled.slides[0].nodes[0]
    if (node.type !== 'line') throw new Error('expected a line node')
    expect(node.dash).toBe(18)
    expect(node.cap).toBe('butt')

    const noop = stylePatch(styled, ['line-1'], { dash: 18, cap: 'butt' })
    expect(noop).toBe(styled)

    const cleared = stylePatch(styled, ['line-1'], { dash: null })
    const clearedNode = cleared.slides[0].nodes[0]
    if (clearedNode.type !== 'line') throw new Error('expected a line node')
    expect('dash' in clearedNode).toBe(false)
    expect(clearedNode.cap).toBe('butt')
  })

  it('switches shapes to star and hexagon and rejects invalid v7 patch values', () => {
    const document = documentWith([{ ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' }])

    const starred = stylePatch(document, ['shape-1'], { shape: 'star' })
    expect((starred.slides[0].nodes[0] as FreeformShapeElement).shape).toBe('star')
    const hexed = stylePatch(document, ['shape-1'], { shape: 'hexagon' })
    expect((hexed.slides[0].nodes[0] as FreeformShapeElement).shape).toBe('hexagon')

    const invalid: Array<[string[], Record<string, unknown>]> = [
      [['shape-1'], { shape: 'circle' }],
      [['shape-1'], { filter: { brightness: 4 } }],
      [['shape-1'], { filter: {} }],
      [['shape-1'], { blendMode: 'dissolve' }],
      [['shape-1'], { dash: 12 }],
    ]
    for (const [path, patch] of invalid) {
      expect(stylePatch(document, path, patch)).toBe(document)
    }
  })
})
