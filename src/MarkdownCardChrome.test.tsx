import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MarkdownCardChrome } from './MarkdownCardChrome'
import { formalNumeral, markdownChromeText, markdownFontPlan, markdownRunningTitle } from './markdownLooks'
import { THEMES } from './theme'

describe('MarkdownCardChrome', () => {
  it.each(THEMES.filter((theme) => theme.look).map((theme) => [theme.look!]))('renders scoped chrome for the %s look', (look) => {
    const html = renderToStaticMarkup(
      <MarkdownCardChrome look={look} pageRole="article" pageIndex={1} pageCount={4} title="在城市里慢慢走" />,
    )

    expect(html).toContain(`markdown-card-chrome--${look}`)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-chrome-role="article"')
    expect(html).toContain('在城市里慢慢走')
  })

  it('draws nothing for a plain theme', () => {
    expect(renderToStaticMarkup(<MarkdownCardChrome look={null} pageRole="article" pageIndex={0} pageCount={1} />)).toBe('')
  })

  it('leaves the running head out when the article has no title', () => {
    const html = renderToStaticMarkup(<MarkdownCardChrome look="column" pageRole="article" pageIndex={0} pageCount={2} />)
    expect(html).not.toContain('markdown-chrome-head')
  })
})

describe('markdown look furniture', () => {
  it('numbers each page the way its look reads', () => {
    expect(markdownChromeText('column', 0, 4).folio).toBe('01 / 04')
    expect(markdownChromeText('column', 9, 12).folio).toBe('10 / 12')
    expect(markdownChromeText('memo', 1, 5).folio).toBe('2 / 5')
    expect(markdownChromeText('letter', 2, 5).folio).toBe('第 3 页 · 共 5 页')
    expect(markdownChromeText('swiss', 0, 3).folio).toBe('01')
    expect(markdownChromeText('xuan', 11, 20).folio).toBe('拾贰')
    expect(markdownChromeText('journal', 3, 6).folio).toBe('P.04')
    expect(markdownChromeText('column', -1, 0).folio).toBe('01 / 01')
    expect(markdownChromeText('column', Number.NaN, Number.POSITIVE_INFINITY).folio).toBe('01 / 01')
  })

  it('dates a note and a journal page, and nothing else', () => {
    const now = new Date(2026, 9, 13, 9, 5)
    expect(markdownChromeText('memo', 0, 1, now).date).toBe('2026年10月13日 09:05')
    expect(markdownChromeText('journal', 0, 1, now).date).toBe('10.13 周二')
    expect(markdownChromeText('column', 0, 1, now).date).toBeNull()
  })

  it('cuts seal numerals the formal way', () => {
    expect([1, 9, 10, 11, 20, 21, 99].map(formalNumeral)).toEqual(['壹', '玖', '拾', '拾壹', '贰拾', '贰拾壹', '玖拾玖'])
  })

  it('takes the running head from the first heading, without its marks', () => {
    expect(markdownRunningTitle('前言\n\n# 在**城市**里`慢慢`走\n\n## 第二节')).toBe('在城市里慢慢走')
    expect(markdownRunningTitle('## [链接](https://x.y) 标题')).toBe('链接 标题')
    expect(markdownRunningTitle('只有正文。')).toBe('')
  })

  it('embeds the chrome words with the card font and the chrome faces', () => {
    const plan = markdownFontPlan('xuan', '# 霜降\n\n正文', "'LXGW WenKai TC', cursive")
    expect(plan[0].fontFamily).toBe("'LXGW WenKai TC', cursive")
    expect(plan[0].text).toContain('完')
    expect(plan.map((entry) => entry.fontFamily)).toContain("'Noto Serif SC', serif")
    expect(markdownFontPlan(null, '正文', 'PingFang SC')).toEqual([{ fontFamily: 'PingFang SC', text: '正文' }])
  })
})
