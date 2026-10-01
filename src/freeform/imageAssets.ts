import type { ImageStore } from '../storage/types'
import {
  mapFreeformDocumentLeaves,
  mapFreeformDocumentLeavesAsync,
} from './sceneDocument'
import { walkScene } from './sceneTree'
import type { FreeformDocument, FreeformSceneLeaf, FreeformSlide } from './types'

function imageSource(leaf: FreeformSceneLeaf): string | undefined {
  if (leaf.type === 'image') return leaf.src
  if (leaf.type === 'shape' && leaf.fill.type === 'image') return leaf.fill.src
  return undefined
}

function cloneLeafWithSource(
  leaf: FreeformSceneLeaf,
  source: string | undefined,
): FreeformSceneLeaf {
  if (leaf.type === 'image') return { ...leaf, src: source ?? leaf.src }
  if (leaf.type === 'shape' && leaf.fill.type === 'image') {
    return { ...leaf, fill: { ...leaf.fill, src: source ?? leaf.fill.src } }
  }
  return leaf
}

/** A page's own picture (v16 background), if it has one. */
function backgroundSource(slide: FreeformSlide): string | undefined {
  return slide.background.type === 'image' ? slide.background.src : undefined
}

/** The same document with each picture background's source swapped (slides are fresh clones). */
function withBackgroundSources(
  document: FreeformDocument,
  sourceFor: (src: string) => string,
): FreeformDocument {
  return {
    ...document,
    slides: document.slides.map((slide) => (
      slide.background.type === 'image'
        ? { ...slide, background: { ...slide.background, src: sourceFor(slide.background.src) } }
        : slide
    )),
  }
}

/** Collect all image sources recursively, including hidden descendants and page backgrounds. */
export function collectFreeformImageSources(document: FreeformDocument): string[] {
  const sources = new Set<string>()
  for (const slide of document.slides) {
    const background = backgroundSource(slide)
    if (background !== undefined) sources.add(background)
    walkScene(slide.nodes, (node) => {
      if (node.type === 'group') return
      const source = imageSource(node)
      if (source !== undefined) sources.add(source)
    })
  }
  return [...sources]
}

/** Materialize local refs in a recursively owned document clone. */
export function materializeLocalFreeformImages(
  document: FreeformDocument,
  images: Pick<ImageStore, 'isRef' | 'resolve'>,
): FreeformDocument {
  const materialize = (source: string) => {
    if (!images.isRef(source)) return source
    let resolved = ''
    try {
      resolved = images.resolve(source)
    } catch {
      // Keep one public error for absent and corrupt local image references.
    }
    if (!resolved) throw new Error(`本地图片引用无法解析：${source}`)
    return resolved
  }
  const mapped = mapFreeformDocumentLeaves(document, (leaf) => {
    const source = imageSource(leaf)
    if (source === undefined || !images.isRef(source)) return leaf
    return cloneLeafWithSource(leaf, materialize(source))
  })
  return withBackgroundSources(mapped, materialize)
}

/** Upload inline images recursively; no partially mapped document is exposed. */
export async function uploadInlineFreeformImages(
  document: FreeformDocument,
  upload: (dataUrl: string) => Promise<string>,
): Promise<FreeformDocument> {
  const localRef = collectFreeformImageSources(document).find((source) => source.startsWith('img:'))
  if (localRef) {
    throw new Error(`远程保存不支持本地图片引用：${localRef}`)
  }

  const uploads = new Map<string, Promise<string>>()
  const isInline = (source: string) => source.toLowerCase().startsWith('data:image/')
  const uploaded = (source: string) => {
    let pending = uploads.get(source)
    if (!pending) {
      pending = upload(source).then((uploadedUrl) => {
        if (typeof uploadedUrl !== 'string' || uploadedUrl.trim() === '') {
          throw new Error('图片上传未返回有效地址')
        }
        return uploadedUrl
      })
      uploads.set(source, pending)
    }
    return pending
  }
  const mapped = await mapFreeformDocumentLeavesAsync(document, async (leaf) => {
    const source = imageSource(leaf)
    if (source === undefined || !isInline(source)) return leaf
    return cloneLeafWithSource(leaf, await uploaded(source))
  })
  // Page backgrounds go up through the same uploads (a picture used twice goes once).
  const backgrounds = new Map<string, string>()
  for (const slide of mapped.slides) {
    const source = backgroundSource(slide)
    if (source !== undefined && isInline(source)) backgrounds.set(source, await uploaded(source))
  }
  return withBackgroundSources(mapped, (source) => backgrounds.get(source) ?? source)
}
