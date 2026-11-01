import type { Block } from './markdown'
import {
  resolveMarkdownPageRole,
  type MarkdownPageRole,
} from './templates/markdownPresentation'
import type { CardConfig } from './theme'
import { splitOversizedTable, splitOversizedTextBlock } from './splitOversizedBlock'

export interface Page {
  blocks: Block[]
  role: MarkdownPageRole
}

// A small visual breathing room at the bottom. Measurements can be off by a few
// pixels across fonts/browsers, and users expect the last line not to sit on the
// rounded card edge.
const BOTTOM_SAFE_GAP = 10

/**
 * The narrowest a shrunken picture may get before it is unreadable. A picture
 * that would have to be narrower than this to fit a page is reported as
 * unplaceable instead of being shrunk into a sliver.
 */
const MIN_SCALED_IMAGE_WIDTH = 48

/** How long a picture may take to arrive before the pages are laid out anyway. */
const IMAGE_WAIT_MS = 600

/** Words for the block kinds, for the error that names what would not fit. */
const KIND_LABELS: Record<string, string> = {
  paragraph: '段落',
  heading: '标题',
  blockquote: '引用',
  list: '列表',
  code: '代码块',
  image: '图片',
  other: '内容块',
}

/** Every picture a document asks for, and how long each one took to arrive. */
const imageArrivals = new Map<string, Promise<void>>()

/** Resolves when the picture has loaded (or failed to). */
function whenImageArrives(src: string): Promise<void> {
  const known = imageArrivals.get(src)
  if (known) return known
  const arrival = new Promise<void>((resolve) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
    image.src = src
  })
  // Keep the map from growing without end over a long session.
  if (imageArrivals.size > 200) {
    for (const [key, value] of imageArrivals) {
      if (imageArrivals.size <= 100) break
      imageArrivals.delete(key)
      void value
    }
  }
  imageArrivals.set(src, arrival)
  return arrival
}

/** The picture sources a document asks for. */
function collectImageSources(blocks: Block[]): string[] {
  const sources = new Set<string>()
  for (const block of blocks) {
    if (!block.html.includes('<img')) continue
    const template = document.createElement('template')
    template.innerHTML = block.html
    for (const image of Array.from(template.content.querySelectorAll('img'))) {
      const src = image.getAttribute('src')
      if (src) sources.add(src)
    }
  }
  return [...sources]
}

const delay = (ms: number) => new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))


/**
 * Measure the candidate page as a whole inside a hidden probe element that
 * mirrors the real card's width and typography. Measuring whole pages (instead
 * of summing individual block heights) keeps CSS margins, list spacing, code
 * blocks, and last-child margin behavior in sync with the exported card.
 *
 * A `---` block is a manual page break: it forces a flush without emitting
 * content. A block taller than the content area is never clipped onto a page
 * of its own: text blocks are cut at a measured boundary and flow across
 * pages, tables are cut between rows with their header repeated, pictures are
 * shrunk proportionally, and a block that can be neither cut nor shrunk throws
 * so the caller can say so — nothing disappears silently under the card's
 * `overflow: hidden`.
 */
