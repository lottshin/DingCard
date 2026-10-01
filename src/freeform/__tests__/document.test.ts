import { describe, expect, it } from 'vitest'
import {
  createFreeformDocument,
  createImageElement,
  createLineElement,
  createPathElement,
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
  FreeformLineElement,
  FreeformPathElement,
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

  it('creates v9 documents and strict leaves with independent image framing', () => {
    const doc = createFreeformDocument()

    expect(doc.documentVersion).toBe(15)
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

describe('v8 appearance patches', () => {
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

  it('applies text outline patches and clears them with null', () => {
    const document = documentWith([{ ...createTextElement(createSlide()), id: 'text-1' }])

    const styled = stylePatch(document, ['text-1'], { stroke: '#f97316', strokeWidth: 3 })
    const node = styled.slides[0].nodes[0] as FreeformTextElement
    expect(node.stroke).toBe('#f97316')
    expect(node.strokeWidth).toBe(3)

    const noop = stylePatch(styled, ['text-1'], { stroke: '#f97316', strokeWidth: 3 })
    expect(noop).toBe(styled)

    const cleared = stylePatch(styled, ['text-1'], { stroke: null, strokeWidth: null })
    const clearedNode = cleared.slides[0].nodes[0] as FreeformTextElement
    expect('stroke' in clearedNode).toBe(false)
    expect('strokeWidth' in clearedNode).toBe(false)
    expect(stylePatch(cleared, ['text-1'], { stroke: null, strokeWidth: null })).toBe(cleared)
  })

  it('applies multi-stop gradient paints to text and shape fills', () => {
    const stops = [
      { offset: 0, color: '#111111' },
      { offset: 0.5, color: '#f97316' },
      { offset: 1, color: '#ffffff' },
    ]
    const document = documentWith([
      { ...createTextElement(createSlide()), id: 'text-1' },
      { ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' },
    ])

    const styled = stylePatch(document, ['text-1'], {
      textFill: { type: 'linear-gradient', stops, angle: 90 },
    })
    const node = styled.slides[0].nodes[0] as FreeformTextElement
    expect(node.textFill).toEqual({ type: 'linear-gradient', stops, angle: 90 })

    const noop = stylePatch(styled, ['text-1'], {
      textFill: { type: 'linear-gradient', stops, angle: 90 },
    })
    expect(noop).toBe(styled)

    const shapeStyled = stylePatch(document, ['shape-1'], {
      fill: { type: 'linear-gradient', stops, angle: 45 },
    })
    expect((shapeStyled.slides[0].nodes[1] as FreeformShapeElement).fill).toEqual({
      type: 'linear-gradient',
      stops,
      angle: 45,
    })
  })

  it('applies the v11 transparent shape fill and treats repeats as no-ops', () => {
    const document = documentWith([{ ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' }])

    const styled = stylePatch(document, ['shape-1'], { fill: { type: 'transparent' } })
    const node = styled.slides[0].nodes[0] as FreeformShapeElement
    expect(node.fill).toEqual({ type: 'transparent' })

    const noop = stylePatch(styled, ['shape-1'], { fill: { type: 'transparent' } })
    expect(noop).toBe(styled)

    // Leaving the no-fill state restores a regular paint untouched.
    const restored = stylePatch(styled, ['shape-1'], { fill: { type: 'solid', color: '#c2410c' } })
    expect((restored.slides[0].nodes[0] as FreeformShapeElement).fill).toEqual({
      type: 'solid',
      color: '#c2410c',
    })
  })

  it('applies the v12 radial gradient to shape and text fills', () => {
    const radial = {
      type: 'radial-gradient' as const,
      stops: [
        { offset: 0, color: '#fde68a' },
        { offset: 1, color: '#c2410c' },
      ],
    }
    const document = documentWith([
      { ...createTextElement(createSlide()), id: 'text-1' },
      { ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' },
    ])

    const styled = stylePatch(document, ['shape-1'], { fill: radial })
    expect((styled.slides[0].nodes[1] as FreeformShapeElement).fill).toEqual(radial)

    const noop = stylePatch(styled, ['shape-1'], {
      fill: { type: 'radial-gradient', stops: radial.stops.map((stop) => ({ ...stop })) },
    })
    expect(noop).toBe(styled)

    const textStyled = stylePatch(document, ['text-1'], { textFill: radial })
    expect((textStyled.slides[0].nodes[0] as FreeformTextElement).textFill).toEqual(radial)
    expect(stylePatch(textStyled, ['text-1'], { textFill: radial })).toBe(textStyled)
  })

  it('applies the v13 endpoint caps to lines and clears them with null', () => {
    const document = documentWith([{ ...createLineElement(createSlide(), 'line'), id: 'line-1' }])

    const styled = stylePatch(document, ['line-1'], { startCap: 'arrow', endCap: 'dot' })
    const node = styled.slides[0].nodes[0] as FreeformLineElement
    expect(node.startCap).toBe('arrow')
    expect(node.endCap).toBe('dot')

    const noop = stylePatch(styled, ['line-1'], { startCap: 'arrow', endCap: 'dot' })
    expect(noop).toBe(styled)

    const overridden = stylePatch(styled, ['line-1'], { endCap: 'none' })
    expect((overridden.slides[0].nodes[0] as FreeformLineElement).endCap).toBe('none')

    const cleared = stylePatch(overridden, ['line-1'], { startCap: null, endCap: null })
    const clearedNode = cleared.slides[0].nodes[0] as FreeformLineElement
    expect('startCap' in clearedNode).toBe(false)
    expect('endCap' in clearedNode).toBe(false)

    const invalid = stylePatch(document, ['line-1'], { startCap: 'square' as never })
    expect(invalid).toBe(document)
  })

  it('applies v14 vertex patches through the style action and rejects out-of-box lists', () => {
    const base = {
      ...createLineElement(createSlide(), 'line'),
      id: 'line-1',
      width: 300,
      height: 80,
      points: [
        { x: 0, y: 70 },
        { x: 150, y: 10 },
        { x: 300, y: 70 },
      ],
    } as FreeformLineElement
    const document = documentWith([base])

    const moved = stylePatch(document, ['line-1'], {
      points: [
        { x: 0, y: 70 },
        { x: 150, y: 10 },
        { x: 300, y: 40 },
      ],
    })
    expect((moved.slides[0].nodes[0] as FreeformLineElement).points).toEqual([
      { x: 0, y: 70 },
      { x: 150, y: 10 },
      { x: 300, y: 40 },
    ])

    const noop = stylePatch(moved, ['line-1'], {
      points: [
        { x: 0, y: 70 },
        { x: 150, y: 10 },
        { x: 300, y: 40 },
      ],
    })
    expect(noop).toBe(moved)

    const outOfBox = stylePatch(document, ['line-1'], {
      points: [
        { x: 0, y: 70 },
        { x: 150, y: 99 },
      ],
    })
    expect(outOfBox).toBe(document)
  })

  it('scales v14 polyline vertices with box resize patches', () => {
    const base = {
      ...createLineElement(createSlide(), 'line'),
      id: 'line-1',
      width: 300,
      height: 80,
      points: [
        { x: 0, y: 70 },
        { x: 150, y: 10 },
        { x: 300, y: 70 },
      ],
    } as FreeformLineElement
    const document = documentWith([base])

    const geometry = (patch: Record<string, number>) => reduceFreeformDocument(document, {
      type: 'node/update-geometry',
      slideId: document.activeSlideId,
      updates: [{ path: ['line-1'], patch: patch as never }],
    })

    const widened = geometry({ width: 600, height: 160 }) as FreeformDocument
    const widenedLine = widened.slides[0].nodes[0] as FreeformLineElement
    expect(widenedLine.width).toBe(600)
    expect(widenedLine.height).toBe(160)
    expect(widenedLine.points).toEqual([
      { x: 0, y: 140 },
      { x: 300, y: 20 },
      { x: 600, y: 140 },
    ])

    // Moving the box never rescales the vertices.
    const moved = geometry({ x: 40, y: 50 }) as FreeformDocument
    const movedLine = moved.slides[0].nodes[0] as FreeformLineElement
    expect(movedLine.points).toEqual(base.points)
  })

  it('applies vertical text patches and clears them with false', () => {
    const document = documentWith([{ ...createTextElement(createSlide()), id: 'text-1' }])

    const styled = stylePatch(document, ['text-1'], { vertical: true })
    const node = styled.slides[0].nodes[0] as FreeformTextElement
    expect(node.vertical).toBe(true)

    const noop = stylePatch(styled, ['text-1'], { vertical: true })
    expect(noop).toBe(styled)

    const cleared = stylePatch(styled, ['text-1'], { vertical: false })
    const clearedNode = cleared.slides[0].nodes[0] as FreeformTextElement
    expect('vertical' in clearedNode).toBe(false)
    expect(stylePatch(cleared, ['text-1'], { vertical: false })).toBe(cleared)

    expect(stylePatch(document, ['text-1'], { vertical: 'yes' as unknown as boolean })).toBe(document)
  })

  it('rejects invalid v8 patch values', () => {
    const document = documentWith([
      { ...createTextElement(createSlide()), id: 'text-1' },
      { ...createShapeElement(createSlide(), 'rect'), id: 'shape-1' },
    ])
    const invalid: Array<[string[], Record<string, unknown>]> = [
      [['text-1'], { stroke: 'orange' }],
      [['text-1'], { strokeWidth: 0 }],
      [['text-1'], { strokeWidth: 101 }],
      [['text-1'], { textFill: { type: 'linear-gradient', stops: [{ offset: 0, color: '#111111' }], angle: 45 } }],
      [['text-1'], {
        textFill: {
          type: 'linear-gradient',
          stops: [{ offset: 0.7, color: '#111111' }, { offset: 0.3, color: '#222222' }],
          angle: 45,
        },
      }],
      [['shape-1'], {
        fill: {
          type: 'linear-gradient',
          stops: [{ offset: 0, color: '#111111' }, { offset: 0, color: '#222222' }],
          angle: 45,
        },
      }],
      [['shape-1'], { stroke: null }],
    ]
    for (const [path, patch] of invalid) {
      expect(stylePatch(document, path, patch)).toBe(document)
    }
  })
})

describe('guides actions', () => {
  it('replaces, clears, and validates page guides', () => {
    const doc = createFreeformDocument()
    const slideId = doc.slides[0].id

    const withGuides = reduceFreeformDocument(doc, {
      type: 'guides/set',
      slideId,
      guides: [
        { id: 'g1', axis: 'x', position: 100 },
        { id: 'g2', axis: 'y', position: 200 },
      ],
    })
    expect(withGuides.slides[0].guides).toEqual([
      { id: 'g1', axis: 'x', position: 100 },
      { id: 'g2', axis: 'y', position: 200 },
    ])

    const replaced = reduceFreeformDocument(withGuides, {
      type: 'guides/set',
      slideId,
      guides: [{ id: 'g3', axis: 'x', position: 50 }],
    })
    expect(replaced.slides[0].guides).toEqual([{ id: 'g3', axis: 'x', position: 50 }])

    // Setting an identical list is a reference-equal no-op.
    expect(reduceFreeformDocument(replaced, {
      type: 'guides/set',
      slideId,
      guides: [{ id: 'g3', axis: 'x', position: 50 }],
    })).toBe(replaced)

    // Clearing guides removes the key entirely.
    const cleared = reduceFreeformDocument(replaced, { type: 'guides/set', slideId, guides: [] })
    expect('guides' in cleared.slides[0]).toBe(false)
    expect(reduceFreeformDocument(doc, { type: 'guides/set', slideId, guides: [] })).toBe(doc)
  })

  it('ignores invalid guides and unknown pages', () => {
    const doc = createFreeformDocument()
    const slideId = doc.slides[0].id
    const withGuides = reduceFreeformDocument(doc, {
      type: 'guides/set',
      slideId,
      guides: [{ id: 'g1', axis: 'x', position: 100 }],
    })

    const invalid: unknown[] = [
      { type: 'guides/set', slideId, guides: [{ id: 'g1', axis: 'x', position: 9999 }] },
      { type: 'guides/set', slideId, guides: [{ id: 'g1', axis: 'x', position: 100 }, { id: 'g1', axis: 'y', position: 1 }] },
      { type: 'guides/set', slideId, guides: [{ id: 'g1', axis: 'z', position: 100 }] },
      { type: 'guides/set', slideId: 'missing-slide', guides: [] },
    ]
    for (const action of invalid) {
      expect(reduceFreeformDocument(withGuides, action as FreeformAction)).toBe(withGuides)
    }
  })
})

describe('v15 path nodes', () => {
  const slideIdOf = (document: FreeformDocument) => document.slides[0].id
  const update = (
    document: FreeformDocument,
    type: 'node/update-style' | 'node/update-content',
    patch: Record<string, unknown>,
  ) => reduceFreeformDocument(document, {
    type,
    slideId: slideIdOf(document),
    updates: [{ path: ['icon-1'], patch }],
  } as FreeformAction)
  const icon = (overrides: Partial<FreeformPathElement> = {}): FreeformPathElement => ({
    ...createPathElement(createSlide(), {
      name: '对勾',
      d: 'M20 6 9 17l-5-5',
      viewBox: { x: 0, y: 0, width: 24, height: 24 },
      size: 96,
    }),
    id: 'icon-1',
    ...overrides,
  })
  const pathOf = (document: FreeformDocument) => document.slides[0].nodes[0] as FreeformPathElement

  it('creates a centred outline path whose box follows the drawing aspect', () => {
    const slide = createSlide()
    const square = createPathElement(slide, {
      name: '对勾',
      d: 'M20 6 9 17l-5-5',
      viewBox: { x: 0, y: 0, width: 24, height: 24 },
      size: 96,
    })
    expect(square).toMatchObject({
      type: 'path',
      width: 96,
      height: 96,
      x: (slide.width - 96) / 2,
      y: (slide.height - 96) / 2,
      fill: { type: 'transparent' },
      stroke: '#18181b',
      strokeWidth: 2,
    })
    const wide = createPathElement(slide, {
      name: '波浪',
      d: 'M0 10q25-20 50 0t50 0',
      viewBox: { x: 0, y: 0, width: 100, height: 20 },
      size: 400,
    })
    expect([wide.width, wide.height]).toEqual([400, 80])
  })

  it('patches fill, stroke and stroke style, and keeps no-ops stable', () => {
    const document = documentWith([icon()])
    const styled = update(document, 'node/update-style', {
      fill: { type: 'linear-gradient', stops: [{ offset: 0, color: '#fde68a' }, { offset: 1, color: '#f97316' }], angle: 90 },
      stroke: '#1d4ed8',
      strokeWidth: 1.5,
      dash: 0.75,
      cap: 'butt',
      join: 'bevel',
      fillRule: 'evenodd',
      opacity: 0.5,
    })
    expect(pathOf(styled)).toMatchObject({
      stroke: '#1d4ed8',
      strokeWidth: 1.5,
      dash: 0.75,
      cap: 'butt',
      join: 'bevel',
      fillRule: 'evenodd',
      opacity: 0.5,
    })
    expect(update(styled, 'node/update-style', { stroke: '#1d4ed8', join: 'bevel' })).toBe(styled)
    expect(update(styled, 'node/update-style', {
      fill: { type: 'linear-gradient', stops: [{ offset: 0, color: '#fde68a' }, { offset: 1, color: '#f97316' }], angle: 90 },
    })).toBe(styled)

    const solid = update(styled, 'node/update-style', { dash: null, strokeWidth: 0, fill: { type: 'transparent' } })
    expect('dash' in pathOf(solid)).toBe(false)
    expect(pathOf(solid).strokeWidth).toBe(0)
    expect(pathOf(solid).fill).toEqual({ type: 'transparent' })
  })

  it.each([
    ['picture fill', { fill: { type: 'image', src: 'a.png', fit: 'cover', framing: framing() } }],
    ['named stroke', { stroke: 'blue' }],
    ['cleared stroke', { stroke: null }],
    ['negative width', { strokeWidth: -2 }],
    ['zero dash', { dash: 0 }],
    ['unknown join', { join: 'sharp' }],
    ['cleared cap', { cap: null }],
    ['shape-only key', { cornerRadius: 4 }],
    ['line-only key', { lineKind: 'arrow' }],
  ])('rejects a style patch with %s', (_label, patch) => {
    const document = documentWith([icon()])
    expect(update(document, 'node/update-style', patch)).toBe(document)
  })

  it('replaces the drawing and its viewBox as content', () => {
    const document = documentWith([icon()])
    const redrawn = update(document, 'node/update-content', {
      d: 'M12 2 2 22h20z',
      viewBox: { x: 0, y: 0, width: 24, height: 24 },
    })
    expect(pathOf(redrawn).d).toBe('M12 2 2 22h20z')
    expect(update(redrawn, 'node/update-content', { d: 'M12 2 2 22h20z' })).toBe(redrawn)

    const reframed = update(redrawn, 'node/update-content', { viewBox: { x: 2, y: 2, width: 20, height: 20 } })
    expect(pathOf(reframed).viewBox).toEqual({ x: 2, y: 2, width: 20, height: 20 })

    for (const patch of [{ d: 'Z' }, { viewBox: { x: 0, y: 0, width: -1, height: 1 } }, { text: 'x' }, {}]) {
      expect(update(document, 'node/update-content', patch)).toBe(document)
    }
  })

  it('stretches the drawing with geometry patches and clones paths independently', () => {
    const document = documentWith([icon()])
    const resized = reduceFreeformDocument(document, {
      type: 'node/update-geometry',
      slideId: slideIdOf(document),
      updates: [{ path: ['icon-1'], patch: { width: 192, height: 96 } }],
    })
    expect(pathOf(resized)).toMatchObject({ width: 192, height: 96, viewBox: { x: 0, y: 0, width: 24, height: 24 } })

    const cloned = reduceFreeformDocument(document, {
      type: 'node/clone',
      slideId: slideIdOf(document),
      parentPath: [],
      nodeIds: ['icon-1'],
      idFactory: () => 'icon-2',
    })
    const [source, copy] = cloned.slides[0].nodes as FreeformPathElement[]
    expect(copy).toMatchObject({ id: 'icon-2', d: source.d, viewBox: source.viewBox })
    expect(copy.viewBox).not.toBe(source.viewBox)
    expect(copy.fill).not.toBe(source.fill)
  })

  it('inserts only well-formed path nodes', () => {
    const document = documentWith([])
    const insert = (node: unknown) => reduceFreeformDocument(document, {
      type: 'node/insert-children',
      slideId: slideIdOf(document),
      parentPath: [],
      nodes: [node as FreeformSceneNode],
    })
    expect(pathOf(insert(icon({ cap: 'square', fillRule: 'evenodd' }))).cap).toBe('square')
    for (const broken of [
      icon({ d: 'M0' }),
      icon({ viewBox: { x: 0, y: 0, width: 24, height: 0 } }),
      icon({ stroke: 'currentColor' }),
      icon({ dash: -1 }),
      { ...icon(), shape: 'rect' },
    ]) {
      expect(insert(broken)).toBe(document)
    }
  })
})
