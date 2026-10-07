// Storage entry point — picks the backend once, at module load.
//
//   VITE_API_BASE unset / empty  ->  LocalStore  (default, zero-deploy, offline)
//   VITE_API_BASE = "https://..." ->  RemoteStore (real accounts, cross-device)
//
// The whole app imports `store` from here and never touches localStorage or
// fetch directly. Swapping backends is this one decision; nothing else changes.
//
// Work made without an account belongs to GUEST_OWNER_ID and always stays in
// this browser, whichever backend holds the accounts: `storeFor(owner)` is the
// storage for an owner's projects, pictures and assets.

import { createLocalStore } from './local'
import { createRemoteStore } from './remote'
import type { Storage } from './types'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').trim()

/** The owner of everything made on this device without signing in. */
export const GUEST_OWNER_ID = 'local-guest'

const local = createLocalStore()
const accounts: Storage = API_BASE ? createRemoteStore(API_BASE) : local

/**
 * The account backend. On a server deployment a guest's pictures are still
 * local `img:` refs, so resolving and registering them stays local too.
 */
export const store: Storage = accounts === local
  ? local
  : {
      ...accounts,
      images: { ...accounts.images, resolve: local.images.resolve, register: local.images.register },
    }

export function isGuestOwner(ownerId: string | null | undefined): boolean {
  return ownerId === GUEST_OWNER_ID
}

/** Where an owner's projects, pictures and assets live. */
export function storeFor(ownerId: string): Storage {
  return isGuestOwner(ownerId) ? local : store
}

export type {
  Storage,
  AuthStore,
  DraftStore,
  DraftVersion,
  DraftVersionDetail,
  ImageStore,
  AssetStore,
  ShareStore,
  Share,
  StockStore,
  StockSources,
  StockSourceInfo,
  StockHit,
  StockSearchPage,
  StockImport,
} from './types'
