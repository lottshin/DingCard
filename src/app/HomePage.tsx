import { useMemo, useRef, useState } from 'react'
import type { User } from '../auth'
import type { Draft } from '../drafts'
import { pageSizePresets } from '../freeform/constants'
import type { FreeformSceneNode } from '../freeform/types'
import { TEMPLATE_REGISTRY } from '../templates/registry'
import type { TemplateDefinition } from '../templates/types'
import { PLATFORMS } from '../theme'
import { AssetsIcon, FreeformMarkIcon, MarkdownMarkIcon, TemplatesIcon, UploadIcon } from '../ui/icons'
import type { WorkspaceMode } from '../workspaces/types'
import { ASSET_ACCEPT } from './assetFiles'
import { DocumentPreview } from './DocumentPreview'
import { templatePreviewSource } from './LoginPage'
import { ProjectCard } from './ProjectCard'
import { navigate, routes } from './router'
import { TemplateCard } from './TemplateCard'
import type { AssetsState } from './useAssets'
import type { ProjectsState } from './useProjects'
import { t } from '../i18n'

const FREEFORM_SIZES = pageSizePresets.filter((preset) => ['3:4', '1:1', '9:16', '16:9'].includes(preset.ratio))

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 6) return t('夜深了')
  if (hour < 12) return t('早上好')
  if (hour < 18) return t('下午好')
  return t('晚上好')
}

function nodeLabel(node: FreeformSceneNode): string {
  return node.name || (node.type === 'text' ? t('文本') : node.type === 'image' ? t('图片') : t('形状'))
}

interface HomePageProps {
  user: User | null
  /** Whose projects these are; null while the session is being checked. */
  ownerId: string | null
  projects: ProjectsState
  assets: AssetsState
  onUploadAssets: (files: File[]) => void
  templateCounts: Record<WorkspaceMode, number>
  onNewMarkdown: (platformId: string) => void
  onNewFreeform: (width: number, height: number) => void
  onOpenProject: (draft: Draft) => void
  onUseTemplate: (template: TemplateDefinition) => void
  onDuplicate: (draft: Draft) => void
  onRename: (draft: Draft, title: string) => void
  onDelete: (draft: Draft) => void
}

