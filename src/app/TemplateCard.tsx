import { useMemo } from 'react'
import type { TemplateDefinition } from '../templates/types'
import { DocumentPreview, Measured } from './DocumentPreview'
import { templatePreviewSource } from './LoginPage'

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
      <button className="tpl-stage" type="button" onClick={() => onUse(template)} aria-label={`用「${template.title}」新建项目`}>
        {source && (
          <Measured className="tpl-fan">
            {(width) => pages.map((page) => (
              <div key={page} className={`tpl-page tpl-page-${page}`}>
                <DocumentPreview source={source} page={page} width={Math.round(width * 0.38)} lazy />
              </div>
            ))}
          </Measured>
        )}
        <span className="tpl-use">使用模板</span>
      </button>
      <div className="tpl-info">
        <div className="tpl-title-row">
          <h3>{template.title}</h3>
          <span className="chip tnum">{template.pageCount} 页</span>
        </div>
        <p>
          <span className={`sys-dot ${system}`} aria-hidden="true" />
          {system === 'md' ? 'Markdown 卡片' : '自由编辑'}
          {template.tags.length > 0 && ` · ${template.tags.join(' · ')}`}
        </p>
      </div>
    </article>
  )
}
