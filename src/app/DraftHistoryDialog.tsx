import { useEffect, useId, useState } from 'react'
import { useT } from '../i18n'
import { storeFor } from '../storage'
import type { Draft } from '../drafts'
import type { DraftVersion } from '../storage/types'
import { ConfirmDialog } from './ConfirmDialog'
import { errorText } from './errors'

interface DraftHistoryDialogProps {
  ownerId: string
  draftId: string
  /** The restored draft replaces what is on screen; the workspace opens it. */
  onRestored: (draft: Draft) => void
  onClose: () => void
}

/**
 * 历史版本：服务端每隔一段时间存一份旧内容（每份草稿保留最近 30 个）。
 * 这里列出它们，恢复哪个就把哪个写回成当前内容——被替换的内容同样会
 * 先存成一个版本，所以恢复本身也可以再恢复回去。
 */
export function DraftHistoryDialog({ ownerId, draftId, onRestored, onClose }: DraftHistoryDialogProps) {
  const t = useT()
  const titleId = useId()
  const [versions, setVersions] = useState<DraftVersion[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<DraftVersion | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    storeFor(ownerId).drafts.listVersions(ownerId, draftId).then(
      (list) => {
        if (!cancelled) {
          setVersions(list)
          setLoadError(null)
        }
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(errorText(error, t('暂时无法读取历史版本，请稍后重试')))
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, draftId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || confirming || restoring) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirming, restoring])

  async function restore(version: DraftVersion): Promise<void> {
    setRestoring(true)
    setRestoreError(null)
    try {
      const draft = await storeFor(ownerId).drafts.restoreVersion(ownerId, draftId, version.id)
      setConfirming(null)
      onRestored(draft)
    } catch (error) {
      setRestoreError(errorText(error, t('恢复失败，请稍后重试')))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal token-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="draft-history-dialog"
      >
        <h3 id={titleId} className="confirm-title">{t('历史版本')}</h3>
        <p className="confirm-body">
          {t('服务端每隔一段时间自动存一份旧内容（最多保留 30 个）。恢复哪个，哪个就成为当前内容；被替换的内容也会先存成一个版本。')}
        </p>
        {restoreError && <p className="share-error" role="alert">{restoreError}</p>}
        {loadError ? (
          <p className="share-error" role="alert">{loadError}</p>
        ) : versions === null ? (
          <p className="confirm-body" data-testid="draft-history-loading">{t('读取中…')}</p>
        ) : versions.length === 0 ? (
          <p className="confirm-body" data-testid="draft-history-empty">
            {t('还没有历史版本——编辑并保存一段时间后，这里会出现可以回去的版本。')}
          </p>
        ) : (
          <ul className="token-list" data-testid="draft-history-list">
            {versions.map((version) => (
              <li className="token-row" key={version.id}>
                <div className="token-main">
                  <span className="token-name">{version.title || t('未命名')}</span>
                  <span className="token-sub">
                    {new Date(version.createdAt).toLocaleString()}
                    {version.mode === 'markdown-card' ? ` · ${t('Markdown')}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost"
                  data-testid="draft-history-restore"
                  disabled={restoring}
                  onClick={() => setConfirming(version)}
                >
                  {t('恢复')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-foot">
          <button type="button" className="ghost" onClick={onClose} disabled={restoring}>
            {t('关闭')}
          </button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('恢复这个版本？')}
          body={t('当前内容会被替换（替换前也会存成一个版本，随时能再换回来）。')}
          confirmLabel={restoring ? t('正在恢复…') : t('恢复')}
          onConfirm={() => void restore(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
