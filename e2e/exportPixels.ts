// Pixels of exported JPEGs and PDFs, as a browser decodes them.

import type { Page } from '@playwright/test'

/** A JPEG's red, green and blue at a pixel. */
export async function jpegPixel(page: Page, jpeg: Buffer, x: number, y: number): Promise<number[]> {
  return page.evaluate(async ({ source, x, y }) => {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas context')
    context.drawImage(image, 0, 0)
    return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3))
  }, { source: `data:image/jpeg;base64,${jpeg.toString('base64')}`, x, y })
}

/** The first page's picture in a PDF the export wrote: the JPEG its image stream holds. */
export function firstPdfJpeg(pdf: Buffer): Buffer {
  const start = pdf.indexOf(Buffer.from([0xff, 0xd8, 0xff]))
  if (start < 0) throw new Error('no JPEG in the PDF')
  return pdf.subarray(start, pdf.indexOf(Buffer.from('\nendstream', 'latin1'), start))
}

export function colourDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}
