import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FreeformDocument, FreeformImageElement, FreeformShapeElement } from '../freeform/types'
import { createLocalStore } from './local'

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

describe('LocalStore freeform image persistence', () => {
  let values: Map<string, string>
  let setItem: ReturnType<typeof vi.fn>

  beforeEach(() => {
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
    const existing = JSON.stringify([{ id: 'draft-1', title: 'Existing', untouched: true }])
    values.set(key, existing)
    const store = createLocalStore()

    await expect(store.drafts.save('user-1', {
      id: 'draft-1',
      mode: 'freeform-slide',
      document: freeformDocument('img:missing-local-ref'),
    })).rejects.toThrow('本地图片引用无法解析：img:missing-local-ref')

    expect(setItem).not.toHaveBeenCalled()
    expect(values.get(key)).toBe(existing)
  })

  it('materializes before writing and returns the normalized saved draft', async () => {
    const ref = 'img:local-success'
    const dataUrl = 'data:image/png;base64,persisted'
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
