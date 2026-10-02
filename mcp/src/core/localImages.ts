// Pictures on the client's disk. A client may set a picture's src (an image
// node, a picture fill, a picture page background) to a file path; before a
// document is kept, checked or rendered, each such path is read and embedded
// as a data URL, so the document stands on its own — in the editor, in
// exports, and on another machine.

import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { FreeformDocument, FreeformSceneNode, FreeformSlide } from '../../../src/freeform/types'
import { expandPath } from './documents'

/** The largest picture embedded from disk. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** A src naming a file: file:// URLs, ~/, ./, ../, Windows drive paths, and absolute paths. */
function filePathOf(src: string, baseDir: string): { path: string; explicit: boolean } | null {
  if (src.startsWith('file://')) {
    try {
      return { path: fileURLToPath(src), explicit: true }
    } catch {
      return null
    }
  }
  if (/^~[\\/]|^\.\.?[\\/]|^[A-Za-z]:[\\/]/.test(src)) return { path: expandPath(src, baseDir), explicit: true }
  // A bare absolute path may also be a site path ("/uploads/…"): only one that is a file on disk counts.
  if (src.startsWith('/') && !src.startsWith('//')) return { path: src, explicit: false }
  return null
}

function mimeOf(bytes: Buffer, file: string): string | null {
  const head = bytes.subarray(0, 16)
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.subarray(0, 6).toString('latin1') === 'GIF87a' || head.subarray(0, 6).toString('latin1') === 'GIF89a') return 'image/gif'
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (/^ftypavi[fs]$/.test(head.subarray(4, 12).toString('latin1'))) return 'image/avif'
  const text = bytes.subarray(0, 2048).toString('utf8').trimStart()
  if (/\.svg$/i.test(file) || (text.startsWith('<') && text.includes('<svg'))) return 'image/svg+xml'
  return null
}

export type EmbedResult =
  | { ok: true; document: FreeformDocument; embedded: string[] }
  | { ok: false; error: string }

/** The document with every picture path read from disk and embedded as a data URL. */
export async function embedLocalImages(document: FreeformDocument, baseDir: string): Promise<EmbedResult> {
  const found = new Map<string, string>()
  const failures: string[] = []
  const embedded: string[] = []

  const dataUrlFor = async (src: string): Promise<string> => {
    const cached = found.get(src)
    if (cached !== undefined) return cached
    const target = filePathOf(src, baseDir)
    if (!target) return src
    let result = src
    try {
      const info = await stat(target.path)
      if (!info.isFile()) throw new Error('不是文件')
      if (info.size > MAX_IMAGE_BYTES) throw new Error('超过 20 MB')
      const bytes = await readFile(target.path)
      const mime = mimeOf(bytes, target.path)
      if (!mime) throw new Error('不是 PNG / JPEG / GIF / WebP / AVIF / SVG 图片')
      result = `data:${mime};base64,${bytes.toString('base64')}`
      embedded.push(target.path)
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException)?.code === 'ENOENT'
      if (target.explicit || !missing) {
        failures.push(`${src}（${missing ? '找不到文件' : error instanceof Error ? error.message : String(error)}）`)
      }
    }
    found.set(src, result)
    return result
  }

  const node = async (current: FreeformSceneNode): Promise<FreeformSceneNode> => {
    if (current.type === 'group') {
      const children = await Promise.all(current.children.map(node))
      return children.every((child, index) => child === current.children[index]) ? current : { ...current, children }
    }
    if (current.type === 'image') {
      const src = await dataUrlFor(current.src)
      return src === current.src ? current : { ...current, src }
    }
    if (current.type === 'shape' && current.fill.type === 'image') {
      const src = await dataUrlFor(current.fill.src)
      return src === current.fill.src ? current : { ...current, fill: { ...current.fill, src } }
    }
    return current
  }

  const slide = async (current: FreeformSlide): Promise<FreeformSlide> => {
    const nodes = await Promise.all(current.nodes.map(node))
    const background = current.background.type === 'image'
      ? { ...current.background, src: await dataUrlFor(current.background.src) }
      : current.background
    const backgroundChanged = background.type === 'image' && current.background.type === 'image' && background.src !== current.background.src
    if (!backgroundChanged && nodes.every((entry, index) => entry === current.nodes[index])) return current
    return { ...current, background: backgroundChanged ? background : current.background, nodes }
  }

  const slides = await Promise.all(document.slides.map(slide))
  if (failures.length > 0) return { ok: false, error: `这些图片路径读不了：${failures.join('；')}` }
  return {
    ok: true,
    document: slides.every((entry, index) => entry === document.slides[index]) ? document : { ...document, slides },
    embedded,
  }
}
