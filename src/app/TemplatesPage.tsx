import { useMemo, useState } from 'react'
import { Select } from '../Select'
import { findTemplates, useName, usesIn } from '../templates/finder'
import { TEMPLATE_FORMATS } from '../templates/formats'
import {
  TEMPLATE_COLORS,
  TEMPLATE_STYLES,
  templateFacets,
  type TemplateColorId,
  type TemplateStyleId,
  type TemplateUseId,
} from '../templates/taxonomy'
import type { TemplateDefinition, TemplateFormatId } from '../templates/types'
import { CloseIcon, SearchIcon } from '../ui/icons'
import type { WorkspaceMode } from '../workspaces/types'
import { navigate, routes } from './router'
import { TemplateMasonry, TemplatePreviewDialog, TemplateTile, useFavoriteTemplates } from './TemplateBrowser'
import { templatesFor, templateSystem } from './templates'
import { t, useLang } from '../i18n'

interface TemplatesPageProps {
  system: WorkspaceMode | null
  onUseTemplate: (template: TemplateDefinition) => void
}

/** Where template contributions are explained. */
export const TEMPLATE_GUIDE_URL = 'https://github.com/lottshin/DingCard/blob/master/docs/templates.md'

const ALL = 'all'

/**
 * The template center, laid out the way commercial galleries are: search,
 * then what the template is for, then size, style and colour; every
 * template at its own proportions, and a preview before it is used.
 */
