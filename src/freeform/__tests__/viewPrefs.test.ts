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

  it('fills the export-option defaults into pre-export stored payloads', () => {
    localStorage.setItem(
      'slicer.freeform.prefs.v1',
      '{"guidesVisible":false,"snappingEnabled":true}',
    )
    expect(loadViewPrefs()).toEqual({ ...DEFAULT_VIEW_PREFS, guidesVisible: false })
  })

  it('round-trips toggled preferences', () => {
    const prefs = { ...DEFAULT_VIEW_PREFS, guidesVisible: false, snappingEnabled: false }
    saveViewPrefs(prefs)
    expect(loadViewPrefs()).toEqual(prefs)

    saveViewPrefs({ ...DEFAULT_VIEW_PREFS, guidesVisible: false, snappingEnabled: true })
    expect(loadViewPrefs()).toEqual({ ...DEFAULT_VIEW_PREFS, guidesVisible: false })
  })

  it('round-trips export options', () => {
    const prefs = {
      ...DEFAULT_VIEW_PREFS,
      exportFormat: 'jpeg' as const,
      exportQuality: 0.8,
      exportScale: 2 as const,
    }
    saveViewPrefs(prefs)
    expect(loadViewPrefs()).toEqual(prefs)
  })

  it('rejects malformed export options back to the defaults', () => {
    localStorage.setItem(
      'slicer.freeform.prefs.v1',
      '{"guidesVisible":true,"snappingEnabled":true,"exportFormat":"webp","exportQuality":3,"exportScale":4}',
    )
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS)
  })

  it('strips unknown keys from stored payloads', () => {
    localStorage.setItem(
      'slicer.freeform.prefs.v1',
      '{"guidesVisible":true,"snappingEnabled":true,"extra":1}',
    )
    expect(loadViewPrefs()).toEqual(DEFAULT_VIEW_PREFS)
  })
})
