import { useEffect, useId, useRef } from 'react'
import { t } from '../i18n'
import { store } from '../storage'
import { DeviceCheckIcon } from '../ui/icons'

export type GuestMovePhase =
  | { kind: 'ask' }
  | { kind: 'moving'; done: number; total: number }
  | { kind: 'failed'; failed: number; message: string }

interface GuestMoveDialogProps {
  username: string
  projects: number
  assets: number
  phase: GuestMovePhase
  onMove: () => void
  onKeep: () => void
}

function describeWork(projects: number, assets: number): string {
  if (projects > 0 && assets > 0) {
    return t('你没登录时做了 {projects} 个项目、存了 {assets} 张素材，都保存在这台设备上。', { projects, assets })
  }
  if (projects > 0) return t('你没登录时做了 {n} 个项目，都保存在这台设备上。', { n: projects })
  return t('你没登录时存了 {n} 张素材，都保存在这台设备上。', { n: assets })
}

/** Asked once after signing in: take what this device's guest made into the account? */
export function GuestMoveDialog({ username, projects, assets, phase, onMove, onKeep }: GuestMoveDialogProps) {
  const titleId = useId()
  const bodyId = useId()
  const moveRef = useRef<HTMLButtonElement>(null)
  const moving = phase.kind === 'moving'
  const movingRef = useRef(moving)
  movingRef.current = moving
  const onKeepRef = useRef(onKeep)
  onKeepRef.current = onKeep

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    moveRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || movingRef.current) return
      event.preventDefault()
      onKeepRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return (
    <div className="modal-backdrop">
      <div
        className="modal confirm-modal guest-move-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-testid="guest-move-dialog"
      >
        <span className="guest-move-icon" aria-hidden="true"><DeviceCheckIcon /></span>
        <h3 id={titleId} className="confirm-title">
          {projects > 0 ? t('把这台设备上的项目放进账号？') : t('把这台设备上的素材放进账号？')}
        </h3>
        <p id={bodyId} className="confirm-body">
          {describeWork(projects, assets)}
          {store.remote
            ? t('放进「{name}」后，换一台设备登录也能继续编辑。', { name: username })
            : t('放进「{name}」后，它们会出现在这个账号的「我的项目」里。', { name: username })}
        </p>
        {phase.kind === 'failed' && (
          <p className="form-error" role="alert">
            {t('还有 {n} 项没能放进账号：{error}', { n: phase.failed, error: phase.message })}
          </p>
        )}
        <div className="modal-foot">
          <button className="ghost" type="button" onClick={onKeep} disabled={moving} data-testid="guest-move-keep">
            {t('先留在本机')}
          </button>
          <button
            ref={moveRef}
            className="accent"
            type="button"
            onClick={onMove}
            disabled={moving}
            data-testid="guest-move-confirm"
          >
            {moving
              ? t('正在放进账号… {done}/{total}', { done: phase.done, total: phase.total })
              : phase.kind === 'failed' ? t('重试') : t('放进账号')}
          </button>
        </div>
      </div>
    </div>
  )
}
