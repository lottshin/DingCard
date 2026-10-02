import { useMemo } from 'react'
import { templateFormat } from '../templates/formats'
import type { TemplateDefinition } from '../templates/types'
import { DocumentPreview, Measured } from './DocumentPreview'
import { templatePreviewSource } from './LoginPage'
import { t } from '../i18n'

interface TemplateCardProps {
  template: TemplateDefinition
  onUse: (template: TemplateDefinition) => void
}

export function TemplateCard({ template, onUse }: TemplateCardProps) {
  const source = useMemo(() => templatePreviewSource(template), [template])
  const system = template.workspace === 'markdown' ? 'md' : 'ff'
  const fanned = Math.min(3, template.pageCount)
  const pages = fanned > 1 ? [1, 0, 2].filter((page) => page < fanned) : [0]

  return (
    <article className="tpl-card" data-testid="template-card">
      <button className="tpl-stage" type="button" onClick={() => onUse(template)} aria-label={t('用「{title}」新建项目', { title: t(template.title) })}>
        {source && template.kind === 'poster' && (
          <Measured className="tpl-fan">
            {(width) => {
              // One page at its own proportions, as large as the stage allows.
              const size = templateFormat(template.format)
              const scale = Math.min((width * 0.84) / size.width, (width * 0.75 * 0.78) / size.height)
              const frame = { width: Math.round(size.width * scale), height: Math.round(size.height * scale) }
              return (
                <div className="tpl-page tpl-page-solo" style={{ left: (width - frame.width) / 2, top: (width * 0.75 - frame.height) / 2 }}>
                  <DocumentPreview source={source} page={0} width={frame.width} height={frame.height} lazy />
                </div>
              )
            }}
          </Measured>
        )}
        {source && template.kind !== 'poster' && (
          <Measured className="tpl-fan">
            {(width) => pages.map((page) => (
              <div key={page} className={`tpl-page tpl-page-${page}`}>
                <DocumentPreview source={source} page={page} width={Math.round(width * 0.38)} lazy />
              </div>
            ))}
          </Measured>
        )}
        <span className="tpl-use">{t('使用模板')}</span>
      </button>
      <div className="tpl-info">
        <div className="tpl-title-row">
          <h3>{t(template.title)}</h3>
          <span className="chip tnum">{template.kind === 'poster' ? templateFormat(template.format).ratio : t('{n} 页', { n: template.pageCount })}</span>
        </div>
        <p>
          <span className={`sys-dot ${system}`} aria-hidden="true" />
          {system === 'md' ? t('Markdown 卡片') : t('自由编辑')}
          {template.tags.length > 0 && ` · ${template.tags.map((tag) => t(tag)).join(' · ')}`}
        </p>
      </div>
    </article>
  )
}
