import { useEffect, useId, useRef } from 'react'
import { t } from '../i18n'

interface ConfirmDialogProps {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = t('取消'),
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId} className="confirm-title">{title}</h3>
        <p className="confirm-body">{body}</p>
        <div className="modal-foot">
          <button ref={cancelRef} className="ghost" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'accent confirm-danger' : 'accent'} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
