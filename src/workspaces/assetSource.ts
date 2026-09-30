import type { Asset } from '../assets'
import { storeFor } from '../storage'

/**
 * The image source a document embeds for a library asset. Local documents get
 * their own `img:` copy (drafts embed it on save), so deleting the asset later
 * cannot break them; remote documents point at the upload, which the server
 * keeps while any draft or asset still references it.
 */
export async function assetDocumentSource(asset: Asset, ownerId: string): Promise<string> {
  const store = storeFor(ownerId)
  return store.remote ? asset.src : store.images.put(asset.src)
}

/** Alt text that is safe inside `![alt](src)`, where a trailing `|123` means a width. */
export function markdownImageAlt(name: string): string {
  return name.replace(/[[\]"<>|\\]+/g, ' ').replace(/\s+/g, ' ').trim()
}
