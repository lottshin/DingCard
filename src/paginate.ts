import type { Block } from './markdown'
import {
  resolveMarkdownPageRole,
  type MarkdownPageRole,
} from './templates/markdownPresentation'
import type { CardConfig } from './theme'

export interface Page {
  blocks: Block[]
  role: MarkdownPageRole
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
  probe.dataset.cardTheme = config.themeId
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
  let currentRole: MarkdownPageRole = 'article'
  const lastContentBlock = [...blocks].reverse().find((block) => !block.isBreak)

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
    probe.innerHTML = candidate.map((b) => b.html).join('')
    return {
      height: Math.max(probe.scrollHeight, probe.getBoundingClientRect().height),
      role,
    }
  }

  const flush = () => {
    if (current.length) {
      pages.push({ blocks: current, role: currentRole })
      current = []
      currentRole = 'article'
    }
  }

  for (const block of blocks) {
    if (block.isBreak) {
      flush()
      continue
    }

    const single = [block]
    const singleMeasurement = measure(single)
    if (singleMeasurement.height > pageLimit()) {
      flush()
      const isolatedMeasurement = measure(single)
      pages.push({ blocks: single, role: isolatedMeasurement.role })
      continue
    }

    const next = [...current, block]
    const nextMeasurement = current.length > 0 ? measure(next) : singleMeasurement
    if (current.length > 0 && nextMeasurement.height > pageLimit()) {
      flush()
      const newPageMeasurement = measure(single)
      current = single
      currentRole = newPageMeasurement.role
    } else {
      current = next
      currentRole = nextMeasurement.role
    }
  }

  flush()
  document.body.removeChild(probe)

  return pages.length ? pages : [{ blocks: [], role: 'article' }]
}
