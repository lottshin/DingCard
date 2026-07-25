import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MarkdownCardChrome } from './MarkdownCardChrome'

describe('MarkdownCardChrome', () => {
  it.each([
    ['template-editorial-archive', 'markdown-card-chrome--editorial-archive'],
    ['template-public-theatre', 'markdown-card-chrome--public-theatre'],
    ['template-issue-cover', 'markdown-card-chrome--issue-cover'],
  ])('renders scoped chrome for %s', (themeId, expectedClass) => {
    const html = renderToStaticMarkup(
      <MarkdownCardChrome themeId={themeId} pageRole="cover" pageIndex={0} pageCount={4} />,
    )

    expect(html).toContain(expectedClass)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('01 / 04')
  })

  it.each(['light', 'template-editorial', 'missing-theme', ''])(
    'does not render chrome for %s',
    (themeId) => {
      expect(
        renderToStaticMarkup(
          <MarkdownCardChrome themeId={themeId} pageRole="article" pageIndex={0} pageCount={1} />,
        ),
      ).toBe('')
    },
  )

  it('formats double-digit page totals from runtime values', () => {
    const html = renderToStaticMarkup(
      <MarkdownCardChrome
        themeId="template-public-theatre"
        pageRole="list"
        pageIndex={9}
        pageCount={12}
      />,
    )

    expect(html).toContain('10 / 12')
    expect(html).toContain('data-chrome-role="list"')
  })
})
