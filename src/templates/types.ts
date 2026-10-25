import type { FreeformDocument } from '../freeform/types'
import type { Profile } from '../theme'

export type MarkdownTemplateSeriesId =
  | 'column'
  | 'memo'
  | 'letter'
  | 'night'
  | 'aurora'
  | 'doc'
  | 'xuan'
  | 'swiss'
  | 'journal'

/** Freeform templates that make a deck: a cover, pages for the sections, an ending. */
export type FreeformDeckSeriesId =
  | 'editorial'
  | 'checklist'
  | 'signal'
  | 'night-flight'
  | 'brutalist'
  | 'blueprint'
  | 'spotlight'

/**
 * Pages a deck can draw besides its section and closing pages, picked by what
 * a page holds: a paragraph or a point or two (statement), three or more
 * points (list), a chart, table, timeline or progress (data); and a closing
 * page that is only a sentence (closing).
 */
export type DeckLayoutId = 'statement' | 'list' | 'data' | 'closing'

/** Freeform templates that make one page: posters, covers, cards and flyers. */
export type FreeformPosterSeriesId =
  | 'talk-poster'
  | 'sale-poster'
  | 'hiring-poster'
  | 'festival-poster'
  | 'invitation'
  | 'quote-card'
  | 'product-card'
  | 'video-cover'
  | 'article-cover'
  | 'flyer'
  | 'note-cover'
  | 'photo-cover'
  | 'menu'
  | 'price-list'
  | 'certificate'
  | 'moments-grid'
  | 'timetable'
  | 'data-roundup'
  | 'birthday-card'
  | 'growth-timeline'
  | 'compare-table'
  | 'exhibition-poster'
  | 'launch-poster'
  | 'solar-term'
  | 'podcast-cover'
  | 'pitch-cover'
  | 'portfolio-cover'
  | 'dessert-menu'
  | 'wedding-invitation'
  | 'autumn-market'
  | 'magazine-cover'
  | 'book-list'
  | 'word-of-year'
  | 'music-festival'
  | 'travel-postcard'
  | 'design-week'
  | 'double-eleven'
  | 'christmas-card'
  | 'new-year-calendar'
  | 'spring-festival'
  | 'listicle-cover'
  | 'ridge-cover'
  | 'summit-visual'
  | 'gala-backdrop'
  | 'agenda-sheet'
  | 'annual-report'
  | 'stat-card'
  | 'countdown'
  | 'versus-cover'
  | 'habit-tracker'
  | 'fun-fact'
  | 'trip-route'
  | 'ranking-cover'

export type FreeformTemplateSeriesId = FreeformDeckSeriesId | FreeformPosterSeriesId
export type TemplateSeriesId = MarkdownTemplateSeriesId | FreeformTemplateSeriesId
export type TemplateWorkspace = 'markdown' | 'freeform'

/** What a template makes: a deck of pages, or one poster page. */
export type TemplateKind = 'deck' | 'poster'

/** The page size a template is drawn at (formats.ts). */
export type TemplateFormatId = 'xhs' | 'story' | 'square' | 'landscape' | 'wechat-cover' | 'a4' | 'a4-landscape' | 'moments-grid'

export interface MarkdownTemplateDocument {
  source: string
  platformId: string
  themeId: string
  fontFamily: string
  radius: number
  profile: Profile
}

export interface TemplateDefinition {
  id: string
  series: TemplateSeriesId
  workspace: TemplateWorkspace
  title: string
  description: string
  pageCount: number
  tags: readonly string[]
  kind: TemplateKind
  format: TemplateFormatId
  createMarkdown?: () => MarkdownTemplateDocument
  createFreeform?: () => FreeformDocument
}
