import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Card } from './Card'
import { DEFAULT_PROFILE, FONTS, PLATFORMS, buildConfig, resolveTheme } from './theme'

describe('Card markdown presentation contract', () => {
  it('writes theme and page metadata on both export and measurement nodes', () => {
    const config = buildConfig(
      PLATFORMS[0],
      resolveTheme('template-editorial-archive'),
      FONTS[0].id,
    )
    const html = renderToStaticMarkup(
      <Card
        html="<h1>编辑档案</h1>"
        config={config}
        profile={DEFAULT_PROFILE}
        pageIndex={1}
        pageCount={4}
        pageRole="article"
        showHeader={false}
      />,
    )

    expect(html).toContain('data-card-theme="template-editorial-archive"')
    expect(html).toContain('data-page-role="article"')
    expect(html).toContain('data-page-index="1"')
    expect(html).toContain('data-page-count="4"')
    expect(html).toContain('data-has-social-header="false"')
    expect(html.match(/data-card-theme=/g)).toHaveLength(2)
    expect(html).toContain('markdown-card-chrome--editorial-archive')
  })
})
