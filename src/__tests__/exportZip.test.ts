import { describe, expect, it, vi } from 'vitest'
import { downloadZip, type ZipDownloader } from '../exportZip'

async function readZipEntries(blob: Blob) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return Object.fromEntries(
    await Promise.all(
      Object.keys(zip.files)
        .filter((name) => !zip.files[name].dir)
        .map(async (name) => [name, await zip.file(name)!.async('string')]),
    ),
  )
}

describe('downloadZip', () => {
  it('keeps data URL inputs compatible with card file names', async () => {
    const downloader = vi.fn<ZipDownloader>()

    await downloadZip(['data:image/png;base64,YQ=='], 'cards.zip', { downloader })

    expect(downloader).toHaveBeenCalledTimes(1)
    const [blob, zipName] = downloader.mock.calls[0]
    expect(zipName).toBe('cards.zip')
    await expect(readZipEntries(blob)).resolves.toEqual({ 'card-1.png': 'a' })
  })

  it('writes named Blob entries without base64 conversion', async () => {
    const downloader = vi.fn<ZipDownloader>()

    await downloadZip(
      [{ name: 'slide-01.png', blob: new Blob(['png-bytes'], { type: 'image/png' }) }],
      'slides.zip',
      { downloader },
    )

    expect(downloader).toHaveBeenCalledTimes(1)
    const [blob, zipName] = downloader.mock.calls[0]
    expect(zipName).toBe('slides.zip')
    await expect(readZipEntries(blob)).resolves.toEqual({ 'slide-01.png': 'png-bytes' })
  })
})
