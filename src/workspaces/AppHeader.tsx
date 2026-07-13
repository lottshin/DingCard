import { useRef } from 'react'
import logoUrl from '../logo.svg'
import type { User } from '../auth'
import type { Mode } from '../useAppTheme'
import type { WorkspaceMode } from './types'

interface AppHeaderProps {
  mode: WorkspaceMode
  theme: Mode
  user: User | null
  onModeChange: (mode: WorkspaceMode) => void
  onToggleTheme: () => void
  onRequestAuth: () => void
  onLogout: () => void
}

export function AppHeader({
  mode,
  theme,
  user,
  onModeChange,
  onToggleTheme,
  onRequestAuth,
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
        <img className="app-brand-logo" src={logoUrl} alt="" width="28" height="28" />
        <strong>叮卡</strong>
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
          自由编辑
        </button>
      </div>

      <div className="app-header-spacer" />

      <button
        className="app-header-icon"
        type="button"
        data-testid="theme-toggle"
        aria-label="切换深浅色"
        title={theme === 'dark' ? '切换到浅色' : '切换到深色'}
        onClick={onToggleTheme}
      >
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 12.6A8.8 8.8 0 1 1 11.4 3 7 7 0 0 0 21 12.6Z" />
          </svg>
        )}
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
          {user.username.slice(0, 1)}
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
    </header>
  )
}
