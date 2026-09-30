import type { Asset } from '../assets'
import type { Draft } from '../drafts'
import { collectFreeformImageSources } from '../freeform/imageAssets'
import { collectMarkdownImageSources } from '../markdown'

function draftImageSources(draft: Draft): string[] {
  if (draft.mode === 'freeform-slide') return collectFreeformImageSources(draft.document)
  // Local drafts embed their pictures as ref -> data URL; remote ones link the upload.
  return [...collectMarkdownImageSources(draft.document.source), ...Object.values(draft.document.images ?? {})]
}

/** One key per picture, whether a URL is spelled absolute or root-relative. */
function sourceKey(src: string): string {
  if (src.startsWith('data:')) return src
  try {
    return new URL(src, 'http://local.invalid').pathname
  } catch {
    return src
  }
}

/** How many saved projects use each asset, keyed by asset id. */
export function assetUsage(assets: readonly Asset[], drafts: readonly Draft[]): Map<string, number> {
  const counts = new Map<string, number>()
  if (assets.length === 0) return counts
  const idsByKey = new Map(assets.map((asset) => [sourceKey(asset.src), asset.id]))
  for (const draft of drafts) {
    const used = new Set<string>()
    for (const src of draftImageSources(draft)) {
      const id = idsByKey.get(sourceKey(src))
      if (id) used.add(id)
    }
    for (const id of used) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}
