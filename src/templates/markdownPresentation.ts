import type { Block } from '../markdown'
import { resolveTheme, THEMES, type MarkdownLookId } from '../theme'

export type MarkdownPageRole = 'cover' | 'article' | 'quote' | 'list' | 'close'

/** The theme ids of the designed looks (theme.ts `look`), the Markdown templates' themes. */
export const MARKDOWN_TEMPLATE_THEME_IDS: readonly string[] = THEMES.filter((theme) => theme.look).map((theme) => theme.id)

const markdownTemplateThemeIds = new Set<string>(MARKDOWN_TEMPLATE_THEME_IDS)

export function isMarkdownTemplateTheme(themeId: unknown): themeId is string {
  return typeof themeId === 'string' && markdownTemplateThemeIds.has(themeId)
}

/** The look a theme id draws, or null for the plain themes. */
export function markdownLookOf(themeId: unknown): MarkdownLookId | null {
  return isMarkdownTemplateTheme(themeId) ? resolveTheme(themeId).look ?? null : null
}

/**
 * What a page is, for a look to set it apart: the first page of a longer
 * article is its cover, the page holding the article's end closes it, and a
 * page with a quote or a list says so. Plain themes draw every page alike.
 */
export function resolveMarkdownPageRole({
  themeId,
  blocks,
  pageIndex,
  includesLastContentBlock,
}: {
  themeId: unknown
  blocks: Block[]
  pageIndex: number
  includesLastContentBlock: boolean
}): MarkdownPageRole {
  if (!isMarkdownTemplateTheme(themeId)) return 'article'

  const contentBlocks = blocks.filter((block) => !block.isBreak)
  if (contentBlocks.length === 0) return 'article'

  const normalizedPageIndex = Number.isFinite(pageIndex) ? Math.max(0, Math.floor(pageIndex)) : 0
  if (normalizedPageIndex === 0 && includesLastContentBlock) return 'article'
  if (normalizedPageIndex === 0) return 'cover'
  if (includesLastContentBlock) return 'close'
  if (contentBlocks.some((block) => block.kind === 'blockquote')) return 'quote'
  if (contentBlocks.some((block) => block.kind === 'list')) return 'list'
  return 'article'
}
