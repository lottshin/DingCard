// Fonts the user imports, kept in this browser (IndexedDB) and registered
// with `document.fonts`, so the canvas, page thumbnails and exports all draw
// them. A text names an imported font like any other ("'Family', sans-serif");
// where the font isn't imported — another browser, the MCP renderer — the
// text falls back to the default sans-serif.

import { useSyncExternalStore } from 'react'
import { FONTS } from '../theme'
import {
  cleanFontName,
  fontFileFormat,
  fontFileMime,
  FONT_FILE_MAX_BYTES,
  fontNameFromFile,
  readFontName,
  type FontFileFormat,
} from './fontFiles'

export interface ImportedFont {
  id: string
  /** The family it is registered under, which is also its name in the pickers. */
  family: string
  format: FontFileFormat
  bytes: number
  createdAt: number
}

export interface FontRecord extends ImportedFont {
  data: Blob
}

export interface FontBackend {
  all(): Promise<FontRecord[]>
  put(record: FontRecord): Promise<void>
  delete(id: string): Promise<void>
}

/** Makes a font drawable under a family (FontFace + document.fonts in the browser); rejects a file it can't read. */
export interface FontRegistry {
  add(family: string, data: ArrayBuffer): Promise<void>
  remove(family: string): void
}

const DB_VERSION = 1
const STORE_NAME = 'fonts'

function storageError(error: unknown): Error {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return new Error('浏览器存储空间不足，删掉一些字体后再试')
  return error instanceof Error ? error : new Error('字体读写失败，请稍后重试')
}

export function createIndexedDbFontBackend(name = 'dingcard.fonts'): FontBackend {
  let opening: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前浏览器无法保存字体'))
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        resolve(db)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('字体库正在其他标签页中升级，请刷新后重试'))
    }).catch((error: unknown) => {
      opening = null
      throw storageError(error)
    })
    return opening
  }

  async function run<T>(mode: IDBTransactionMode, operate: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      let result: T
      const transaction = db.transaction(STORE_NAME, mode)
      const request = operate(transaction.objectStore(STORE_NAME))
      request.onsuccess = () => {
        result = request.result
      }
      transaction.oncomplete = () => resolve(result)
      transaction.onerror = () => reject(storageError(transaction.error ?? request.error))
      transaction.onabort = () => reject(storageError(transaction.error ?? request.error))
    })
  }

  return {
    all: () => run('readonly', (store) => store.getAll()) as Promise<FontRecord[]>,
    put: async (record) => {
      await run('readwrite', (store) => store.put(record))
    },
    delete: async (id) => {
      await run('readwrite', (store) => store.delete(id))
    },
  }
}

export function createMemoryFontBackend(): FontBackend {
  const records = new Map<string, FontRecord>()
  return {
    all: async () => [...records.values()].map((record) => ({ ...record })),
    put: async (record) => {
      records.set(record.id, { ...record })
    },
    delete: async (id) => {
      records.delete(id)
    },
  }
}

export function createDocumentFontRegistry(): FontRegistry {
  const faces = new Map<string, FontFace>()
  return {
    async add(family, data) {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined') return
      const face = new FontFace(family, data, { display: 'swap' })
      try {
        await face.load()
      } catch {
        throw new Error('浏览器读不了这个字体文件，换一个试试')
      }
      const previous = faces.get(family)
      if (previous) document.fonts.delete(previous)
      document.fonts.add(face)
      faces.set(family, face)
    },
    remove(family) {
      const face = faces.get(family)
      if (!face || typeof document === 'undefined') return
      document.fonts.delete(face)
      faces.delete(family)
    },
  }
}

