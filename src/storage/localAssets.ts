// Local asset library, kept in IndexedDB: a handful of photos already outgrows
// the ~5 MB localStorage budget that drafts live in.
//
// The store logic runs against a tiny `AssetBackend`, so tests can swap the
// IndexedDB backend for an in-memory one.

import {
  ASSET_MIME_TYPES,
  dataUrlBytes,
  dataUrlMime,
  isAsset,
  isAssetDimension,
  normalizeAssetName,
  sortAssets,
  type Asset,
} from '../assets'
import type { AssetStore } from './types'

export interface AssetRecord extends Asset {
  userId: string
}

export interface AssetBackend {
  all(userId: string): Promise<AssetRecord[]>
  get(id: string): Promise<AssetRecord | undefined>
  put(record: AssetRecord): Promise<void>
  delete(id: string): Promise<void>
}

const DB_VERSION = 1
const STORE_NAME = 'assets'

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError'
}

function storageError(error: unknown): Error {
  if (isQuotaError(error)) return new Error('浏览器存储空间不足，删掉一些素材后再试')
  return error instanceof Error ? error : new Error('素材库读写失败，请稍后重试')
}

export function createIndexedDbAssetBackend(name = 'dingcard.assets'): AssetBackend {
  let opening: Promise<IDBDatabase> | null = null

  function open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('当前浏览器无法使用素材库'))
    }
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' }).createIndex('userId', 'userId')
        }
      }
      request.onsuccess = () => {
        const db = request.result
        // Another tab upgrading the schema must not be blocked by this connection.
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        resolve(db)
      }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('素材库正在其他标签页中升级，请刷新后重试'))
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
    all: (userId) => run('readonly', (store) => store.index('userId').getAll(userId)) as Promise<AssetRecord[]>,
    get: (id) => run('readonly', (store) => store.get(id)) as Promise<AssetRecord | undefined>,
    put: async (record) => {
      await run('readwrite', (store) => store.put(record))
    },
    delete: async (id) => {
      await run('readwrite', (store) => store.delete(id))
    },
  }
}

export function createMemoryAssetBackend(): AssetBackend {
  const records = new Map<string, AssetRecord>()
  return {
    all: async (userId) => [...records.values()].filter((record) => record.userId === userId).map((record) => ({ ...record })),
    get: async (id) => {
      const record = records.get(id)
      return record ? { ...record } : undefined
    },
    put: async (record) => {
      records.set(record.id, { ...record })
    },
    delete: async (id) => {
      records.delete(id)
    },
  }
}

function toAsset({ userId: _userId, ...asset }: AssetRecord): Asset {
  return asset
}

export function createLocalAssetStore(
  backend: AssetBackend = createIndexedDbAssetBackend(),
  now: () => number = Date.now,
): AssetStore {
  async function owned(userId: string, id: string): Promise<AssetRecord> {
    const record = await backend.get(id)
    if (!record || record.userId !== userId) throw new Error('素材不存在')
    return record
  }

  return {
    async list(userId) {
      const records = await backend.all(userId)
      return sortAssets(records.filter((record) => record.userId === userId && isAsset(record)).map(toAsset))
    },
    async add(userId, input) {
      const mime = dataUrlMime(input.dataUrl)
      if (!mime || !ASSET_MIME_TYPES.includes(mime)) throw new Error('仅支持 PNG、JPG、WebP 图片')
      if (!isAssetDimension(input.width) || !isAssetDimension(input.height)) throw new Error('图片尺寸无效')
      const record: AssetRecord = {
        id: crypto.randomUUID(),
        userId,
        name: normalizeAssetName(input.name),
        src: input.dataUrl,
        width: input.width,
        height: input.height,
        bytes: dataUrlBytes(input.dataUrl),
        createdAt: now(),
      }
      await backend.put(record)
      return toAsset(record)
    },
    async rename(userId, id, name) {
      const record = await owned(userId, id)
      const next = { ...record, name: normalizeAssetName(name, record.name) }
      await backend.put(next)
      return toAsset(next)
    },
    async remove(userId, id) {
      const record = await backend.get(id)
      if (record && record.userId === userId) await backend.delete(id)
    },
  }
}
