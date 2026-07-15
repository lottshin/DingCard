// Storage entry point — picks the backend once, at module load.
//
//   VITE_API_BASE unset / empty  ->  LocalStore  (default, zero-deploy, offline)
//   VITE_API_BASE = "https://..." ->  RemoteStore (real accounts, cross-device)
//
// The whole app imports `store` from here and never touches localStorage or
// fetch directly. Swapping backends is this one decision; nothing else changes.

import { createLocalStore } from './local'
import { createRemoteStore } from './remote'
import type { Storage } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim()

export const store: Storage = API_BASE ? createRemoteStore(API_BASE) : createLocalStore()

export type { Storage, AuthStore, DraftStore, ImageStore } from './types'
