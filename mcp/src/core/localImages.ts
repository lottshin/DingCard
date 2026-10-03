// Pictures on the client's disk. A client may set a picture's src (an image
// node, a picture fill, a picture page background) to a file path; before a
// document is kept, checked or rendered, each such path is read and embedded
// as a data URL, so the document stands on its own — in the editor, in
// exports, and on another machine.

import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
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

/** Reads picture paths into data URLs, once each; what it couldn't read is listed in `failures`. */
function localImageReader(baseDir: string) {
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
  return { dataUrlFor, failures, embedded }
}

/** The document with every picture path read from disk and embedded as a data URL. */
export async function embedLocalImages(document: FreeformDocument, baseDir: string): Promise<EmbedResult> {
  const { dataUrlFor, failures, embedded } = localImageReader(baseDir)

  const node = async (current: FreeformSceneNode): Promise<FreeformSceneNode> => {
    if (current.type === 'group') {
      const children = await Promise.all(current.children.map(node))
      return children.every((child, index) => child === current.children[index]) ? current : { ...current, children }
    }
    if (current.type === 'image') {
      const src = await dataUrlFor(current.src)
      return src === current.src ? current : { ...current, src }
    }
    if ((current.type === 'shape' || current.type === 'path') && current.fill.type === 'image') {
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

const ATTRIBUTE_PICTURE = /(\s(?:src|href|xlink:href|poster)\s*=\s*)(["'])([^"']*)\2/gi
const CSS_PICTURE = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi
const STYLESHEET_LINK = /<link\b[^>]*\brel\s*=\s*(["'])stylesheet\1[^>]*>/gi

async function replaceAsync(text: string, pattern: RegExp, replace: (match: RegExpExecArray) => Promise<string>): Promise<string> {
  const parts: string[] = []
  let last = 0
  pattern.lastIndex = 0
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    parts.push(text.slice(last, match.index), await replace(match))
    last = match.index + match[0].length
  }
  parts.push(text.slice(last))
  return parts.join('')
}

/** A web page's own way of naming a nearby file ("images/a.png", "a%20b.png") as a path the reader knows. */
function htmlPath(src: string): string | null {
  if (!src || src.startsWith('#') || src.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(src) && !/^[a-z]:[\\/]/i.test(src)) {
    return src.startsWith('file://') ? src : null
  }
  let decoded = src
  try {
    decoded = decodeURI(src)
  } catch {
    // Not percent-encoded after all.
  }
  return /^(?:[/~]|\.\.?[\\/]|[a-z]:[\\/])/i.test(decoded) ? decoded : `./${decoded}`
}

async function embedCssPictures(css: string, dataUrlFor: (src: string) => Promise<string>): Promise<string> {
  // The quote stays as written: the CSS may sit in a style="…" attribute. Data URLs need none.
  return replaceAsync(css, CSS_PICTURE, async (match) => `url(${match[1]}${await dataUrlFor(match[2].trim())}${match[1]})`)
}

/**
 * HTML with the pictures it names on disk embedded as data URLs — in src,
 * href and poster attributes and CSS url() — and local stylesheets inlined.
 * A path that isn't a picture (a link to a page) stays as written; pictures
 * it couldn't read are listed in `missing`, for the client to hear about.
 */
export async function embedLocalHtmlImages(html: string, baseDir: string): Promise<{ html: string; missing: string[]; embedded: string[] }> {
  const reader = localImageReader(baseDir)
  // Stylesheets next to the page: inlined, their pictures found next to them.
  let text = await replaceAsync(html, STYLESHEET_LINK, async (match) => {
    const href = /\bhref\s*=\s*(["'])([^"']+)\1/i.exec(match[0])?.[2]
    const local = href ? htmlPath(href) : null
    const target = local ? filePathOf(local, baseDir) : null
    if (!target) return match[0]
    try {
      const css = await readFile(target.path, 'utf8')
      const nearby = localImageReader(path.dirname(target.path))
      const embedded = await embedCssPictures(css, async (src) => {
        const local = htmlPath(src)
        return local ? nearby.dataUrlFor(local).then((value) => (value === local ? src : value)) : src
      })
      reader.failures.push(...nearby.failures)
      reader.embedded.push(target.path, ...nearby.embedded)
      return `<style>${embedded}</style>`
    } catch {
      reader.failures.push(`${href}（读不了这个样式表）`)
      return match[0]
    }
  })
  const pictureOnly = async (src: string) => {
    if (/\.(html?|css|js|json|md|txt)(?:[?#].*)?$/i.test(src)) return src
    const local = htmlPath(src)
    if (!local) return src
    const value = await reader.dataUrlFor(local)
    return value === local ? src : value
  }
  text = await replaceAsync(text, ATTRIBUTE_PICTURE, async (match) => `${match[1]}${match[2]}${await pictureOnly(match[3])}${match[2]}`)
  text = await embedCssPictures(text, pictureOnly)
  return { html: text, missing: reader.failures, embedded: reader.embedded }
}
