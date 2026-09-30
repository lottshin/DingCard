import { useEffect, useRef, useState, type ReactNode } from 'react'
import logoUrl from '../logo.svg'
import type { User } from '../auth'
import { LanguageMenu } from '../app/LanguageMenu'
import { useDismiss } from '../app/useDismiss'
import { locale, t } from '../i18n'
import { store } from '../storage'
import {
  AlertIcon,
  ChevronLeftIcon,
  CloudCheckIcon,
  CloudOffIcon,
  DeviceCheckIcon,
  LogoutIcon,
  MoonIcon,
  PencilIcon,
  SunIcon,
} from '../ui/icons'
import type { EditorChrome, WorkspaceMode } from './types'

/** What the bar says about saving the open project. */
export type SaveState =
  | { kind: 'none' }
  | { kind: 'saving' }
  /** `onDevice`: a guest's project, kept in this browser. */
  | { kind: 'saved'; at: number; onDevice: boolean }
  | { kind: 'error'; message: string }
  /** The session ended with edits it couldn't save; they wait for that account to sign back in. */
  | { kind: 'signed-out' }

interface EditorTopBarProps {
  chrome: EditorChrome
  user: User | null
  requestAuth: () => void
  system: WorkspaceMode
  title: string
  onRename: (title: string) => void
  save: SaveState
  onRetrySave: () => void
  /** Editor tools, centred. */
  center?: ReactNode
  /** Editor controls placed before language, theme and account. */
  actions?: ReactNode
  /** The editor's main action, last in the bar. */
  primary?: ReactNode
}

function savedAtLabel(at: number): string {
  return new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
}

function ProjectTitle({ title, onRename }: { title: string; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  function finish(value: string) {
    setEditing(false)
    if (cancelRef.current) {
      cancelRef.current = false
      return
    }
    const next = value.trim()
    if (next && next !== title) onRename(next)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="editor-title-input"
        data-testid="editor-title-input"
        aria-label={t('项目名称')}
        defaultValue={title}
        maxLength={60}
        onBlur={(event) => finish(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            event.currentTarget.blur()
          } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            cancelRef.current = true
            event.currentTarget.blur()
          }
        }}
      />
    )
  }

  return (
    <button
      className="editor-title"
      type="button"
      data-testid="editor-title"
      title={t('重命名项目')}
      aria-label={t('项目名称：{title}，点击重命名', { title })}
      onClick={() => setEditing(true)}
    >
      <span className="editor-title-text">{title}</span>
      <PencilIcon className="editor-title-edit" />
    </button>
  )
}

function SaveChip({ save, onRequestAuth, onRetry }: { save: SaveState; onRequestAuth: () => void; onRetry: () => void }) {
  switch (save.kind) {
    case 'none':
      return null
    case 'signed-out':
      return (
        <button
          className="save-chip is-signed-out"
          type="button"
          data-testid="editor-save-state"
          title={t('登录已过期。重新登录后，这些修改会存回原来的项目。')}
          onClick={onRequestAuth}
        >
          <CloudOffIcon />
          <span>{t('登录后继续保存')}</span>
        </button>
      )
    case 'saving':
      return (
        <span className="save-chip is-saving" data-testid="editor-save-state" role="status">
          <span className="save-spinner" aria-hidden="true" />
          <span>{t('保存中…')}</span>
        </span>
      )
    case 'saved':
      return save.onDevice ? (
        <span
          className="save-chip is-saved is-on-device"
          data-testid="editor-save-state"
          role="status"
          title={`${t('已自动保存 · {time}', { time: savedAtLabel(save.at) })}\n${store.remote
            ? t('只保存在这台设备上。登录后可以放进账号，换一台设备也能继续编辑。')
            : t('保存在这台设备的浏览器里。')}`}
        >
          <DeviceCheckIcon />
          <span>{t('已保存到本机')}</span>
        </span>
      ) : (
        <span
          className="save-chip is-saved"
          data-testid="editor-save-state"
          role="status"
          title={t('已自动保存 · {time}', { time: savedAtLabel(save.at) })}
        >
          <CloudCheckIcon />
          <span>{t('已保存')}</span>
        </span>
      )
    case 'error':
      return (
        <span className="save-chip is-error" data-testid="editor-save-state" role="alert" title={save.message}>
          <AlertIcon />
          <span>{t('保存失败')}</span>
          <button type="button" className="save-retry" data-testid="editor-save-retry" onClick={onRetry}>
            {t('重试')}
          </button>
        </span>
      )
  }
}

