import { useState } from 'react'
import { AuthModal } from '../AuthModal'
import { current as currentUser, logout as authLogout, type User } from '../auth'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'
import { useAppTheme } from '../useAppTheme'
import { AppHeader } from './AppHeader'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import type { WorkspaceMode } from './types'

export function AppShell() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')
  const [appTheme, toggleAppTheme] = useAppTheme()
  const [user, setUser] = useState<User | null>(() => currentUser())
  const [showAuth, setShowAuth] = useState(false)

  function handleLogout() {
    authLogout()
    setUser(null)
  }

  return (
    <div className="app-shell" data-workspace={workspaceMode}>
      <AppHeader
        mode={workspaceMode}
        theme={appTheme}
        user={user}
        onModeChange={setWorkspaceMode}
        onToggleTheme={toggleAppTheme}
        onRequestAuth={() => setShowAuth(true)}
        onLogout={handleLogout}
      />

      <div
        id="workspace-panel-markdown"
        className="workspace-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-markdown"
        hidden={workspaceMode !== 'markdown-card'}
      >
        <MarkdownWorkspace
          isActive={workspaceMode === 'markdown-card'}
          user={user}
          requestAuth={() => setShowAuth(true)}
        />
      </div>
      <div
        id="workspace-panel-freeform"
        className="workspace-panel"
        role="tabpanel"
        aria-labelledby="workspace-tab-freeform"
        hidden={workspaceMode !== 'freeform-slide'}
      >
        <FreeformWorkspace
          isActive={workspaceMode === 'freeform-slide'}
          user={user}
          requestAuth={() => setShowAuth(true)}
        />
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={(nextUser) => {
            setUser(nextUser)
            setShowAuth(false)
          }}
        />
      )}
    </div>
  )
}
