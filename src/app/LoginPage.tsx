import { useId, useMemo, useState } from 'react'
import logoUrl from '../logo.svg'
import type { User } from '../auth'
import { store } from '../storage'
import { TEMPLATE_REGISTRY } from '../templates/registry'
import type { TemplateDefinition } from '../templates/types'
import { LockIcon } from '../ui/icons'
import { DocumentPreview, type PreviewSource } from './DocumentPreview'

const SHOWCASE_IDS = [
  'editorial-archive-markdown',
  'neon-freeform',
  'issue-cover-markdown',
  'night-flight-freeform',
  'public-theatre-markdown',
]

export function templatePreviewSource(template: TemplateDefinition): PreviewSource | null {
  if (template.workspace === 'markdown') {
    const document = template.createMarkdown?.()
    return document ? { kind: 'markdown', document } : null
  }
  const document = template.createFreeform?.()
  return document ? { kind: 'freeform', document } : null
}

interface LoginPageProps {
  onAuthed: (user: User) => void
  onGuest: () => void
}

export function LoginPage({ onAuthed, onGuest }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const titleId = useId()
  const showcase = useMemo(
    () =>
      SHOWCASE_IDS.map((id) => TEMPLATE_REGISTRY.find((template) => template.id === id))
        .filter((template): template is TemplateDefinition => Boolean(template))
        .map((template) => ({ id: template.id, source: templatePreviewSource(template) }))
        .filter((item): item is { id: string; source: PreviewSource } => item.source !== null),
    [],
  )

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const user = mode === 'login'
        ? await store.auth.login(username, password)
        : await store.auth.register(username, password)
      onAuthed(user)
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : '出错了，请重试')
      setBusy(false)
    }
  }

  const registering = mode === 'register'

  return (
    <div className="login" data-testid="login-page">
      <section className="login-show" aria-label="叮卡能做什么">
        <div className="login-brand"><img src={logoUrl} alt="" width="28" height="28" />叮卡</div>
        <div className="login-fan" aria-hidden="true">
          {showcase.map((item) => (
            <div className="login-fan-card" key={item.id}>
              <DocumentPreview source={item.source} width={240} />
            </div>
          ))}
        </div>
        <div className="login-copy">
          <h2>长文自动排成卡片，<br />海报随手自由排版</h2>
          <p>Markdown 卡片把一篇长文切成一组小红书、微博、推特卡片；自由编辑像做海报一样摆放文字、图片和形状。</p>
          <ul className="login-facts">
            <li><b>2</b> 套编辑器，一个工作台</li>
            <li><b>11</b> 套成品模板</li>
            <li><b>MIT</b> 开源，可自部署</li>
          </ul>
        </div>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} aria-labelledby={titleId}>
          <div>
            <h1 id={titleId}>{registering ? '创建叮卡账号' : '欢迎回来'}</h1>
            <p className="login-sub">{registering ? '只需要用户名和密码。' : '登录后继续编辑你的项目。'}</p>
          </div>
          <div className="login-seg" role="group" aria-label="登录或注册">
            <button type="button" aria-pressed={!registering} onClick={() => { setMode('login'); setError(null) }}>登录</button>
            <button type="button" aria-pressed={registering} onClick={() => { setMode('register'); setError(null) }}>注册</button>
          </div>
          <label className="login-field">
            <span>用户名</span>
            <input className="text-input" value={username} autoComplete="username" autoFocus onChange={(event) => setUsername(event.target.value)} placeholder="至少 2 个字符" />
          </label>
          <label className="login-field">
            <span>密码</span>
            <input className="text-input" type="password" value={password} autoComplete={registering ? 'new-password' : 'current-password'} onChange={(event) => setPassword(event.target.value)} placeholder="至少 4 个字符" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="accent login-submit" type="submit" disabled={busy} data-testid="login-submit">
            {busy ? '请稍候…' : registering ? '创建账号并进入' : '登录'}
          </button>
          <div className="login-or">或</div>
          <button className="ghost login-guest" type="button" onClick={onGuest} data-testid="login-guest">先逛逛，暂不登录</button>
          <p className="login-note">
            <LockIcon />
            <span>
              {store.remote
                ? '账号保存在你部署的服务器上，登录后可在多台设备间同步项目。'
                : '账号和项目只保存在这台设备的浏览器里，不会上传。部署服务端后可在多台设备间同步。'}
            </span>
          </p>
        </form>
      </section>
    </div>
  )
}
