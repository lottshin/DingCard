import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Share } from '../storage'

interface FreeformShareDialogProps {
  share: Share
  /** A revocation is in flight; the dialog stays until it settles. */
  revoking: boolean
  onRevoke: () => void
  onClose: () => void
}

function formatExpiry(expiresAt: number): string {
  const date = new Date(expiresAt)
  const normalized = Number.isFinite(date.getTime()) ? date : null
  if (!normalized) return ''
  return normalized.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** The share result: a QR code to scan on the phone, the link to copy, and a way back. */
export function FreeformShareDialog({ share, revoking, onRevoke, onClose }: FreeformShareDialogProps) {
  const titleId = useId()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const copyRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
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
  }, [share.url])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    copyRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || revoking) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [onClose, revoking])

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(share.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const expiry = formatExpiry(share.expiresAt)

  return (
    <div className="modal-backdrop">
      <div
        className="modal share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="freeform-share-dialog"
      >
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
      </div>
    </div>
  )
}
