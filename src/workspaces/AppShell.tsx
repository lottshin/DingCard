import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import logoUrl from '../logo.svg'
import { AuthModal } from '../AuthModal'
import { AssetDrawer } from '../app/AssetDrawer'
import { readGuest, writeGuest } from '../app/guest'
import { LoginPage } from '../app/LoginPage'
import { navigate, routes, useRoute, type EditIntent } from '../app/router'
import { findTemplate } from '../app/templates'
import { Workbench } from '../app/Workbench'
import type { User } from '../auth'
import { readLastSession, updateLastSession } from '../lastSession'
import { store } from '../storage'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'
import { useAppTheme } from '../useAppTheme'
import { AppHeader } from './AppHeader'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import { OperationNotice } from './OperationNotice'
import type { WorkspaceMeta, WorkspaceMode, WorkspaceRequest } from './types'

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

const EMPTY_META: WorkspaceMeta = { title: '', draftId: null, dirty: false }

function sameMeta(a: WorkspaceMeta, b: WorkspaceMeta) {
  return a.title === b.title && a.draftId === b.draftId && a.dirty === b.dirty
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export function AppShell() {
  const route = useRoute()
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
  // 刷新恢复：只在首屏会话确认时恢复一次工作区；用户在本页内手动切换过就不再抢。
  const sessionModeRestoredRef = useRef(false)
  const modeTouchedRef = useRef(false)
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
  const editorRoute = route.name === 'edit'
  // Editors mount on first visit and then stay mounted, so leaving for the
  // workbench (or switching editors) never drops unsaved work.
  const [editorsMounted, setEditorsMounted] = useState(editorRoute)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const userRef = useRef(user)
  userRef.current = user

  const setGuest = useCallback((value: boolean) => {
    writeGuest(value)
    setGuestState(value)
  }, [])

  const changeWorkspaceMode = useCallback((next: WorkspaceMode) => {
    modeTouchedRef.current = true
    setWorkspaceMode(next)
    if (location.hash.startsWith('#/edit')) navigate(routes.editor(next), { replace: true })
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

  useEffect(() => {
    if (editorRoute) setEditorsMounted(true)
  }, [editorRoute])

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
    if (!system) return
    modeTouchedRef.current = true
    setWorkspaceMode(system)
    const intent: EditIntent | null = route.intent
    if (!intent) return
    if (intent.kind === 'open') sendRequest(system, { kind: 'open', draftId: intent.draftId })
    else if (intent.kind === 'new') {
      sendRequest(system, { kind: 'new', platformId: intent.platformId, width: intent.width, height: intent.height })
    } else {
      const template = findTemplate(system, intent.templateId, userRef.current)
      if (template) sendRequest(system, { kind: 'template', template })
    }
    navigate(routes.editor(system), { replace: true })
  }, [route, sendRequest, setGuest])

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
      '[data-testid="account-login"], [data-testid="account-logout"], [data-testid="account-status-retry"]',
    ) ?? null
    if (focusRestorableTarget(accountControl)) return
    focusRestorableTarget(
      shell?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null,
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

  // 刷新后恢复上一次使用的工作区。只在首屏会话确认（checking → ready）时
  // 执行一次；页面内登录/退出不抢用户当前所在的工作区。
  useEffect(() => {
    if (sessionModeRestoredRef.current || authStatus !== 'ready') return
    sessionModeRestoredRef.current = true
    if (!user || modeTouchedRef.current) return
    setWorkspaceMode(readLastSession(user.id).mode)
  }, [authStatus, user])

  // 登录状态下持续记录当前工作区：登录、切换工作区都会同步，刷新后即可回到原处。
  // （modeTouchedRef 不参与此处——即使用户在登录前切过工作区，登录时也要把
  // 当前所在的工作区记下来。）
  useEffect(() => {
    if (user) updateLastSession(user.id, { mode: workspaceMode })
  }, [user, workspaceMode])

  async function handleLogout(): Promise<boolean> {
    const generation = ++authCheckGeneration.current
    try {
      await store.auth.logout()
      if (generation !== authCheckGeneration.current) return false
      setUser(null)
      setAuthStatus('ready')
      setAuthNotice(null)
      return true
    } catch (error) {
      if (generation !== authCheckGeneration.current) return false
      setAuthNotice({
        title: '退出登录失败',
        detail: errorMessage(error, '请稍后重试'),
        retry: false,
      })
      return false
    }
  }

  function completeLogin(nextUser: User) {
    authCheckGeneration.current += 1
    setUser(nextUser)
    setAuthStatus('ready')
    setAuthNotice(null)
    setGuest(false)
    if (route.name === 'login') navigate(routes.home, { replace: true })
  }

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
      data-workspace={workspaceMode}
      data-view={view}
      onClickCapture={captureAuthInvoker}
    >
      {view === 'splash' && (
        <div className="app-splash" aria-label="正在加载">
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
        />
      )}

      {editorsMounted && (
        <div className="editor-frame" hidden={view !== 'editor'}>
          <AppHeader
            mode={workspaceMode}
            theme={appTheme}
            user={user}
            authStatus={authStatus}
            title={editorMeta[workspaceMode].title}
            saveState={user ? (editorMeta[workspaceMode].dirty ? 'unsaved' : editorMeta[workspaceMode].draftId ? 'saved' : null) : null}
            onHome={() => navigate(routes.home)}
            assetsOpen={assetsOpen}
            onToggleAssets={() => setAssetsOpen((open) => !open)}
            onModeChange={changeWorkspaceMode}
            onToggleTheme={toggleAppTheme}
            onRequestAuth={requestAuth}
            onRetryAuth={() => void checkCurrentSession()}
            onLogout={() => void handleLogout()}
          />

          <div
            id="workspace-panel-markdown"
            className="workspace-panel"
            role="tabpanel"
            aria-labelledby="workspace-tab-markdown"
            hidden={workspaceMode !== 'markdown-card'}
          >
            <MarkdownWorkspace
              isActive={view === 'editor' && workspaceMode === 'markdown-card'}
              user={user}
              requestAuth={requestAuth}
              request={requests['markdown-card']}
              onMetaChange={onMarkdownMeta}
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
              isActive={view === 'editor' && workspaceMode === 'freeform-slide'}
              user={user}
              requestAuth={requestAuth}
              request={requests['freeform-slide']}
              onMetaChange={onFreeformMeta}
            />
          </div>

          {assetsOpen && view === 'editor' && (
            <AssetDrawer
              user={user}
              system={workspaceMode}
              onInsert={(asset) => sendRequest(workspaceMode, { kind: 'insert-asset', asset })}
              onRequestAuth={requestAuth}
              onManage={() => navigate(routes.assets)}
              onClose={() => setAssetsOpen(false)}
            />
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
