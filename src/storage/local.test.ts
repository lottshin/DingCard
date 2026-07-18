import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveDraftInput } from '../drafts'
import { normalizeFreeformDocumentV3 } from '../freeform/sceneDocument'
import type {
  FreeformDocumentV3,
  FreeformGroupNode,
  FreeformSceneLeaf,
  FreeformSceneNode,
} from '../freeform/types'

function image(id: string, src: string): FreeformSceneLeaf & { legacyField?: string } {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'image',
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    rotation: 0,
    scale: 1,
    src,
    alt: 'photo',
    fit: 'cover',
    legacyField: 'remove-on-normalize',
  }
}

function imageShape(id: string, src: string): FreeformSceneLeaf {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'shape',
    x: 30,
    y: 40,
    width: 240,
    height: 160,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'image', src, fit: 'contain' },
    stroke: '#000000',
    strokeWidth: 0,
  }
}

function group(
  id: string,
  children: FreeformSceneNode[],
  hidden = false,
): FreeformGroupNode {
  return {
    id,
    name: id,
    locked: false,
    hidden,
    type: 'group',
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
    children,
  }
}

function freeformDocument(imageSrc: string, shapeSrc = imageSrc): FreeformDocumentV3 {
  return {
    documentVersion: 3,
    activeSlideId: 'page-1',
    slides: [{
      id: 'page-1',
      name: 'Page 1',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [group('outer', [
        image('image-1', imageSrc),
        group('inner', [imageShape('shape-1', shapeSrc)], true),
      ])],
    }],
  }
}

function legacyFreeformDocument() {
  return {
    documentVersion: 2,
    activeSlideId: 'page-1',
    slides: [{
      id: 'page-1',
      name: 'Page 1',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      elements: [{
        id: 'legacy-image',
        type: 'image',
        x: 10,
        y: 20,
        width: 300,
        height: 200,
        rotation: 0,
        src: 'data:image/png;base64,legacy',
        alt: 'legacy',
        fit: 'cover',
      }],
    }],
  }
}

function textNode(id: string) {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'text' as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    scale: 1,
    text: id,
    fontSize: 12,
    fontFamily: 'system-ui',
    textFill: { type: 'solid' as const, color: '#111111' },
    align: 'left' as const,
    fontWeight: 'normal' as const,
  }
}

function strictSlide(id: string, nodes: unknown[] = []) {
  return {
    id,
    name: id,
    width: 1024,
    height: 768,
    background: { type: 'solid' as const, color: '#ffffff' },
    nodes,
  }
}

function nestedGroups(depth: number): unknown {
  let node: unknown = textNode(`node-${depth}`)
  for (let level = depth - 1; level >= 1; level -= 1) {
    node = {
      id: `node-${level}`,
      name: `Group ${level}`,
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [node],
    }
  }
  return node
}

function validStoredDraft(id: string) {
  return {
    id,
    title: 'Existing',
    schemaVersion: 2,
    updatedAt: 1,
    mode: 'freeform-slide',
    document: freeformDocument('data:image/png;base64,existing'),
  }
}

