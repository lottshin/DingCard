import { describe, expect, it } from 'vitest'
import { normalizeDraftForRead } from '../../drafts'

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

  it('keeps freeform v2 drafts unchanged', () => {
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

    expect(normalizeDraftForRead(draft)).toEqual(draft)
  })

  it('returns null for invalid draft data', () => {
    expect(normalizeDraftForRead({ id: 'broken' })).toBeNull()
    expect(normalizeDraftForRead(null)).toBeNull()
  })
})
