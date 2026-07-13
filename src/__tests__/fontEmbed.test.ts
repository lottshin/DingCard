import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFontEmbedCSS } from '../fontEmbed'

describe('buildFontEmbedCSS', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not request Google Fonts for a system font family', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
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
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
    })

    await expect(buildFontEmbedCSS('自由编辑', 'ZCOOL XiaoWei, serif')).resolves.toBe('')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(href)
  })

  it('shares an in-flight build between background warmup and export', async () => {
    const href =
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap&test=in-flight'
    let resolveCss!: (css: string) => void
    const css = new Promise<string>((resolve) => {
      resolveCss = resolve
    })
    const fetchMock = vi.fn(async () => ({ ok: true, text: () => css }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
    })

    const warmup = buildFontEmbedCSS('warmup-export', 'Noto Sans SC, sans-serif')
    const exportBuild = buildFontEmbedCSS('warmup-export', 'Noto Sans SC, sans-serif')
    resolveCss('')

    await Promise.all([warmup, exportBuild])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('fetches only the requested font weights when provided', async () => {
    const href =
      'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&display=swap&test=weights'
    const regularUrl = 'https://fonts.test/noto-serif-regular.woff2'
    const boldUrl = 'https://fonts.test/noto-serif-bold.woff2'
    const css = `
      @font-face { font-family: 'Noto Serif SC'; font-weight: 400; src: url(${regularUrl}); }
      @font-face { font-family: 'Noto Serif SC'; font-weight: 700; src: url(${boldUrl}); }
    `
    const fetchMock = vi.fn(async (url: string) =>
      url === href
        ? { ok: true, text: async () => css }
        : { ok: true, blob: async () => new Blob(['font']) },
    )
    class TestFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL() {
        this.result = 'data:font/woff2;base64,Zm9udA=='
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('FileReader', TestFileReader)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
    })

    await (buildFontEmbedCSS as unknown as (
      text: string,
      fontFamily: string,
      fontWeights: number[],
    ) => Promise<string>)('weight-filter', 'Noto Serif SC, serif', [700])

    const requestedUrls = fetchMock.mock.calls.map(([url]) => url)
    expect(requestedUrls).toContain(boldUrl)
    expect(requestedUrls).not.toContain(regularUrl)
  })

  it('reuses an accessible loaded Google Fonts stylesheet without fetching it again', async () => {
    const href =
      'https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400&display=swap&test=cssom'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
      styleSheets: [
        {
          href,
          cssRules: [
            {
              cssText: "@font-face { font-family: 'LXGW WenKai TC'; font-weight: 400; }",
            },
          ],
        },
      ],
    })

    await expect(
      buildFontEmbedCSS('loaded-cssom', 'LXGW WenKai TC, cursive', [400]),
    ).resolves.toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shares an in-flight font file across different character signatures', async () => {
    const href =
      'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400&display=swap&test=font-file'
    const fontUrl = 'https://fonts.test/shared-subset.woff2'
    const css = `@font-face {
      font-family: 'Noto Sans SC';
      font-weight: 400;
      src: url(${fontUrl});
    }`
    let resolveBlob!: (blob: Blob) => void
    const blob = new Promise<Blob>((resolve) => {
      resolveBlob = resolve
    })
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, blob: () => blob }))
    class TestFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null

      readAsDataURL() {
        this.result = 'data:font/woff2;base64,Zm9udA=='
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('FileReader', TestFileReader)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
      styleSheets: [{ href, cssRules: [{ cssText: css }] }],
    })

    const first = buildFontEmbedCSS('甲', 'Noto Sans SC, sans-serif', [400])
    const second = buildFontEmbedCSS('乙', 'Noto Sans SC, sans-serif', [400])
    resolveBlob(new Blob(['font']))
    await Promise.all([first, second])

    const fontRequests = fetchMock.mock.calls.filter(([url]) => url === fontUrl)
    expect(fontRequests).toHaveLength(1)
  })

  it('retries a stylesheet after a transient fetch failure', async () => {
    const href =
      'https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap&test=retry'
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('document', {
      querySelectorAll: () => [{ href }],
      styleSheets: [],
    })

    await expect(
      buildFontEmbedCSS('失败重试', 'ZCOOL XiaoWei, serif', [400]),
    ).rejects.toThrow('temporary network failure')
    await expect(
      buildFontEmbedCSS('失败重试', 'ZCOOL XiaoWei, serif', [400]),
    ).resolves.toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