function AccountControl({ chrome, user, requestAuth }: Pick<EditorTopBarProps, 'chrome' | 'user' | 'requestAuth'>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useDismiss(rootRef, open, () => setOpen(false))

  if (user) {
    return (
      <div className="editor-account" ref={rootRef}>
        <button
          className="editor-avatar-btn"
          type="button"
          data-testid="account-menu"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('账号菜单（{name}）', { name: user.username })}
          title={user.username}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="editor-avatar" aria-hidden="true">{user.username.slice(0, 1)}</span>
        </button>
        {open && (
          <div className="menu editor-account-menu" role="menu">
            <div className="editor-account-head">
              <b>{user.username}</b>
              <span>{store.remote ? t('服务器账号 · 多设备同步') : t('本地账号 · 数据只存在这台设备')}</span>
            </div>
            <button role="menuitem" type="button" onClick={() => { setOpen(false); chrome.onHome() }}>
              <ChevronLeftIcon />{t('返回工作台')}
            </button>
            <div className="menu-sep" role="separator" />
            <button
              role="menuitem"
              type="button"
              data-testid="account-logout"
              onClick={() => { setOpen(false); chrome.onLogout() }}
            >
              <LogoutIcon />{t('退出登录')}
            </button>
          </div>
        )}
      </div>
    )
  }

  if (chrome.authStatus === 'checking') {
    return (
      <span className="editor-account-status" data-testid="account-status" aria-label={t('正在检查登录状态')}>
        {t('检查中')}
      </span>
    )
  }

  if (chrome.authStatus === 'error') {
    return (
      <button
        className="editor-account-status is-retry"
        type="button"
        data-testid="account-status-retry"
        title={t('重新检查登录状态')}
        onClick={chrome.onRetryAuth}
      >
        {t('待确认')}
      </button>
    )
  }

  return (
    <button className="editor-login" type="button" data-testid="account-login" title={t('登录账户')} onClick={requestAuth}>
      {t('登录')}
    </button>
  )
}

/** The one bar over an editor: the way back, the project, the editor's tools and its main action. */
export function EditorTopBar({
  chrome,
  user,
  requestAuth,
  system,
  title,
  onRename,
  save,
  onRetrySave,
  center,
  actions,
  primary,
}: EditorTopBarProps) {
  return (
    <header className="editor-bar" data-testid="app-header" data-system={system}>
      <div className="editor-bar-start">
        <button
          className="editor-home"
          type="button"
          data-testid="editor-home"
          aria-label={t('返回工作台')}
          title={t('返回工作台')}
          onClick={chrome.onHome}
        >
          <ChevronLeftIcon className="editor-home-chevron" />
          <img src={logoUrl} alt="" width="22" height="22" />
        </button>
        <div className="editor-doc">
          <ProjectTitle title={title} onRename={onRename} />
          <SaveChip save={save} onRequestAuth={requestAuth} onRetry={onRetrySave} />
        </div>
      </div>

      <div className="editor-bar-center">{center}</div>

      <div className="editor-bar-end">
        {actions}
        <LanguageMenu className="editor-lang" />
        <button
          className="editor-icon-btn"
          type="button"
          data-testid="theme-toggle"
          aria-label={t('切换深浅色')}
          title={chrome.theme === 'dark' ? t('切换到浅色模式') : t('切换到深色模式')}
          onClick={chrome.onToggleTheme}
        >
          {chrome.theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <AccountControl chrome={chrome} user={user} requestAuth={requestAuth} />
        {primary}
      </div>
    </header>
  )
}
