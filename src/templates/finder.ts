// Finding a template: the words it answers to, the facets that narrow a
// gallery down, and the templates like a given one. Shared by the template
// center, the editors' galleries and the command palette.

import { t } from '../i18n'
import { templateFormat } from './formats'
import {
  TEMPLATE_COLORS,
  TEMPLATE_STYLES,
  TEMPLATE_USES,
  templateFacets,
  type TemplateColorId,
  type TemplateStyleId,
  type TemplateUseId,
} from './taxonomy'
import type { TemplateDefinition, TemplateFormatId } from './types'

/**
 * Words people type for a use that its name and its templates don't say:
 * general ones only (a wedding is a word of the wedding invitation's own,
 * not of every invitation).
 */
const USE_ALIASES: Record<TemplateUseId, readonly string[]> = {
  article: ['长文', '笔记', 'Markdown', '文章', '图文'],
  carousel: ['套图', '多页', '图文', '轮播'],
  social: ['封面', '配图', '头图'],
  event: ['活动', '海报', '宣传', '报名'],
  promo: ['促销', '电商', '打折', '新品', '优惠', '海报'],
  menu: ['菜单', '价目', '餐厅', '饮品'],
  festival: ['节日', '节气', '问候', '祝福'],
  invite: ['请柬', '请帖', '邀请', '贺卡'],
  office: ['办公', '工作', '汇报', 'PPT', '学习', '学校'],
}

export interface TemplateQuery {
  text?: string
  use?: TemplateUseId | null
  format?: TemplateFormatId | null
  style?: TemplateStyleId | null
  color?: TemplateColorId | null
  /** Only these template ids (the favourites), when given. */
  only?: ReadonlySet<string> | null
}

const nameOf = <T extends { id: string; name: string }>(list: readonly T[], id: string) => list.find((entry) => entry.id === id)?.name ?? id

export function useName(id: TemplateUseId): string {
  return nameOf(TEMPLATE_USES, id)
}

export function styleName(id: TemplateStyleId): string {
  return nameOf(TEMPLATE_STYLES, id)
}

export function colorName(id: TemplateColorId): string {
  return nameOf(TEMPLATE_COLORS, id)
}

/** Everything a template answers to, weighted: its title most, its description least. */
function weightedWords(template: TemplateDefinition): Array<[string, number]> {
  const { uses, styles, colors } = templateFacets(template)
  const format = templateFormat(template.format)
  const words: Array<[string, number]> = [
    [template.title, 8],
    ...template.tags.map((tag): [string, number] => [tag, 4]),
    ...uses.map((use): [string, number] => [useName(use), 4]),
    ...uses.flatMap((use) => USE_ALIASES[use].map((alias): [string, number] => [alias, 2])),
    ...styles.map((style): [string, number] => [styleName(style), 3]),
    ...colors.map((color): [string, number] => [colorName(color), 2]),
    [format.name, 2],
    [format.ratio, 2],
    [template.workspace === 'markdown' ? 'Markdown 卡片' : '自由编辑', 1],
    [template.description, 1],
  ]
  // The same words as the reader sees them, when the UI isn't in Chinese.
  return words.flatMap(([word, weight]): Array<[string, number]> => {
    const shown = t(word)
    return shown === word ? [[word.toLowerCase(), weight]] : [[word.toLowerCase(), weight], [shown.toLowerCase(), weight]]
  })
}

/** How well a template answers the typed words: 0 when one of them misses. */
export function templateScore(template: TemplateDefinition, text: string): number {
  const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1
  const words = weightedWords(template)
  let score = 0
  for (const term of terms) {
    const best = words.reduce((top, [word, weight]) => (word.includes(term) ? Math.max(top, weight) : top), 0)
    if (best === 0) return 0
    score += best
  }
  return score
}

export function matchesFacets(template: TemplateDefinition, query: TemplateQuery): boolean {
  const { uses, styles, colors } = templateFacets(template)
  if (query.use && !uses.includes(query.use)) return false
  if (query.format && template.format !== query.format) return false
  if (query.style && !styles.includes(query.style)) return false
  if (query.color && !colors.includes(query.color)) return false
  if (query.only && !query.only.has(template.id)) return false
  return true
}

/** The templates a query finds, best matches first (in gallery order among equals). */
export function findTemplates(templates: readonly TemplateDefinition[], query: TemplateQuery): TemplateDefinition[] {
  const text = query.text?.trim() ?? ''
  const found = templates
    .map((template, index) => ({ template, index, score: matchesFacets(template, query) ? templateScore(template, text) : 0 }))
    .filter((entry) => entry.score > 0)
  if (text) found.sort((a, b) => b.score - a.score || a.index - b.index)
  return found.map((entry) => entry.template)
}

/** Templates like this one: the same use first, then a shared style, size or colour. */
export function similarTemplates(template: TemplateDefinition, templates: readonly TemplateDefinition[], limit = 6): TemplateDefinition[] {
  const own = templateFacets(template)
  return templates
    .filter((candidate) => candidate.id !== template.id)
    .map((candidate, index) => {
      const facets = templateFacets(candidate)
      const uses = facets.uses.filter((use) => own.uses.includes(use)).length
      const styles = facets.styles.filter((style) => own.styles.includes(style)).length
      const score = uses * 4 + styles * 2
        + (candidate.format === template.format ? 1 : 0)
        + facets.colors.filter((color) => own.colors.includes(color)).length * 0.5
      // Alike means for the same thing or in the same style; size and colour only rank them.
      return { candidate, index, score: uses + styles > 0 ? score : 0 }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate)
}

/** The uses that have templates in this list, in taxonomy order. */
export function usesIn(templates: readonly TemplateDefinition[]): TemplateUseId[] {
  return TEMPLATE_USES.map((use) => use.id).filter((id) => templates.some((template) => templateFacets(template).uses.includes(id)))
}
