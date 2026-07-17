import { useEffect, useId, useRef, useState } from 'react'
import type { User } from './auth'
import { store } from './storage'

interface AuthModalProps {
  onAuthed: (user: User) => void
  onClose: () => void
}

type Mode = 'login' | 'register'

const FOCUSABLE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      !element.closest('[inert]') &&
      element.getClientRects().length > 0 &&
      window.getComputedStyle(element).visibility !== 'hidden',
  )
}

/** Sign-in / sign-up dialog for the active LocalStore or RemoteStore backend. */
export function AuthModal({ onAuthed, onClose }: AuthModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (document.activeElement === submitButtonRef.current) {
      cancelButtonRef.current?.focus()
    }
    setBusy(true)
    try {
      const user =
        mode === 'login'
          ? await store.auth.login(username, password)
          : await store.auth.register(username, password)
      onAuthed(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '出错了，请重试')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && dialog.contains(activeElement)) {
      lastFocusedRef.current = activeElement
    }

    const containFocus = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && dialog.contains(target)) {
        if (focusableElements(dialog).includes(target)) lastFocusedRef.current = target
        return
      }

      const focusable = focusableElements(dialog)
      const lastFocused = lastFocusedRef.current
      const preferred = lastFocused && focusable.includes(lastFocused)
        ? lastFocused
        : focusable[0]
      preferred?.focus()
      if (!dialog.contains(document.activeElement)) {
        focusable[0]?.focus()
      }
      if (!dialog.contains(document.activeElement)) dialog.focus()
    }

    document.addEventListener('focusin', containFocus)
    return () => document.removeEventListener('focusin', containFocus)
  }, [])

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = focusableElements(dialog)
    if (focusable.length === 0) {
      event.preventDefault()
      return
    }

    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement)
    const nextIndex = event.shiftKey
      ? activeIndex <= 0
        ? focusable.length - 1
        : activeIndex - 1
      : activeIndex < 0 || activeIndex === focusable.length - 1
        ? 0
        : activeIndex + 1
    event.preventDefault()
    focusable[nextIndex]?.focus()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="sheet"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="sr-only">
          账户登录与注册
        </h2>
        <div className="sheet-tabs">
          <button
            className={mode === 'login' ? 'sheet-tab on' : 'sheet-tab'}
            onClick={() => {
              setMode('login')
              setError(null)
            }}
          >
            登录
          </button>
          <button
            className={mode === 'register' ? 'sheet-tab on' : 'sheet-tab'}
            onClick={() => {
              setMode('register')
              setError(null)
            }}
          >
            注册
          </button>
        </div>

        <form className="sheet-body" onSubmit={submit}>
          <label className="field">
            <span className="field-label">用户名</span>
            <input
              className="text-input"
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
              placeholder="至少 2 个字符"
            />
          </label>

          <label className="field">
            <span className="field-label">密码</span>
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 4 个字符"
            />
          </label>

          {error && (
            <div className="form-error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <p className="form-note">
            {store.remote
              ? '账号会安全保存到你的服务器，可在登录后跨设备同步草稿。'
              : '账号仅保存在此浏览器本地，不会上传，也不能跨设备同步。'}
          </p>

          <div className="sheet-foot">
            <button ref={cancelButtonRef} type="button" className="ghost" onClick={onClose}>
              取消
            </button>
            <button ref={submitButtonRef} type="submit" className="accent" disabled={busy}>
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
