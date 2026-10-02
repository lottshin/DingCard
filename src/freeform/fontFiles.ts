// Reading an imported font file: which format it is, and the name it gives
// itself. TrueType / OpenType files and WOFF (zlib tables) carry a `name`
// table we can read; WOFF2 tables are Brotli-packed, so a WOFF2 font goes by
// its file name.

export type FontFileFormat = 'truetype' | 'opentype' | 'woff' | 'woff2'

/** The largest font file we take: a full CJK family runs to about 20 MB. */
export const FONT_FILE_MAX_BYTES = 40 * 1024 * 1024

/** What a font picker's file input accepts. */
export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2'

const MIME: Record<FontFileFormat, string> = {
  truetype: 'font/ttf',
  opentype: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
}

export function fontFileMime(format: FontFileFormat): string {
  return MIME[format]
}

function tag(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
}

/** The format the file's first bytes announce, or null when it isn't a font we can use. */
export function fontFileFormat(bytes: ArrayBuffer): FontFileFormat | null {
  if (bytes.byteLength < 12) return null
  const view = new DataView(bytes)
  const signature = tag(view, 0)
  if (signature === 'wOF2') return 'woff2'
  if (signature === 'wOFF') return 'woff'
  if (signature === 'OTTO') return 'opentype'
  if (view.getUint32(0) === 0x00010000 || signature === 'true') return 'truetype'
  return null
}

// Names in the reader's language first: Simplified Chinese, then the other
// Chinese locales, then US English.
const LANGUAGE_ORDER = [0x0804, 0x1004, 0x0404, 0x0c04, 0x1404, 0x0409]

interface NameRecord {
  platform: number
  language: number
  nameId: number
  value: string
}

function decodeName(bytes: Uint8Array, platform: number): string {
  if (platform === 0 || platform === 3) {
    let value = ''
    for (let index = 0; index + 1 < bytes.length; index += 2) value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
    return value
  }
  // Mac Roman: font names are ASCII in practice.
  return String.fromCharCode(...bytes)
}

function nameRecords(table: DataView): NameRecord[] {
  const count = table.getUint16(2)
  const storage = table.getUint16(4)
  const records: NameRecord[] = []
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 12
    if (at + 12 > table.byteLength) break
    const platform = table.getUint16(at)
    const language = table.getUint16(at + 4)
    const nameId = table.getUint16(at + 6)
    const length = table.getUint16(at + 8)
    const start = storage + table.getUint16(at + 10)
    if (start + length > table.byteLength) continue
    const bytes = new Uint8Array(table.buffer, table.byteOffset + start, length)
    records.push({ platform, language, nameId, value: decodeName(bytes, platform).replace(/\0/g, '').trim() })
  }
  return records
}

function bestName(records: NameRecord[], nameId: number): string | undefined {
  const named = records.filter((record) => record.nameId === nameId && record.value)
  const windows = named.filter((record) => record.platform === 3)
  for (const language of LANGUAGE_ORDER) {
    const found = windows.find((record) => record.language === language)
    if (found) return found.value
  }
  return (windows[0] ?? named.find((record) => record.platform === 0) ?? named[0])?.value
}

const PLAIN_STYLE = /^(regular|normal|book|roman|plain|standard|常规|常规体|標準|標準體|标准|标准体|正常)$/i

/** "Family Style" from a name table, leaving out the plain style. */
function nameFromRecords(records: NameRecord[]): string | null {
  const family = bestName(records, 16) ?? bestName(records, 1)
  if (!family) return bestName(records, 4) ?? null
  const style = bestName(records, 17) ?? bestName(records, 2)
  return style && !PLAIN_STYLE.test(style) && !family.endsWith(style) ? `${family} ${style}` : family
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The `name` table, unpacked if it was packed. */
async function nameTable(bytes: ArrayBuffer, format: FontFileFormat): Promise<DataView | null> {
  const view = new DataView(bytes)
  if (format === 'truetype' || format === 'opentype') {
    const tables = view.getUint16(4)
    for (let index = 0; index < tables; index += 1) {
      const at = 12 + index * 16
      if (at + 16 > bytes.byteLength) return null
      if (tag(view, at) !== 'name') continue
      const offset = view.getUint32(at + 8)
      const length = view.getUint32(at + 12)
      return offset + length <= bytes.byteLength ? new DataView(bytes, offset, length) : null
    }
    return null
  }
  if (format === 'woff') {
    const tables = view.getUint16(12)
    for (let index = 0; index < tables; index += 1) {
      const at = 44 + index * 20
      if (at + 20 > bytes.byteLength) return null
      if (tag(view, at) !== 'name') continue
      const offset = view.getUint32(at + 4)
      const packed = view.getUint32(at + 8)
      const length = view.getUint32(at + 12)
      if (offset + packed > bytes.byteLength) return null
      const data = new Uint8Array(bytes, offset, packed)
      const table = packed < length ? await inflate(data) : data.slice()
      return new DataView(table.buffer, table.byteOffset, table.byteLength)
    }
  }
  return null
}

/** The name the font gives itself ("阿里巴巴普惠体 Bold"), or null when it can't be read. */
export async function readFontName(bytes: ArrayBuffer): Promise<string | null> {
  const format = fontFileFormat(bytes)
  if (!format) return null
  try {
    const table = await nameTable(bytes, format)
    return table && table.byteLength >= 6 ? nameFromRecords(nameRecords(table)) : null
  } catch {
    return null
  }
}

/** "AlibabaPuHuiTi-Bold.woff2" -> "AlibabaPuHuiTi-Bold" */
export function fontNameFromFile(filename: string): string {
  return filename.replace(/\.(ttf|otf|woff2?)$/i, '')
}

/** A name that is safe as a quoted CSS family: no quotes, backslashes or control characters, at most 60 characters. */
export function cleanFontName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f'"\;{}<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return Array.from(cleaned).slice(0, 60).join('').trim()
}

/** The font-family value a text takes for an imported font. */
export function importedFontStack(family: string): string {
  return `'${family}', sans-serif`
}
