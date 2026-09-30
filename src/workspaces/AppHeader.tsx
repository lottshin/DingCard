import { useRef } from 'react'
import logoUrl from '../logo.svg'
import type { User } from '../auth'
import type { Mode } from '../useAppTheme'
import { AssetsIcon, CheckIcon, ChevronLeftIcon, FreeformMarkIcon, MarkdownMarkIcon, MoonIcon, SunIcon } from '../ui/icons'
import type { WorkspaceMode } from './types'

interface AppHeaderProps {
  mode: WorkspaceMode
  theme: Mode
  user: User | null
  authStatus: 'checking' | 'ready' | 'error'
  /** Title of the project open in the active editor. */
  title: string
  /** Whether the open project has changes that are not saved yet; null when saving does not apply. */
  saveState: 'saved' | 'unsaved' | null
  onHome: () => void
  /** The asset library drawer beside the editors. */
  assetsOpen: boolean
  onToggleAssets: () => void
  onModeChange: (mode: WorkspaceMode) => void
  onToggleTheme: () => void
  onRequestAuth: () => void
  onRetryAuth: () => void
  onLogout: () => void
}

export function AppHeader({
  mode,
  theme,
  user,
  authStatus,
  title,
  saveState,
  onHome,
  assetsOpen,
  onToggleAssets,
  onModeChange,
  onToggleTheme,
  onRequestAuth,
  onRetryAuth,
  onLogout,
}: AppHeaderProps) {
  const markdownTabRef = useRef<HTMLButtonElement>(null)
  const freeformTabRef = useRef<HTMLButtonElement>(null)

  function selectWorkspaceTab(nextMode: WorkspaceMode) {
    onModeChange(nextMode)
    const nextTab = nextMode === 'markdown-card' ? markdownTabRef : freeformTabRef
    nextTab.current?.focus()
  }

  function handleWorkspaceTabKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let nextMode: WorkspaceMode

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        nextMode = mode === 'markdown-card' ? 'freeform-slide' : 'markdown-card'
        break
      case 'Home':
        nextMode = 'markdown-card'
        break
      case 'End':
        nextMode = 'freeform-slide'
        break
      default:
        return
    }

    event.preventDefault()
    event.stopPropagation()
    selectWorkspaceTab(nextMode)
  }

  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-brand">
        <button className="app-home" type="button" onClick={onHome} data-testid="editor-home" title="返回工作台">
          <ChevronLeftIcon className="app-home-chevron" />
          <img className="app-brand-logo" src={logoUrl} alt="" width="24" height="24" />
          <strong className="app-brand-name">工作台</strong>
        </button>
        {title && (
          <>
            <span className="app-title-sep" aria-hidden="true">/</span>
            <span className="app-doc-title" title={title} data-testid="editor-title">{title}</span>
            {saveState && (
              <span className={`app-save-state is-${saveState}`} data-testid="editor-save-state">
                {saveState === 'saved' ? <CheckIcon /> : <span className="app-save-dot" aria-hidden="true" />}
                {saveState === 'saved' ? '已保存' : '未保存'}
              </span>
            )}
          </>
        )}
      </div>

      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="工作区"
        onKeyDown={handleWorkspaceTabKeyDown}
      >
        <button
          ref={markdownTabRef}
          id="workspace-tab-markdown"
          className="workspace-tab"
          type="button"
          role="tab"
          data-testid="workspace-tab-markdown"
          aria-controls="workspace-panel-markdown"
          aria-selected={mode === 'markdown-card'}
          tabIndex={mode === 'markdown-card' ? 0 : -1}
          onClick={() => onModeChange('markdown-card')}
        >
          <MarkdownMarkIcon className="tab-mark sys-md" />
          Markdown 卡片
        </button>
        <button
          ref={freeformTabRef}
          id="workspace-tab-freeform"
          className="workspace-tab"
          type="button"
          role="tab"
          data-testid="workspace-tab-freeform"
          aria-controls="workspace-panel-freeform"
          aria-selected={mode === 'freeform-slide'}
          tabIndex={mode === 'freeform-slide' ? 0 : -1}
          onClick={() => onModeChange('freeform-slide')}
        >
          <FreeformMarkIcon className="tab-mark sys-ff" />
          自由编辑
        </button>
      </div>

      <div className="app-header-actions">
        <button
          className="app-assets"
          type="button"
          data-testid="editor-assets"
          aria-pressed={assetsOpen}
          aria-label="素材库"
          title="素材库：插入常用图片"
          onClick={onToggleAssets}
        >
          <AssetsIcon />
          <span className="app-assets-label" aria-hidden="true">素材库</span>
        </button>
        <button
          className="app-header-icon"
          type="button"
          data-testid="theme-toggle"
          aria-label="切换深浅色"
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        {user ? (
          <button
            className="app-account app-account-user"
            type="button"
            data-testid="account-logout"
            aria-label={`退出登录（${user.username}）`}
            title={`退出登录（${user.username}）`}
            onClick={onLogout}
          >
            <span className="app-account-avatar" aria-hidden="true">
              {user.username.slice(0, 1)}
            </span>
          </button>
        ) : authStatus === 'checking' ? (
          <span
            className="app-account app-account-status"
            data-testid="account-status"
            aria-label="正在检查登录状态"
          >
            检查中
          </span>
        ) : authStatus === 'error' ? (
          <button
            className="app-account app-account-status app-account-status-retry"
            type="button"
            data-testid="account-status-retry"
            title="重新检查登录状态"
            onClick={onRetryAuth}
          >
            待确认
          </button>
        ) : (
          <button
            className="app-account app-account-login"
            type="button"
            data-testid="account-login"
            title="登录账户"
            onClick={onRequestAuth}
          >
            登录
          </button>
        )}
      </div>
    </header>
  )
}
