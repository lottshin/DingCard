import { afterEach, describe, expect, it } from 'vitest'
import { setLang } from '../../i18n'
import { isDefaultPageName, slideDisplayName } from '../pageNames'

afterEach(() => setLang('zh'))

describe('page names', () => {
  it('calls pages with the names the editor made up by their position', () => {
    expect(slideDisplayName('Page 3', 0)).toBe('第 1 页')
    expect(slideDisplayName('Page 3 copy', 3)).toBe('第 4 页')
    expect(slideDisplayName('Page 3 copy copy', 4)).toBe('第 5 页')
    expect(slideDisplayName('   ', 1)).toBe('第 2 页')
    setLang('en')
    expect(slideDisplayName('Page 1 copy', 1)).toBe('Page 2')
  })

  it('keeps names people typed, translating only the copy suffix', () => {
    expect(slideDisplayName('  结尾页 ', 0)).toBe('结尾页')
    expect(slideDisplayName('Page one', 0)).toBe('Page one')
    expect(slideDisplayName('封面 copy', 1)).toBe('封面 副本')
    expect(slideDisplayName('封面 copy copy', 2)).toBe('封面 副本 副本')
    expect(isDefaultPageName('Page 2 copy')).toBe(true)
    expect(isDefaultPageName('封面 copy')).toBe(false)
    expect(isDefaultPageName('结尾页')).toBe(false)
    expect(isDefaultPageName('')).toBe(false)
  })
})
