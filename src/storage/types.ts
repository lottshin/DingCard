// Storage adapter interfaces.
//
// The app talks to storage ONLY through these interfaces, so the same UI works
// against two backends:
//   - LocalStore  : browser localStorage (default, zero-deploy, offline)
//   - RemoteStore : the Fastify + SQLite backend (real accounts, sync)
//
// Everything is async (returns Promise) so the remote implementation — which
// must do network I/O — fits the same shape as the local one. The local
// implementation just wraps its synchronous work in resolved promises.

import type { Draft, SaveDraftInput } from '../drafts'
import type { User } from '../auth'

/** Account + session. `register`/`login` were already async in the local impl. */
export interface AuthStore {
  register(username: string, password: string): Promise<User>
  login(username: string, password: string): Promise<User>
  logout(): Promise<void>
  /** The currently signed-in user, or null. */
  current(): Promise<User | null>
  /** Subscribe to server-confirmed session invalidation (for example, HTTP 401). */
  onInvalidated(listener: () => void): () => void
}

/** Per-user draft persistence. All scoped to the signed-in user. */
export interface DraftStore {
  list(userId: string): Promise<Draft[]>
  save(userId: string, data: SaveDraftInput): Promise<Draft>
  remove(userId: string, id: string): Promise<void>
}

/**
 * Image persistence for pasted/inserted pictures.
 *
 * `put` is the only inherently async op (upload / encode). `resolve` MUST stay
 * synchronous: it is called deep inside the markdown render + pagination path,
 * which cannot await. Both backends satisfy this — local resolves an `img:` ref
 * to a stored data URL; remote embeds a real `/uploads/x` URL that `resolve`
 * returns verbatim (it passes through anything that isn't an `img:` ref).
 */
export interface ImageStore {
  /** Store an image (data URL) and return a reference to embed in the document. */
  put(dataUrl: string): Promise<string>
  /** Resolve a ref (or plain URL) to a displayable src. Synchronous by contract. */
  resolve(href: string): string
  /** True if `href` is one of our short references. */
  isRef(href: string): boolean
  /** Register an existing ref -> dataURL pair (used when loading a local draft). */
  register(ref: string, dataUrl: string): void
  /** Collect data URLs for every ref used in a markdown source (for embedding). */
  collect(source: string): Record<string, string>
  /** Renew the lease for managed image URLs. Local storage implements this as a no-op. */
  retain(hrefs: readonly string[]): Promise<void>
}

/** The full storage surface the app depends on. */
export interface Storage {
  auth: AuthStore
  drafts: DraftStore
  images: ImageStore
  /** true when backed by a real server (enables login UI, sync messaging). */
  readonly remote: boolean
}
