import { describe, expect, it } from 'vitest'

import {
  FONTS,
  PLATFORMS,
  THEMES,
  buildConfig,
  resolveTheme,
  themesForPicker,
} from './theme'

describe('theme resolution', () => {
  it.each([
    ['template-editorial-archive'],
    ['template-public-theatre'],
    ['template-issue-cover'],
    ['template-editorial'],
  ])('resolves known theme %s without changing its id', (themeId) => {
    expect(resolveTheme(themeId).id).toBe(themeId)
  })

  it.each([undefined, null, '', 'missing-theme', 42, {}])(
    'falls back to the default theme for %j',
    (themeId) => {
      expect(resolveTheme(themeId)).toBe(THEMES[0])
    },
  )

  it('keeps the resolved theme id in card config', () => {
    const theme = resolveTheme('template-public-theatre')
    const config = buildConfig(PLATFORMS[0], theme, FONTS[0].id)

    expect(config.themeId).toBe('template-public-theatre')
  })
})

describe('themesForPicker', () => {
  it('shows generic and new template themes while hiding legacy template themes', () => {
    const ids = themesForPicker(undefined).map((theme) => theme.id)

    expect(ids).toEqual([
      'light',
      'warm',
      'dark',
      'mint',
      'template-editorial-archive',
      'template-public-theatre',
      'template-issue-cover',
    ])
    expect(ids).not.toContain('template-editorial')
    expect(ids).not.toContain('template-checklist')
    expect(ids).not.toContain('template-signal')
    expect(ids).not.toContain('template-night-flight')
  })

  it('temporarily includes the active legacy theme without mutating the registry', () => {
    const snapshot = THEMES.map((theme) => theme.id)
    const options = themesForPicker('template-signal')

    expect(options[options.length - 1]?.id).toBe('template-signal')
    expect(options.filter((theme) => theme.id === 'template-signal')).toHaveLength(1)
    expect(THEMES.map((theme) => theme.id)).toEqual(snapshot)
    expect(themesForPicker('light').map((theme) => theme.id)).not.toContain('template-signal')
  })

  it.each(['', 'missing-theme', null, 12])(
    'does not add invalid active theme %j to the picker',
    (themeId) => {
      expect(themesForPicker(themeId).every((theme) => theme.hidden !== true)).toBe(true)
    },
  )
})
