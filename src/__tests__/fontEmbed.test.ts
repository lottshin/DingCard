import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFontEmbedCSS } from '../fontEmbed'

describe('buildFontEmbedCSS', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not request Google Fonts for a system font family', async () => {
    const fetchMock = vi.fn(async () => ({ text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      querySelectorAll: () => [
        {
          href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap',
        },
      ],
    })

    await expect(buildFontEmbedCSS('自由编辑', 'PingFang SC, sans-serif')).resolves.toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still requests the matching Google Fonts stylesheet for a web font', async () => {
    const href =
      'https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap&test=font-embed'
    const fetchMock = vi.fn(async () => ({ text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
    })

    await expect(buildFontEmbedCSS('自由编辑', 'ZCOOL XiaoWei, serif')).resolves.toBe('')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(href)
  })
})
