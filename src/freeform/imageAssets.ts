import type { ImageStore } from '../storage/types'
import type { FreeformDocument, FreeformElement } from './types'

function imageSource(element: FreeformElement): string | undefined {
  if (element.type === 'image') return element.src
  if (element.type === 'shape' && element.fill.type === 'image') return element.fill.src
  return undefined
}

function cloneElementWithSource(element: FreeformElement, source: string | undefined): FreeformElement {
  if (element.type === 'image') {
    return { ...element, src: source ?? element.src }
  }
  if (element.type === 'shape') {
    return {
      ...element,
      fill: element.fill.type === 'image'
        ? { ...element.fill, src: source ?? element.fill.src }
        : { ...element.fill },
    }
  }
  return { ...element }
}

function cloneWithSources(
  document: FreeformDocument,
  transform: (source: string) => string,
): FreeformDocument {
  return {
    ...document,
    slides: document.slides.map((slide) => ({
      ...slide,
      background: { ...slide.background },
      elements: slide.elements.map((element) => {
        const source = imageSource(element)
        return cloneElementWithSource(element, source === undefined ? undefined : transform(source))
      }),
    })),
  }
}

async function cloneWithAsyncSources(
  document: FreeformDocument,
  transform: (source: string) => Promise<string>,
): Promise<FreeformDocument> {
  return {
    ...document,
    slides: await Promise.all(document.slides.map(async (slide) => ({
      ...slide,
      background: { ...slide.background },
      elements: await Promise.all(slide.elements.map(async (element) => {
        const source = imageSource(element)
        return cloneElementWithSource(
          element,
          source === undefined ? undefined : await transform(source),
        )
      })),
    }))),
  }
}

export function collectFreeformImageSources(document: FreeformDocument): string[] {
  const sources = new Set<string>()
  for (const slide of document.slides) {
    for (const element of slide.elements) {
      const source = imageSource(element)
      if (source !== undefined) sources.add(source)
    }
  }
  return [...sources]
}

export function materializeLocalFreeformImages(
  document: FreeformDocument,
  images: Pick<ImageStore, 'isRef' | 'resolve'>,
): FreeformDocument {
  return cloneWithSources(document, (source) => {
    if (!images.isRef(source)) return source

    let resolved = ''
    try {
      resolved = images.resolve(source)
    } catch {
      // Use the same public error whether the local image is absent or corrupt.
    }
    if (!resolved) throw new Error(`本地图片引用无法解析：${source}`)
    return resolved
  })
}

export async function uploadInlineFreeformImages(
  document: FreeformDocument,
  upload: (dataUrl: string) => Promise<string>,
): Promise<FreeformDocument> {
  const localRef = collectFreeformImageSources(document).find((source) => source.startsWith('img:'))
  if (localRef) {
    throw new Error(`远程保存不支持本地图片引用：${localRef}`)
  }

  const uploads = new Map<string, Promise<string>>()

  return cloneWithAsyncSources(document, async (source) => {
    if (!source.toLowerCase().startsWith('data:image/')) return source

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
  })
}
