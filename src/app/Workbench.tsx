import { useEffect, useMemo, useRef, useState } from 'react'
import logoUrl from '../logo.svg'
import type { Asset } from '../assets'
import type { User } from '../auth'
import { importDraftFromJson, type Draft, type SaveDraftInput } from '../drafts'
import { setLang, useLang, useT } from '../i18n'
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
  SidebarIcon,
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
import { LanguageMenu } from './LanguageMenu'
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
  onProjectRenamed: (system: WorkspaceMode, draftId: string, title: string) => void
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

const COLLAPSED_KEY = 'dingcard.sidebar-collapsed.v1'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(COLLAPSED_KEY, '1')
    else localStorage.removeItem(COLLAPSED_KEY)
  } catch {
    // A per-browser convenience; the toggle still works for this page.
  }
}

export function Workbench({ route, user, theme, onToggleTheme, onLogout, editorMeta, onProjectRemoved, onProjectRenamed }: WorkbenchProps) {
  const t = useT()
  const lang = useLang()
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
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const meMenuRef = useRef<HTMLDivElement>(null)

  const templates = useMemo(
    () => [...templatesFor('markdown-card'), ...templatesFor('freeform-slide')],
    [],
  )
  const templateCounts = {
    'markdown-card': templates.filter((template) => template.workspace === 'markdown').length,
    'freeform-slide': templates.filter((template) => template.workspace === 'freeform').length,
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

  useEffect(() => {
    if (projects.movedTemplates === 0) return
    setNotice({
      title: t('你存过的 {n} 个模板已经放进「我的项目」', { n: projects.movedTemplates }),
      detail: t('模板改由社区共建；想复用自己的作品，在项目卡片上选「复制一份」。'),
      tone: 'info',
    })
  }, [projects.movedTemplates, t])

  function toggleCollapsed() {
    setCollapsed((current) => {
      writeCollapsed(!current)
      return !current
    })
    setNewMenuOpen(false)
    setMeMenuOpen(false)
  }

  /** Go to an editor, first asking before an intent would replace edits that can't be saved. */
  function enterEditor(system: WorkspaceMode, path: string, targetDraftId?: string) {
    const meta = editorMeta[system]
    if (targetDraftId && meta.draftId === targetDraftId) {
      navigate(routes.editor(system))
      return
    }
    if (meta.unsaved) {
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
      ? { mode: draft.mode, title: t('{title} 副本', { title: draft.title }), document: draft.document }
      : { mode: draft.mode, title: t('{title} 副本', { title: draft.title }), document: draft.document }
    try {
      await store.drafts.save(user.id, input)
      projects.reload()
      setNotice({ title: t('已复制「{title}」', { title: draft.title }), tone: 'info' })
    } catch (error) {
      setNotice({ title: t('复制失败'), detail: errorText(error, t('暂时无法复制，请稍后重试')), tone: 'error' })
    }
  }

  async function rename(draft: Draft, title: string) {
    if (!user) return
    const input: SaveDraftInput = draft.mode === 'markdown-card'
      ? { id: draft.id, mode: draft.mode, title, document: draft.document }
      : { id: draft.id, mode: draft.mode, title, document: draft.document }
    try {
      await store.drafts.save(user.id, input)
      onProjectRenamed(draft.mode, draft.id, title)
      projects.reload()
    } catch (error) {
      setNotice({ title: t('重命名失败'), detail: errorText(error, t('暂时无法重命名，请稍后重试')), tone: 'error' })
    }
  }

  /** A .json document (from the MCP tools, or exported elsewhere) becomes a project and opens. */
  async function importProject(file: File) {
    if (!user) {
      navigate(routes.login)
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      setNotice({ title: t('导入失败'), detail: t('文件读取失败，请重试'), tone: 'error' })
      return
    }
    const outcome = importDraftFromJson(text)
    if (!outcome.ok) {
      setNotice({ title: t('导入失败'), detail: t(outcome.error), tone: 'error' })
      return
    }
    try {
      const saved = await store.drafts.save(user.id, outcome.data)
      projects.reload()
      enterEditor(saved.mode, routes.openProject(saved.mode, saved.id), saved.id)
    } catch (error) {
      setNotice({ title: t('导入失败'), detail: errorText(error, t('暂时无法导入，请稍后重试')), tone: 'error' })
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
      projects.forget(draft.id)
      projects.reload()
      setNotice({ title: t('已删除「{title}」', { title: draft.title }), tone: 'info' })
    } catch (error) {
      setNotice({ title: t('删除失败'), detail: errorText(error, t('暂时无法删除，请稍后重试')), tone: 'error' })
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
      setNotice({ title: t('重命名失败'), detail: errorText(error, t('暂时无法重命名，请稍后重试')), tone: 'error' })
    })
  }

  function deleteAsset(asset: Asset) {
    assets.remove(asset).then(
      () => setNotice({ title: t('已删除「{title}」', { title: asset.name }), tone: 'info' }),
      (error: unknown) => setNotice({ title: t('删除失败'), detail: errorText(error, t('暂时无法删除，请稍后重试')), tone: 'error' }),
    )
  }

  const paletteActions: PaletteAction[] = [
    { id: 'new-md', label: t('新建 Markdown 卡片'), hint: t('小红书'), icon: 'markdown', run: () => newMarkdown() },
    { id: 'new-ff', label: t('新建自由编辑'), hint: '3:4', icon: 'freeform', run: () => newFreeform() },
    { id: 'projects', label: t('打开我的项目'), icon: 'projects', run: () => navigate(routes.projects()) },
    { id: 'templates', label: t('打开模板中心'), icon: 'templates', run: () => navigate(routes.templates()) },
    { id: 'assets', label: t('打开素材库'), icon: 'assets', run: () => navigate(routes.assets) },
    { id: 'theme', label: theme === 'dark' ? t('切换到浅色模式') : t('切换到深色模式'), icon: 'theme', run: onToggleTheme },
    { id: 'language', label: lang === 'zh' ? 'Switch to English' : t('切换到中文'), icon: 'language', run: () => setLang(lang === 'zh' ? 'en' : 'zh') },
  ]

  const navCurrent = (name: WorkbenchRoute['name']) => (route.name === name ? ('page' as const) : undefined)
  const wbClass = ['wb', sideOpen ? 'is-side-open' : '', collapsed ? 'is-collapsed' : ''].filter(Boolean).join(' ')

  return (
    <div className={wbClass} data-testid="workbench">
      <aside className="wb-side" aria-label={t('主导航')}>
        <div className="wb-brand">
          <img src={logoUrl} alt="" width="28" height="28" />
          <span className="wb-brand-name">{t('叮卡')}</span>
          <button
            className="icon-btn wb-collapse"
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('展开侧栏') : t('收起侧栏')}
            title={collapsed ? t('展开侧栏') : t('收起侧栏')}
            data-testid="sidebar-toggle"
          >
            <SidebarIcon />
          </button>
        </div>

        <div className="wb-new" ref={newMenuRef}>
          <button
            className="accent wb-new-btn"
            type="button"
            aria-haspopup="menu"
            aria-expanded={newMenuOpen}
            aria-label={collapsed ? t('新建项目') : undefined}
            title={collapsed ? t('新建项目') : undefined}
            onClick={() => setNewMenuOpen((open) => !open)}
            data-testid="new-project"
          >
            <span><PlusIcon /><span className="wb-text">{t('新建项目')}</span></span>
            <ChevronDownIcon className="wb-text" />
          </button>
          {newMenuOpen && (
            <div className="menu wb-new-menu" role="menu">
              <button role="menuitem" type="button" onClick={() => { setNewMenuOpen(false); newMarkdown() }}>
                <span className="sys-tile sys-tile-md"><MarkdownMarkIcon /></span>
                <span><b>{t('Markdown 卡片')}</b><small>{t('写长文，自动分页成一组卡片')}</small></span>
              </button>
              <button role="menuitem" type="button" onClick={() => { setNewMenuOpen(false); newFreeform() }}>
                <span className="sys-tile sys-tile-ff"><FreeformMarkIcon /></span>
                <span><b>{t('自由编辑')}</b><small>{t('像做海报一样自由排版')}</small></span>
              </button>
            </div>
          )}
        </div>

        <nav className="wb-nav" aria-label={t('工作台导航')}>
          {[
            { name: 'home' as const, href: routes.home, icon: <HomeIcon />, label: t('首页'), count: 0 },
            { name: 'projects' as const, href: routes.projects(), icon: <ProjectsIcon />, label: t('我的项目'), count: projects.projects.length },
            { name: 'templates' as const, href: routes.templates(), icon: <TemplatesIcon />, label: t('模板中心'), count: 0 },
            { name: 'assets' as const, href: routes.assets, icon: <AssetsIcon />, label: t('素材库'), count: assets.assets.length },
          ].map((item) => (
            <a key={item.name} href={`#${item.href}`} aria-current={navCurrent(item.name)} title={collapsed ? item.label : undefined}>
              {item.icon}
              <span className="wb-text">{item.label}</span>
              {item.count > 0 && <span className="count tnum">{item.count}</span>}
            </a>
          ))}
        </nav>

        {projects.projects.length > 0 && (
          <div className="wb-recent">
            <div className="wb-label">{t('最近打开')}</div>
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
                    <span>{store.remote ? t('服务器账号 · 多设备同步') : t('本地账号 · 数据只存在这台设备')}</span>
                  </div>
                  <div className="menu-sep" role="separator" />
                  <button role="menuitem" type="button" onClick={() => { setMeMenuOpen(false); onLogout() }} data-testid="workbench-logout">
                    <LogoutIcon />{t('退出登录')}
                  </button>
                </div>
              )}
              <button
                className="wb-me-btn"
                type="button"
                aria-haspopup="menu"
                aria-expanded={meMenuOpen}
                aria-label={t('账号菜单（{name}）', { name: user.username })}
                onClick={() => setMeMenuOpen((open) => !open)}
              >
                <span className="wb-avatar" aria-hidden="true">{user.username.slice(0, 1)}</span>
                <span className="wb-who wb-text"><b>{user.username}</b><span>{store.remote ? t('服务器账号') : t('本地账号')}</span></span>
                <MoreIcon className="wb-text" />
              </button>
            </div>
          ) : (
            <div className="wb-guest">
              <button
                className="accent"
                type="button"
                onClick={() => navigate(routes.login)}
                data-testid="workbench-login"
                title={collapsed ? t('登录或注册') : undefined}
              >
                {collapsed ? <LogoutIcon /> : t('登录或注册')}
              </button>
            </div>
          )}
        </div>
      </aside>
      {sideOpen && <div className="wb-scrim" onClick={() => setSideOpen(false)} aria-hidden="true" />}

      <div className="wb-main">
        <header className="wb-top" data-testid="workbench-topbar">
          <button className="icon-btn wb-menu-btn" type="button" aria-label={t('打开导航')} onClick={() => setSideOpen(true)}>
            <SidebarIcon />
          </button>
          <button className="wb-search" type="button" onClick={() => setPaletteOpen(true)} data-testid="open-palette">
            <SearchIcon /><span>{t('搜索项目、模板和操作')}</span><kbd>⌘K</kbd>
          </button>
          <span className="grow" />
          <LanguageMenu />
          <button
            className="icon-btn wb-theme"
            type="button"
            aria-label={t('切换深浅色')}
            title={theme === 'dark' ? t('切换到浅色模式') : t('切换到深色模式')}
            onClick={onToggleTheme}
          >
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
              onRename={(draft, title) => void rename(draft, title)}
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
              onImport={(file) => void importProject(file)}
              onOpenProject={openProject}
              onDuplicate={duplicate}
              onRename={(draft, title) => void rename(draft, title)}
              onDelete={setDeleting}
            />
          )}
          {route.name === 'templates' && (
            <TemplatesPage system={route.system} onUseTemplate={useTemplate} />
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
          title={t('{system}里还有没保存的修改', { system: t(SYSTEM_NAME[pending.system]) })}
          body={user
            ? t('「{title}」最近的修改没能保存。继续的话，这些改动会被丢掉。', { title: editorMeta[pending.system].title || t('未命名') })
            : t('访客模式不会保存「{title}」。继续的话，这些改动会被丢掉；登录后编辑的内容会自动保存。', { title: editorMeta[pending.system].title || t('未命名') })}
          confirmLabel={t('丢掉改动，继续')}
          cancelLabel={t('回去看看')}
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
          title={t('删除「{title}」？', { title: deleting.title })}
          body={t('删除后无法恢复。')}
          confirmLabel={t('删除')}
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete(deleting)}
        />
      )}
    </div>
  )
}
