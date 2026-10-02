// A minimal PDF writer for exported cards: one picture per page, filling the
// page. Every page is already rendered to pixels, so a JPEG per page (PDF
// reads baseline JPEG as-is, DCTDecode) is all a file needs — no PDF library.
// Pages keep their own sizes. Pure bytes in, bytes out: the editor's export
// and the MCP server build files with the same code.

export interface PdfPage {
  /** A baseline JPEG, as canvas.toBlob('image/jpeg') makes it. */
  jpeg: Uint8Array
  /** The picture's size in pixels. */
  pixelWidth: number
  pixelHeight: number
  /** The page's size in points (1/72 inch). */
  width: number
  height: number
}

/** Points per CSS pixel: pages print at 96 px to the inch, as browsers print. */
export const POINTS_PER_PIXEL = 0.75

/** A page for a card `width`×`height` CSS pixels, drawn from a JPEG of `pixelWidth`×`pixelHeight`. */
export function pdfPageFor(
  jpeg: Uint8Array,
  card: { width: number; height: number },
  pixels: { width: number; height: number },
): PdfPage {
  return {
    jpeg,
    pixelWidth: pixels.width,
    pixelHeight: pixels.height,
    width: card.width * POINTS_PER_PIXEL,
    height: card.height * POINTS_PER_PIXEL,
  }
}

function points(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** The bytes of a PDF with one page per entry, in order. */
export function buildPdf(pages: readonly PdfPage[]): Uint8Array<ArrayBuffer> {
  if (pages.length === 0) throw new Error('PDF needs at least one page')
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string | Uint8Array[], dictionary?: string) => {
    offsets[id] = length
    write(`${id} 0 obj\n`)
    if (typeof body === 'string') {
      write(body)
    } else {
      const streamLength = body.reduce((sum, part) => sum + part.length, 0)
      write(`<< ${dictionary ?? ''} /Length ${streamLength} >>\nstream\n`)
      body.forEach(write)
      write('\nendstream')
    }
    write('\nendobj\n')
  }

  // A binary comment after the header tells file tools the file isn't text.
  write('%PDF-1.4\n')
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  // Objects: 1 catalog, 2 page tree, then per page its page, picture and drawing.
  const pageId = (index: number) => 3 + index * 3
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  pages.forEach((page, index) => {
    const id = pageId(index)
    const size = `${points(page.width)} 0 0 ${points(page.height)} 0 0`
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${points(page.width)} ${points(page.height)}] `
      + `/Resources << /XObject << /Card ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`)
    object(id + 1, [page.jpeg], `/Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} `
      + '/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode')
    object(id + 2, [encoder.encode(`q\n${size} cm\n/Card Do\nQ`)])
  })

  const xref = length
  const count = 3 + pages.length * 3
  write(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let id = 1; id < count; id += 1) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const file = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    file.set(part, at)
    at += part.length
  }
  return file
}
