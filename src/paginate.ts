import type { Block } from './markdown'
import type { CardConfig } from './theme'

export interface Page {
  blocks: Block[]
}

// A small visual breathing room at the bottom. Measurements can be off by a few
// pixels across fonts/browsers, and users expect the last line not to sit on the
// rounded card edge.
const BOTTOM_SAFE_GAP = 10

/**
 * Measure the candidate page as a whole inside a hidden probe element that
 * mirrors the real card's width and typography. Measuring whole pages (instead
 * of summing individual block heights) keeps CSS margins, list spacing, code
 * blocks, and last-child margin behavior in sync with the exported card.
 *
 * A `---` block is a manual page break: it forces a flush without emitting
 * content. A single block taller than the content area gets its own page (it
 * will overflow visually, but splitting arbitrary HTML mid-block is unsafe).
 */
export function paginate(blocks: Block[], config: CardConfig, headerFirstPageOnly = false): Page[] {
  const probe = document.createElement('div')
  probe.className = 'card-content'
  Object.assign(probe.style, {
    position: 'absolute',
    left: '-99999px',
    top: '0',
    visibility: 'hidden',
    width: `${config.width - config.padding * 2}px`,
    fontFamily: config.fontFamily,
    fontSize: `${config.fontSize}px`,
    lineHeight: String(config.lineHeight),
    boxSizing: 'content-box',
  })
  probe.style.setProperty('--card-font', config.fontFamily)
  probe.style.setProperty('--card-fs', `${config.fontSize}px`)
  probe.style.setProperty('--card-lh', String(config.lineHeight))
  probe.style.setProperty('--card-gap', `${config.blockGap}px`)
  probe.style.setProperty('--card-accent', config.accent)
  document.body.appendChild(probe)

  const pages: Page[] = []
  let current: Block[] = []

  const pageLimit = () => {
    const isFirstPage = pages.length === 0
    const headerHeight = headerFirstPageOnly && !isFirstPage ? 0 : config.headerHeight
    return config.height - config.padding * 2 - headerHeight - BOTTOM_SAFE_GAP
  }

  const measure = (candidate: Block[]): number => {
    probe.innerHTML = candidate.map((b) => b.html).join('')
    return Math.max(probe.scrollHeight, probe.getBoundingClientRect().height)
  }

  const flush = () => {
    if (current.length) {
      pages.push({ blocks: current })
      current = []
    }
  }

  for (const block of blocks) {
    if (block.isBreak) {
      flush()
      continue
    }

    const single = [block]
    if (measure(single) > pageLimit()) {
      flush()
      pages.push({ blocks: single })
      continue
    }

    const next = [...current, block]
    if (current.length > 0 && measure(next) > pageLimit()) {
      flush()
      current.push(block)
    } else {
      current = next
    }
  }

  flush()
  document.body.removeChild(probe)

  return pages.length ? pages : [{ blocks: [] }]
}
