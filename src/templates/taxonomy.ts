// How the template center sorts templates for finding them, the way
// commercial galleries do (Canva, 稿定): by what a template is for, then by
// its style and its colours. Sizes are formats.ts. Every template in the
// registry has an entry here (registry.test.ts).

import type { TemplateDefinition, TemplateSeriesId } from './types'

/** What a template is for, the first thing a gallery asks. */
export const TEMPLATE_USES = [
  { id: 'article', name: '长文卡片' },
  { id: 'carousel', name: '图文套图' },
  { id: 'social', name: '社交配图' },
  { id: 'event', name: '活动海报' },
  { id: 'promo', name: '营销电商' },
  { id: 'menu', name: '菜单价目' },
  { id: 'festival', name: '节日节气' },
  { id: 'invite', name: '邀请贺卡' },
  { id: 'office', name: '办公学习' },
] as const

export const TEMPLATE_STYLES = [
  { id: 'minimal', name: '简约' },
  { id: 'editorial', name: '杂志' },
  { id: 'literary', name: '文艺' },
  { id: 'chinese', name: '国风' },
  { id: 'retro', name: '复古' },
  { id: 'handdrawn', name: '手绘' },
  { id: 'elegant', name: '优雅' },
  { id: 'bold', name: '潮酷' },
  { id: 'business', name: '商务' },
  { id: 'fresh', name: '清新' },
] as const

/** Colour families, each with the swatch the filter shows. */
export const TEMPLATE_COLORS = [
  { id: 'white', name: '白色', swatch: '#ffffff' },
  { id: 'beige', name: '米色', swatch: '#efe4cf' },
  { id: 'gray', name: '灰色', swatch: '#9b9b98' },
  { id: 'black', name: '黑色', swatch: '#1d1d1f' },
  { id: 'red', name: '红色', swatch: '#d33b2c' },
  { id: 'orange', name: '橙色', swatch: '#ec8a3c' },
  { id: 'yellow', name: '黄色', swatch: '#f2c84b' },
  { id: 'green', name: '绿色', swatch: '#3c8c5b' },
  { id: 'blue', name: '蓝色', swatch: '#3467d6' },
  { id: 'purple', name: '紫色', swatch: '#8b62d9' },
  { id: 'pink', name: '粉色', swatch: '#ef93b4' },
] as const

export type TemplateUseId = (typeof TEMPLATE_USES)[number]['id']
export type TemplateStyleId = (typeof TEMPLATE_STYLES)[number]['id']
export type TemplateColorId = (typeof TEMPLATE_COLORS)[number]['id']

export interface TemplateFacets {
  uses: readonly TemplateUseId[]
  styles: readonly TemplateStyleId[]
  colors: readonly TemplateColorId[]
}

const facets = (uses: TemplateUseId[], styles: TemplateStyleId[], colors: TemplateColorId[]): TemplateFacets => ({ uses, styles, colors })

