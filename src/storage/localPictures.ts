// Pictures in this browser's saved projects, kept in IndexedDB.
//
// Projects are stored in localStorage, and a handful of photos used to fill its
// ~5 MB: autosave then failed. Now a stored project names each big picture by a
// short `picture:<key>` ref, and the picture itself lives here, where the
// browser allows far more. The key is a hash of the picture, so one used twice
// (a duplicated page, two projects) is kept once.
//
// Projects read back with their pictures in place, so nothing above the store
// changes. A picture becomes a ref only once it is safely stored; until then it
// stays inline while it is put away in the background, and a write that runs
// out of room waits for it. Every write re-stamps the pictures it names (and
// stores again any that went missing), so a sweep only takes pictures that no
// project names and no write has touched for a while.

import type { Draft } from '../drafts'
import { collectFreeformImageSources, mapFreeformImageSources } from '../freeform/imageAssets'

export const PICTURE_REF_PREFIX = 'picture:'

/** Pictures this small (icons, flat colours) cost localStorage next to nothing and stay inline. */
const SMALL_PICTURE_CHARS = 4096
/** A sweep spares unnamed pictures stamped this recently: a write may still be on its way. */
const SWEEP_GRACE_MS = 60 * 60 * 1000
/** After a failed write, new pictures stay inline this long before storing is tried again. */
const WRITE_RETRY_MS = 30 * 1000

const PICTURES = 'pictures'
const STAMPS = 'stamps'
const REF_PATTERN = /picture:([0-9a-z]+)/g

export interface PictureBackend {
  /** The stored pictures among `keys`; missing ones are left out. */
  read(keys: readonly string[]): Promise<Map<string, string>>
  /** Store pictures (key -> data URL), stamped `at`. */
  write(pictures: ReadonlyMap<string, string>, at: number): Promise<void>
  /** Re-stamp pictures `at`, storing again any that went missing. */
  touch(pictures: ReadonlyMap<string, string>, at: number): Promise<void>
  /**
   * Delete the pictures stamped before `before` that `keep` doesn't name, and
   * resolve to their keys. `keep` runs once the sweep holds the store, so a
   * write that lands after it re-stamps (or stores again) what it names.
   */
  sweep(before: number, keep: () => ReadonlySet<string>): Promise<string[]>
}

export function isPictureRef(source: string): boolean {
  return source.startsWith(PICTURE_REF_PREFIX)
}

function refKey(source: string): string | null {
  return isPictureRef(source) ? source.slice(PICTURE_REF_PREFIX.length) : null
}

/** Every key a stored text names (stray matches in someone's words only keep a picture longer). */
export function pictureRefsIn(text: string): string[] {
  return [...text.matchAll(REF_PATTERN)].map((match) => match[1])
}

function isPackable(source: string): boolean {
  return source.length > SMALL_PICTURE_CHARS && /^data:image\//i.test(source)
}

/** Two 32-bit hashes and the length: different pictures don't share a key in practice. */
export function pictureKey(dataUrl: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < dataUrl.length; index += 1) {
    const code = dataUrl.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const part = (value: number) => (value >>> 0).toString(36).padStart(7, '0')
  return part(h2) + part(h1) + dataUrl.length.toString(36)
}

function draftPictureSources(draft: Draft): string[] {
  return draft.mode === 'freeform-slide'
    ? collectFreeformImageSources(draft.document)
    : Object.values(draft.document.images ?? {})
}

function mapDraftPictures(draft: Draft, sourceFor: (source: string) => string): Draft {
  if (draft.mode === 'freeform-slide') {
    return { ...draft, document: mapFreeformImageSources(draft.document, sourceFor) }
  }
  const images = draft.document.images
  if (!images) return draft
  const mapped = Object.fromEntries(Object.entries(images).map(([ref, source]) => [ref, sourceFor(source)]))
  return { ...draft, document: { ...draft.document, images: mapped } }
}

export interface LocalPictures {
  /** Put a picture away in the background; resolves to whether it is stored. */
  keep(dataUrl: string): Promise<boolean>
  /**
   * A draft as written: each big inline picture already stored becomes a ref
   * (recorded in `packed`), the rest stay inline and are put away.
   */
  pack(draft: Draft, packed?: Map<string, string>): Draft
  /** Wait for the pictures still being put away. */
  settle(): Promise<void>
  /** After a write: re-stamp what it packed, storing again anything a sweep took meanwhile. */
  confirm(packed: ReadonlyMap<string, string>): Promise<void>
  /** Drafts as read: refs become their pictures again (one that can't be read stays a ref). */
  unpack(drafts: Draft[]): Promise<Draft[]>
  /** Delete the pictures no stored draft names. */
  sweep(storedDrafts: () => readonly string[]): Promise<void>
}

