import { marked } from 'marked'
import { resolveImage } from './imageStore'

export interface Block {
  /** rendered HTML for a single top-level markdown block */
  html: string
  /** raw source, kept for debugging / future editing features */
  raw: string
  /** true when this is a manual page-break marker (a `---` line), not content */
  isBreak?: boolean
}

marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * Custom image rendering so images can be resized by dragging in the preview.
 *
 * Width is stored in the markdown itself using an `alt|width` convention:
 *   ![some caption|320](img:abc123)
 * The `|320` means "render this image 320px wide". Plain `![](url)` renders at
 * natural size (capped to the content width). We emit a wrapper span carrying
 * the width plus a drag handle; App wires the handle up to live-resize the
 * wrapper and write the new width back into the source. The handle is excluded
 * from PNG export via html-to-image's filter (see App.renderPage).
 *
 * The href in the markdown is usually a short `img:<id>` reference (see
 * imageStore.ts) — big base64 data URLs are kept OUT of the source so the
 * editor stays fast. We resolve the ref to the real data URL for the <img src>,
 * but keep the original href in data-href so the resize logic can locate this
 * exact image back in the source.
 */
marked.use({
  renderer: {
    image(href: string, _title: string | null, text: string): string {
      // Split a trailing `|<number>` off the alt text as the stored width.
      const m = text.match(/^(.*)\|(\d+)$/)
      const alt = m ? m[1] : text
      const width = m ? Number(m[2]) : null
      const widthStyle = width ? `width:${width}px;` : ''
      const ref = href ?? ''
      const src = resolveImage(ref)
      // data-href keeps the ORIGINAL href (short ref) so resize can find it in source.
      return (
        `<span class="img-wrap" style="${widthStyle}" data-href="${encodeURIComponent(ref)}">` +
        `<img src="${src}" alt="${alt}" />` +
        `<span class="img-handle" aria-hidden="true"></span>` +
        `</span>`
      )
    },
  },
})

function renderParagraph(raw: string): Block | null {
  const text = raw.trim()
  if (!text) return null
  const html = `<p>${marked.parseInline(text) as string}</p>\n`
  return html.trim() ? { html, raw: text } : null
}

function renderListItem(text: string, ordered: boolean, start: number, raw = text): Block | null {
  const body = text.trim()
  if (!body) return null
  const tag = ordered ? 'ol' : 'ul'
  const startAttr = ordered ? ` start="${start}"` : ''
  const html = `<${tag}${startAttr}><li>${marked.parseInline(body) as string}</li></${tag}>\n`
  return { html, raw }
}

function splitLongLine(line: string): string[] {
  const text = line.trim()
  if (text.length <= 90) return text ? [text] : []

  const pieces = text.match(/[^。！？!?；;]+[。！？!?；;]?/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const piece of pieces) {
    const next = current ? current + piece : piece
    if (current && next.length > 90) {
      chunks.push(current.trim())
      current = piece
    } else {
      current = next
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.length ? chunks : [text]
}

function splitParagraph(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .flatMap(splitLongLine)
    .filter(Boolean)
}

function listItemLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  return lines
    .map((line, i) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      // First line owns the list marker; continuation lines should not remain
      // attached to the same <li>, otherwise one `1.` can swallow a whole article.
      return i === 0 ? trimmed.replace(/^([-+*]|\d+[.)])\s+/, '') : trimmed
    })
    .flatMap(splitLongLine)
    .filter(Boolean)
}

/**
 * Split markdown source into top-level blocks (paragraphs, headings, lists,
 * blockquotes, code fences, images, hr). Each block is rendered to HTML
 * independently so the paginator can measure and place it as an atomic unit.
 *
 * A horizontal rule (`---`) is NOT rendered as a line — it is emitted as a
 * manual page-break marker so users can force a new card wherever they want.
 *
 * Marked treats a long run of non-blank lines as ONE paragraph. That is bad for
 * card pagination because a single over-tall paragraph cannot be split safely by
 * the paginator after it has become HTML. For plain paragraphs, split by source
 * line first, then by long sentence chunks, so long articles can flow across
 * cards instead of being clipped at the bottom.
 */
