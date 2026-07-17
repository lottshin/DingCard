import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AuthModal } from '../AuthModal'
import type { User } from '../auth'
import { store } from '../storage'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'
import { useAppTheme } from '../useAppTheme'
import { AppHeader } from './AppHeader'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import { OperationNotice } from './OperationNotice'
import type { WorkspaceMode } from './types'

interface AuthNotice {
  title: string
  detail?: string
  retry: boolean
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export function AppShell() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')
  const [appTheme, toggleAppTheme] = useAppTheme()
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready' | 'error'>('checking')
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null)
  const authCheckGeneration = useRef(0)
  const authOpenerRef = useRef<HTMLElement | null>(null)
  const authWasOpenRef = useRef(false)

  const requestAuth = useCallback(() => {
    const activeElement = document.activeElement
    authOpenerRef.current =
      activeElement instanceof HTMLElement && activeElement.isConnected ? activeElement : null
    setShowAuth(true)
  }, [])

  useLayoutEffect(() => {
    const authWasOpen = authWasOpenRef.current
    authWasOpenRef.current = showAuth
    if (!authWasOpen || showAuth) return

    const opener = authOpenerRef.current
    authOpenerRef.current = null
    if (opener?.isConnected) opener.focus()
  }, [showAuth])

  const checkCurrentSession = useCallback(async () => {
    const generation = ++authCheckGeneration.current
    setAuthStatus('checking')
    try {
      const nextUser = await store.auth.current()
      if (generation !== authCheckGeneration.current) return
      setUser(nextUser)
      setAuthStatus('ready')
      setAuthNotice(null)
    } catch (error) {
      if (generation !== authCheckGeneration.current) return
      setAuthStatus('error')
      setAuthNotice({
        title: '登录状态尚未确认',
        detail: errorMessage(error, '暂时无法连接服务器，请稍后重试'),
        retry: true,
      })
    }
  }, [])

  // Load the current session (async so the remote backend can verify the token
  // against /api/auth/me; the local backend resolves immediately).
  useEffect(() => {
    const unsubscribe = store.auth.onInvalidated(() => {
      authCheckGeneration.current += 1
      setUser(null)
      setAuthStatus('ready')
      setShowAuth(false)
      setAuthNotice({
        title: '登录已过期，请重新登录',
        retry: false,
      })
    })

    void checkCurrentSession()
    return () => {
      authCheckGeneration.current += 1
      unsubscribe()
    }
  }, [checkCurrentSession])

  async function handleLogout() {
    const generation = ++authCheckGeneration.current
    try {
      await store.auth.logout()
      if (generation !== authCheckGeneration.current) return
      setUser(null)
      setAuthStatus('ready')
      setAuthNotice(null)
    } catch (error) {
      if (generation !== authCheckGeneration.current) return
      setAuthNotice({
        title: '退出登录失败',
        detail: errorMessage(error, '请稍后重试'),
        retry: false,
      })
    }
  }

  return (
    <div className="app-shell" data-workspace={workspaceMode}>
      <AppHeader
        mode={workspaceMode}
        theme={appTheme}
        user={user}
        authStatus={authStatus}
        onModeChange={setWorkspaceMode}
        onToggleTheme={toggleAppTheme}
        onRequestAuth={requestAuth}
        onRetryAuth={() => void checkCurrentSession()}
        onLogout={() => void handleLogout()}
      />

      {authNotice && (
        <OperationNotice
          className="operation-notice--global"
          title={authNotice.title}
          detail={authNotice.detail}
          onDismiss={() => setAuthNotice(null)}
          onRetry={authNotice.retry ? () => void checkCurrentSession() : undefined}
        />
      )}

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
          requestAuth={requestAuth}
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
          requestAuth={requestAuth}
        />
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={(nextUser) => {
            authCheckGeneration.current += 1
            setUser(nextUser)
            setAuthStatus('ready')
            setAuthNotice(null)
            setShowAuth(false)
          }}
        />
      )}
    </div>
  )
}
