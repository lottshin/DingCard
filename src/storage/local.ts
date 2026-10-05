// Local storage backend — wraps the existing localStorage modules
// (auth.ts / drafts.ts / imageStore.ts) in the async adapter interface.
//
// This is the DEFAULT backend: zero deploy, works offline, no server needed.
// The wrapped modules keep all their data-model, validation and migration
// logic untouched; we only adapt the shape (sync -> Promise, rename methods).
// Drafts stay in localStorage, but their big pictures go to IndexedDB
// (localPictures.ts): a few photos used to fill localStorage and stop autosave.

import * as authImpl from '../auth'
import * as draftsImpl from '../drafts'
import type { Draft, SaveDraftInput } from '../drafts'
import { materializeLocalFreeformImages } from '../freeform/imageAssets'
import * as imagesImpl from '../imageStore'
import { createLocalAssetStore } from './localAssets'
import { createLocalPictures, isPictureRef, type PictureBackend } from './localPictures'
import type { AuthStore, DraftStore, ImageStore, ShareStore, Storage, TokenStore } from './types'

const auth: AuthStore = {
  register: (username, password) => authImpl.register(username, password),
  login: (username, password) => authImpl.login(username, password),
  logout: async () => authImpl.logout(),
  current: async () => authImpl.current(),
  onInvalidated: () => () => {},
}

function normalizeSaveInput(data: SaveDraftInput): SaveDraftInput {
  const normalized = draftsImpl.normalizeDraftForWrite(data)
  if (!normalized) throw new Error('本地草稿内容无效')
  return normalized
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
}

/** `pictureBackend` stands in for IndexedDB in tests; null keeps every picture inline. */
export function createLocalStore(pictureBackend?: PictureBackend | null): Storage {
  const pictures = createLocalPictures(pictureBackend)

  const images: ImageStore = {
    // downscale happens at the call site (paste handler) before this; local just
    // stashes the data URL and returns an `img:<id>` ref. The picture is put away
    // right away too, so the first save already names it by ref.
    put: async (dataUrl) => {
      const ref = imagesImpl.putImage(dataUrl)
      void pictures.keep(dataUrl)
      return ref
    },
    // A stored picture that couldn't be read back shows as missing, like a lost `img:` ref.
    resolve: (href) => (isPictureRef(href) ? '' : imagesImpl.resolveImage(href)),
    isRef: (href) => imagesImpl.isImageRef(href),
    register: (ref, dataUrl) => imagesImpl.registerImage(ref, dataUrl),
    collect: (source) => imagesImpl.collectImages(source),
    retain: async () => {},
  }

  /** Write with the stored pictures as refs; out of room, wait for the rest to be stored and try once more. */
  async function writeDraft(userId: string, input: SaveDraftInput): Promise<Draft> {
    const packed = new Map<string, string>()
    const pack = (draft: Draft) => pictures.pack(draft, packed)
    let saved: Draft
    try {
      saved = draftsImpl.saveDraft(userId, input, pack)
    } catch (error) {
      if (!isQuotaError(error)) throw error
      await pictures.settle()
      packed.clear()
      try {
        saved = draftsImpl.saveDraft(userId, input, pack)
      } catch (retryError) {
        throw isQuotaError(retryError) ? new Error('浏览器存储空间不足，删掉一些图片或项目后再试') : retryError
      }
    }
    void pictures.confirm(packed)
    return saved
  }

  let swept = false

  /** Clear out pictures no project names any more: once a session, and after a project goes. */
  function sweepPictures() {
    swept = true
    void pictures.sweep(draftsImpl.storedDraftLists)
  }

  const drafts: DraftStore = {
    list: async (userId) => {
      const listed = await pictures.unpack(draftsImpl.listDrafts(userId))
      if (!swept) sweepPictures()
      return listed
    },
    save: async (userId, data) => {
      const validated = normalizeSaveInput(data)
      const prepared = validated.mode === 'freeform-slide'
        ? {
            ...validated,
            document: materializeLocalFreeformImages(validated.document, images),
          }
        : validated
      const saved = await writeDraft(userId, prepared)
      const normalized = draftsImpl.normalizeDraftForRead(saved)
      if (!normalized) throw new Error('本地草稿保存结果无效')
      return normalized
    },
    remove: async (userId, id) => {
      draftsImpl.deleteDraft(userId, id, (draft) => pictures.pack(draft))
      sweepPictures()
    },
    listVersions: async () => {
      throw new Error('版本历史需要部署服务端')
    },
    getVersion: async () => {
      throw new Error('版本历史需要部署服务端')
    },
    restoreVersion: async () => {
      throw new Error('版本历史需要部署服务端')
    },
  }

  // Share links need a server to host the public page; local mode has none.
  // The UI hides the share entry in local mode, so these only ever fire if
  // something calls them anyway — they fail with an explicit message.
  const shares: ShareStore = {
    list: async () => {
      throw new Error('分享需要部署服务端')
    },
    create: async () => {
      throw new Error('分享需要部署服务端')
    },
    revoke: async () => {
      throw new Error('分享需要部署服务端')
    },
  }

  // API tokens stand in for a server account; without a server there is
  // nothing to authenticate against.
  const tokens: TokenStore = {
    list: async () => {
      throw new Error('API 令牌需要部署服务端')
    },
    create: async () => {
      throw new Error('API 令牌需要部署服务端')
    },
    revoke: async () => {
      throw new Error('API 令牌需要部署服务端')
    },
  }

  return { auth, drafts, images, assets: createLocalAssetStore(), shares, tokens, remote: false }
}
