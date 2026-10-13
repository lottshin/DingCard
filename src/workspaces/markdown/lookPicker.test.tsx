import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, resolveTheme } from '../../theme'
import { lookFont, LookPicker } from './LookPicker'

describe('the look picker', () => {
  it("sets a designed look in its template's face and leaves a plain theme in the article's", () => {
    expect(lookFont(resolveTheme('template-letter'), 'PingFang SC')).toBe("'LXGW WenKai TC', cursive")
    expect(lookFont(resolveTheme('template-xuan'), 'PingFang SC')).toBe("'Noto Serif SC', serif")
    expect(lookFont(resolveTheme('mint'), 'PingFang SC')).toBe('PingFang SC')
    // A retired template theme is plain now.
    expect(lookFont(resolveTheme('template-editorial-archive'), 'PingFang SC')).toBe('PingFang SC')
  })

  it('shows the current theme in a combobox named 主题, closed until asked', () => {
    const html = renderToStaticMarkup(
      <LookPicker themeId="template-night" fontFamily="PingFang SC" radius={0} profile={DEFAULT_PROFILE} firstPageHtml="<h1>标题</h1>" pageCount={3} title="标题" onPick={() => undefined} />,
    )
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="主题"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('夜读')
    expect(html).not.toContain('role="listbox"')
  })
})
