// Bundle multiple rendered PNGs into a single .zip download.
//
// The actual per-page rendering stays in the caller, because it needs mounted
// DOM nodes and React state. This module only takes already-rendered data URLs
// and packages them.

import JSZip from 'jszip'

interface DownloadZipOptions {
  fileNameForIndex?: (index: number, total: number) => string
}

/** Strip the `data:image/png;base64,` prefix and return the raw base64 body. */
function base64Body(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/**
 * Package a list of PNG data URLs into a zip and trigger a download.
 * Defaults to card-01.png, card-02.png so the existing Markdown export keeps
 * its file naming.
 */
export async function downloadZip(
  dataUrls: string[],
  zipName = 'cards.zip',
  options: DownloadZipOptions = {},
): Promise<void> {
  const zip = new JSZip()
  const pad = String(dataUrls.length).length

  dataUrls.forEach((url, i) => {
    const name =
      options.fileNameForIndex?.(i, dataUrls.length) ??
      `card-${String(i + 1).padStart(pad, '0')}.png`
    zip.file(name, base64Body(url), { base64: true })
  })

  const blob = await zip.generateAsync({ type: 'blob' })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = zipName
  a.click()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
