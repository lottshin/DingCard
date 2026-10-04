import { useEffect, useId, useRef, useState } from 'react'
import { useLang, useT } from '../i18n'
import { store } from '../storage'
import type { ApiToken, MintedApiToken } from '../storage/types'
import { ConfirmDialog } from './ConfirmDialog'
import { errorText } from './errors'

/** Every scope the server honors, in a sensible default order. */
const SCOPES = ['decks', 'shares', 'drafts', 'assets', 'images'] as const

function formatDate(t: (source: string) => string, at: number | null): string {
  if (at === null) return t('还没用过')
  return new Date(at).toLocaleString()
}

/**
 * API 令牌：给程序（AI 客户端、脚本）的钥匙。签发的值只显示一次；撤销立即生效。
 * Only reachable with a server account — the workbench hides the entry in
 * local mode.
 */
export function TokenDialog({ ownerId, onClose }: { ownerId: string; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  const scopeSeparator = lang === 'zh' ? '、' : ', '
  const titleId = useId()
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<readonly string[]>(['shares', 'images'])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [minted, setMinted] = useState<MintedApiToken | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<ApiToken | null>(null)

  const refresh = () => {
    store.tokens.list(ownerId).then(
      (list) => {
        setTokens(list)
        setLoadError(null)
      },
      (error: unknown) => {
        setLoadError(errorText(error, t('暂时无法读取令牌，请稍后重试')))
      },
    )
  }

  useEffect(() => {
    refresh()
    nameInputRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleScope = (scope: string) => {
    setScopes((current) => (
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]
    ))
  }

  const create = async () => {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const mintedToken = await store.tokens.create(ownerId, name.trim(), scopes)
      setMinted(mintedToken)
      setCopied(false)
      setName('')
      refresh()
    } catch (error) {
      setCreateError(errorText(error, t('暂时无法创建令牌，请稍后重试')))
    } finally {
      setCreating(false)
    }
  }

  const copy = async () => {
    if (!minted) return
    try {
      await navigator.clipboard.writeText(minted.token)
      setCopied(true)
    } catch {
      // The value stays selectable; a manual copy still works.
    }
  }

  const revoke = async () => {
    if (!revoking) return
    const target = revoking
    setRevoking(null)
    try {
      await store.tokens.revoke(ownerId, target.id)
      refresh()
    } catch (error) {
      setLoadError(errorText(error, t('暂时无法撤销令牌，请稍后重试')))
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal token-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-head">
          <h3 id={titleId}>{t('API 令牌')}</h3>
          <p className="token-intro">
            {t('给程序用的钥匙：带上这个值的请求就代表你的账号，只能做勾选范围内的事。值只显示一次，随时可以撤销。')}
          </p>
        </div>

        {minted && (
          <div className="token-minted" data-testid="token-minted">
            <div className="token-minted-label">{t('「{name}」的令牌值（只显示这一次）', { name: minted.name })}</div>
            <code className="token-value">{minted.token}</code>
            <div className="token-minted-actions">
              <button type="button" className="ghost" onClick={() => void copy()}>
                {copied ? t('已复制') : t('复制')}
              </button>
              <button type="button" className="ghost" onClick={() => setMinted(null)}>{t('我存好了')}</button>
            </div>
          </div>
        )}

        <div className="token-create">
          <label className="field-label" htmlFor="token-name">{t('名称')}</label>
          <input
            id="token-name"
            ref={nameInputRef}
            className="token-name-input"
            data-testid="token-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('比如：我的智能体')}
          />
          <span className="field-label">{t('权限')}</span>
          <div className="token-scopes" role="group" aria-label={t('权限')}>
            {SCOPES.map((scope) => (
              <label key={scope} className="token-scope">
                <input
                  type="checkbox"
                  data-testid={`token-scope-${scope}`}
                  checked={scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {t(scope)}
              </label>
            ))}
          </div>
          {createError && <p className="token-error" role="alert">{createError}</p>}
          <button
            type="button"
            className="accent token-create-btn"
            data-testid="token-create-btn"
            disabled={creating || name.trim() === '' || scopes.length === 0}
            onClick={() => void create()}
          >
            {creating ? t('创建中…') : t('创建令牌')}
          </button>
        </div>

        <div className="token-list" data-testid="token-list">
          {loadError && <p className="token-error" role="alert">{loadError}</p>}
          {tokens !== null && tokens.length === 0 && !loadError && (
            <p className="token-empty">{t('还没有令牌。')}</p>
          )}
          {tokens?.map((token) => (
            <div key={token.id} className="token-row" data-testid="token-row">
              <div className="token-row-main">
                <b>{token.name}</b>
                <span className="token-row-scopes">
                  {token.scopes.map((scope) => t(scope)).join(scopeSeparator)}
                </span>
              </div>
              <div className="token-row-meta">
                <span>{t('最近使用：{time}', { time: formatDate(t, token.lastUsedAt) })}</span>
                <button type="button" className="ghost token-revoke" onClick={() => setRevoking(token)}>
                  {t('撤销')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button type="button" className="ghost" onClick={onClose}>{t('关闭')}</button>
        </div>
      </div>

      {revoking && (
        <ConfirmDialog
          title={t('撤销「{name}」？', { name: revoking.name })}
          body={t('撤销后用这个令牌的程序立刻无法访问。')}
          confirmLabel={t('撤销')}
          danger
          onConfirm={() => void revoke()}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  )
}
