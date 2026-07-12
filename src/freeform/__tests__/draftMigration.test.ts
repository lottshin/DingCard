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

  it('migrates freeform v1 drafts to v2 envelopes', () => {
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
    expect(migrated.document.documentVersion).toBe(2)
    expect(migrated.document.slides[0].background).toEqual({ type: 'solid', color: '#ffffff' })
  })

  it('migrates v1 freeform text color to v2 textFill', () => {
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
    expect(draft.document.documentVersion).toBe(2)
    expect(draft.document.slides[0].elements[0]).toMatchObject({
      type: 'text',
      textFill: { type: 'solid', color: '#123456' },
    })
    expect('color' in draft.document.slides[0].elements[0]).toBe(false)
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
    expect(draft.document.slides[0].elements[0]).toMatchObject({
      type: 'shape',
      fill: { type: 'linear-gradient', from: '#fed7aa', to: '#f97316', angle: 90 },
    })
    expect(draft.document.slides[0].elements[1]).toMatchObject({
      type: 'text',
      textFill: { type: 'solid', color: '#18181b' },
    })
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
