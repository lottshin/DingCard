import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  loadRecentColors,
  normalizeRecentColors,
  pushRecentColor,
  RECENT_COLORS_MAX,
  saveRecentColors,
} from '../recentColors'

describe('freeform recent colors', () => {
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

  it('starts empty and survives a save/load round trip', () => {
    expect(loadRecentColors()).toEqual([])
    saveRecentColors(['#ff0000', '#00ff00'])
    expect(loadRecentColors()).toEqual(['#ff0000', '#00ff00'])
  })

  it('pushes new colors to the front and de-duplicates', () => {
    let colors: string[] = []
    colors = pushRecentColor(colors, '#ff0000')
    colors = pushRecentColor(colors, '#00ff00')
    expect(colors).toEqual(['#00ff00', '#ff0000'])
    // Re-picking an existing color moves it to the front without duplicating.
    colors = pushRecentColor(colors, '#FF0000')
    expect(colors).toEqual(['#ff0000', '#00ff00'])
  })

  it('rejects invalid hex values', () => {
    const colors = pushRecentColor(['#123456'], '#abc')
    expect(colors).toEqual(['#123456'])
    expect(pushRecentColor(colors, 'red')).toEqual(['#123456'])
  })

  it('caps the list at the most recent entries', () => {
    let colors: string[] = []
    for (let index = 0; index < RECENT_COLORS_MAX + 5; index += 1) {
      colors = pushRecentColor(colors, `#${index.toString(16).padStart(6, '0')}`)
    }
    expect(colors).toHaveLength(RECENT_COLORS_MAX)
    expect(colors[0]).toBe('#00000e')
  })

  it('normalizes stored payloads defensively', () => {
    expect(normalizeRecentColors('nope')).toEqual([])
    expect(normalizeRecentColors(['#ff0000', 'red', '#ff0000', '#00ff00', null])).toEqual([
      '#ff0000',
      '#00ff00',
    ])
    expect(normalizeRecentColors(undefined)).toEqual([])
  })

  it('drops a corrupt store payload to an empty list', () => {
    localStorage.setItem('slicer.recent-colors.v1', '{{{')
    expect(loadRecentColors()).toEqual([])
    localStorage.setItem('slicer.recent-colors.v1', '"just a string"')
    expect(loadRecentColors()).toEqual([])
  })
})
