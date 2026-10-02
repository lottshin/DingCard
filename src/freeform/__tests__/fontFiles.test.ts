import { describe, expect, it } from 'vitest'

import { cleanFontName, fontFileFormat, fontNameFromFile, importedFontStack, readFontName } from '../fontFiles'

type Name = [platform: number, language: number, nameId: number, value: string]

/** A name table holding the given records, strings in UTF-16BE. */
function nameTable(names: Name[]): Uint8Array {
  const strings = names.map(([, , , value]) => {
    const bytes = new Uint8Array(value.length * 2)
    for (let index = 0; index < value.length; index += 1) {
      bytes[index * 2] = value.charCodeAt(index) >> 8
      bytes[index * 2 + 1] = value.charCodeAt(index) & 255
    }
    return bytes
  })
  const storage = 6 + names.length * 12
  const table = new Uint8Array(storage + strings.reduce((sum, bytes) => sum + bytes.length, 0))
  const view = new DataView(table.buffer)
  view.setUint16(2, names.length)
  view.setUint16(4, storage)
  let offset = 0
  names.forEach(([platform, language, nameId], index) => {
    const at = 6 + index * 12
    view.setUint16(at, platform)
    view.setUint16(at + 2, 1)
    view.setUint16(at + 4, language)
    view.setUint16(at + 6, nameId)
    view.setUint16(at + 8, strings[index].length)
    view.setUint16(at + 10, offset)
    table.set(strings[index], storage + offset)
    offset += strings[index].length
  })
  return table
}

function ascii(view: DataView, at: number, text: string) {
  for (let index = 0; index < 4; index += 1) view.setUint8(at + index, text.charCodeAt(index))
}

/** A TrueType file with just a name table: all the name reader looks at. */
function sfnt(names: Name[], version = 0x00010000): ArrayBuffer {
  const table = nameTable(names)
  const bytes = new Uint8Array(12 + 16 + table.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, version)
  view.setUint16(4, 1)
  ascii(view, 12, 'name')
  view.setUint32(20, 28)
  view.setUint32(24, table.length)
  bytes.set(table, 28)
  return bytes.buffer
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The same in a WOFF wrapper, the name table zlib-packed. */
async function woff(names: Name[]): Promise<ArrayBuffer> {
  const table = nameTable(names)
  const packed = await deflate(table)
  const bytes = new Uint8Array(44 + 20 + packed.length)
  const view = new DataView(bytes.buffer)
  ascii(view, 0, 'wOFF')
  view.setUint32(4, 0x00010000)
  view.setUint32(8, bytes.length)
  view.setUint16(12, 1)
  ascii(view, 44, 'name')
  view.setUint32(48, 64)
  view.setUint32(52, packed.length)
  view.setUint32(56, table.length)
  bytes.set(packed, 64)
  return bytes.buffer
}

const ALIBABA: Name[] = [
  [3, 0x0409, 1, 'Alibaba PuHuiTi'],
  [3, 0x0804, 1, '阿里巴巴普惠体'],
  [3, 0x0409, 2, 'Bold'],
  [3, 0x0409, 4, 'Alibaba PuHuiTi Bold'],
]

describe('font files', () => {
  it('knows a font by its first bytes', async () => {
    expect(fontFileFormat(sfnt(ALIBABA))).toBe('truetype')
    expect(fontFileFormat(sfnt(ALIBABA, 0x4f54544f))).toBe('opentype') // OTTO
    expect(fontFileFormat(await woff(ALIBABA))).toBe('woff')
    expect(fontFileFormat(new TextEncoder().encode('wOF2 and the rest').buffer)).toBe('woff2')
    expect(fontFileFormat(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>').buffer)).toBeNull()
    expect(fontFileFormat(new ArrayBuffer(4))).toBeNull()
  })

  it('reads the name a font gives itself, in Chinese first, with its style unless it is the plain one', async () => {
    expect(await readFontName(sfnt(ALIBABA))).toBe('阿里巴巴普惠体 Bold')
    expect(await readFontName(sfnt([[3, 0x0409, 1, 'Smiley Sans'], [3, 0x0409, 2, 'Regular']]))).toBe('Smiley Sans')
    // The typographic family (16) wins over the legacy one (1).
    expect(await readFontName(sfnt([[3, 0x0409, 1, 'Source Han Sans SC Heavy'], [3, 0x0409, 16, 'Source Han Sans SC'], [3, 0x0409, 17, 'Heavy']])))
      .toBe('Source Han Sans SC Heavy')
    expect(await readFontName(await woff(ALIBABA))).toBe('阿里巴巴普惠体 Bold')
    // WOFF2 tables are Brotli-packed: no name to read, so the file name stands in.
    expect(await readFontName(new TextEncoder().encode('wOF2 and the rest').buffer)).toBeNull()
  })

  it('makes a safe family name and the stack a text takes', () => {
    expect(fontNameFromFile('AlibabaPuHuiTi-Bold.woff2')).toBe('AlibabaPuHuiTi-Bold')
    expect(cleanFontName(`  Evil'; } body { x: "y  `)).toBe('Evil body x: y')
    expect(Array.from(cleanFontName('字'.repeat(80)))).toHaveLength(60)
    expect(importedFontStack('阿里巴巴普惠体 Bold')).toBe("'阿里巴巴普惠体 Bold', sans-serif")
  })
})
