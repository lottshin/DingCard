import type { ImageStore } from '../storage/types'
import {
  mapFreeformDocumentV3Leaves,
  mapFreeformDocumentV3LeavesAsync,
} from './sceneDocument'
import { walkScene } from './sceneTree'
import type {
  FreeformDocument,
  FreeformDocumentV3,
  FreeformSceneLeaf,
} from './types'

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

/** Collect all image sources recursively, including hidden descendants. */
export function collectFreeformImageSources(document: FreeformDocument): string[] {
  const sources = new Set<string>()
  for (const slide of document.slides) {
    walkScene(slide.nodes, (node) => {
      if (node.type === 'group') return
      const source = imageSource(node)
      if (source !== undefined) sources.add(source)
    })
  }
  return [...sources]
}

/** Materialize local refs in a recursively owned v3 document clone. */
export function materializeLocalFreeformImages(
  document: FreeformDocument,
  images: Pick<ImageStore, 'isRef' | 'resolve'>,
): FreeformDocument {
  return mapFreeformDocumentV3Leaves(document, (leaf) => {
    const source = imageSource(leaf)
    if (source === undefined || !images.isRef(source)) return leaf

    let resolved = ''
    try {
      resolved = images.resolve(source)
    } catch {
      // Keep one public error for absent and corrupt local image references.
    }
    if (!resolved) throw new Error(`本地图片引用无法解析：${source}`)
    return cloneLeafWithSource(leaf, resolved)
  })
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
  return mapFreeformDocumentV3LeavesAsync(document, async (leaf) => {
    const source = imageSource(leaf)
    if (source === undefined || !source.toLowerCase().startsWith('data:image/')) return leaf

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
    return cloneLeafWithSource(leaf, await pending)
  })
}

// Additive names remain available while callers finish their v3 migration.
export function collectFreeformImageSourcesV3(document: FreeformDocumentV3): string[] {
  return collectFreeformImageSources(document)
}

export function materializeLocalFreeformImagesV3(
  document: FreeformDocumentV3,
  images: Pick<ImageStore, 'isRef' | 'resolve'>,
): FreeformDocumentV3 {
  return materializeLocalFreeformImages(document, images)
}

export function uploadInlineFreeformImagesV3(
  document: FreeformDocumentV3,
  upload: (dataUrl: string) => Promise<string>,
): Promise<FreeformDocumentV3> {
  return uploadInlineFreeformImages(document, upload)
}
