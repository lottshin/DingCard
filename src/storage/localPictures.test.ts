import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Draft } from '../drafts'
import type { FreeformDocument } from '../freeform/types'
import {
  createLocalPictures,
  createMemoryPictureBackend,
  pictureKey,
  pictureRefsIn,
  type PictureBackend,
} from './localPictures'

/** A data URL big enough to be put away (the store keeps small ones inline). */
function photo(seed: string, size = 6000): string {
  return `data:image/jpeg;base64,${seed}${'A'.repeat(size)}`
}

const SMALL = 'data:image/png;base64,iVBORw0KGgo='

function freeformDocument(sources: { image: string; fill: string; background?: string }): FreeformDocument {
  return {
    documentVersion: 21,
    activeSlideId: 'page-1',
    slides: [{
      id: 'page-1',
      name: 'Page 1',
      width: 1080,
      height: 1440,
      background: sources.background
        ? { type: 'image', src: sources.background, fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } }
        : { type: 'solid', color: '#ffffff' },
      nodes: [
        {
          id: 'image-1', name: 'image-1', locked: false, hidden: false, type: 'image',
          x: 10, y: 20, width: 300, height: 200, rotation: 0, scale: 1,
          src: sources.image, alt: 'photo', fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
        },
        {
          id: 'group-1', name: 'group-1', locked: false, hidden: false, type: 'group',
          x: 0, y: 0, rotation: 0, scale: 1,
          children: [{
            id: 'shape-1', name: 'shape-1', locked: false, hidden: false, type: 'shape',
            x: 30, y: 40, width: 240, height: 160, rotation: 0, scale: 1, shape: 'rect',
            fill: { type: 'image', src: sources.fill, fit: 'cover', framing: { focusX: 0.5, focusY: 0.5, zoom: 1 } },
            stroke: '#000000', strokeWidth: 0,
          }],
        },
      ],
    }],
  }
}

function freeformDraft(id: string, document: FreeformDocument): Draft {
  return { id, title: id, schemaVersion: 2, updatedAt: 1, mode: 'freeform-slide', document }
}

describe('pictureKey', () => {
  it('names a picture by its content, the same way every time', () => {
    expect(pictureKey(photo('a'))).toBe(pictureKey(photo('a')))
    expect(pictureKey(photo('a'))).not.toBe(pictureKey(photo('b')))
    expect(pictureKey(photo('a'))).toMatch(/^[0-9a-z]+$/)
    expect(pictureRefsIn(`["picture:${pictureKey(photo('a'))}"]`)).toEqual([pictureKey(photo('a'))])
  })
})

describe('createLocalPictures', () => {
  it('packs a stored picture as one ref wherever it is used, and unpacks it again', async () => {
    const backend = createMemoryPictureBackend()
    const pictures = createLocalPictures(backend, () => 1000)
    const big = photo('x')
    const draft = freeformDraft('one', freeformDocument({ image: big, fill: big, background: SMALL }))

    // Not stored yet: the picture stays inline while it is put away.
    expect(JSON.stringify(pictures.pack(draft))).toContain(big)
    await pictures.settle()
    expect([...backend.pictures.values()]).toEqual([big])
    expect(backend.stamps.get(pictureKey(big))).toBe(1000)

    const packed = new Map<string, string>()
    const stored = pictures.pack(draft, packed)
    const text = JSON.stringify(stored)
    expect(text).not.toContain(big)
    expect(pictureRefsIn(text)).toEqual([pictureKey(big), pictureKey(big)])
    expect(text).toContain(SMALL)
    expect([...packed]).toEqual([[pictureKey(big), big]])

    const fresh = createLocalPictures(backend)
    expect(await fresh.unpack([JSON.parse(text) as Draft])).toEqual([draft])
  })

  it('keeps markdown pictures out of the stored draft too', async () => {
    const backend = createMemoryPictureBackend()
    const pictures = createLocalPictures(backend)
    const big = photo('md')
    const draft: Draft = {
      id: 'md', title: 'md', schemaVersion: 2, updatedAt: 1, mode: 'markdown-card',
      document: {
        source: '![](img:abc)', platformId: 'xhs', themeId: 'paper', fontFamily: 'system-ui', radius: 18,
        profile: { nickname: '', handle: '', location: '', avatarColor: '#000000', avatarImage: null, verified: false, headerFirstPageOnly: false },
        images: { 'img:abc': big },
      },
    }
    await pictures.keep(big)
    const stored = pictures.pack(draft)
    expect(stored.mode === 'markdown-card' && stored.document.images).toEqual({ 'img:abc': `picture:${pictureKey(big)}` })
    expect(await createLocalPictures(backend).unpack([stored])).toEqual([draft])
  })

  it('leaves a picture that cannot be read as its ref', async () => {
    const backend = createMemoryPictureBackend()
    const pictures = createLocalPictures(backend)
    const big = photo('gone')
    await pictures.keep(big)
    const stored = pictures.pack(freeformDraft('one', freeformDocument({ image: big, fill: SMALL })))
    backend.pictures.clear()
    const [read] = await createLocalPictures(backend).unpack([stored])
    expect(read.mode === 'freeform-slide' && read.document.slides[0].nodes[0]).toMatchObject({ src: `picture:${pictureKey(big)}` })
  })

  it('confirms a write by stamping its pictures, storing again one that went missing', async () => {
    const backend = createMemoryPictureBackend()
    let now = 1000
    const pictures = createLocalPictures(backend, () => now)
    const big = photo('again')
    await pictures.keep(big)
    const packed = new Map<string, string>()
    pictures.pack(freeformDraft('one', freeformDocument({ image: big, fill: SMALL })), packed)
    backend.pictures.clear()
    now = 5000
    await pictures.confirm(packed)
    expect(backend.pictures.get(pictureKey(big))).toBe(big)
    expect(backend.stamps.get(pictureKey(big))).toBe(5000)
  })

  it('sweeps pictures no stored draft names once their grace is over, and stores a swept one again when it comes back', async () => {
    const backend = createMemoryPictureBackend()
    let now = 0
    const pictures = createLocalPictures(backend, () => now)
    const named = photo('named')
    const dropped = photo('dropped')
    const recent = photo('recent')
    await pictures.keep(named)
    await pictures.keep(dropped)
    now = 3 * 60 * 60 * 1000
    await pictures.keep(recent)
    const stored = JSON.stringify([pictures.pack(freeformDraft('one', freeformDocument({ image: named, fill: SMALL })))])

    await pictures.sweep(() => [stored])
    expect([...backend.pictures.values()].sort()).toEqual([named, recent].sort())

    // Undo brings the swept picture back: it is written inline and stored again.
    const back = freeformDraft('one', freeformDocument({ image: dropped, fill: SMALL }))
    expect(JSON.stringify(pictures.pack(back))).toContain(dropped)
    await pictures.settle()
    expect(backend.pictures.get(pictureKey(dropped))).toBe(dropped)
  })

  it('without a backend keeps every picture inline, and after a failed write pauses storing for a while', async () => {
    const draft = freeformDraft('one', freeformDocument({ image: photo('a'), fill: photo('b') }))
    const none = createLocalPictures(null)
    expect(await none.keep(photo('a'))).toBe(false)
    expect(none.pack(draft)).toBe(draft)
    expect(await none.unpack([draft])).toEqual([draft])

    const memory = createMemoryPictureBackend()
    let failing = true
    const write = vi.fn((entries: ReadonlyMap<string, string>, at: number) => (
      failing ? Promise.reject(new DOMException('full', 'QuotaExceededError')) : memory.write(entries, at)
    ))
    let now = 0
    const pictures = createLocalPictures({ ...memory, write } satisfies PictureBackend, () => now)
    expect(await pictures.keep(photo('a'))).toBe(false)
    expect(JSON.stringify(pictures.pack(draft))).toContain(photo('b'))
    expect(await pictures.keep(photo('b'))).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)

    failing = false
    now = 31_000
    expect(await pictures.keep(photo('b'))).toBe(true)
    expect(memory.pictures.size).toBe(1)
  })
})

