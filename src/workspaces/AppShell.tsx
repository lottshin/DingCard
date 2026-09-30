import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import logoUrl from '../logo.svg'
import { AuthModal } from '../AuthModal'
import { readGuest, writeGuest } from '../app/guest'
import { LoginPage } from '../app/LoginPage'
import { navigate, routes, useRoute, type EditIntent } from '../app/router'
import { findTemplate } from '../app/templates'
import { t, useLang } from '../i18n'
import { Workbench } from '../app/Workbench'
import type { User } from '../auth'
import { readLastSession, updateLastSession } from '../lastSession'
import { store } from '../storage'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'
import { useAppTheme } from '../useAppTheme'
import { flushAllAutosaves } from './autosave'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import { OperationNotice } from './OperationNotice'
import type { EditorChrome, WorkspaceMeta, WorkspaceMode, WorkspaceRequest } from './types'

interface AuthNotice {
  title: string
  detail?: string
  retry: boolean
}

const INTERACTION_CONTROL_SELECTOR = 'button,a,input,select,textarea,[tabindex]'

function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  if (
    !target?.isConnected ||
    target.tabIndex < 0 ||
    target.matches(':disabled, [aria-disabled="true"]') ||
    target.closest('[inert], [hidden], [aria-hidden="true"]')
  ) return false

  const style = window.getComputedStyle(target)
  return (
    target.getClientRects().length > 0 &&
    style.display !== 'none' &&
    style.visibility === 'visible'
  )
}

