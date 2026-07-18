import { describe, expect, it } from 'vitest'
import { draftSubtitle, draftTitle, normalizeDraftForRead } from '../../drafts'

const profile = {
  nickname: 'A',
  handle: 'a',
  location: '',
  avatarColor: '#000000',
  avatarImage: null,
  verified: false,
  headerFirstPageOnly: false,
}

function strictText(id: string) {
  return {
    id,
    name: id,
    locked: false,
    hidden: false,
    type: 'text' as const,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    rotation: 0,
    scale: 1,
    text: id,
    fontSize: 16,
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
  let node: unknown = strictText(`node-${depth}`)
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

function freeformEnvelope(document: unknown) {
  return {
    id: 'freeform-draft',
    title: 'Freeform',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: 1,
    document,
  }
}

describe('draft migration', () => {
  it('treats legacy drafts as markdown-card v2 envelopes', () => {
    const legacy = {
      id: 'old-1',
      title: 'Old',
      source: '# hello',
      platformId: 'rednote',
      themeId: 'light',
      fontFamily: 'system-ui, sans-serif',
      profile,
      updatedAt: 1,
    }

    const migrated = normalizeDraftForRead(legacy)

    expect(migrated?.schemaVersion).toBe(2)
    expect(migrated?.mode).toBe('markdown-card')
    if (migrated?.mode !== 'markdown-card') throw new Error('Expected markdown draft')
    expect(migrated.document.source).toBe('# hello')
    expect(migrated.document.radius).toBe(18)
  })

  it('migrates freeform v1 drafts to strict v3 envelopes', () => {
    const draft = {
      id: 'free-1',
      title: 'Free',
      schemaVersion: 2,
      mode: 'freeform-slide',
      updatedAt: 2,
      document: {
        documentVersion: 1,
        activeSlideId: 's1',
        slides: [
          {
            id: 's1',
            name: 'Page 1',
            width: 1080,
            height: 1440,
            background: { type: 'solid', color: '#ffffff' },
            elements: [],
          },
        ],
      },
    }

    const migrated = normalizeDraftForRead(draft)

    expect(migrated?.mode).toBe('freeform-slide')
    if (migrated?.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(migrated.document.documentVersion).toBe(3)
    expect(migrated.document.slides[0].background).toEqual({ type: 'solid', color: '#ffffff' })
    expect(migrated.document.slides[0].nodes).toEqual([])
  })

  it('migrates v1 freeform text color to v3 textFill', () => {
    const draft = normalizeDraftForRead({
      id: 'freeform-v1',
      title: 'Old',
      schemaVersion: 2,
      mode: 'freeform-slide',
      updatedAt: 1,
      document: {
        documentVersion: 1,
        activeSlideId: 's1',
        slides: [
          {
            id: 's1',
            name: 'Page 1',
            width: 1024,
            height: 768,
            background: { type: 'solid', color: '#ffffff' },
            elements: [
              {
                id: 't1',
                type: 'text',
                x: 10,
                y: 20,
                width: 300,
                height: 120,
                rotation: 0,
                text: 'old text',
                fontSize: 32,
                fontFamily: 'system-ui, sans-serif',
                color: '#123456',
                align: 'left',
                fontWeight: 'bold',
              },
            ],
          },
        ],
      },
    })

    expect(draft?.mode).toBe('freeform-slide')
    if (draft?.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(draft.document.documentVersion).toBe(3)
    expect(draft.document.slides[0].nodes[0]).toMatchObject({
      type: 'text',
      name: '文本',
      locked: false,
      hidden: false,
      scale: 1,
      textFill: { type: 'solid', color: '#123456' },
    })
    expect('color' in draft.document.slides[0].nodes[0]).toBe(false)
  })

  it('normalizes v2 gradients and falls back for malformed paint', () => {
    const draft = normalizeDraftForRead({
      id: 'freeform-v2',
      title: 'Gradient',
      schemaVersion: 2,
      mode: 'freeform-slide',
      updatedAt: 1,
      document: {
        documentVersion: 2,
        activeSlideId: 's1',
        slides: [
          {
            id: 's1',
            name: 'Page 1',
            width: 1024,
            height: 768,
            background: { type: 'linear-gradient', from: '#ffffff', to: '#f97316', angle: 765.7 },
            elements: [
              {
                id: 'shape1',
                type: 'shape',
                x: 10,
                y: 20,
                width: 300,
                height: 120,
                rotation: 0,
                shape: 'rect',
                fill: { type: 'linear-gradient', from: '#fed7aa', to: '#f97316', angle: 90 },
                stroke: '#c2410c',
                strokeWidth: 0,
              },
              {
                id: 'text1',
                type: 'text',
                x: 10,
                y: 160,
                width: 300,
                height: 120,
                rotation: 0,
                text: 'bad paint',
                fontSize: 32,
                fontFamily: 'system-ui, sans-serif',
                textFill: { type: 'solid', color: 'red' },
                align: 'left',
                fontWeight: 'bold',
              },
            ],
          },
        ],
      },
    })

    expect(draft?.mode).toBe('freeform-slide')
    if (draft?.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(draft.document.slides[0].background).toEqual({
      type: 'linear-gradient',
      from: '#ffffff',
      to: '#f97316',
      angle: 46,
    })
    expect(draft.document.documentVersion).toBe(3)
    expect(draft.document.slides[0].nodes[0]).toMatchObject({
      type: 'shape',
      fill: { type: 'linear-gradient', from: '#fed7aa', to: '#f97316', angle: 90 },
    })
    expect(draft.document.slides[0].nodes[1]).toMatchObject({
      type: 'text',
      textFill: { type: 'solid', color: '#18181b' },
    })
  })

  it('round-trips migrated v2 documents through the strict v3 read path', () => {
    const migrated = normalizeDraftForRead(freeformEnvelope({
      documentVersion: 2,
      activeSlideId: 's1',
      slides: [{
        id: 's1',
        name: 'Page 1',
        width: 1024,
        height: 768,
        background: { type: 'solid', color: '#ffffff' },
        elements: [{
          id: 'legacy-text',
          type: 'text',
          x: 10,
          y: 20,
          width: 200,
          height: 60,
          rotation: 0,
          text: 'legacy',
          fontSize: 20,
          fontFamily: 'system-ui',
          textFill: { type: 'solid', color: '#111111' },
          align: 'left',
          fontWeight: 'normal',
        }],
      }],
    }))

    expect(migrated?.mode).toBe('freeform-slide')
    if (migrated?.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    const reread = normalizeDraftForRead({ ...migrated, updatedAt: 2 })
    expect(reread).toEqual({ ...migrated, updatedAt: 2 })
  })

  it('reads a valid strict v3 document without flattening its scene tree', () => {
    const document = {
      documentVersion: 3,
      activeSlideId: 'slide-1',
      slides: [strictSlide('slide-1', [{
        id: 'group-1',
        name: 'Group',
        locked: true,
        hidden: false,
        type: 'group',
        x: 100,
        y: 80,
        rotation: 0,
        scale: 1,
        children: [strictText('text-1')],
      }])],
    }

    const normalized = normalizeDraftForRead(freeformEnvelope(document))

    expect(normalized?.mode).toBe('freeform-slide')
    if (normalized?.mode !== 'freeform-slide') throw new Error('Expected freeform draft')
    expect(normalized.document).toEqual(document)
  })

  it.each([
    ['501 slides', {
      documentVersion: 3,
      activeSlideId: 'slide-0',
      slides: Array.from({ length: 501 }, (_, index) => strictSlide(`slide-${index}`)),
    }],
    ['5001 nodes', {
      documentVersion: 3,
      activeSlideId: 'slide-1',
      slides: [strictSlide(
        'slide-1',
        Array.from({ length: 5001 }, (_, index) => strictText(`node-${index}`)),
      )],
    }],
    ['a non-finite transform', {
      documentVersion: 3,
      activeSlideId: 'slide-1',
      slides: [strictSlide('slide-1', [{ ...strictText('text-1'), x: Number.NaN }])],
    }],
    ['depth 33', {
      documentVersion: 3,
      activeSlideId: 'slide-1',
      slides: [strictSlide('slide-1', [nestedGroups(33)])],
    }],
    ['an invalid active slide id', {
      documentVersion: 3,
      activeSlideId: 'missing',
      slides: [strictSlide('slide-1')],
    }],
  ])('atomically rejects strict v3 with %s', (_label, document) => {
    expect(normalizeDraftForRead(freeformEnvelope(document))).toBeNull()
  })

  it('returns null for invalid draft data', () => {
    expect(normalizeDraftForRead({ id: 'broken' })).toBeNull()
    expect(normalizeDraftForRead(null)).toBeNull()
  })

  it('formats draft titles and subtitles for markdown and freeform drafts', () => {
    const markdownDraft = normalizeDraftForRead({
      id: 'old-1',
      title: 'Old',
      source: '# hello',
      platformId: 'rednote',
      themeId: 'light',
      fontFamily: 'system-ui, sans-serif',
      profile,
      updatedAt: 1,
    })

    const freeformDraft = normalizeDraftForRead({
      id: 'free-1',
      title: 'Free',
      schemaVersion: 2,
      mode: 'freeform-slide',
      updatedAt: 2,
      document: {
        documentVersion: 1,
        activeSlideId: 's1',
        slides: [
          {
            id: 's1',
            name: 'Page 1',
            width: 1080,
            height: 1440,
            background: { type: 'solid', color: '#ffffff' },
            elements: [],
          },
        ],
      },
    })

    if (!markdownDraft || !freeformDraft) throw new Error('Expected valid drafts')

    expect(draftTitle(markdownDraft)).toBe('Old')
    expect(draftSubtitle(markdownDraft)).toContain('Markdown')
    expect(draftSubtitle(freeformDraft)).toContain('自由编辑')
    expect(draftSubtitle(freeformDraft)).toContain('1 页')
  })
})
