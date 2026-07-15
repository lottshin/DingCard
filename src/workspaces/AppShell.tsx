import { useEffect, useState } from 'react'
import { AuthModal } from '../AuthModal'
import type { User } from '../auth'
import { store } from '../storage'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'
import { useAppTheme } from '../useAppTheme'
import { AppHeader } from './AppHeader'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import type { WorkspaceMode } from './types'

export function AppShell() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')
  const [appTheme, toggleAppTheme] = useAppTheme()
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  // Load the current session (async so the remote backend can verify the token
  // against /api/auth/me; the local backend resolves immediately).
  useEffect(() => {
    let alive = true
    store.auth.current().then((u) => {
      if (alive) setUser(u)
    })
    return () => {
      alive = false
    }
  }, [])

  function handleLogout() {
    store.auth.logout().then(() => setUser(null))
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