function focusRestorableTarget(target: HTMLElement | null): boolean {
  if (!canRestoreFocus(target)) return false
  target.focus()
  return document.activeElement === target
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

const EMPTY_META: WorkspaceMeta = { title: '', draftId: null, unsaved: false }

function sameMeta(a: WorkspaceMeta, b: WorkspaceMeta) {
  return a.title === b.title && a.draftId === b.draftId && a.unsaved === b.unsaved
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? t(error.message) : fallback
}

export function AppShell() {
  // Re-render the whole app when the UI language changes.
  useLang()
  const route = useRoute()
  // The editor on screen (or last on screen, while the workbench is up).
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    () => (route.name === 'edit' && route.system) || 'markdown-card',
  )
  const [appTheme, toggleAppTheme] = useAppTheme()
  const [user, setUser] = useState<User | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready' | 'error'>('checking')
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(null)
  const authCheckGeneration = useRef(0)
  const shellRef = useRef<HTMLDivElement>(null)
  const authOpenerRef = useRef<HTMLElement | null>(null)
  const authWasOpenRef = useRef(false)
  const authOpenRef = useRef(false)
  const pendingAuthInvokerRef = useRef<HTMLElement | null>(null)
  const pendingAuthInvokerGeneration = useRef(0)
  const [guest, setGuestState] = useState(readGuest)
  const [requests, setRequests] = useState<Record<WorkspaceMode, WorkspaceRequest | null>>({
    'markdown-card': null,
    'freeform-slide': null,
  })
  const requestNonceRef = useRef(0)
  const [editorMeta, setEditorMeta] = useState<Record<WorkspaceMode, WorkspaceMeta>>({
    'markdown-card': EMPTY_META,
    'freeform-slide': EMPTY_META,
  })
  const editorRoute = route.name === 'edit' && route.system !== null
  // Each editor mounts on its first visit and then stays mounted, so a trip to
  // the workbench never drops a guest's work.
  const [mounted, setMounted] = useState<Record<WorkspaceMode, boolean>>(() => ({
    'markdown-card': route.name === 'edit' && route.system === 'markdown-card',
    'freeform-slide': route.name === 'edit' && route.system === 'freeform-slide',
  }))
  const userRef = useRef(user)
  userRef.current = user
  const workspaceModeRef = useRef(workspaceMode)
  workspaceModeRef.current = workspaceMode
  // The editor to show follows the URL in the same render: an effect would leave
  // the previous editor active (and listening for keys) for a frame.
  const routeSystem = route.name === 'edit' ? route.system : null
  const activeSystem: WorkspaceMode = routeSystem ?? workspaceMode
  const isMounted = (system: WorkspaceMode) => mounted[system] || routeSystem === system

  const setGuest = useCallback((value: boolean) => {
    writeGuest(value)
    setGuestState(value)
  }, [])

  const sendRequest = useCallback((system: WorkspaceMode, request: DistributiveOmit<WorkspaceRequest, 'nonce'>) => {
    const nonce = ++requestNonceRef.current
    setRequests((current) => ({ ...current, [system]: { ...request, nonce } as WorkspaceRequest }))
  }, [])

  const onMarkdownMeta = useCallback((meta: WorkspaceMeta) => {
    setEditorMeta((current) => (sameMeta(current['markdown-card'], meta) ? current : { ...current, 'markdown-card': meta }))
  }, [])
  const onFreeformMeta = useCallback((meta: WorkspaceMeta) => {
    setEditorMeta((current) => (sameMeta(current['freeform-slide'], meta) ? current : { ...current, 'freeform-slide': meta }))
  }, [])

  // Editor URLs carry a one-shot intent (open / new / template); hand it to the
  // editor, then settle on the plain #/edit/<system> URL.
  useEffect(() => {
    if (route.name === 'login' && userRef.current) {
      navigate(routes.home, { replace: true })
      return
    }
    if (route.name !== 'edit') return
    if (!userRef.current && !readGuest()) setGuest(true)
    const system = route.system
    if (!system) {
      // Bare #/edit: the editor used last.
      const last = userRef.current ? readLastSession(userRef.current.id).mode : workspaceModeRef.current
      navigate(routes.editor(last), { replace: true })
      return
    }
    setWorkspaceMode(system)
    setMounted((current) => (current[system] ? current : { ...current, [system]: true }))
    if (userRef.current) updateLastSession(userRef.current.id, { mode: system })
    const intent: EditIntent | null = route.intent
    if (!intent) return
    if (intent.kind === 'open') sendRequest(system, { kind: 'open', draftId: intent.draftId })
    else if (intent.kind === 'new') {
      sendRequest(system, { kind: 'new', platformId: intent.platformId, width: intent.width, height: intent.height })
    } else {
      const template = findTemplate(system, intent.templateId)
      if (template) sendRequest(system, { kind: 'template', template })
    }
    navigate(routes.editor(system), { replace: true })
  }, [route, sendRequest, setGuest])

  // Leaving the page: send what the editors still have queued.
  useEffect(() => {
    const flush = () => void flushAllAutosaves()
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [])

  const captureAuthInvoker = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target
    const control = target instanceof Element
      ? target.closest<HTMLElement>(INTERACTION_CONTROL_SELECTOR)
      : null
    if (!control || !event.currentTarget.contains(control)) return

    const generation = ++pendingAuthInvokerGeneration.current
    pendingAuthInvokerRef.current = control
    window.setTimeout(() => {
      if (pendingAuthInvokerGeneration.current === generation) {
        pendingAuthInvokerRef.current = null
      }
    }, 0)
  }, [])

  const requestAuth = useCallback(() => {
    const pendingInvoker = pendingAuthInvokerRef.current
    pendingAuthInvokerRef.current = null
    if (authOpenRef.current) return

    authOpenRef.current = true
    const activeElement = document.activeElement
    authOpenerRef.current =
      pendingInvoker?.isConnected
        ? pendingInvoker
        : activeElement instanceof HTMLElement && activeElement.isConnected
          ? activeElement
          : null
    setShowAuth(true)
  }, [])

  useLayoutEffect(() => {
    if (!showAuth) return
    const shell = shellRef.current
    if (!shell) return

    const siblingStates = Array.from(shell.children)
      .filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && !child.classList.contains('sheet-backdrop'),
      )
      .map((element) => ({
        element,
        inert: element.getAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      }))

    for (const { element } of siblingStates) {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    }

    return () => {
      for (const { element, inert, ariaHidden } of siblingStates) {
        if (inert === null) element.removeAttribute('inert')
        else element.setAttribute('inert', inert)
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      }
    }
  }, [showAuth, authNotice])

  useLayoutEffect(() => {
    const authWasOpen = authWasOpenRef.current
    authWasOpenRef.current = showAuth
    if (!authWasOpen || showAuth) return

    authOpenRef.current = false
    const opener = authOpenerRef.current
    authOpenerRef.current = null
    if (focusRestorableTarget(opener)) return

    const shell = shellRef.current
    const accountControl = shell?.querySelector<HTMLElement>(
      '[data-testid="account-login"], [data-testid="account-menu"], [data-testid="account-status-retry"]',
    ) ?? null
    if (focusRestorableTarget(accountControl)) return
    focusRestorableTarget(
      shell?.querySelector<HTMLElement>('[data-testid="editor-home"], [data-testid="open-palette"]') ?? null,
    )
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
        title: t('登录状态尚未确认'),
        detail: errorMessage(error, t('暂时无法连接服务器，请稍后重试')),
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
        title: t('登录已过期，请重新登录'),
        retry: false,
      })
    })

    void checkCurrentSession()
    return () => {
      authCheckGeneration.current += 1
      unsubscribe()
    }
  }, [checkCurrentSession])

  // Remember the editor in use once the account is known, so a bare #/edit returns to it.
  useEffect(() => {
    if (user && editorRoute) updateLastSession(user.id, { mode: activeSystem })
  }, [activeSystem, editorRoute, user])

  async function handleLogout(): Promise<boolean> {
    const generation = ++authCheckGeneration.current
    try {
      // Edits still waiting for their pause belong to the account being left.
      await flushAllAutosaves()
      await store.auth.logout()
      if (generation !== authCheckGeneration.current) return false
      setUser(null)
      setAuthStatus('ready')
      setAuthNotice(null)
      return true
    } catch (error) {
      if (generation !== authCheckGeneration.current) return false
      setAuthNotice({
        title: t('退出登录失败'),
        detail: errorMessage(error, t('请稍后重试')),
        retry: false,
      })
      return false
    }
  }

  const logoutRef = useRef(handleLogout)
  logoutRef.current = handleLogout

  function completeLogin(nextUser: User) {
    authCheckGeneration.current += 1
    setUser(nextUser)
    setAuthStatus('ready')
    setAuthNotice(null)
    setGuest(false)
    if (route.name === 'login') navigate(routes.home, { replace: true })
  }

  const chrome = useMemo<EditorChrome>(() => ({
    theme: appTheme,
    authStatus,
    onHome: () => navigate(routes.home),
    onToggleTheme: toggleAppTheme,
    onRetryAuth: () => void checkCurrentSession(),
    onLogout: () => void logoutRef.current(),
  }), [appTheme, authStatus, checkCurrentSession, toggleAppTheme])

  const view: 'editor' | 'workbench' | 'login' | 'splash' = editorRoute
    ? 'editor'
    : route.name === 'login'
      ? user ? 'workbench' : 'login'
      : user || guest
        ? 'workbench'
        : authStatus === 'checking'
          ? 'splash'
          : 'login'

  return (
    <div
      ref={shellRef}
      className="app-shell"
      data-workspace={activeSystem}
      data-view={view}
      onClickCapture={captureAuthInvoker}
    >
      {view === 'splash' && (
        <div className="app-splash" aria-label={t('正在加载')}>
          <img src={logoUrl} alt="" width="40" height="40" />
        </div>
      )}

      {view === 'login' && (
        <LoginPage onAuthed={completeLogin} onGuest={() => setGuest(true)} />
      )}

      {view === 'workbench' && route.name !== 'edit' && route.name !== 'login' && (
        <Workbench
          route={route}
          user={user}
          theme={appTheme}
          onToggleTheme={toggleAppTheme}
          onLogout={() => {
            void handleLogout().then((loggedOut) => {
              if (loggedOut) setGuest(false)
            })
          }}
          editorMeta={editorMeta}
          onProjectRemoved={(system, draftId) => sendRequest(system, { kind: 'removed', draftId })}
          onProjectRenamed={(system, draftId, title) => sendRequest(system, { kind: 'renamed', draftId, title })}
        />
      )}

      {(isMounted('markdown-card') || isMounted('freeform-slide')) && (
        <div className="editor-frame" hidden={view !== 'editor'}>
          {isMounted('markdown-card') && (
            <div
              id="workspace-panel-markdown"
              className="workspace-panel"
              data-testid="workspace-markdown"
              hidden={activeSystem !== 'markdown-card'}
            >
              <MarkdownWorkspace
                isActive={view === 'editor' && activeSystem === 'markdown-card'}
                user={user}
                requestAuth={requestAuth}
                chrome={chrome}
                request={requests['markdown-card']}
                onMetaChange={onMarkdownMeta}
              />
            </div>
          )}
          {isMounted('freeform-slide') && (
            <div
              id="workspace-panel-freeform"
              className="workspace-panel"
              data-testid="workspace-freeform"
              hidden={activeSystem !== 'freeform-slide'}
            >
              <FreeformWorkspace
                isActive={view === 'editor' && activeSystem === 'freeform-slide'}
                user={user}
                requestAuth={requestAuth}
                chrome={chrome}
                request={requests['freeform-slide']}
                onMetaChange={onFreeformMeta}
              />
            </div>
          )}
        </div>
      )}

      {authNotice && (
        <OperationNotice
          className="operation-notice--global"
          tone="error"
          title={authNotice.title}
          detail={authNotice.detail}
          onDismiss={() => setAuthNotice(null)}
          onRetry={authNotice.retry ? () => void checkCurrentSession() : undefined}
        />
      )}

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
