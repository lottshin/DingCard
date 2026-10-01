import { useMemo } from 'react'
import type { TemplateDefinition } from '../templates/types'
import type { WorkspaceMode } from '../workspaces/types'
import { navigate, routes } from './router'
import { TemplateCard } from './TemplateCard'
import { templatesFor } from './templates'
import { t } from '../i18n'

interface TemplatesPageProps {
  system: WorkspaceMode | null
  onUseTemplate: (template: TemplateDefinition) => void
}

/** Where template contributions are explained. */
export const TEMPLATE_GUIDE_URL = 'https://github.com/lottshin/DingCard/blob/master/docs/templates.md'

export function TemplatesPage({ system, onUseTemplate }: TemplatesPageProps) {
  const markdown = useMemo(() => templatesFor('markdown-card'), [])
  const freeform = useMemo(() => templatesFor('freeform-slide'), [])
  const groups = [
    { system: 'markdown-card' as const, title: t('Markdown 卡片模板'), hint: t('写好正文就能套用，封面、正文、金句、收尾按内容自动分配。'), templates: markdown },
    { system: 'freeform-slide' as const, title: t('自由编辑模板'), hint: t('每个元素都能拖动、改色、换图，多页一起调整。'), templates: freeform },
  ].filter((group) => !system || group.system === system)

  return (
    <section className="page" aria-label={t('模板中心')}>
      <div className="page-head">
        <div>
          <h1>{t('模板中心')}</h1>
        </div>
        <div className="tabs" role="group" aria-label={t('按系统筛选')}>
          <button type="button" aria-pressed={!system} onClick={() => navigate(routes.templates())}>{t('全部')} <span className="tnum">{markdown.length + freeform.length}</span></button>
          <button type="button" aria-pressed={system === 'markdown-card'} onClick={() => navigate(routes.templates('markdown-card'))}>
            <span className="sys-dot md" aria-hidden="true" />{t('Markdown 卡片')} <span className="tnum">{markdown.length}</span>
          </button>
          <button type="button" aria-pressed={system === 'freeform-slide'} onClick={() => navigate(routes.templates('freeform-slide'))}>
            <span className="sys-dot ff" aria-hidden="true" />{t('自由编辑')} <span className="tnum">{freeform.length}</span>
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

      <aside className="tpl-contribute" aria-label={t('贡献模板')}>
        <div>
          <b>{t('模板由社区共建')}</b>
          <p>{t('每套模板都在仓库里维护。做了一套好看的版式？按贡献指南提交 Pull Request，合并后所有人都能用。想复用自己的作品，在「我的项目」里复制一份就行。')}</p>
        </div>
        <a className="ghost tpl-contribute-link" href={TEMPLATE_GUIDE_URL} target="_blank" rel="noreferrer">
          {t('查看贡献指南')}
        </a>
      </aside>
    </section>
  )
}
