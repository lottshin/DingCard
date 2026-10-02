import { describe, expect, it } from 'vitest'
import { buildPdf, pdfPageFor, POINTS_PER_PIXEL } from '../exportPdf'

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

/** A stand-in for JPEG bytes: the writer embeds them as they are. */
function fakeJpeg(size: number, fill: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill)
  bytes.set([0xff, 0xd8], 0)
  bytes.set([0xff, 0xd9], size - 2)
  return bytes
}

describe('buildPdf', () => {
  it('writes one page per picture, each as large as its card, with a cross-reference table that points at every object', () => {
    const cover = pdfPageFor(fakeJpeg(300, 0x11), { width: 1080, height: 1440 }, { width: 2160, height: 2880 })
    const square = pdfPageFor(fakeJpeg(200, 0x22), { width: 1080, height: 1080 }, { width: 1080, height: 1080 })
    const file = buildPdf([cover, square])
    const source = text(file)

    expect(source.startsWith('%PDF-1.4\n')).toBe(true)
    expect(source.endsWith('%%EOF\n')).toBe(true)
    expect(source).toContain('/Type /Pages /Kids [3 0 R 6 0 R] /Count 2')
    expect(source).toContain(`/MediaBox [0 0 ${1080 * POINTS_PER_PIXEL} ${1440 * POINTS_PER_PIXEL}]`)
    expect(source).toContain('/MediaBox [0 0 810 810]')
    expect(source).toContain('/Width 2160 /Height 2880 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 300')
    expect(source).toContain('810 0 0 1080 0 0 cm\n/Card Do')

    // Every offset in the table lands on its object, and startxref on the table.
    const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(source)![1])
    expect(source.slice(startxref, startxref + 4)).toBe('xref')
    const entries = source.slice(startxref).split('\n').slice(2, 2 + 9)
    expect(entries[0]).toBe('0000000000 65535 f ')
    entries.slice(1).forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10))
      expect(source.slice(offset, offset + 10), `object ${index + 1}`).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })

    // The pictures go in byte for byte.
    const at = source.indexOf('stream\n', source.indexOf('/Length 300')) + 'stream\n'.length
    expect([...file.slice(at, at + 300)]).toEqual([...cover.jpeg])
  })

  it('refuses an empty document', () => {
    expect(() => buildPdf([])).toThrow()
  })
})
