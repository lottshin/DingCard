// Local storage backend — wraps the existing localStorage modules
// (auth.ts / drafts.ts / imageStore.ts) in the async adapter interface.
//
// This is the DEFAULT backend: zero deploy, works offline, no server needed.
// The wrapped modules keep all their data-model, validation and migration
// logic untouched; we only adapt the shape (sync -> Promise, rename methods).

import * as authImpl from '../auth'
import * as draftsImpl from '../drafts'
import type { SaveDraftInput } from '../drafts'
import { materializeLocalFreeformImages } from '../freeform/imageAssets'
import * as imagesImpl from '../imageStore'
import type { AuthStore, DraftStore, ImageStore, Storage } from './types'

const auth: AuthStore = {
  register: (username, password) => authImpl.register(username, password),
  login: (username, password) => authImpl.login(username, password),
  logout: async () => authImpl.logout(),
  current: async () => authImpl.current(),
  onInvalidated: () => () => {},
}

const images: ImageStore = {
  // downscale happens at the call site (paste handler) before this; local just
  // stashes the data URL and returns an `img:<id>` ref.
  put: async (dataUrl) => imagesImpl.putImage(dataUrl),
  resolve: (href) => imagesImpl.resolveImage(href),
  isRef: (href) => imagesImpl.isImageRef(href),
  register: (ref, dataUrl) => imagesImpl.registerImage(ref, dataUrl),
  collect: (source) => imagesImpl.collectImages(source),
  retain: async () => {},
}

function normalizeSaveInput(data: SaveDraftInput): SaveDraftInput {
  if (typeof data !== 'object' || data === null) {
    throw new Error('本地草稿内容无效')
  }

  const raw = data as unknown as Record<string, unknown>
  if (raw.id !== undefined && typeof raw.id !== 'string') {
    throw new Error('本地草稿内容无效')
  }
  if (raw.title !== undefined && typeof raw.title !== 'string') {
    throw new Error('本地草稿内容无效')
  }

  const normalized = draftsImpl.normalizeDraftForRead({
    id: raw.id ?? '__local-draft-validation__',
    title: raw.title ?? '',
    schemaVersion: 2,
    updatedAt: 0,
    mode: raw.mode,
    document: raw.document,
  })
  if (!normalized) throw new Error('本地草稿内容无效')

  const identity = {
    ...(raw.id !== undefined ? { id: raw.id } : {}),
    ...(raw.title !== undefined ? { title: raw.title } : {}),
  }
  return normalized.mode === 'freeform-slide'
    ? { ...identity, mode: normalized.mode, document: normalized.document }
    : { ...identity, mode: normalized.mode, document: normalized.document }
}

const drafts: DraftStore = {
  list: async (userId) => draftsImpl.listDrafts(userId),
  save: async (userId, data) => {
    const validated = normalizeSaveInput(data)
    const prepared = validated.mode === 'freeform-slide'
      ? {
          ...validated,
          document: materializeLocalFreeformImages(validated.document, images),
        }
      : validated
    const saved = draftsImpl.saveDraft(userId, prepared)
    const normalized = draftsImpl.normalizeDraftForRead(saved)
    if (!normalized) throw new Error('本地草稿保存结果无效')
    return normalized
  },
  remove: async (userId, id) => draftsImpl.deleteDraft(userId, id),
}

export function createLocalStore(): Storage {
  return { auth, drafts, images, remote: false }
}
