import type { FreeformDocument } from '../freeform/types'
import type { Profile } from '../theme'

export type MarkdownTemplateSeriesId =
  | 'editorial-archive'
  | 'public-theatre'
  | 'issue-cover'

/** Freeform templates that make a deck: a cover, pages for the sections, an ending. */
export type FreeformDeckSeriesId =
  | 'editorial'
  | 'checklist'
  | 'signal'
  | 'night-flight'
  | 'neon'
  | 'brutalist'
  | 'soft'
  | 'blueprint'

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
  | 'contact-card'
  | 'data-roundup'
  | 'follow-card'

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
