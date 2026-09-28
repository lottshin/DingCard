import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_VIEW_PREFS,
  loadViewPrefs,
  saveViewPrefs,
} from '../viewPrefs'

describe('freeform view prefs', () => {
  let values: Map<string, string>

  beforeEach(() => {
    values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the defaults for a fresh or unreadable store', () => {
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS)
    localStorage.setItem('slicer.freeform.prefs.v1', 'not json')
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS)
    localStorage.setItem('slicer.freeform.prefs.v1', '{"guidesVisible":true}')
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS)
  })

  it('round-trips toggled preferences', () => {
    const prefs = { guidesVisible: false, snappingEnabled: false }
    saveViewPrefs(prefs)
    expect(loadViewPrefs()).toEqual(prefs)

    saveViewPrefs({ guidesVisible: false, snappingEnabled: true })
    expect(loadViewPrefs()).toEqual({ guidesVisible: false, snappingEnabled: true })
  })

  it('strips unknown keys from stored payloads', () => {
    localStorage.setItem(
      'slicer.freeform.prefs.v1',
      '{"guidesVisible":true,"snappingEnabled":true,"extra":1}',
    )
    expect(loadViewPrefs()).toEqual({ guidesVisible: true, snappingEnabled: true })
  })
})