export function HomePage({
  user,
  ownerId,
  projects,
  assets,
  onUploadAssets,
  templateCounts,
  onNewMarkdown,
  onNewFreeform,
  onOpenProject,
  onUseTemplate,
  onDuplicate,
  onRename,
  onDelete,
}: HomePageProps) {
  const [filter, setFilter] = useState<'all' | WorkspaceMode>('all')
  const assetInputRef = useRef<HTMLInputElement>(null)
  const counts = useMemo(() => ({
    'markdown-card': projects.projects.filter((draft) => draft.mode === 'markdown-card').length,
    'freeform-slide': projects.projects.filter((draft) => draft.mode === 'freeform-slide').length,
  }), [projects.projects])
  const recent = projects.projects.filter((draft) => filter === 'all' || draft.mode === filter).slice(0, 8)

  const archive = useMemo(() => {
    const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === 'editorial-archive-markdown')
    return template ? templatePreviewSource(template) : null
  }, [])
  const flight = useMemo(() => {
    const template = TEMPLATE_REGISTRY.find((candidate) => candidate.id === 'night-flight-freeform')
    return template ? templatePreviewSource(template) : null
  }, [])
  const flightLayers = flight?.kind === 'freeform'
    ? (flight.document.slides[0]?.nodes ?? []).slice(-4).reverse().map(nodeLabel)
    : []
  const picks = useMemo(
    () => ['public-theatre-markdown', 'soft-freeform', 'issue-cover-markdown', 'signal-freeform']
      .map((id) => TEMPLATE_REGISTRY.find((template) => template.id === id))
      .filter((template): template is TemplateDefinition => Boolean(template)),
    [],
  )

  return (
    <section className="page page-home" aria-label={t('首页')}>
      <h1 className="hello">{user ? t('{greeting}，{name}', { greeting: greeting(), name: user.username }) : greeting()}</h1>
      <p className="hello-sub">{t('今天想发点什么？写长文用 Markdown 卡片，自己排版用自由编辑。')}</p>

      <div className="systems">
        <article className="system" data-testid="system-markdown">
          <div className="system-top">
            <span className="sys-badge"><MarkdownMarkIcon className="sys-md" />{t('Markdown 卡片')}</span>
            <span className="system-count tnum">{t('{projects} 个项目 · {templates} 套模板', { projects: counts['markdown-card'], templates: templateCounts['markdown-card'] })}</span>
          </div>
          <div>
            <h2 className="system-title">{t('写一篇长文，自动排成一组卡片')}</h2>
            <p className="system-desc">{t('只管写字。标题、正文、金句按内容自动分页，整组图片一键导出。')}</p>
          </div>
          <div className="system-art system-art-md" aria-hidden="true">
            <div className="md-doc">
              <b>{t('# 这周事情很多，我先删掉一半')}</b>
              <i /><i className="short" />
              <span className="md-break">---</span>
              <b>{t('## 任务列了二十多条，今天只做三条')}</b>
              <i /><i /><i className="short" />
              <span className="md-break">---</span>
              <span>{t('> 明天上午先不回消息')}</span>
            </div>
            <span className="md-flow" />
            <div className="md-fan">
              {archive && [1, 0, 2].map((page) => (
                <div key={page} className={`md-fan-page md-fan-${page}`}><DocumentPreview source={archive} page={page} width={84} /></div>
              ))}
            </div>
          </div>
          <div className="system-actions">
            <span className="system-label">{t('新建')}</span>
            {PLATFORMS.map((platform) => (
              <button key={platform.id} className="pill" type="button" onClick={() => onNewMarkdown(platform.id)}>{t(platform.label)}</button>
            ))}
            <button className="system-more" type="button" onClick={() => navigate(routes.templates('markdown-card'))}>{t('从模板开始')}</button>
          </div>
        </article>

        <article className="system" data-testid="system-freeform">
          <div className="system-top">
            <span className="sys-badge"><FreeformMarkIcon className="sys-ff" />{t('自由编辑')}</span>
            <span className="system-count tnum">{t('{projects} 个项目 · {templates} 套模板', { projects: counts['freeform-slide'], templates: templateCounts['freeform-slide'] })}</span>
          </div>
          <div>
            <h2 className="system-title">{t('像做海报一样，自由摆放每个元素')}</h2>
            <p className="system-desc">{t('文字、图片、形状、图层和参考线都在手边，多页设计一次导出。')}</p>
          </div>
          <div className="system-art system-art-ff" aria-hidden="true">
            <div className="ff-rail"><span><TemplatesIcon /></span><span className="on"><AssetsIcon /></span><span><FreeformMarkIcon /></span></div>
            <div className="ff-canvas">
              {flight && <div className="ff-page"><DocumentPreview source={flight} width={112} /><i className="ff-sel" /></div>}
            </div>
            <div className="ff-layers">
              {flightLayers.map((label, index) => <span key={`${label}-${index}`} className={index === 1 ? 'on' : undefined}>{label}</span>)}
            </div>
          </div>
          <div className="system-actions">
            <span className="system-label">{t('新建')}</span>
            {FREEFORM_SIZES.map((preset) => (
              <button key={preset.ratio} className="pill tnum" type="button" onClick={() => onNewFreeform(preset.width, preset.height)}>{preset.ratio}</button>
            ))}
            <button className="system-more" type="button" onClick={() => navigate(routes.templates('freeform-slide'))}>{t('从模板开始')}</button>
          </div>
        </article>
      </div>

      <section className="section" aria-labelledby="home-recent">
        <div className="section-head">
          <h2 id="home-recent">{t('最近编辑')}</h2>
          <div className="section-tools">
            <div className="tabs" role="group" aria-label={t('按系统筛选')}>
              <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('全部')}</button>
              <button type="button" aria-pressed={filter === 'markdown-card'} onClick={() => setFilter('markdown-card')}>{t('Markdown 卡片')}</button>
              <button type="button" aria-pressed={filter === 'freeform-slide'} onClick={() => setFilter('freeform-slide')}>{t('自由编辑')}</button>
            </div>
            {projects.projects.length > 0 && (
              <button className="link-btn" type="button" onClick={() => navigate(routes.projects())}>{t('查看全部 {n} 个', { n: projects.projects.length })}</button>
            )}
          </div>
        </div>
        {recent.length > 0 ? (
          <div className="project-grid">
            {recent.map((draft) => (
              <ProjectCard key={draft.id} draft={draft} onOpen={onOpenProject} onDuplicate={onDuplicate} onRename={onRename} onDelete={onDelete} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <b>{t('还没有项目')}</b>
            <span>{t('从上面选一种方式新建，开始编辑就会自动保存到这里。')}</span>
          </div>
        )}
      </section>

      {ownerId && (
        <section className="section" aria-labelledby="home-assets">
          <div className="section-head">
            <div>
              <h2 id="home-assets">{t('素材库')}</h2>
              <p className="section-hint">{t('常用的照片、头像和 Logo 放在这里，两套系统都能直接取用。')}</p>
            </div>
            <button className="link-btn" type="button" onClick={() => navigate(routes.assets)}>
              {assets.assets.length > 0 ? t('管理全部 {n} 张', { n: assets.assets.length }) : t('打开素材库')}
            </button>
          </div>
          <div className="asset-strip">
            {assets.assets.slice(0, 7).map((asset) => (
              <button
                key={asset.id}
                className="asset-strip-item"
                type="button"
                title={asset.name}
                aria-label={t('在素材库中查看 {name}', { name: asset.name })}
                onClick={() => navigate(routes.assets)}
              >
                <img src={asset.src} alt="" loading="lazy" decoding="async" draggable={false} />
              </button>
            ))}
            <button className="asset-strip-add" type="button" onClick={() => assetInputRef.current?.click()}>
              <UploadIcon />
              <span>{t('上传图片')}</span>
            </button>
            <input
              ref={assetInputRef}
              type="file"
              accept={ASSET_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                if (files.length > 0) onUploadAssets(files)
              }}
            />
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="home-templates">
        <div className="section-head">
          <h2 id="home-templates">{t('模板推荐')}</h2>
          <button className="link-btn" type="button" onClick={() => navigate(routes.templates())}>{t('去模板中心')}</button>
        </div>
        <div className="tpl-grid">
          {picks.map((template) => <TemplateCard key={template.id} template={template} onUse={onUseTemplate} />)}
        </div>
      </section>
    </section>
  )
}
