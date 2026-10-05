import { useCallback, useEffect, useId, useState } from 'react'
import { useT } from '../i18n'
import { storeFor } from '../storage'
import type { TrashedProject } from '../storage/types'
import { ConfirmDialog } from './ConfirmDialog'
import { errorText } from './errors'

interface ProjectTrashDialogProps {
  ownerId: string
  /** A project came back (or left for good): the projects list refreshes. */
  onChanged: () => void
  onClose: () => void
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Kept in sync with the server's retention window. */
const RETENTION_DAYS = 30

/**
 * 回收站：删除的项目在这里保留 30 天——恢复就回到「我的项目」（内容和历史
 * 版本都在），「彻底删除」立刻清掉，到期没管的项目也会被自动清除。
 */
export function ProjectTrashDialog({ ownerId, onChanged, onClose }: ProjectTrashDialogProps) {
  const t = useT()
  const titleId = useId()
  const [entries, setEntries] = useState<TrashedProject[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<TrashedProject | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const reload = useCallback(() => {
    let cancelled = false
    storeFor(ownerId).drafts.listTrash(ownerId).then(
      (list) => {
        if (!cancelled) {
          setEntries(list)
          setLoadError(null)
        }
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(errorText(error, t('暂时无法读取回收站，请稍后重试')))
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId])

  useEffect(reload, [reload])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || confirming || busyId) return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirming, busyId])

  async function restore(entry: TrashedProject): Promise<void> {
    setBusyId(entry.id)
    setActionError(null)
    try {
      await storeFor(ownerId).drafts.restore(ownerId, entry.id)
      setEntries((current) => current?.filter((item) => item.id !== entry.id) ?? current)
      onChanged()
    } catch (error) {
      setActionError(errorText(error, t('恢复失败，请稍后重试')))
    } finally {
      setBusyId(null)
    }
  }

  async function purge(entry: TrashedProject): Promise<void> {
    setBusyId(entry.id)
    setActionError(null)
    try {
      await storeFor(ownerId).drafts.purge(ownerId, entry.id)
      setConfirming(null)
      setEntries((current) => current?.filter((item) => item.id !== entry.id) ?? current)
      onChanged()
    } catch (error) {
      setActionError(errorText(error, t('彻底删除失败，请稍后重试')))
    } finally {
      setBusyId(null)
    }
  }

  function daysLeft(entry: TrashedProject): number {
    return Math.max(1, RETENTION_DAYS - Math.floor((Date.now() - entry.deletedAt) / DAY_MS))
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal token-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="project-trash-dialog"
      >
        <h3 id={titleId} className="confirm-title">{t('回收站')}</h3>
        <p className="confirm-body">
          {t('删除的项目在这里保留 30 天：恢复就回到「我的项目」，内容和历史版本都在；到期没管的会被自动清除。')}
        </p>
        {actionError && <p className="share-error" role="alert">{actionError}</p>}
        {loadError ? (
          <p className="share-error" role="alert">{loadError}</p>
        ) : entries === null ? (
          <p className="confirm-body" data-testid="project-trash-loading">{t('读取中…')}</p>
        ) : entries.length === 0 ? (
          <p className="confirm-body" data-testid="project-trash-empty">
            {t('回收站是空的——删除的项目会在这里保留 30 天。')}
          </p>
        ) : (
          <ul className="token-list" data-testid="project-trash-list">
            {entries.map((entry) => (
              <li className="token-row" key={entry.id}>
                <div className="token-main">
                  <span className="token-name">{entry.title || t('未命名')}</span>
                  <span className="token-sub">
                    {t('{n} 天后自动清除', { n: daysLeft(entry) })}
                    {entry.mode === 'markdown-card' ? ` · ${t('Markdown')}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="ghost"
                  data-testid="project-trash-restore"
                  disabled={busyId !== null}
                  onClick={() => void restore(entry)}
                >
                  {t('恢复')}
                </button>
                <button
                  type="button"
                  className="ghost danger-text"
                  data-testid="project-trash-purge"
                  disabled={busyId !== null}
                  onClick={() => setConfirming(entry)}
                >
                  {t('彻底删除')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="modal-foot">
          <button type="button" className="ghost" onClick={onClose} disabled={busyId !== null}>
            {t('关闭')}
          </button>
        </div>
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('彻底删除「{title}」？', { title: confirming.title })}
          body={t('彻底删除后无法恢复，它的内容和历史版本都会一起清掉。')}
          confirmLabel={t('彻底删除')}
          danger
          onConfirm={() => void purge(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}
