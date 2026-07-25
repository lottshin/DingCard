import type { Block } from '../markdown'

export const MARKDOWN_TEMPLATE_THEME_IDS = [
  'template-editorial-archive',
  'template-public-theatre',
  'template-issue-cover',
] as const

export type MarkdownTemplateThemeId = (typeof MARKDOWN_TEMPLATE_THEME_IDS)[number]
export type MarkdownPageRole = 'cover' | 'article' | 'quote' | 'list' | 'close'

const markdownTemplateThemeIds = new Set<string>(MARKDOWN_TEMPLATE_THEME_IDS)

export function isMarkdownTemplateTheme(themeId: unknown): themeId is MarkdownTemplateThemeId {
  return typeof themeId === 'string' && markdownTemplateThemeIds.has(themeId)
}

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
  if (contentBlocks.some((block) => block.kind === 'blockquote')) return 'quote'
  if (contentBlocks.some((block) => block.kind === 'list')) return 'list'
  if (includesLastContentBlock) return 'close'
  return 'article'
}

export function formatMarkdownPageNumber(pageIndex: number, pageCount: number): string {
  const normalizedPageCount =
    Number.isFinite(pageCount) && pageCount > 0 ? Math.max(1, Math.floor(pageCount)) : 1
  const requestedPage = Number.isFinite(pageIndex) ? Math.floor(pageIndex) + 1 : 1
  const normalizedPage = Math.min(normalizedPageCount, Math.max(1, requestedPage))
  const digits = Math.max(2, String(normalizedPageCount).length)

  return `${String(normalizedPage).padStart(digits, '0')} / ${String(normalizedPageCount).padStart(digits, '0')}`
}
