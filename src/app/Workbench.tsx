import { useEffect, useMemo, useRef, useState } from 'react'
import logoUrl from '../logo.svg'
import type { Asset } from '../assets'
import type { User } from '../auth'
import type { Draft, SaveDraftInput } from '../drafts'
import { readLastSession, updateLastSession } from '../lastSession'
import { store } from '../storage'
import type { TemplateDefinition } from '../templates/types'
import type { Mode } from '../useAppTheme'
import {
  AssetsIcon,
  ChevronDownIcon,
  FreeformMarkIcon,
  HomeIcon,
  LogoutIcon,
  MarkdownMarkIcon,
  MoonIcon,
  MoreIcon,
  PlusIcon,
  ProjectsIcon,
  SearchIcon,
  SunIcon,
  TemplatesIcon,
} from '../ui/icons'
import { OperationNotice } from '../workspaces/OperationNotice'
import type { WorkspaceMeta, WorkspaceMode } from '../workspaces/types'
import { AssetsPage } from './AssetsPage'
import { assetUsage } from './assetUsage'
import { CommandPalette, type PaletteAction } from './CommandPalette'
import { ConfirmDialog } from './ConfirmDialog'
import { errorText } from './errors'
import { HomePage } from './HomePage'
import { projectSource } from './ProjectCard'
import { ProjectsPage } from './ProjectsPage'
import { navigate, routes, type AppRoute } from './router'
import { templatesFor, templateSystem } from './templates'
import { TemplatesPage } from './TemplatesPage'
import { uploadNotice, useAssets } from './useAssets'
import { useProjects } from './useProjects'
import { DocumentPreview } from './DocumentPreview'

type WorkbenchRoute = Extract<AppRoute, { name: 'home' | 'projects' | 'templates' | 'assets' }>

interface WorkbenchProps {
  route: WorkbenchRoute
  user: User | null
  theme: Mode
  onToggleTheme: () => void
  onLogout: () => void
  editorMeta: Record<WorkspaceMode, WorkspaceMeta>
  onProjectRemoved: (system: WorkspaceMode, draftId: string) => void
}

interface PendingNavigation {
  system: WorkspaceMode
  path: string
}

interface Notice {
  title: string
  detail?: string
  tone: 'info' | 'error'
}

const SYSTEM_NAME: Record<WorkspaceMode, string> = {
  'markdown-card': 'Markdown 卡片',
  'freeform-slide': '自由编辑',
}

