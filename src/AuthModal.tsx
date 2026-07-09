import { useState } from 'react'
import { login, register, type User } from './auth'

interface AuthModalProps {
  onAuthed: (user: User) => void
  onClose: () => void
}

type Mode = 'login' | 'register'

/**
 * Sign-in / sign-up dialog. Backed by the client-only auth in auth.ts, so this
 * is a UX shell rather than real security — see the warning in that file.
 */
export function AuthModal({ onAuthed, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user =
        mode === 'login'
          ? await login(username, password)
          : await register(username, password)
      onAuthed(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : '出错了，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
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

          {error && <div className="form-error">{error}</div>}

          <p className="form-note">
            账号仅保存在此浏览器本地，不会上传，也不能跨设备同步。
          </p>

          <div className="sheet-foot">
            <button type="button" className="ghost" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="accent" disabled={busy}>
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账号'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