const BUILT_IN_FAMILIES = new Set(
  FONTS.flatMap((font) => font.id.split(',')).map((family) => family.trim().replace(/^['"]|['"]$/g, '').toLowerCase()),
)

function firstFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
}

function sorted(fonts: ImportedFont[]): ImportedFont[] {
  return [...fonts].sort((a, b) => b.createdAt - a.createdAt)
}

function withoutData({ data: _data, ...font }: FontRecord): ImportedFont {
  return font
}

export interface FontLibrary {
  /** Newest first. */
  list(): readonly ImportedFont[]
  subscribe(listener: () => void): () => void
  /** Reads the saved fonts and registers them; later calls share the first. */
  load(): Promise<void>
  /** Checks, names, registers and saves a font file; importing a font with the same name again replaces it. */
  importFile(file: File): Promise<ImportedFont>
  remove(id: string): Promise<void>
  /** The imported font a font-family value starts with. */
  fontFor(fontFamily: string): ImportedFont | undefined
  /** The font file as a data URL, for embedding in an export. */
  dataUrl(id: string): Promise<string | null>
}

export function createFontLibrary(
  backend: FontBackend = createIndexedDbFontBackend(),
  registry: FontRegistry = createDocumentFontRegistry(),
  now: () => number = Date.now,
): FontLibrary {
  let fonts: ImportedFont[] = []
  let loading: Promise<void> | null = null
  const listeners = new Set<() => void>()
  const dataUrls = new Map<string, Promise<string | null>>()

  function publish(next: ImportedFont[]) {
    fonts = sorted(next)
    for (const listener of [...listeners]) listener()
  }

  async function records(): Promise<FontRecord[]> {
    try {
      return await backend.all()
    } catch (error) {
      throw storageError(error)
    }
  }

  return {
    list: () => fonts,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load() {
      loading ??= (async () => {
        const saved = await records().catch(() => [])
        const usable: ImportedFont[] = []
        for (const record of saved) {
          try {
            await registry.add(record.family, await record.data.arrayBuffer())
            usable.push(withoutData(record))
          } catch {
            // A file the browser no longer reads stays saved but out of the pickers.
          }
        }
        publish([...usable, ...fonts.filter((font) => !usable.some((saved) => saved.id === font.id))])
      })()
      return loading
    },
    async importFile(file) {
      if (file.size > FONT_FILE_MAX_BYTES) throw new Error('字体文件太大，最大 40 MB')
      const data = await file.arrayBuffer()
      const format = fontFileFormat(data)
      if (!format) throw new Error('不是可用的字体文件，请选 TTF、OTF、WOFF 或 WOFF2')
      let family = cleanFontName((await readFontName(data)) ?? '') || cleanFontName(fontNameFromFile(file.name)) || '我的字体'
      // A built-in font keeps its own name; the import goes by a numbered one.
      if (BUILT_IN_FAMILIES.has(family.toLowerCase())) family = `${family} 2`
      await registry.add(family, data)
      const existing = fonts.find((font) => font.family === family)
      const record: FontRecord = {
        id: existing?.id ?? crypto.randomUUID(),
        family,
        format,
        bytes: data.byteLength,
        createdAt: now(),
        data: new Blob([data], { type: fontFileMime(format) }),
      }
      try {
        await backend.put(record)
      } catch (error) {
        if (!existing) registry.remove(family)
        throw storageError(error)
      }
      dataUrls.delete(record.id)
      const font = withoutData(record)
      publish([font, ...fonts.filter((entry) => entry.id !== font.id)])
      return font
    },
    async remove(id) {
      const font = fonts.find((entry) => entry.id === id)
      try {
        await backend.delete(id)
      } catch (error) {
        throw storageError(error)
      }
      dataUrls.delete(id)
      if (font) registry.remove(font.family)
      publish(fonts.filter((entry) => entry.id !== id))
    },
    fontFor(fontFamily) {
      const family = firstFamily(fontFamily)
      return fonts.find((font) => font.family === family)
    },
    dataUrl(id) {
      let pending = dataUrls.get(id)
      if (!pending) {
        pending = (async () => {
          const record = (await records()).find((entry) => entry.id === id)
          if (!record) return null
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(record.data)
          })
        })().catch(() => {
          dataUrls.delete(id)
          return null
        })
        dataUrls.set(id, pending)
      }
      return pending
    },
  }
}

/** This browser's font library. */
export const fontLibrary = createFontLibrary()

/** The imported fonts, newest first; re-renders when one is added or removed. */
export function useImportedFonts(): readonly ImportedFont[] {
  return useSyncExternalStore(fontLibrary.subscribe, fontLibrary.list, fontLibrary.list)
}