export function Workbench({ route, user, theme, onToggleTheme, onLogout, editorMeta, onProjectRemoved }: WorkbenchProps) {
  const projects = useProjects(user)
  const assets = useAssets(user)
  const usage = useMemo(() => assetUsage(assets.assets, projects.projects), [assets.assets, projects.projects])
  const [pending, setPending] = useState<PendingNavigation | null>(null)
  const [deleting, setDeleting] = useState<Draft | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const [meMenuOpen, setMeMenuOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const meMenuRef = useRef<HTMLDivElement>(null)

  const templates = useMemo(
    () => [...templatesFor('markdown-card', user), ...templatesFor('freeform-slide', user)],
    [user],
  )
  const templateCounts = {
    'markdown-card': templates.filter((template) => template.workspace === 'markdown').length,
    'freeform-slide': templates.filter((template) => template.workspace === 'freeform').length,
  }
  const counts = {
    all: projects.projects.length,
    'markdown-card': projects.projects.filter((draft) => draft.mode === 'markdown-card').length,
    'freeform-slide': projects.projects.filter((draft) => draft.mode === 'freeform-slide').length,
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!newMenuOpen && !meMenuOpen) return
    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!newMenuRef.current?.contains(target)) setNewMenuOpen(false)
      if (!meMenuRef.current?.contains(target)) setMeMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setNewMenuOpen(false)
      setMeMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [newMenuOpen, meMenuOpen])

  useEffect(() => setSideOpen(false), [route])

  /** Go to an editor, first asking before an intent would replace unsaved edits. */
  function enterEditor(system: WorkspaceMode, path: string, targetDraftId?: string) {
    const meta = editorMeta[system]
    if (targetDraftId && meta.draftId === targetDraftId) {
      navigate(routes.editor(system))
      return
    }
    if (meta.dirty) {
      setPending({ system, path })
      return
    }
    navigate(path)
  }

  const newMarkdown = (platformId = 'rednote') =>
    enterEditor('markdown-card', routes.newProject('markdown-card', { platformId }))
  const newFreeform = (width = 1080, height = 1440) =>
    enterEditor('freeform-slide', routes.newProject('freeform-slide', { width, height }))
  const openProject = (draft: Draft) =>
    enterEditor(draft.mode, routes.openProject(draft.mode, draft.id), draft.id)
  const useTemplate = (template: TemplateDefinition) => {
    const system = templateSystem(template)
    enterEditor(system, routes.fromTemplate(system, template.id))
  }

  async function duplicate(draft: Draft) {
    if (!user) return
    const input: SaveDraftInput = draft.mode === 'markdown-card'
      ? { mode: draft.mode, title: `${draft.title} 副本`, document: draft.document }
      : { mode: draft.mode, title: `${draft.title} 副本`, document: draft.document }
    try {
      await store.drafts.save(user.id, input)
      projects.reload()
      setNotice({ title: `已复制「${draft.title}」`, tone: 'info' })
    } catch (error) {
      setNotice({ title: '复制失败', detail: errorText(error, '暂时无法复制，请稍后重试'), tone: 'error' })
    }
  }

  async function confirmDelete(draft: Draft) {
    setDeleting(null)
    if (!user) return
    try {
      await store.drafts.remove(user.id, draft.id)
      const session = readLastSession(user.id)
      if (session.markdownDraftId === draft.id) updateLastSession(user.id, { markdownDraftId: null })
      if (session.freeformDraftId === draft.id) updateLastSession(user.id, { freeformDraftId: null })
      onProjectRemoved(draft.mode, draft.id)
      projects.reload()
      setNotice({ title: `已删除「${draft.title}」`, tone: 'info' })
    } catch (error) {
      setNotice({ title: '删除失败', detail: errorText(error, '暂时无法删除，请稍后重试'), tone: 'error' })
    }
  }

  function uploadAssets(files: File[]) {
    if (!user) return
    void assets.upload(files).then((outcome) => {
      const next = uploadNotice(outcome)
      if (next) setNotice(next)
    })
  }

  function renameAsset(asset: Asset, name: string) {
    assets.rename(asset, name).catch((error: unknown) => {
      setNotice({ title: '重命名失败', detail: errorText(error, '暂时无法重命名，请稍后重试'), tone: 'error' })
    })
  }

  function deleteAsset(asset: Asset) {
    assets.remove(asset).then(
      () => setNotice({ title: `已删除「${asset.name}」`, tone: 'info' }),
      (error: unknown) => setNotice({ title: '删除失败', detail: errorText(error, '暂时无法删除，请稍后重试'), tone: 'error' }),
    )
  }

  const paletteActions: PaletteAction[] = [
    { id: 'new-md', label: '新建 Markdown 卡片', hint: '小红书', icon: 'markdown', run: () => newMarkdown() },
    { id: 'new-ff', label: '新建自由编辑', hint: '3:4', icon: 'freeform', run: () => newFreeform() },
    { id: 'projects', label: '打开我的项目', icon: 'projects', run: () => navigate(routes.projects()) },
    { id: 'templates', label: '打开模板中心', icon: 'templates', run: () => navigate(routes.templates()) },
    { id: 'assets', label: '打开素材库', icon: 'assets', run: () => navigate(routes.assets) },
    { id: 'theme', label: theme === 'dark' ? '切换到浅色模式' : '切换到深色模式', icon: 'theme', run: onToggleTheme },
  ]

  const navCurrent = (name: WorkbenchRoute['name'], system?: WorkspaceMode | null) => {
    if (route.name !== name) return undefined
    if (name === 'projects' && route.name === 'projects' && system !== undefined && route.system !== system) return undefined
    return 'page' as const
  }

  return (
    <div className={sideOpen ? 'wb is-side-open' : 'wb'} data-testid="workbench">
      <aside className="wb-side" aria-label="主导航">
        <div className="wb-brand"><img src={logoUrl} alt="" width="28" height="28" />叮卡</div>

        <div className="wb-new" ref={newMenuRef}>
          <button
            className="accent wb-new-btn"
            type="button"
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            onClick={() => setNewMenuOpen((open) => !open)}
            data-testid="new-project"
          >
            <span><PlusIcon />新建项目</span>
            <ChevronDownIcon />
          </button>
          {newMenuOpen && (
            <div className="menu wb-new-menu" role="menu">
              <button role="menuitem" type="button" onClick={() => { setNewMenuOpen(false); newMarkdown() }}>
                <span className="sys-tile sys-tile-md"><MarkdownMarkIcon /></span>
                <span><b>Markdown 卡片</b><small>写长文，自动分页成一组卡片</small></span>
              </button>
              <button role="menuitem" type="button" onClick={() => { setNewMenuOpen(false); newFreeform() }}>
                <span className="sys-tile sys-tile-ff"><FreeformMarkIcon /></span>
                <span><b>自由编辑</b><small>像做海报一样自由排版</small></span>
              </button>
            </div>
          )}
        </div>

        <nav className="wb-nav">
          <a href={`#${routes.home}`} aria-current={navCurrent('home')}><HomeIcon />首页</a>
          <a href={`#${routes.projects()}`} aria-current={navCurrent('projects', null)}>
            <ProjectsIcon />我的项目<span className="count tnum">{counts.all || ''}</span>
          </a>
          <a className="sub" href={`#${routes.projects('markdown-card')}`} aria-current={navCurrent('projects', 'markdown-card')}>
            <span className="sys-dot md" aria-hidden="true" />Markdown 卡片<span className="count tnum">{counts['markdown-card'] || ''}</span>
          </a>
          <a className="sub" href={`#${routes.projects('freeform-slide')}`} aria-current={navCurrent('projects', 'freeform-slide')}>
            <span className="sys-dot ff" aria-hidden="true" />自由编辑<span className="count tnum">{counts['freeform-slide'] || ''}</span>
          </a>
          <a href={`#${routes.templates()}`} aria-current={navCurrent('templates')}><TemplatesIcon />模板中心</a>
          <a href={`#${routes.assets}`} aria-current={navCurrent('assets')}>
            <AssetsIcon />素材库<span className="count tnum">{assets.assets.length || ''}</span>
          </a>
        </nav>

        {projects.projects.length > 0 && (
          <div className="wb-recent">
            <div className="wb-label">最近打开</div>
            {projects.projects.slice(0, 3).map((draft) => (
              <button key={draft.id} type="button" className="wb-recent-item" onClick={() => openProject(draft)}>
                <span className="wb-recent-thumb"><DocumentPreview source={projectSource(draft)} width={22} /></span>
                <span className="wb-recent-title">{draft.title}</span>
              </button>
            ))}
          </div>
        )}

        <div className="wb-foot">
          {user ? (
            <div className="wb-me" ref={meMenuRef}>
              {meMenuOpen && (
                <div className="menu wb-me-menu" role="menu">
                  <div className="wb-me-head">
                    <b>{user.username}</b>
                    <span>{store.remote ? '服务器账号 · 多设备同步' : '本地账号 · 数据只存在这台设备'}</span>
                  </div>
                  <button role="menuitem" type="button" onClick={() => { setMeMenuOpen(false); onToggleTheme() }}>
                    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}{theme === 'dark' ? '切换到浅色' : '切换到深色'}
                  </button>
                  <button role="menuitem" type="button" onClick={() => { setMeMenuOpen(false); onLogout() }} data-testid="workbench-logout">
                    <LogoutIcon />退出登录
                  </button>
                </div>
              )}
              <button
                className="wb-me-btn"
                type="button"
                aria-haspopup="menu"
                aria-expanded={meMenuOpen}
                aria-label={`账号菜单（${user.username}）`}
                onClick={() => setMeMenuOpen((open) => !open)}
              >
                <span className="wb-avatar" aria-hidden="true">{user.username.slice(0, 1)}</span>
                <span className="wb-who"><b>{user.username}</b><span>{store.remote ? '服务器账号' : '本地账号'}</span></span>
                <MoreIcon />
              </button>
            </div>
          ) : (
            <div className="wb-guest">
              <p>现在是访客模式，项目不会被保存。</p>
              <button className="accent" type="button" onClick={() => navigate(routes.login)} data-testid="workbench-login">登录或注册</button>
            </div>
          )}
        </div>
      </aside>
      {sideOpen && <div className="wb-scrim" onClick={() => setSideOpen(false)} aria-hidden="true" />}

      <div className="wb-main">
        <header className="wb-top" data-testid="workbench-topbar">
          <button className="icon-btn wb-menu-btn" type="button" aria-label="打开导航" onClick={() => setSideOpen(true)}>
            <ProjectsIcon />
          </button>
          <button className="wb-search" type="button" onClick={() => setPaletteOpen(true)} data-testid="open-palette">
            <SearchIcon /><span>搜索项目、模板和操作</span><kbd>⌘K</kbd>
          </button>
          <span className="grow" />
          <button className="icon-btn" type="button" aria-label="切换深浅色" onClick={onToggleTheme}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </header>

        {notice && (
          <OperationNotice
            className="operation-notice--workbench"
            title={notice.title}
            detail={notice.detail}
            tone={notice.tone}
            onDismiss={() => setNotice(null)}
          />
        )}

        <div className="wb-scroll">
          {route.name === 'home' && (
            <HomePage
              user={user}
              projects={projects}
              assets={assets}
              onUploadAssets={uploadAssets}
              templateCounts={templateCounts}
              onNewMarkdown={newMarkdown}
              onNewFreeform={newFreeform}
              onOpenProject={openProject}
              onUseTemplate={useTemplate}
              onDuplicate={duplicate}
              onDelete={setDeleting}
            />
          )}
          {route.name === 'projects' && (
            <ProjectsPage
              user={user}
              system={route.system}
              projects={projects}
              onNewMarkdown={() => newMarkdown()}
              onNewFreeform={() => newFreeform()}
              onOpenProject={openProject}
              onDuplicate={duplicate}
              onDelete={setDeleting}
            />
          )}
          {route.name === 'templates' && (
            <TemplatesPage user={user} system={route.system} onUseTemplate={useTemplate} />
          )}
          {route.name === 'assets' && (
            <AssetsPage user={user} assets={assets} usage={usage} onUpload={uploadAssets} onRename={renameAsset} onDelete={deleteAsset} />
          )}
        </div>
      </div>

      {paletteOpen && (
        <CommandPalette
          projects={projects.projects}
          templates={templates}
          actions={paletteActions}
          onOpenProject={openProject}
          onUseTemplate={useTemplate}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={`${SYSTEM_NAME[pending.system]}里还有未保存的修改`}
          body={`「${editorMeta[pending.system].title || '未命名'}」自上次保存后有改动。继续的话，这些改动会被丢掉。`}
          confirmLabel="丢掉改动，继续"
          cancelLabel="回去保存"
          danger
          onCancel={() => {
            const system = pending.system
            setPending(null)
            navigate(routes.editor(system))
          }}
          onConfirm={() => {
            const path = pending.path
            setPending(null)
            navigate(path)
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`删除「${deleting.title}」？`}
          body="删除后无法恢复。"
          confirmLabel="删除"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </div>
  )
}
