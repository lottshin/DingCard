import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readLastSession, updateLastSession } from '../lastSession'

function stubStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    clear: vi.fn(() => {
      values.clear()
    }),
  })
  return values
}

beforeEach(() => {
  stubStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readLastSession', () => {
  it('returns the default session when nothing is stored', () => {
    expect(readLastSession('user-1')).toEqual({
      mode: 'markdown-card',
      markdownDraftId: null,
      freeformDraftId: null,
    })
  })

  it('returns the default session for an empty user id', () => {
    stubStorage({ 'slicer.last-session.user-1': JSON.stringify({ mode: 'freeform-slide' }) })
    expect(readLastSession('')).toEqual({
      mode: 'markdown-card',
      markdownDraftId: null,
      freeformDraftId: null,
    })
  })

  it('reads back a recorded session per user', () => {
    updateLastSession('user-1', { mode: 'freeform-slide', freeformDraftId: 'draft-a' })
    updateLastSession('user-2', { mode: 'markdown-card', markdownDraftId: 'draft-b' })

    expect(readLastSession('user-1')).toEqual({
      mode: 'freeform-slide',
      markdownDraftId: null,
      freeformDraftId: 'draft-a',
    })
    expect(readLastSession('user-2')).toEqual({
      mode: 'markdown-card',
      markdownDraftId: 'draft-b',
      freeformDraftId: null,
    })
  })

  it('falls back to defaults on corrupted JSON', () => {
    stubStorage({ 'slicer.last-session.user-1': '{not json' })
    expect(readLastSession('user-1').mode).toBe('markdown-card')
  })

  it('drops invalid fields instead of trusting them', () => {
    stubStorage({
      'slicer.last-session.user-1': JSON.stringify({
        mode: 'something-else',
        markdownDraftId: 42,
        freeformDraftId: ['draft-a'],
      }),
    })
    expect(readLastSession('user-1')).toEqual({
      mode: 'markdown-card',
      markdownDraftId: null,
      freeformDraftId: null,
    })
  })

  it('falls back to defaults when storage throws on read', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError')
      }),
    })
    expect(readLastSession('user-1').mode).toBe('markdown-card')
  })
})

describe('updateLastSession', () => {
  it('merges patches and keeps unmentioned fields', () => {
    updateLastSession('user-1', { mode: 'freeform-slide' })
    updateLastSession('user-1', { freeformDraftId: 'draft-a' })

    expect(readLastSession('user-1')).toEqual({
      mode: 'freeform-slide',
      markdownDraftId: null,
      freeformDraftId: 'draft-a',
    })
  })

  it('clears a draft id back to null', () => {
    updateLastSession('user-1', { freeformDraftId: 'draft-a' })
    updateLastSession('user-1', { freeformDraftId: null })

    expect(readLastSession('user-1').freeformDraftId).toBeNull()
  })

  it('ignores writes for an empty user id', () => {
    updateLastSession('', { mode: 'freeform-slide' })
    expect(localStorage.getItem('slicer.last-session.')).toBeNull()
  })

  it('silently gives up when storage throws on write', () => {
    updateLastSession('user-1', { mode: 'freeform-slide' })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => JSON.stringify({ mode: 'freeform-slide' })),
      setItem: vi.fn(() => {
        throw new DOMException('quota', 'QuotaExceededError')
      }),
    })
    expect(() => updateLastSession('user-1', { freeformDraftId: 'draft-b' })).not.toThrow()
    // 读取不受影响，仍是上一次成功写入的内容。
    expect(readLastSession('user-1').freeformDraftId).toBeNull()
  })
})