export const TEMPLATE_FACETS: Record<TemplateSeriesId, TemplateFacets> = {
  // Markdown looks
  column: facets(['article'], ['editorial', 'literary'], ['beige', 'red']),
  memo: facets(['article'], ['minimal', 'fresh'], ['white', 'yellow']),
  letter: facets(['article'], ['literary', 'retro'], ['beige', 'red']),
  night: facets(['article'], ['literary'], ['black']),
  aurora: facets(['article'], ['fresh'], ['purple', 'pink', 'blue']),
  doc: facets(['article'], ['business', 'minimal'], ['white', 'blue']),
  xuan: facets(['article'], ['chinese'], ['beige', 'red']),
  swiss: facets(['article'], ['bold', 'minimal'], ['white', 'red']),
  journal: facets(['article'], ['handdrawn', 'fresh'], ['beige', 'orange']),
  // Decks
  editorial: facets(['carousel'], ['editorial'], ['beige', 'red']),
  checklist: facets(['carousel'], ['minimal', 'fresh'], ['green', 'white']),
  signal: facets(['carousel'], ['bold'], ['beige', 'red']),
  'night-flight': facets(['carousel'], ['literary'], ['black', 'blue']),
  brutalist: facets(['carousel'], ['bold'], ['yellow', 'black']),
  blueprint: facets(['carousel'], ['business'], ['blue']),
  spotlight: facets(['carousel', 'office'], ['minimal', 'business'], ['orange', 'white']),
  // Posters
  'note-cover': facets(['social'], ['fresh'], ['beige', 'yellow']),
  'photo-cover': facets(['social'], ['retro'], ['beige', 'black']),
  'portfolio-cover': facets(['social'], ['elegant', 'editorial'], ['black', 'red']),
  menu: facets(['menu'], ['minimal', 'retro'], ['beige', 'orange']),
  'dessert-menu': facets(['menu'], ['handdrawn'], ['beige', 'orange', 'yellow']),
  'price-list': facets(['menu', 'promo'], ['retro'], ['red', 'white']),
  certificate: facets(['office'], ['elegant'], ['beige', 'yellow']),
  'moments-grid': facets(['social', 'festival'], ['handdrawn'], ['purple', 'orange', 'pink']),
  timetable: facets(['office'], ['fresh'], ['white', 'blue', 'yellow']),
  'exhibition-poster': facets(['event'], ['bold', 'minimal'], ['white', 'black']),
  'talk-poster': facets(['event'], ['editorial'], ['beige', 'black']),
  'launch-poster': facets(['promo', 'event'], ['bold'], ['black', 'blue', 'purple']),
  'sale-poster': facets(['promo'], ['bold'], ['orange']),
  'hiring-poster': facets(['office', 'event'], ['minimal', 'fresh'], ['beige', 'blue', 'orange']),
  'festival-poster': facets(['festival'], ['chinese'], ['blue', 'yellow']),
  'solar-term': facets(['festival'], ['chinese'], ['beige', 'red']),
  invitation: facets(['invite'], ['elegant'], ['green', 'yellow']),
  'wedding-invitation': facets(['invite'], ['elegant'], ['white', 'green']),
  'birthday-card': facets(['invite'], ['fresh'], ['pink', 'beige']),
  'autumn-market': facets(['event'], ['handdrawn'], ['beige', 'orange']),
  'quote-card': facets(['social'], ['minimal', 'literary'], ['beige', 'red']),
  'product-card': facets(['promo'], ['fresh'], ['green']),
  'video-cover': facets(['social'], ['bold'], ['black', 'yellow']),
  'pitch-cover': facets(['office'], ['business', 'minimal'], ['blue', 'white']),
  'podcast-cover': facets(['social'], ['retro', 'bold'], ['beige', 'red', 'blue']),
  'article-cover': facets(['social'], ['editorial'], ['blue', 'black']),
  flyer: facets(['event'], ['fresh'], ['beige', 'orange']),
  'data-roundup': facets(['office'], ['editorial', 'business'], ['beige', 'red']),
  'compare-table': facets(['office'], ['business'], ['blue', 'white']),
  'growth-timeline': facets(['office'], ['elegant'], ['green', 'yellow']),
  'magazine-cover': facets(['social'], ['editorial', 'elegant'], ['beige', 'black']),
  'book-list': facets(['social'], ['literary', 'fresh'], ['beige', 'green', 'orange']),
  'word-of-year': facets(['festival', 'social'], ['chinese', 'minimal'], ['white', 'red', 'black']),
  'music-festival': facets(['event'], ['bold', 'retro'], ['purple', 'pink', 'yellow']),
  'travel-postcard': facets(['invite', 'social'], ['retro'], ['beige', 'red', 'blue']),
  'design-week': facets(['event'], ['bold', 'minimal'], ['white', 'red', 'black']),
  'double-eleven': facets(['promo', 'festival'], ['bold'], ['red', 'yellow']),
  'christmas-card': facets(['festival', 'invite'], ['retro', 'handdrawn'], ['red', 'green']),
  'new-year-calendar': facets(['festival', 'social'], ['retro', 'minimal'], ['blue', 'red', 'beige']),
  'spring-festival': facets(['festival', 'invite'], ['chinese'], ['red', 'yellow']),
  'listicle-cover': facets(['social'], ['editorial', 'minimal'], ['red', 'beige']),
  'ridge-cover': facets(['social'], ['literary', 'fresh'], ['blue', 'beige']),
  'summit-visual': facets(['event'], ['business', 'bold'], ['black', 'blue', 'green']),
  'gala-backdrop': facets(['event', 'festival'], ['elegant', 'retro'], ['black', 'yellow']),
  'agenda-sheet': facets(['event', 'office'], ['business', 'minimal'], ['blue', 'white']),
  'annual-report': facets(['office'], ['business', 'elegant'], ['white', 'blue']),
  'stat-card': facets(['social', 'office'], ['minimal', 'bold'], ['blue']),
  'countdown': facets(['event', 'promo'], ['minimal'], ['beige', 'black']),
}

export function templateFacets(template: Pick<TemplateDefinition, 'series'>): TemplateFacets {
  return TEMPLATE_FACETS[template.series]
}
