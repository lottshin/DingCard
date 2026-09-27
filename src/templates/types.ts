import type { FreeformDocument } from '../freeform/types'
import type { Profile } from '../theme'

export type MarkdownTemplateSeriesId =
  | 'editorial-archive'
  | 'public-theatre'
  | 'issue-cover'

export type FreeformTemplateSeriesId =
  | 'editorial'
  | 'checklist'
  | 'signal'
  | 'night-flight'
  | 'neon'
  | 'brutalist'
  | 'soft'
  | 'blueprint'
export type TemplateSeriesId = MarkdownTemplateSeriesId | FreeformTemplateSeriesId
export type TemplateWorkspace = 'markdown' | 'freeform'

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
  series: TemplateSeriesId | 'user'
  workspace: TemplateWorkspace
  title: string
  description: string
  pageCount: number
  tags: readonly string[]
  createMarkdown?: () => MarkdownTemplateDocument
  createFreeform?: () => FreeformDocument
  /** Present only on user-saved templates: the storage-layer template id. */
  userTemplateId?: string
}
