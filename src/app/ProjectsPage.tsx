import { useMemo, useState } from 'react'
import type { User } from '../auth'
import type { Draft } from '../drafts'
import { Select } from '../Select'
import { FreeformMarkIcon, MarkdownMarkIcon } from '../ui/icons'
import type { WorkspaceMode } from '../workspaces/types'
import { ProjectCard } from './ProjectCard'
import { navigate, routes } from './router'
import type { ProjectsState } from './useProjects'

type SortKey = 'updated' | 'title'

interface ProjectsPageProps {
  user: User | null
  system: WorkspaceMode | null
  projects: ProjectsState
  onNewMarkdown: () => void
  onNewFreeform: () => void
  onOpenProject: (draft: Draft) => void
  onDuplicate: (draft: Draft) => void
  onDelete: (draft: Draft) => void
}

export function ProjectsPage({
  user,
  system,
  projects,
  onNewMarkdown,
  onNewFreeform,
  onOpenProject,
  onDuplicate,
  onDelete,
}: ProjectsPageProps) {
  const [sort, setSort] = useState<SortKey>('updated')
  const all = projects.projects
  const counts = {
    'markdown-card': all.filter((draft) => draft.mode === 'markdown-card').length,
    'freeform-slide': all.filter((draft) => draft.mode === 'freeform-slide').length,
  }
  const visible = useMemo(() => {
    const list = all.filter((draft) => !system || draft.mode === system)
    return sort === 'title'
      ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
      : list
  }, [all, sort, system])

  return (
    <section className="page" aria-label="我的项目">
      <div className="page-head">
        <div>
          <h1>我的项目</h1>
          <p>
            {user
              ? all.length > 0
                ? `共 ${all.length} 个项目，最近一次保存在 ${new Date(all[0].updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}。`
                : '保存过的项目都会出现在这里。'
              : '登录后，保存的项目会出现在这里。'}
          </p>
        </div>
        <div className="page-actions">
          <button className="ghost" type="button" onClick={onNewMarkdown}><MarkdownMarkIcon className="sys-md" />新建 Markdown 卡片</button>
          <button className="ghost" type="button" onClick={onNewFreeform}><FreeformMarkIcon className="sys-ff" />新建自由编辑</button>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="tabs" role="group" aria-label="按系统筛选">
          <button type="button" aria-pressed={!system} onClick={() => navigate(routes.projects())}>全部 <span className="tnum">{all.length}</span></button>
          <button type="button" aria-pressed={system === 'markdown-card'} onClick={() => navigate(routes.projects('markdown-card'))}>
            <span className="sys-dot md" aria-hidden="true" />Markdown 卡片 <span className="tnum">{counts['markdown-card']}</span>
          </button>
          <button type="button" aria-pressed={system === 'freeform-slide'} onClick={() => navigate(routes.projects('freeform-slide'))}>
            <span className="sys-dot ff" aria-hidden="true" />自由编辑 <span className="tnum">{counts['freeform-slide']}</span>
          </button>
        </div>
        <span className="grow" />
        <Select
          value={sort}
          title="排序"
          onChange={(value) => setSort(value as SortKey)}
          options={[{ id: "updated", label: "最近编辑" }, { id: "title", label: "按名称" }]}
        />
      </div>

      {projects.status === 'error' && (
        <div className="empty">
          <b>项目读取失败</b>
          <span>{projects.error}</span>
          <button className="ghost" type="button" onClick={projects.reload}>重试</button>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="project-grid">
          {visible.map((draft) => (
            <ProjectCard key={draft.id} draft={draft} onOpen={onOpenProject} onDuplicate={onDuplicate} onDelete={onDelete} />
          ))}
        </div>
      ) : projects.status !== 'error' && (
        <div className="empty">
          <b>{user ? (system ? '这一类还没有项目' : '还没有保存的项目') : '还没有登录'}</b>
          <span>{user ? '新建一个，保存后就会出现在这里。' : '登录后可以保存项目，并在这里继续编辑。'}</span>
          {!user && <button className="ghost" type="button" onClick={() => navigate(routes.login)}>登录或注册</button>}
        </div>
      )}
    </section>
  )
}