export function paginate(blocks: Block[], config: CardConfig, headerFirstPageOnly = false): Page[] {
  const probe = document.createElement('div')
  probe.className = 'card-content'
  probe.dataset.cardTheme = config.themeId
  if (config.look) probe.dataset.look = config.look
  // Border-box, like the card's own content box: a look's side padding
  // narrows the words here exactly as it does on the card.
  Object.assign(probe.style, {
    position: 'absolute',
    left: '-99999px',
    top: '0',
    visibility: 'hidden',
    width: `${config.width - config.padding * 2}px`,
    fontFamily: config.fontFamily,
    fontSize: `${config.fontSize}px`,
    lineHeight: String(config.lineHeight),
    boxSizing: 'border-box',
  })
  probe.style.setProperty('--card-font', config.fontFamily)
  probe.style.setProperty('--card-fs', `${config.fontSize}px`)
  probe.style.setProperty('--card-lh', String(config.lineHeight))
  probe.style.setProperty('--card-gap', `${config.blockGap}px`)
  probe.style.setProperty('--card-accent', config.accent)
  document.body.appendChild(probe)

  try {
    const pages: Page[] = []
    let current: Block[] = []
    // The article's last content block, tracked as blocks are split so the
    // closing page style lands on the page that really holds the ending.
    let lastContentBlock = [...blocks].reverse().find((block) => !block.isBreak)

    const pageLimit = () => {
      const isFirstPage = pages.length === 0
      const headerHeight = headerFirstPageOnly && !isFirstPage ? 0 : config.headerHeight
      return config.height - config.padding * 2 - headerHeight - BOTTOM_SAFE_GAP
    }

    const measure = (candidate: Block[]): { height: number; role: MarkdownPageRole } => {
      const role = resolveMarkdownPageRole({
        themeId: config.themeId,
        blocks: candidate,
        pageIndex: pages.length,
        includesLastContentBlock:
          lastContentBlock !== undefined && candidate.includes(lastContentBlock),
      })
      probe.dataset.pageRole = role
      // A page under a social header: a look gives the header its top margin.
      probe.dataset.social = String(config.header !== 'none' && (!headerFirstPageOnly || pages.length === 0))
      probe.innerHTML = candidate.map((b) => b.html).join('')
      return {
        height: Math.max(probe.scrollHeight, probe.getBoundingClientRect().height),
        role,
      }
    }

    // Close a page, verifying one last time that it really fits — a page is
    // never emitted on the strength of a measurement made of other blocks.
    const closePage = (pageBlocks: Block[]) => {
      const closing = measure(pageBlocks)
      if (closing.height > pageLimit()) {
        throw new Error('分页校验失败：收尾测量时这一页仍高于页面的可用高度，内容没有放进卡片。')
      }
      pages.push({ blocks: pageBlocks, role: closing.role })
    }

    const flush = () => {
      if (!current.length) return
      const pageBlocks = current
      current = []
      closePage(pageBlocks)
    }

    /**
     * A picture block taller than a page is shrunk proportionally (its
     * wrapper's inline width, which the stylesheet scales the picture by)
     * until it fits. Pictures that would become narrower than
     * MIN_SCALED_IMAGE_WIDTH — or whose natural size is not known yet — are
     * left alone and reported by the caller instead.
     */
    const tryScaleImages = (block: Block): Block | null => {
      const template = document.createElement('template')
      template.innerHTML = block.html
      const root = template.content.firstElementChild
      const wraps = Array.from(template.content.querySelectorAll<HTMLElement>('.img-wrap'))
      if (!root || template.content.childElementCount !== 1 || wraps.length === 0) return null

      // Only shrink when every picture has its real size (data URLs do):
      // the height being scaled by must be the height being measured.
      probe.innerHTML = block.html
      const rendered = Array.from(probe.querySelectorAll<HTMLElement>('.img-wrap'))
      if (rendered.length !== wraps.length) return null
      for (const wrap of rendered) {
        const img = wrap.querySelector('img')
        if (!img || !img.complete || img.naturalWidth === 0) return null
      }

      let html = block.html
      let height = measure([{ ...block, html }]).height
      // Each round scales every wrapper by how far the page is over; margins
      // and surrounding text shrink the picture more than proportionally, so
      // a couple of rounds converge on a block that fits. measure() leaves
      // the candidate rendered in the probe, so its wrappers are read live.
      for (let round = 0; round < 4 && height > pageLimit(); round += 1) {
        const factor = (pageLimit() / height) * 0.98
        const wrapsNow = Array.from(probe.querySelectorAll<HTMLElement>('.img-wrap'))
        if (wrapsNow.length !== wraps.length) return null
        const nextWidths = wrapsNow.map((wrap) => Math.floor(wrap.getBoundingClientRect().width * factor))
        if (nextWidths.some((width) => width < MIN_SCALED_IMAGE_WIDTH)) return null
        wraps.forEach((wrap, index) => {
          wrap.style.width = `${nextWidths[index]}px`
        })
        html = `${root.outerHTML}\n`
        height = measure([{ ...block, html }]).height
      }
      return height <= pageLimit() ? { ...block, html } : null
    }

    const work = [...blocks]

    for (let i = 0; i < work.length;) {
      const block = work[i]

      if (block.isBreak) {
        flush()
        i += 1
        continue
      }

      // Fits on the current page: in it goes, measured as the page it joins.
      const candidate = [...current, block]
      const measured = measure(candidate)
      if (measured.height <= pageLimit()) {
        current = candidate
        i += 1
        continue
      }

      // The current page already has content: close it and let the block try
      // again as the first block of a fresh page.
      if (current.length > 0) {
        // A page doesn't end on a heading: headings at its foot move over with
        // the block they introduce, when the two fit on the next page.
        let carried: Block[] = []
        let kept = current
        while (kept.length > 1 && kept[kept.length - 1].kind === 'heading') {
          carried = [kept[kept.length - 1], ...carried]
          kept = kept.slice(0, -1)
        }
        if (carried.length > 0) {
          const keptPage = measure(kept)
          if (keptPage.height <= pageLimit()) {
            closePage(kept)
            // Measured after the close: the opening is laid out as the first
            // page content of the NEXT page (its own header rules apply).
            const opening = measure([...carried, block])
            if (opening.height <= pageLimit()) {
              current = [...carried, block]
              i += 1
              continue
            }
            pages.pop() // The headings stay on this page instead.
          }
          // The headings cannot open the next page either: they stay on this
          // one, and the block moves on alone.
        }
        flush()
        continue // The same block retries on the now-empty page.
      }

      // Even an empty page cannot hold this block alone.
      const scaled = tryScaleImages(block)
      if (scaled) {
        work.splice(i, 1, scaled)
        continue
      }

      const pair =
        splitOversizedTextBlock(block, (part) => measure([part]).height <= pageLimit()) ??
        splitOversizedTable(block, (part) => measure([part]).height <= pageLimit())
      if (!pair) {
        const label = KIND_LABELS[block.kind] ?? '内容块'
        const excerpt = block.raw.slice(0, 30).replace(/\s+/g, ' ').trim()
        throw new Error(
          `有一个${label}超过了一页的高度，且无法安全拆分或缩小` +
            (excerpt ? `（开头：${excerpt}…）` : '') +
            '。请缩短内容、缩小图片或拆分表格后重试。',
        )
      }

      const [head, tail] = pair
      // The tail now holds the article's ending, so the closing page style
      // follows it.
      if (lastContentBlock === block) lastContentBlock = tail
      current = [head]
      flush()
      work.splice(i, 1, tail) // The rest retries, split again if it still overflows.
    }

    flush()

    return pages.length ? pages : [{ blocks: [], role: 'article' }]
  } finally {
    document.body.removeChild(probe)
  }
}

