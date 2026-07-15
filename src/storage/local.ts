// Local storage backend — wraps the existing localStorage modules
// (auth.ts / drafts.ts / imageStore.ts) in the async adapter interface.
//
// This is the DEFAULT backend: zero deploy, works offline, no server needed.
// The wrapped modules keep all their data-model, validation and migration
// logic untouched; we only adapt the shape (sync -> Promise, rename methods).

import * as authImpl from '../auth'
import * as draftsImpl from '../drafts'
import * as imagesImpl from '../imageStore'
import type { AuthStore, DraftStore, ImageStore, Storage } from './types'

const auth: AuthStore = {
  register: (username, password) => authImpl.register(username, password),
  login: (username, password) => authImpl.login(username, password),
  logout: async () => authImpl.logout(),
  current: async () => authImpl.current(),
}

const drafts: DraftStore = {
  list: async (userId) => draftsImpl.listDrafts(userId),
  save: async (userId, data) => draftsImpl.saveDraft(userId, data),
  remove: async (userId, id) => draftsImpl.deleteDraft(userId, id),
}

const images: ImageStore = {
  // downscale happens at the call site (paste handler) before this; local just
  // stashes the data URL and returns an `img:<id>` ref.
  put: async (dataUrl) => imagesImpl.putImage(dataUrl),
  resolve: (href) => imagesImpl.resolveImage(href),
  isRef: (href) => imagesImpl.isImageRef(href),
  register: (ref, dataUrl) => imagesImpl.registerImage(ref, dataUrl),
  collect: (source) => imagesImpl.collectImages(source),
}

export function createLocalStore(): Storage {
  return { auth, drafts, images, remote: false }
}