export function TemplatesPage({ system, onUseTemplate }: TemplatesPageProps) {
  useLang()
  const markdown = useMemo(() => templatesFor('markdown-card'), [])
  const freeform = useMemo(() => templatesFor('freeform-slide'), [])
  const all = useMemo(() => [...markdown, ...freeform], [markdown, freeform])
  const shown = useMemo(() => (system ? all.filter((template) => templateSystem(template) === system) : all), [all, system])
  const [text, setText] = useState('')
  const [use, setUse] = useState<TemplateUseId | null>(null)
  const [format, setFormat] = useState<TemplateFormatId | null>(null)
  const [style, setStyle] = useState<TemplateStyleId | null>(null)
  const [color, setColor] = useState<TemplateColorId | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favorites, toggleFavorite] = useFavoriteTemplates()
  const [previewId, setPreviewId] = useState<string | null>(null)

  const uses = usesIn(shown)
  // A filter the other editor's templates don't have stops applying on its tab.
  const activeUse = use && uses.includes(use) ? use : null
  const activeFormat = format && shown.some((template) => template.format === format) ? format : null
  const activeStyle = style && shown.some((template) => templateFacets(template).styles.includes(style)) ? style : null
  const activeColor = color && shown.some((template) => templateFacets(template).colors.includes(color)) ? color : null
  const query = { text, use: activeUse, format: activeFormat, style: activeStyle, color: activeColor, only: favoritesOnly ? favorites : null }
  const results = findTemplates(shown, query)
  // Each facet offers what the other filters leave, so no choice leads to an empty page.
  const formats = TEMPLATE_FORMATS.filter((entry) => entry.id === activeFormat
    || findTemplates(shown, { ...query, format: entry.id }).length > 0)
  const styles = TEMPLATE_STYLES.filter((entry) => entry.id === activeStyle
    || findTemplates(shown, { ...query, style: entry.id }).length > 0)
  const colors = TEMPLATE_COLORS.filter((entry) => entry.id === activeColor
    || findTemplates(shown, { ...query, color: entry.id }).length > 0)
  const filtered = Boolean(text.trim() || activeUse || activeFormat || activeStyle || activeColor || favoritesOnly)
  // Unfiltered, the gallery reads by use: each template under its first one.
  const sections = filtered
    ? []
    : uses.map((id) => ({ id, templates: results.filter((template) => templateFacets(template).uses[0] === id) }))
      .filter((section) => section.templates.length > 0)
  const preview = previewId ? all.find((template) => template.id === previewId) ?? null : null

  function clearFilters() {
    setText('')
    setUse(null)
    setFormat(null)
    setStyle(null)
    setColor(null)
    setFavoritesOnly(false)
  }

  const tile = (template: TemplateDefinition, width: number) => (
    <TemplateTile
      key={template.id}
      template={template}
      width={width}
      favorited={favorites.has(template.id)}
      onToggleFavorite={toggleFavorite}
      onPreview={(next) => setPreviewId(next.id)}
      onUse={onUseTemplate}
    />
  )

  return (
    <section className="page tpl-center" aria-label={t('模板中心')}>
      <div className="page-head">
        <div>
          <h1>{t('模板中心')}</h1>
        </div>
        <div className="tabs" role="group" aria-label={t('按系统筛选')}>
          <button type="button" aria-pressed={!system} onClick={() => navigate(routes.templates())}>{t('全部')} <span className="tnum">{all.length}</span></button>
          <button type="button" aria-pressed={system === 'markdown-card'} onClick={() => navigate(routes.templates('markdown-card'))}>
            <span className="sys-dot md" aria-hidden="true" />{t('Markdown 卡片')} <span className="tnum">{markdown.length}</span>
          </button>
          <button type="button" aria-pressed={system === 'freeform-slide'} onClick={() => navigate(routes.templates('freeform-slide'))}>
            <span className="sys-dot ff" aria-hidden="true" />{t('自由编辑')} <span className="tnum">{freeform.length}</span>
          </button>
        </div>
      </div>

      <div className="tpl-finder">
        <label className="search-field tpl-search">
          <SearchIcon />
          <input
            type="search"
            data-testid="template-center-search"
            aria-label={t('搜索模板')}
            placeholder={t('搜索模板，比如：菜单、中秋、读书笔记')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && text) {
                event.preventDefault()
                setText('')
              }
            }}
          />
          {text && (
            <button className="tpl-search-clear" type="button" aria-label={t('清空搜索')} onClick={() => setText('')}><CloseIcon /></button>
          )}
        </label>

        {uses.length > 1 && (
          <div className="tpl-uses" role="group" aria-label={t('按用途筛选')}>
            <button type="button" aria-pressed={activeUse === null} onClick={() => setUse(null)}>{t('全部')}</button>
            {uses.map((id) => (
              <button key={id} type="button" aria-pressed={activeUse === id} data-testid={`template-use-${id}`} onClick={() => setUse(activeUse === id ? null : id)}>
                {t(useName(id))}
              </button>
            ))}
          </div>
        )}

        <div className="tpl-filters">
          <Select
            value={activeFormat ?? ALL}
            title={t('尺寸')}
            testId="template-filter-format"
            onChange={(id) => setFormat(id === ALL ? null : (id as TemplateFormatId))}
            options={[{ id: ALL, label: t('全部尺寸') }, ...formats.map((entry) => ({ id: entry.id, label: `${t(entry.name)} · ${t(entry.ratio)}` }))]}
          />
          <Select
            value={activeStyle ?? ALL}
            title={t('风格')}
            testId="template-filter-style"
            onChange={(id) => setStyle(id === ALL ? null : (id as TemplateStyleId))}
            options={[{ id: ALL, label: t('全部风格') }, ...styles.map((entry) => ({ id: entry.id, label: t(entry.name) }))]}
          />
          <Select
            value={activeColor ?? ALL}
            title={t('颜色')}
            testId="template-filter-color"
            onChange={(id) => setColor(id === ALL ? null : (id as TemplateColorId))}
            options={[{ id: ALL, label: t('全部颜色') }, ...colors.map((entry) => ({ id: entry.id, label: t(entry.name), swatch: { bg: entry.swatch, accent: entry.swatch } }))]}
          />
          <button className="tpl-filter-toggle" type="button" aria-pressed={favoritesOnly} data-testid="template-center-favorites" onClick={() => setFavoritesOnly((current) => !current)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 17s-6.3-3.9-8.2-7.2C.5 7.4 2 4 5.2 4c2 0 3.4 1.1 4.8 2.9C11.4 5.1 12.8 4 14.8 4 18 4 19.5 7.4 18.2 9.8 16.3 13.1 10 17 10 17Z" />
            </svg>
            {t('收藏')}
            {favorites.size > 0 && <span className="tnum">{favorites.size}</span>}
          </button>
          <span className="grow" />
          <span className="tpl-count tnum" data-testid="template-center-count">{t('{n} 套模板', { n: results.length })}</span>
          {filtered && <button className="link-btn" type="button" onClick={clearFilters}>{t('清除筛选')}</button>}
        </div>
      </div>

      {results.length === 0 && (
        <div className="empty tpl-empty" data-testid="template-center-empty">
          <b>{t('没有找到相关模板')}</b>
          <button className="ghost" type="button" onClick={clearFilters}>{t('清除筛选')}</button>
        </div>
      )}

      {filtered && results.length > 0 && <TemplateMasonry templates={results}>{tile}</TemplateMasonry>}

      {!filtered && sections.map((section) => (
        <section key={section.id} className="tpl-section" aria-labelledby={`tpl-use-${section.id}`}>
          <div className="tpl-section-head">
            <h2 id={`tpl-use-${section.id}`}>{t(useName(section.id))}</h2>
            <span className="tnum">{section.templates.length}</span>
            <span className="grow" />
            <button className="link-btn" type="button" onClick={() => setUse(section.id)}>{t('只看这一类')}</button>
          </div>
          <TemplateMasonry templates={section.templates}>{tile}</TemplateMasonry>
        </section>
      ))}

      <aside className="tpl-contribute" aria-label={t('贡献模板')}>
        <div>
          <b>{t('模板由社区共建')}</b>
          <p>{t('每套模板都在仓库里维护。做了一套好看的版式？按贡献指南提交 Pull Request，合并后所有人都能用。想复用自己的作品，在「我的项目」里复制一份就行。')}</p>
        </div>
        <a className="ghost tpl-contribute-link" href={TEMPLATE_GUIDE_URL} target="_blank" rel="noreferrer">
          {t('查看贡献指南')}
        </a>
      </aside>

      {preview && (
        <TemplatePreviewDialog
          template={preview}
          list={results}
          pool={shown}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onShow={(next) => setPreviewId(next.id)}
          onUse={(template) => {
            setPreviewId(null)
            onUseTemplate(template)
          }}
          onFilterUse={(next) => {
            setPreviewId(null)
            clearFilters()
            setUse(next)
          }}
          onFilterStyle={(next) => {
            setPreviewId(null)
            clearFilters()
            setStyle(next)
          }}
          onClose={() => setPreviewId(null)}
        />
      )}
    </section>
  )
}
