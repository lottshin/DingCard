// Find-and-replace across the whole deck (or the active page): two inputs, a
// scope switch and one button. The count of hits is live and honest — it
// comes from the same walk the reducer does (findReplace.ts) — and applying
// is one undo step.

import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export type FindReplaceScope = 'deck' | 'slide'

export interface FreeformFindReplaceDialogProps {
  slideCount: number
  activeSlideName: string
  /** How many times `find` shows within the scope. */
  countMatches: (find: string, scope: FindReplaceScope) => number
  /** Replace within the scope; how many were replaced and how many had no room. */
  onApply: (find: string, replace: string, scope: FindReplaceScope) => { replaced: number; skipped: number }
  onClose: () => void
}

export function FreeformFindReplaceDialog({
  slideCount,
  activeSlideName,
  countMatches,
  onApply,
  onClose,
}: FreeformFindReplaceDialogProps) {
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [scope, setScope] = useState<FindReplaceScope>('deck')
  const [result, setResult] = useState<{ replaced: number; skipped: number } | null>(null)
  const findRef = useRef<HTMLInputElement>(null)
  const hits = find === '' ? null : countMatches(find, scope)

  useEffect(() => {
    findRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // A new search clears the last replacement's report.
  useEffect(() => {
    setResult(null)
  }, [find, replace, scope])

  const apply = () => {
    if (find === '' || !hits) return
    setResult(onApply(find, replace, scope))
  }

  return (
    <div
      className="modal-backdrop"
      data-testid="find-replace-scrim"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="modal find-replace-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('查找替换')}
        data-testid="find-replace-dialog"
      >
        <div className="modal-head"><h3>{t('查找替换')}</h3></div>
        <label className="field find-replace-field">
          <span className="field-label">{t('查找')}</span>
          <input
            ref={findRef}
            data-testid="find-input"
            type="text"
            value={find}
            onChange={(event) => setFind(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply()
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('替换为')}</span>
          <input
            data-testid="replace-input"
            type="text"
            value={replace}
            onChange={(event) => setReplace(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') apply()
            }}
          />
        </label>
        <div className="seg stretch" role="group" aria-label={t('范围')}>
          <button
            type="button"
            className={scope === 'deck' ? 'seg-btn on' : 'seg-btn'}
            aria-pressed={scope === 'deck'}
            data-testid="find-scope-deck"
            onClick={() => setScope('deck')}
          >
            {t('整套作品')}
          </button>
          <button
            type="button"
            className={scope === 'slide' ? 'seg-btn on' : 'seg-btn'}
            aria-pressed={scope === 'slide'}
            data-testid="find-scope-slide"
            onClick={() => setScope('slide')}
          >
            {t('仅当前页')}{slideCount > 1 ? `（${activeSlideName}）` : ''}
          </button>
        </div>
        <p className="find-replace-result" data-testid="find-replace-result" aria-live="polite">
          {result
            ? [
                t('已替换 {n} 处', { n: result.replaced }),
                ...(result.skipped > 0 ? [t('{n} 处换完超出字数上限，没有替换', { n: result.skipped })] : []),
              ].join(' · ')
            : hits === null
              ? ''
              : hits === 0
                ? t('没有找到要替换的文字')
                : t('找到 {n} 处', { n: hits })}
        </p>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            {t('关闭')}
          </button>
          <button
            type="button"
            className="primary"
            data-testid="find-replace-apply"
            disabled={!hits}
            onClick={apply}
          >
            {t('全部替换')}
          </button>
        </div>
      </div>
    </div>
  )
}