describe('LocalStore pictures', () => {
  const LIMIT = 20_000
  let values: Map<string, string>

  beforeEach(() => {
    vi.resetModules()
    values = new Map()
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        // A small quota, like the browser's 5 MB at a smaller scale.
        if (value.length > LIMIT) throw new DOMException('quota', 'QuotaExceededError')
        values.set(key, value)
      },
      removeItem: (key: string) => values.delete(key),
    })
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => {} })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves a project whose pictures outgrow localStorage, and reads them back', async () => {
    const { createLocalStore } = await import('./local')
    const backend = createMemoryPictureBackend()
    const store = createLocalStore(backend)
    const document = freeformDocument({ image: photo('a', 9000), fill: photo('b', 9000), background: photo('c', 9000) })

    const saved = await store.drafts.save('guest', { mode: 'freeform-slide', document })
    expect(saved.mode === 'freeform-slide' && saved.document).toEqual(document)
    const stored = values.get('slicer.drafts.guest') ?? ''
    expect(stored.length).toBeLessThan(LIMIT)
    expect(pictureRefsIn(stored)).toHaveLength(3)
    expect(backend.pictures.size).toBe(3)

    const [listed] = await createLocalStore(backend).drafts.list('guest')
    expect(listed.mode === 'freeform-slide' && listed.document).toEqual(document)
  })

  it('says the browser is out of room when the pictures cannot be put away', async () => {
    const { createLocalStore } = await import('./local')
    const store = createLocalStore(null)
    const document = freeformDocument({ image: photo('a', 9000), fill: photo('b', 9000), background: photo('c', 9000) })
    await expect(store.drafts.save('guest', { mode: 'freeform-slide', document }))
      .rejects.toThrow('浏览器存储空间不足，删掉一些图片或项目后再试')
  })

  it('stores a new picture as soon as it is put, and a removed project lets its pictures go', async () => {
    const { createLocalStore } = await import('./local')
    const backend = createMemoryPictureBackend()
    const store = createLocalStore(backend)
    const big = photo('kept')
    const ref = await store.images.put(big)
    await vi.waitFor(() => expect(backend.pictures.size).toBe(1))

    const saved = await store.drafts.save('guest', { mode: 'freeform-slide', document: freeformDocument({ image: ref, fill: SMALL }) })
    expect(values.get('slicer.drafts.guest')).toContain(`picture:${pictureKey(big)}`)
    expect(values.get('slicer.drafts.guest')).not.toContain(big)

    // Past the grace, the picture of the removed project goes.
    for (const key of backend.stamps.keys()) backend.stamps.set(key, 0)
    await store.drafts.remove('guest', saved.id)
    await vi.waitFor(() => expect(backend.pictures.size).toBe(0))
  })
})
