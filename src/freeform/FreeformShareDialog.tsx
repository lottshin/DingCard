import { useEffect, useId, useRef, useState } from 'react'
import { locale, t } from '../i18n'
import type { Share } from '../storage'

/** Offered lifetimes, in days; the largest is the most the server accepts. */
const EXPIRY_PRESETS = [7, 30, 90, 365] as const
const EXPIRY_MAX_DAYS = 365

interface FreeformShareDialogProps {
  /** The created share, or null while the dialog only offers the lifetime. */
  share: Share | null
  /** A creation is in flight: pages are being rendered and uploaded. */
  creating: boolean
  /** How far the creation has got, the same counter the export menu shows. */
  progress: { current: number; total: number } | null
  /** Pages the link will carry, for the explainer before creation. */
  slideCount: number
  /** A revocation is in flight; the dialog stays until it settles. */
  revoking: boolean
  /** Why the last creation failed, if it did; shown inside the dialog. */
  error: string | null
  onCreate: (expiresInDays: number) => void
  onRevoke: () => void
  onClose: () => void
}

function formatExpiry(expiresAt: number): string {
  const date = new Date(expiresAt)
  const normalized = Number.isFinite(date.getTime()) ? date : null
  if (!normalized) return ''
  return normalized.toLocaleDateString(locale(), { year: 'numeric', month: 'long', day: 'numeric' })
}

/** First pick how long the link should live, then scan the QR or copy it away. */
export function FreeformShareDialog({
  share,
  creating,
  progress,
  slideCount,
  revoking,
  error,
  onCreate,
  onRevoke,
  onClose,
}: FreeformShareDialogProps) {
  const titleId = useId()
  const [preset, setPreset] = useState<number | 'custom'>(30)
  const [customDays, setCustomDays] = useState('30')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyRef = useRef<HTMLButtonElement>(null)
  const createRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!share) return
    let cancelled = false
    // Loaded on demand so the QR encoder never lands in the main bundle.
    void import('qrcode')
      .then((qrcode) => qrcode.toDataURL(share.url, { margin: 1, width: 256 }))
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl)
      })
      .catch(() => {
        // The link alone still shares fine; the QR is a convenience.
      })
    return () => {
      cancelled = true
    }
  }, [share])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(share ? copyRef.current : createRef.current)?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || revoking || creating) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [share, onClose, revoking, creating])

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(share!.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const parsedDays = preset === 'custom' ? Number(customDays) : preset
  const daysValid = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= EXPIRY_MAX_DAYS
  const expiry = share ? formatExpiry(share.expiresAt) : ''

  return (
    <div className="modal-backdrop">
      <div
        className="modal share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="freeform-share-dialog"
      >
        {share ? (
          <>
            <h3 id={titleId} className="confirm-title">{t('分享链接已创建')}</h3>
            <p className="confirm-body">
              {t('手机扫码或在浏览器打开链接就能看这 {n} 张卡片，长按图片可以保存到相册。', { n: share.imageCount })}
              {expiry ? t('有效期到 {date}。', { date: expiry }) : ''}
            </p>
            {qrDataUrl
              ? <img className="share-qr" src={qrDataUrl} alt={t('分享二维码')} data-testid="share-qr" />
              : <div className="share-qr share-qr-pending" aria-hidden="true" data-testid="share-qr-pending" />}
            <label className="share-link-label" htmlFor="share-link-input">
              <span className="field-label">{t('链接')}</span>
              <input
                id="share-link-input"
                className="share-link-input"
                type="text"
                readOnly
                value={share.url}
                onFocus={(event) => event.currentTarget.select()}
                data-testid="share-link-input"
              />
            </label>
            <div className="modal-foot">
              <button
                className="ghost"
                type="button"
                onClick={() => void onRevoke()}
                disabled={revoking}
                data-testid="share-revoke"
              >
                {revoking ? t('正在撤销…') : t('撤销分享')}
              </button>
              <button
                ref={copyRef}
                className="accent"
                type="button"
                onClick={() => void copyLink()}
                data-testid="share-copy"
              >
                {copied ? t('已复制') : t('复制链接')}
              </button>
              <button className="ghost" type="button" onClick={onClose} disabled={revoking}>
                {t('完成')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 id={titleId} className="confirm-title">{t('分享链接')}</h3>
            <p className="confirm-body">
              {t('生成一个不用登录就能打开的链接，手机扫码或在浏览器点开，就能看这 {n} 张卡片。', { n: slideCount })}
            </p>
            <div className="share-expiry-row">
              <span className="field-label">{t('有效期')}</span>
              <div className="seg stretch">
                {EXPIRY_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    className={preset === days ? 'seg-btn on' : 'seg-btn'}
                    aria-pressed={preset === days}
                    data-testid={`share-expiry-${days}`}
                    disabled={creating}
                    onClick={() => setPreset(days)}
                  >
                    {t('{n} 天', { n: days })}
                  </button>
                ))}
                <button
                  type="button"
                  className={preset === 'custom' ? 'seg-btn on' : 'seg-btn'}
                  aria-pressed={preset === 'custom'}
                  data-testid="share-expiry-custom"
                  disabled={creating}
                  onClick={() => setPreset('custom')}
                >
                  {t('自定义')}
                </button>
              </div>
            </div>
            {preset === 'custom' && (
              <div className="share-days-row">
                <input
                  className="share-days-input"
                  data-testid="share-expiry-days"
                  type="number"
                  min={1}
                  max={EXPIRY_MAX_DAYS}
                  step={1}
                  value={customDays}
                  disabled={creating}
                  aria-label={t('自定义天数')}
                  onChange={(event) => setCustomDays(event.currentTarget.value)}
                />
                <span className="share-days-suffix">{t('天')}</span>
                {!daysValid && <span className="share-days-hint">{t('最长 {n} 天', { n: EXPIRY_MAX_DAYS })}</span>}
              </div>
            )}
            {error && <p className="share-error" role="alert">{error}</p>}
            {creating && progress && (
              <p className="confirm-body">{t('正在生成 {current}/{total} 页…', progress)}</p>
            )}
            <div className="modal-foot">
              <button className="ghost" type="button" onClick={onClose} disabled={creating}>
                {t('取消')}
              </button>
              <button
                ref={createRef}
                className="accent"
                type="button"
                data-testid="share-create"
                disabled={creating || slideCount === 0 || !daysValid}
                onClick={() => onCreate(parsedDays)}
              >
                {creating ? t('正在生成…') : t('生成链接')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
