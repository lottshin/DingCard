import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveDraftInput } from '../drafts'
import type { FreeformDocument, FreeformImageElement, FreeformShapeElement } from '../freeform/types'

function image(src: string): FreeformImageElement & { legacyField?: string } {
  return {
    id: 'image-1',
    type: 'image',
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    rotation: 0,
    src,
    alt: 'photo',
    fit: 'cover',
    legacyField: 'remove-on-normalize',
  }
}

function imageShape(src: string): FreeformShapeElement {
  return {
    id: 'shape-1',
    type: 'shape',
    x: 30,
    y: 40,
    width: 240,
    height: 160,
    rotation: 0,
    shape: 'rect',
    fill: { type: 'image', src, fit: 'contain' },
    stroke: '#000000',
    strokeWidth: 0,
  }
}

function freeformDocument(src: string): FreeformDocument {
  return {
    documentVersion: 2,
    activeSlideId: 'page-1',
    slides: [
      {
        id: 'page-1',
        name: 'Page 1',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        elements: [image(src), imageShape(src)],
      },
    ],
  }
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

  it('does not overwrite an existing local draft when materialization fails', async () => {
    const key = 'slicer.drafts.user-1'
    const existing = JSON.stringify([validStoredDraft('draft-1')])
    values.set(key, existing)
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()

    await expect(store.drafts.save('user-1', {
      id: 'draft-1',
      mode: 'freeform-slide',
      document: freeformDocument('img:missing-local-ref'),
    })).rejects.toThrow('本地图片引用无法解析：img:missing-local-ref')

    expect(setItem).not.toHaveBeenCalled()
    expect(values.get(key)).toBe(existing)
  })

  it('rejects invalid freeform and markdown inputs before any local draft write', async () => {
    const invalidInputs = [
      {
        id: 'draft-freeform',
        mode: 'freeform-slide',
        document: { documentVersion: 2, activeSlideId: 'missing', slides: [] },
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

  it('materializes before writing and returns the normalized saved draft', async () => {
    const ref = 'img:local-success'
    const dataUrl = 'data:image/png;base64,persisted'
    const { createLocalStore } = await import('./local')
    const store = createLocalStore()
    store.images.register(ref, dataUrl)
    const input = freeformDocument(ref)

    const saved = await store.drafts.save('user-1', {
      id: 'draft-success',
      mode: 'freeform-slide',
      document: input,
    })

    expect(setItem).toHaveBeenCalledTimes(1)
    const persisted = values.get('slicer.drafts.user-1') ?? ''
    expect(persisted).toContain(dataUrl)
    expect(persisted).not.toContain(ref)
    expect(input.slides[0].elements.map((element) => (
      element.type === 'image'
        ? element.src
        : element.type === 'shape' && element.fill.type === 'image'
          ? element.fill.src
          : null
    ))).toEqual([ref, ref])

    expect(saved.mode).toBe('freeform-slide')
    if (saved.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    const savedImage = saved.document.slides[0].elements[0]
    expect(savedImage.type).toBe('image')
    if (savedImage.type !== 'image') throw new Error('Expected image element')
    expect(savedImage.src).toBe(dataUrl)
    expect(savedImage).not.toHaveProperty('legacyField')
  })
})