/**
 * Pictures kept by `backend`; without one (no IndexedDB) drafts are written
 * and read as they are, pictures inline.
 */
export function createLocalPictures(
  backend: PictureBackend | null = defaultPictureBackend(),
  now: () => number = Date.now,
): LocalPictures {
  /** data URL -> key, so a picture is hashed once. */
  const keys = new Map<string, string>()
  /** Keys known to be stored. */
  const stored = new Set<string>()
  /** Pictures being put away, by key. */
  const writing = new Map<string, Promise<boolean>>()
  /** The pictures the last read put back, by key: the next read needn't fetch them again. */
  let readBack = new Map<string, string>()
  /** A failed write pauses the attempts: new pictures stay inline meanwhile, as they always did. */
  let writesPausedUntil = 0

  function keyOf(dataUrl: string): string {
    let key = keys.get(dataUrl)
    if (key === undefined) {
      key = pictureKey(dataUrl)
      keys.set(dataUrl, key)
    }
    return key
  }

  function keep(dataUrl: string): Promise<boolean> {
    if (!backend || !isPackable(dataUrl)) return Promise.resolve(false)
    const key = keyOf(dataUrl)
    if (stored.has(key)) return Promise.resolve(true)
    if (now() < writesPausedUntil) return Promise.resolve(false)
    let pending = writing.get(key)
    if (!pending) {
      pending = backend.write(new Map([[key, dataUrl]]), now()).then(
        () => {
          stored.add(key)
          return true
        },
        () => {
          writesPausedUntil = now() + WRITE_RETRY_MS
          return false
        },
      ).finally(() => writing.delete(key))
      writing.set(key, pending)
    }
    return pending
  }

  return {
    keep,

    pack(draft, packed) {
      if (!backend || !draftPictureSources(draft).some(isPackable)) return draft
      return mapDraftPictures(draft, (source) => {
        if (!isPackable(source)) return source
        const key = keyOf(source)
        if (!stored.has(key)) {
          void keep(source)
          return source
        }
        packed?.set(key, source)
        return PICTURE_REF_PREFIX + key
      })
    },

    async settle() {
      await Promise.all([...writing.values()])
    },

    async confirm(packed) {
      if (!backend || packed.size === 0) return
      try {
        await backend.touch(packed, now())
      } catch {
        // Not sure they are all there: the next write keeps them inline until stored again.
        for (const key of packed.keys()) stored.delete(key)
      }
    },

    async unpack(drafts) {
      const wanted = new Set<string>()
      for (const draft of drafts) {
        for (const source of draftPictureSources(draft)) {
          const key = refKey(source)
          if (key) wanted.add(key)
        }
      }
      if (!backend || wanted.size === 0) return drafts
      const pictures = new Map<string, string>()
      const missing: string[] = []
      for (const key of wanted) {
        const picture = readBack.get(key)
        if (picture === undefined) missing.push(key)
        else pictures.set(key, picture)
      }
      if (missing.length > 0) {
        const read = await backend.read(missing).catch(() => new Map<string, string>())
        for (const [key, picture] of read) {
          pictures.set(key, picture)
          keys.set(picture, key)
          stored.add(key)
        }
      }
      readBack = pictures
      return drafts.map((draft) => (
        draftPictureSources(draft).some(isPictureRef)
          ? mapDraftPictures(draft, (source) => {
              const key = refKey(source)
              return key === null ? source : pictures.get(key) ?? source
            })
          : draft
      ))
    },

    async sweep(storedDrafts) {
      if (!backend) return
      const named = () => {
        const refs = new Set<string>()
        for (const text of storedDrafts()) for (const key of pictureRefsIn(text)) refs.add(key)
        return refs
      }
      try {
        // What went is no longer stored; a write that still has one inline stores it again.
        for (const key of await backend.sweep(now() - SWEEP_GRACE_MS, named)) stored.delete(key)
      } catch {
        // Leftovers only take space; the next sweep tries again.
      }
    },
  }
}

function defaultPictureBackend(): PictureBackend | null {
  return typeof indexedDB === 'undefined' ? null : createIndexedDbPictureBackend()
}

