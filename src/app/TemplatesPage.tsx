import { useMemo } from 'react'
import type { User } from '../auth'
import type { TemplateDefinition } from '../templates/types'
import type { WorkspaceMode } from '../workspaces/types'
import { navigate, routes } from './router'
import { TemplateCard } from './TemplateCard'
import { templatesFor } from './templates'

interface TemplatesPageProps {
  user: User | null
  system: WorkspaceMode | null
  onUseTemplate: (template: TemplateDefinition) => void
}

export function TemplatesPage({ user, system, onUseTemplate }: TemplatesPageProps) {
  const markdown = useMemo(() => templatesFor('markdown-card', user), [user])
  const freeform = useMemo(() => templatesFor('freeform-slide', user), [user])
  const groups = [
    { system: 'markdown-card' as const, title: 'Markdown 卡片模板', hint: '写好正文就能套用，封面、正文、金句、收尾按内容自动分配。', templates: markdown },
    { system: 'freeform-slide' as const, title: '自由编辑模板', hint: '每个元素都能拖动、改色、换图，多页一起调整。', templates: freeform },
  ].filter((group) => !system || group.system === system)

  return (
    <section className="page" aria-label="模板中心">
      <div className="page-head">
        <div>
          <h1>模板中心</h1>
          <p>每套模板都是排好版的完整示例，文字、配色和字体都可以继续改。</p>
        </div>
        <div className="tabs" role="group" aria-label="按系统筛选">
          <button type="button" aria-pressed={!system} onClick={() => navigate(routes.templates())}>全部 <span className="tnum">{markdown.length + freeform.length}</span></button>
          <button type="button" aria-pressed={system === 'markdown-card'} onClick={() => navigate(routes.templates('markdown-card'))}>
            <span className="sys-dot md" aria-hidden="true" />Markdown 卡片 <span className="tnum">{markdown.length}</span>
          </button>
          <button type="button" aria-pressed={system === 'freeform-slide'} onClick={() => navigate(routes.templates('freeform-slide'))}>
            <span className="sys-dot ff" aria-hidden="true" />自由编辑 <span className="tnum">{freeform.length}</span>
          </button>
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.system} className="section tpl-group" aria-labelledby={`tpl-${group.system}`}>
          <div className="section-head">
            <div>
              <h2 id={`tpl-${group.system}`}>{group.title}</h2>
              <p className="section-hint">{group.hint}</p>
            </div>
          </div>
          <div className="tpl-grid">
            {group.templates.map((template) => <TemplateCard key={template.id} template={template} onUse={onUseTemplate} />)}
          </div>
        </section>
      ))}
    </section>
  )
}
