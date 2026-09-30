import type { CSSProperties } from 'react'
import { parseBlocks } from '../markdown'
import type { buildConfig } from '../theme'
import { resolveMarkdownPageRole } from './markdownPresentation'

/** First page of a markdown document: every block up to the first manual break. */
export function markdownFirstPage(document: { source: string; themeId: string }) {
  const { html, role } = markdownPage(document, 0)
  return { html, role }
}

/**
 * One manual-break section of a markdown document, standing in for a page.
 * (Real pagination also splits long sections by height, which needs the DOM.)
 */
export function markdownPage(document: { source: string; themeId: string }, pageIndex: number) {
  const blocks = parseBlocks(document.source)
  const sections: (typeof blocks)[] = [[]]
  for (const block of blocks) {
    if (block.isBreak) sections.push([])
    else sections[sections.length - 1].push(block)
  }
  const pages = sections.filter((section) => section.length > 0)
  if (pages.length === 0) pages.push([])
  const index = Math.min(Math.max(pageIndex, 0), pages.length - 1)
  const pageBlocks = pages[index]
  const lastContentBlock = [...blocks].reverse().find((block) => !block.isBreak)
  return {
    html: pageBlocks.map((block) => block.html).join(''),
    pageCount: pages.length,
    role: resolveMarkdownPageRole({
      themeId: document.themeId,
      blocks: pageBlocks,
      pageIndex: index,
      includesLastContentBlock:
        lastContentBlock !== undefined && pageBlocks.includes(lastContentBlock),
    }),
  }
}

export function previewStyle(scale: number, radius: number, config: ReturnType<typeof buildConfig>): CSSProperties {
  return {
    '--card-w': `${config.width}px`,
    '--card-h': `${config.height}px`,
    '--card-pad': `${config.padding}px`,
    '--card-bg': config.background,
    '--card-fg': config.color,
    '--card-accent': config.accent,
    '--card-font': config.fontFamily,
    '--card-fs': `${config.fontSize}px`,
    '--card-lh': String(config.lineHeight),
    '--card-gap': `${config.blockGap}px`,
    '--card-radius': `${radius}px`,
    '--template-scale': String(scale),
  } as CSSProperties
}
