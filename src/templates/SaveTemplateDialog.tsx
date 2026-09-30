import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CloseIcon } from '../ui/icons'

interface SaveTemplateDialogProps {
  open: boolean
  defaultName: string
  onClose: () => void
  onConfirm: (name: string) => void
}

/** Small modal that names and confirms saving the current work as a template. */
export function SaveTemplateDialog({
  open,
  defaultName,
  onClose,
  onConfirm,
}: SaveTemplateDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    setName(defaultName)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.select()
    })
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown, true)
      previous?.focus()
    }
  }, [open, defaultName])

  if (!open) return null

  function confirm() {
    onConfirm(name.trim())
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      confirm()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
    >
      <div
        className="modal save-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-template-title"
      >
        <div className="modal-head">
          <h3 id="save-template-title">存为模板</h3>
          <button className="modal-x" type="button" aria-label="关闭" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="modal-row save-template-row">
          <label className="field-label" htmlFor="save-template-name">
            模板名称
          </label>
          <input
            id="save-template-name"
            ref={inputRef}
            className="text-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="给这套作品起个名字"
            maxLength={40}
            data-testid="save-template-name-input"
          />
        </div>
        <p className="save-template-hint">
          模板保存在本浏览器当前账号下，图片会一并嵌入；之后在「模板」中心随时可用。
        </p>
        <div className="modal-foot">
          <button className="ghost" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary" type="button" data-testid="save-template-confirm" onClick={confirm}>
            保存模板
          </button>
        </div>
      </div>
    </div>
  )
}