export function createIndexedDbPictureBackend(name = 'dingcard.pictures'): PictureBackend {
  let opening: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(PICTURES)) db.createObjectStore(PICTURES)
        if (!db.objectStoreNames.contains(STAMPS)) db.createObjectStore(STAMPS)
      }
      request.onsuccess = () => {
        const db = request.result
        // Another tab upgrading the schema must not be blocked by this connection.
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        // Closed under us (storage cleared, the browser dropped it): the next call opens again.
        db.onclose = () => {
          opening = null
        }
        resolve(db)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('图片库正在其他标签页中升级'))
    }).catch((error: unknown) => {
      opening = null
      throw error
    })
    return opening
  }

  /** One transaction over both stores; `work` places its requests and returns what to resolve with. */
  async function transact<T>(
    mode: IDBTransactionMode,
    work: (pictures: IDBObjectStore, stamps: IDBObjectStore) => () => T,
  ): Promise<T> {
    const db = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction([PICTURES, STAMPS], mode)
      let result: () => T
      try {
        result = work(transaction.objectStore(PICTURES), transaction.objectStore(STAMPS))
      } catch (error) {
        transaction.abort()
        reject(error)
        return
      }
      transaction.oncomplete = () => resolve(result())
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('图片库写入已取消'))
    })
  }

  return {
    read: (keys) => transact('readonly', (pictures) => {
      const found = new Map<string, string>()
      for (const key of keys) {
        const request = pictures.get(key)
        request.onsuccess = () => {
          if (typeof request.result === 'string') found.set(key, request.result)
        }
      }
      return () => found
    }),

    write: (entries, at) => transact('readwrite', (pictures, stamps) => {
      for (const [key, dataUrl] of entries) {
        pictures.put(dataUrl, key)
        stamps.put(at, key)
      }
      return () => undefined
    }),

    touch: (entries, at) => transact('readwrite', (pictures, stamps) => {
      for (const [key, dataUrl] of entries) {
        const request = pictures.getKey(key)
        request.onsuccess = () => {
          if (request.result === undefined) pictures.put(dataUrl, key)
        }
        stamps.put(at, key)
      }
      return () => undefined
    }),

    sweep: (before, keep) => transact('readwrite', (pictures, stamps) => {
      const named = keep()
      const removed: string[] = []
      const stampKeys = stamps.getAllKeys()
      const stampTimes = stamps.getAll()
      const pictureKeys = pictures.getAllKeys()
      // Requests finish in the order they were placed: the stamps are in by now.
      pictureKeys.onsuccess = () => {
        const stampedAt = new Map<IDBValidKey, unknown>()
        stampKeys.result.forEach((key, index) => stampedAt.set(key, stampTimes.result[index]))
        const spare = (key: IDBValidKey) => {
          const at = stampedAt.get(key)
          return (typeof key === 'string' && named.has(key)) || (typeof at === 'number' && at >= before)
        }
        const present = new Set(pictureKeys.result)
        for (const key of pictureKeys.result) {
          if (spare(key)) continue
          pictures.delete(key)
          stamps.delete(key)
          removed.push(String(key))
        }
        // A stamp whose picture never landed goes with the rest.
        for (const key of stampKeys.result) if (!present.has(key) && !spare(key)) stamps.delete(key)
      }
      return () => removed
    }),
  }
}

export function createMemoryPictureBackend(): PictureBackend & {
  pictures: Map<string, string>
  stamps: Map<string, number>
} {
  const pictures = new Map<string, string>()
  const stamps = new Map<string, number>()
  return {
    pictures,
    stamps,
    read: async (keys) => new Map(keys.flatMap((key) => {
      const picture = pictures.get(key)
      return picture === undefined ? [] : [[key, picture] as const]
    })),
    write: async (entries, at) => {
      for (const [key, dataUrl] of entries) {
        pictures.set(key, dataUrl)
        stamps.set(key, at)
      }
    },
    touch: async (entries, at) => {
      for (const [key, dataUrl] of entries) {
        if (!pictures.has(key)) pictures.set(key, dataUrl)
        stamps.set(key, at)
      }
    },
    sweep: async (before, keep) => {
      const named = keep()
      const removed: string[] = []
      for (const key of [...pictures.keys()]) {
        if (named.has(key) || (stamps.get(key) ?? 0) >= before) continue
        pictures.delete(key)
        stamps.delete(key)
        removed.push(key)
      }
      return removed
    },
  }
}
