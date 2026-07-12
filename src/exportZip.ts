// Bundle multiple rendered PNGs into a single .zip download.
//
// The actual per-page rendering stays in the caller, because it needs mounted
// DOM nodes and React state. This module packages either legacy data URLs or
// named Blob entries.

import JSZip from 'jszip'

export type ZipInput =
  | string
  | { name: string; blob: Blob }

export type ZipDownloader = (blob: Blob, zipName: string) => void

interface DownloadZipOptions {
  fileNameForIndex?: (index: number, total: number) => string
  downloader?: ZipDownloader
}

/** Strip the `data:image/png;base64,` prefix and return the raw base64 body. */
function base64Body(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

/**
 * Package PNGs into a zip and trigger a download.
 *
 * String inputs are legacy PNG data URLs and keep the existing Markdown card
 * file naming. Blob inputs carry their own file names and avoid base64
 * conversion for freeform exports.
 */
export async function downloadZip(
  inputs: ZipInput[],
  zipName = 'cards.zip',
  options: DownloadZipOptions = {},
): Promise<void> {
  const zip = new JSZip()
  const pad = String(inputs.length).length

  await Promise.all(inputs.map(async (input, i) => {
    if (typeof input === 'string') {
      const name =
        options.fileNameForIndex?.(i, inputs.length) ??
        `card-${String(i + 1).padStart(pad, '0')}.png`
      zip.file(name, base64Body(input), { base64: true })
      return
    }

    zip.file(input.name, await input.blob.arrayBuffer())
  }))

  const blob = await zip.generateAsync({ type: 'blob' })
  const downloader = options.downloader ?? downloadBlob
  downloader(blob, zipName)
}

function downloadBlob(blob: Blob, zipName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = zipName
  a.click()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}