describe('LocalStore freeform image persistence', () => {
  let values: Map<string, string>
  let setItem: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    values = new Map()
    setItem = vi.fn((key: string, value: string) => values.set(key, value))
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem,
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not overwrite an existing local draft when nested materialization fails', async () => {
    const key = 'slicer.drafts.user-1'
    const existing = JSON.stringify([validStoredDraft('draft-1')])
    values.set(key, existing)
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()
    store.images.register('img:available-local-ref', 'data:image/png;base64,available')

    await expect(store.drafts.save('user-1', {
      id: 'draft-1',
      mode: 'freeform-slide',
      document: freeformDocument('img:available-local-ref', 'img:missing-local-ref'),
    })).rejects.toThrow(/img:missing-local-ref/)

    expect(setItem).not.toHaveBeenCalled()
    expect(values.get(key)).toBe(existing)
  })

  it('rejects invalid freeform and markdown inputs before any local draft write', async () => {
    const invalidInputs = [
      {
        id: 'draft-freeform',
        mode: 'freeform-slide',
        document: {
          documentVersion: 3,
          activeSlideId: 'missing',
          slides: [strictSlide('slide-1')],
        },
      },
      {
        id: 'too-many-slides',
        mode: 'freeform-slide',
        document: {
          documentVersion: 3,
          activeSlideId: 'slide-0',
          slides: Array.from({ length: 501 }, (_, index) => strictSlide(`slide-${index}`)),
        },
      },
      {
        id: 'too-many-nodes',
        mode: 'freeform-slide',
        document: {
          documentVersion: 3,
          activeSlideId: 'slide-1',
          slides: [strictSlide(
            'slide-1',
            Array.from({ length: 5001 }, (_, index) => textNode(`node-${index}`)),
          )],
        },
      },
      {
        id: 'non-finite-transform',
        mode: 'freeform-slide',
        document: {
          documentVersion: 3,
          activeSlideId: 'slide-1',
          slides: [strictSlide('slide-1', [{ ...textNode('text-1'), rotation: Infinity }])],
        },
      },
      {
        id: 'too-deep',
        mode: 'freeform-slide',
        document: {
          documentVersion: 3,
          activeSlideId: 'slide-1',
          slides: [strictSlide('slide-1', [nestedGroups(33)])],
        },
      },
      {
        id: 'draft-markdown',
        mode: 'markdown-card',
        document: { source: 42 },
      },
    ] as unknown as SaveDraftInput[]
    const originals = invalidInputs.map((input, index) => {
      const userId = `invalid-user-${index}`
      const raw = JSON.stringify([validStoredDraft(input.id ?? `draft-${index}`)])
      values.set(`slicer.drafts.${userId}`, raw)
      return { userId, raw }
    })
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()

    for (const [index, input] of invalidInputs.entries()) {
      await expect(store.drafts.save(originals[index].userId, input)).rejects.toThrow(
        '本地草稿内容无效',
      )
    }

    expect(setItem).not.toHaveBeenCalled()
    for (const { userId, raw } of originals) {
      expect(values.get(`slicer.drafts.${userId}`)).toBe(raw)
    }
  })

  it('materializes nested images before writing and returns strict v3', async () => {
    const imageRef = 'img:local-image'
    const shapeRef = 'img:local-shape'
    const imageDataUrl = 'data:image/png;base64,image'
    const shapeDataUrl = 'data:image/png;base64,shape'
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()
    store.images.register(imageRef, imageDataUrl)
    store.images.register(shapeRef, shapeDataUrl)
    const input = freeformDocument(imageRef, shapeRef)
    const snapshot = structuredClone(input)

    const saved = await store.drafts.save('user-1', {
      id: 'draft-success',
      mode: 'freeform-slide',
      document: input,
    })

    expect(setItem).toHaveBeenCalledTimes(1)
    const persisted = values.get('slicer.drafts.user-1') ?? ''
    expect(persisted).toContain(imageDataUrl)
    expect(persisted).toContain(shapeDataUrl)
    expect(persisted).not.toContain(imageRef)
    expect(persisted).not.toContain(shapeRef)
    expect(input).toEqual(snapshot)

    expect(saved.mode).toBe('freeform-slide')
    if (saved.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(normalizeFreeformDocumentV3(saved.document)).toEqual(saved.document)
    const outer = saved.document.slides[0].nodes[0]
    expect(outer.type).toBe('group')
    if (outer.type !== 'group') throw new Error('Expected outer group')
    const savedImage = outer.children[0]
    expect(savedImage.type).toBe('image')
    if (savedImage.type !== 'image') throw new Error('Expected image element')
    expect(savedImage.src).toBe(imageDataUrl)
    expect(savedImage).not.toHaveProperty('legacyField')
    const inner = outer.children[1]
    expect(inner.type).toBe('group')
    if (inner.type !== 'group') throw new Error('Expected inner group')
    const savedShape = inner.children[0]
    expect(savedShape.type).toBe('shape')
    if (savedShape.type !== 'shape' || savedShape.fill.type !== 'image') {
      throw new Error('Expected image-filled shape')
    }
    expect(savedShape.fill.src).toBe(shapeDataUrl)
  })

  it('migrates a v2 save and every later local read to strict v3', async () => {
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()

    const saved = await store.drafts.save('migration-user', {
      id: 'legacy-draft',
      mode: 'freeform-slide',
      document: legacyFreeformDocument(),
    } as unknown as SaveDraftInput)
    const listed = await store.drafts.list('migration-user')

    expect(saved.mode).toBe('freeform-slide')
    expect(listed).toHaveLength(1)
    if (saved.mode !== 'freeform-slide' || listed[0]?.mode !== 'freeform-slide') {
      throw new Error('Expected freeform drafts')
    }
    expect(saved.document.documentVersion).toBe(3)
    expect(saved.document.slides[0].nodes).toHaveLength(1)
    expect(saved.document.slides[0]).not.toHaveProperty('elements')
    expect(listed[0].document).toEqual(saved.document)
    expect(normalizeFreeformDocumentV3(listed[0].document)).toEqual(listed[0].document)
  })
})