/**
 * A standalone thematic-break line — `---`, `***` or `___` (3+ identical chars,
 * possibly spaced) alone on a line. In this app it is ALWAYS a manual page break.
 * We detect it ourselves (not via marked) because Markdown turns `text` directly
 * followed by `---` into a Setext heading — so marked would never emit an `hr`
 * there and the page break would be silently lost.
 */
function isPageBreakLine(line: string): boolean {
  const compact = line.trim().replace(/[ \t]/g, '')
  return /^(-{3,}|\*{3,}|_{3,})$/.test(compact)
}

/** Lex + render one segment (no page-break lines inside) into content blocks. */
function lexSegment(segment: string): Block[] {
  const blocks: Block[] = []
  if (!segment.trim()) return blocks

  for (const token of marked.lexer(segment)) {
    if (token.type === 'space') continue

    // A stray hr can still appear (e.g. from `***`); treat as a break too.
    if (token.type === 'hr') {
      blocks.push({ html: '', raw: token.raw ?? '---', isBreak: true })
      continue
    }

    const raw = 'raw' in token ? (token.raw as string) : ''

    if (token.type === 'paragraph') {
      for (const part of splitParagraph(raw)) {
        const block = renderParagraph(part)
        if (block) blocks.push(block)
      }
      continue
    }

    if (token.type === 'list') {
      const list = token as never as {
        ordered?: boolean
        start?: number | ''
        items?: Array<{ raw?: string }>
      }
      const ordered = Boolean(list.ordered)
      const start = typeof list.start === 'number' ? list.start : 1

      for (const [i, item] of (list.items ?? []).entries()) {
        const parts = listItemLines(item.raw ?? '')
        parts.forEach((part, partIndex) => {
          const block =
            partIndex === 0
              ? renderListItem(part, ordered, start + i, ordered ? `${start + i}. ${part}` : `- ${part}`)
              : renderParagraph(part)
          if (block) blocks.push(block)
        })
      }
      continue
    }

    const html = marked.parser([token as never])
    if (html.trim()) blocks.push({ html, raw })
  }

  return blocks
}

/**
 * Split markdown source into top-level content blocks plus manual page-break
 * markers. We first cut the source on standalone `---`/`***`/`___` lines so a
 * page break works even when it sits directly under text (which Markdown would
 * otherwise parse as a Setext heading). Each segment between breaks is then
 * lexed independently.
 */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let buffer: string[] = []

  const flush = () => {
    blocks.push(...lexSegment(buffer.join('\n')))
    buffer = []
  }

  for (const line of lines) {
    if (isPageBreakLine(line)) {
      flush()
      blocks.push({ html: '', raw: line.trim(), isBreak: true })
    } else {
      buffer.push(line)
    }
  }
  flush()

  return blocks
}

/**
 * Write a new pixel width back into the markdown source for the image whose URL
 * is `href`. Rewrites `![alt](href)` / `![alt|old](href)` → `![alt|width](href)`.
 * Matching is by exact URL, which is effectively unique for pasted data URLs.
 * Returns the updated source (unchanged if the image wasn't found).
 */
export function setImageWidth(source: string, href: string, width: number): string {
  // Locate `](href)` then walk back to the opening `![`.
  const needle = `](${href})`
  const closeIdx = source.indexOf(needle)
  if (closeIdx < 0) return source
  const openIdx = source.lastIndexOf('![', closeIdx)
  if (openIdx < 0) return source

  const altRaw = source.slice(openIdx + 2, closeIdx) // between "![" and "]("
  const baseAlt = altRaw.replace(/\|\d+$/, '') // strip any existing width
  const replacement = `![${baseAlt}|${width}](${href})`
  return source.slice(0, openIdx) + replacement + source.slice(closeIdx + needle.length)
}
