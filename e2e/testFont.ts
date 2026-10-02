// A tiny TrueType font made on the spot, so font import can be tested
// without shipping a font file: one square glyph for "A", and a name table
// that names the font in English and Simplified Chinese.

type Table = { tag: string; data: Buffer }

function u16(...values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2)
  values.forEach((value, index) => buffer.writeUInt16BE(value & 0xffff, index * 2))
  return buffer
}

function u32(...values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4)
  values.forEach((value, index) => buffer.writeUInt32BE(value >>> 0, index * 4))
  return buffer
}

function checksum(data: Buffer): number {
  const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)])
  let sum = 0
  for (let offset = 0; offset < padded.length; offset += 4) sum = (sum + padded.readUInt32BE(offset)) >>> 0
  return sum
}

function utf16(text: string): Buffer {
  return u16(...Array.from(text, (character) => character.charCodeAt(0)))
}

function nameTable(english: string, chinese: string): Buffer {
  const postScript = english.replace(/[^A-Za-z0-9-]/g, '')
  const records: Array<[number, number, string]> = [
    [0x0409, 1, english],
    [0x0409, 2, 'Regular'],
    [0x0409, 3, `${postScript}-1.0`],
    [0x0409, 4, english],
    [0x0409, 6, postScript],
    [0x0804, 1, chinese],
    [0x0804, 2, 'Regular'],
    [0x0804, 4, chinese],
  ]
  const strings = records.map(([, , text]) => utf16(text))
  const head = u16(0, records.length, 6 + records.length * 12)
  let offset = 0
  const entries = records.map(([language, nameId], index) => {
    const entry = u16(3, 1, language, nameId, strings[index].length, offset)
    offset += strings[index].length
    return entry
  })
  return Buffer.concat([head, ...entries, ...strings])
}

export function makeTestFont(english = 'DingCard Test', chinese = '叮卡测试体'): Buffer {
  const glyph = Buffer.concat([
    u16(1, 100, 0, 900, 700), // one contour, its bounds
    u16(3, 0), // last point, no instructions
    Buffer.from([1, 1, 1, 1]), // four on-curve points
    u16(100, 800, 0, -800 & 0xffff), // x deltas
    u16(0, 0, 700, 0), // y deltas
  ])
  const tables: Table[] = [
    {
      tag: 'OS/2',
      data: Buffer.concat([
        u16(4, 500, 400, 5, 0),
        u16(650, 600, 0, 75, 650, 600, 0, 350, 50, 300),
        u16(0),
        Buffer.alloc(10),
        u32(1, 0, 0, 0),
        Buffer.from('NONE'),
        u16(0x40, 0x41, 0x41),
        u16(800, -200 & 0xffff, 0, 800, 200),
        u32(1, 0),
        u16(500, 700, 0, 0x20, 1),
      ]),
    },
    {
      tag: 'cmap',
      data: Buffer.concat([
        u16(0, 1), u16(3, 1), u32(12),
        u16(4, 32, 0, 4, 4, 1, 0),
        u16(0x41, 0xffff), u16(0),
        u16(0x41, 0xffff),
        u16((1 - 0x41) & 0xffff, 1),
        u16(0, 0),
      ]),
    },
    { tag: 'glyf', data: glyph },
    {
      tag: 'head',
      data: Buffer.concat([
        u16(1, 0), u32(0x00010000, 0, 0x5f0f3cf5), u16(3, 1000),
        Buffer.alloc(16),
        u16(100, 0, 900, 700, 0, 8, 2, 0, 0),
      ]),
    },
    { tag: 'hhea', data: Buffer.concat([u16(1, 0, 800, -200 & 0xffff, 0, 1000, 0, 0, 900, 1, 0, 0, 0, 0, 0, 0, 0, 2)]) },
    { tag: 'hmtx', data: u16(500, 0, 1000, 100) },
    { tag: 'loca', data: u16(0, 0, glyph.length / 2) },
    { tag: 'maxp', data: Buffer.concat([u32(0x00010000), u16(2, 4, 1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)]) },
    { tag: 'name', data: nameTable(english, chinese) },
    { tag: 'post', data: Buffer.concat([u32(0x00030000, 0), u16(-100 & 0xffff, 50), u32(0, 0, 0, 0, 0)]) },
  ]
  const directorySize = 12 + tables.length * 16
  let offset = directorySize
  const records: Buffer[] = []
  const bodies: Buffer[] = []
  for (const table of tables) {
    const padded = Buffer.concat([table.data, Buffer.alloc((4 - (table.data.length % 4)) % 4)])
    records.push(Buffer.concat([Buffer.from(table.tag, 'latin1'), u32(checksum(table.data), offset, table.data.length)]))
    bodies.push(padded)
    offset += padded.length
  }
  const font = Buffer.concat([u32(0x00010000), u16(tables.length, 128, 3, tables.length * 16 - 128), ...records, ...bodies])
  // head.checkSumAdjustment makes the whole file sum to 0xB1B0AFBA.
  const headOffset = directorySize + bodies.slice(0, tables.findIndex((table) => table.tag === 'head')).reduce((sum, body) => sum + body.length, 0)
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8)
  return font
}
