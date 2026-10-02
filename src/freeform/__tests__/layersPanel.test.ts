import { afterEach, describe, expect, it } from 'vitest'

import { setLang } from '../../i18n'
import { layerDepthLabel, layerIndentPx, layerLabel } from '../FreeformLayersPanel'
import { ICONS, iconById, searchIcons } from '../icons'

describe('layer tree presentation', () => {
  it('caps visual indentation while preserving usable width at the maximum scene depth', () => {
    expect(layerIndentPx(1)).toBe(4)
    expect(layerIndentPx(5)).toBe(36)
    expect(layerIndentPx(13)).toBe(36)
    expect(layerIndentPx(32)).toBe(36)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'falls back to root indentation for an invalid aria level %s',
    (level) => {
      expect(layerIndentPx(level)).toBe(4)
    },
  )

  it('keeps exact deep hierarchy visible after indentation reaches its width cap', () => {
    expect(layerDepthLabel(5)).toBeNull()
    expect(layerDepthLabel(6)).toBe('6')
    expect(layerDepthLabel(25)).toBe('25')
    expect(layerDepthLabel(32)).toBe('32')
    expect(layerDepthLabel(33)).toBeNull()
    expect(layerDepthLabel(Number.NaN)).toBeNull()
  })
})

describe('layer labels', () => {
  afterEach(() => setLang('zh'))

  it('shows default, icon and decoration layer names in the interface language', () => {
    expect(layerLabel('图形')).toBe('图形')
    expect(layerLabel('对勾')).toBe('对勾')
    expect(layerLabel('手绘圈')).toBe('手绘圈')
    setLang('en')
    expect(layerLabel('图形')).toBe('Graphic')
    expect(layerLabel('对勾')).toBe('Check')
    expect(layerLabel('手绘圈')).toBe('Scribble circle')
    expect(layerLabel('我的图层')).toBe('我的图层')
  })
})

describe('icon search', () => {
  it('finds icons by id, either name or keyword, best match first', () => {
    expect(searchIcons('')).toHaveLength(ICONS.length)
    expect(searchIcons('勾')[0].id).toBe('check')
    expect(searchIcons('Check')[0].id).toBe('check')
    expect(searchIcons('arrow').map((icon) => icon.id)).toEqual(expect.arrayContaining(['arrow-right', 'arrow-left']))
    expect(searchIcons('购物').map((icon) => icon.id)).toEqual(['shopping-bag', 'shopping-cart'])
    expect(searchIcons('arrow right').map((icon) => icon.id)[0]).toBe('arrow-right')
    expect(searchIcons('不存在的图标')).toEqual([])
    expect(new Set(ICONS.map((icon) => icon.id)).size).toBe(ICONS.length)
    expect(iconById('heart')?.zh).toBe('爱心')
  })
})