/**
 * The pages of a document, laid out once its pictures have arrived.
 *
 * paginate() measures real DOM, and a picture that is still on its way
 * measures as nothing: the pages would be laid out around a picture that is
 * not there yet, and the card would clip it when it does arrive. This waits
 * for the pictures (briefly — a document whose picture never arrives must
 * still lay out) and measures again, so a picture is placed on the space it
 * really takes.
 */
export async function paginateWhenImagesSettled(
  blocks: Block[],
  config: CardConfig,
  headerFirstPageOnly = false,
): Promise<Page[]> {
  const sources = collectImageSources(blocks)
  let pages: Page[] = []
  let failure: unknown = null
  try {
    pages = paginate(blocks, config, headerFirstPageOnly)
  } catch (error) {
    failure = error
  }
  if (!sources.length) {
    if (failure) throw failure
    return pages
  }

  // Two rounds: the pictures that arrive first get measured, and a picture
  // that is still on its way gets one more chance before the pages are laid
  // out as they are.
  for (let round = 0; round < 2; round += 1) {
    const arrived = await Promise.race([
      Promise.all(sources.map(whenImageArrives)),
      delay(IMAGE_WAIT_MS),
    ])
    try {
      pages = paginate(blocks, config, headerFirstPageOnly)
      failure = null
    } catch (error) {
      failure = error
    }
    if (arrived !== undefined) break
  }

  if (failure) throw failure
  return pages
}
