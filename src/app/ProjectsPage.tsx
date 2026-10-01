import { useMemo, useRef, useState, type DragEvent } from 'react'
import type { Draft } from '../drafts'
import { Select } from '../Select'
import { DeviceCheckIcon, FileImportIcon, FreeformMarkIcon, MarkdownMarkIcon } from '../ui/icons'
import type { WorkspaceMode } from '../workspaces/types'
import { ProjectCard } from './ProjectCard'
import { navigate, routes } from './router'
import type { ProjectsState } from './useProjects'
import { locale, t } from '../i18n'

type SortKey = 'updated' | 'title'

interface ProjectsPageProps {
  /** Whose projects these are; null while the session is being checked. */
  ownerId: string | null
  /** What this device's guest left behind, when an account is signed in. */
  guestLeft: { projects: number; assets: number } | null
  onMoveGuestWork: () => void
  system: WorkspaceMode | null
  projects: ProjectsState
  onNewMarkdown: () => void
  onNewFreeform: () => void
  /** A .json document to turn into a project. */
  onImport: (file: File) => void
  onOpenProject: (draft: Draft) => void
  onDuplicate: (draft: Draft) => void
  onRename: (draft: Draft, title: string) => void
  onDelete: (draft: Draft) => void
}

function carriesJson(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function ProjectsPage({
  ownerId,
  guestLeft,
  onMoveGuestWork,
  system,
  projects,
  onNewMarkdown,
  onNewFreeform,
  onImport,
  onOpenProject,
  onDuplicate,
  onRename,
  onDelete,
}: ProjectsPageProps) {
  const [sort, setSort] = useState<SortKey>('updated')
  const [dropping, setDropping] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const all = projects.projects
  const counts = {
    'markdown-card': all.filter((draft) => draft.mode === 'markdown-card').length,
    'freeform-slide': all.filter((draft) => draft.mode === 'freeform-slide').length,
  }
  const visible = useMemo(() => {
    const list = all.filter((draft) => !system || draft.mode === system)
    return sort === 'title'
      ? [...list].sort((a, b) => a.title.localeCompare(b.title, locale()))
      : list
  }, [all, sort, system])

  return (
    <section
      className={dropping ? 'page page-projects is-dropping' : 'page page-projects'}
      aria-label={t('我的项目')}
      onDragOver={(event) => {
        if (!ownerId || !carriesJson(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setDropping(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(event) => {
        if (!ownerId || !carriesJson(event)) return
        event.preventDefault()
        setDropping(false)
        const file = event.dataTransfer.files[0]
        if (file) onImport(file)
      }}
    >
      <div className="page-head">
        <div>
          <h1>{t('我的项目')}</h1>
        </div>
        <div className="page-actions">
          {ownerId && (
            <button
              className="ghost"
              type="button"
              data-testid="project-import"
              title={t('导入 .json 文档，比如 MCP 工具生成的结果')}
              onClick={() => importRef.current?.click()}
            >
              <FileImportIcon />{t('导入 JSON')}
            </button>
          )}
          <button className="ghost" type="button" onClick={onNewMarkdown}><MarkdownMarkIcon className="sys-md" />{t('新建 Markdown 卡片')}</button>
          <button className="ghost" type="button" onClick={onNewFreeform}><FreeformMarkIcon className="sys-ff" />{t('新建自由编辑')}</button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label={t('导入 JSON 文档')}
            data-testid="project-import-input"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) onImport(file)
            }}
          />
        </div>
      </div>

      {guestLeft && guestLeft.projects + guestLeft.assets > 0 && (
        <div className="guest-left" data-testid="guest-left">
          <DeviceCheckIcon />
          <span>
            {guestLeft.projects > 0
              ? t('这台设备上还有 {n} 个没登录时做的项目。', { n: guestLeft.projects })
              : t('这台设备上还有 {n} 张没登录时存的素材。', { n: guestLeft.assets })}
          </span>
          <button className="ghost" type="button" onClick={onMoveGuestWork} data-testid="guest-left-move">
            {t('放进账号')}
          </button>
        </div>
      )}

      <div className="toolbar-row">
        <div className="tabs" role="group" aria-label={t('按系统筛选')}>
          <button type="button" aria-pressed={!system} onClick={() => navigate(routes.projects())}>{t('全部')} <span className="tnum">{all.length}</span></button>
          <button type="button" aria-pressed={system === 'markdown-card'} onClick={() => navigate(routes.projects('markdown-card'))}>
            <span className="sys-dot md" aria-hidden="true" />{t('Markdown 卡片')} <span className="tnum">{counts['markdown-card']}</span>
          </button>
          <button type="button" aria-pressed={system === 'freeform-slide'} onClick={() => navigate(routes.projects('freeform-slide'))}>
            <span className="sys-dot ff" aria-hidden="true" />{t('自由编辑')} <span className="tnum">{counts['freeform-slide']}</span>
          </button>
        </div>
        <span className="grow" />
        <Select
          value={sort}
          title={t('排序')}
          onChange={(value) => setSort(value as SortKey)}
          options={[{ id: "updated", label: t('最近编辑') }, { id: "title", label: t('按名称') }]}
        />
      </div>

      {projects.status === 'error' && (
        <div className="empty">
          <b>{t('项目读取失败')}</b>
          <span>{projects.error}</span>
          <button className="ghost" type="button" onClick={projects.reload}>{t('重试')}</button>
        </div>
      )}

      {dropping && (
        <div className="asset-drop-overlay" aria-hidden="true">
          <div><FileImportIcon /><b>{t('松开，导入为项目')}</b></div>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="project-grid">
          {visible.map((draft) => (
            <ProjectCard key={draft.id} draft={draft} onOpen={onOpenProject} onDuplicate={onDuplicate} onRename={onRename} onDelete={onDelete} />
          ))}
        </div>
      ) : projects.status !== 'error' && (
        <div className="empty">
          <b>{system ? t('这一类还没有项目') : t('还没有保存的项目')}</b>
          <span>{t('新建一个，开始编辑就会自动保存到这里；也可以把 .json 文档拖进来导入。')}</span>
        </div>
      )}
    </section>
  )
}
