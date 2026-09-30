import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { LANGUAGES, setLang, t, useLang, type Lang } from '../i18n'
import { CheckIcon, ChevronDownIcon, LanguageIcon } from '../ui/icons'
import { useDismiss } from './useDismiss'

interface LanguageMenuProps {
  /** Which edge of the button the list lines up with. */
  align?: 'start' | 'end'
  className?: string
}

/** The current language on a globe button; the list opens on click. */
export function LanguageMenu({ align = 'end', className }: LanguageMenuProps) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const current = LANGUAGES.find((option) => option.id === lang) ?? LANGUAGES[0]
  useDismiss(rootRef, open, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus()
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(next: Lang) {
    close()
    setLang(next)
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
    const index = items.findIndex((item) => item === document.activeElement)
    let next = -1
    if (event.key === 'ArrowDown') next = (index + 1) % items.length
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = index
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    } else if (event.key === 'Tab') {
      setOpen(false)
      return
    } else return
    event.preventDefault()
    event.stopPropagation()
    items[next]?.focus()
  }

  return (
    <div className={['lang-menu', className].filter(Boolean).join(' ')} ref={rootRef}>
      <button
        ref={triggerRef}
        className="lang-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('界面语言：{name}', { name: current.label })}
        title={t('界面语言')}
        data-testid="language-menu"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' || open) return
          // Keep the arrow away from editor shortcuts (nudging the selection).
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <LanguageIcon />
        <span className="lang-current">{current.label}</span>
        <ChevronDownIcon className="lang-chevron" />
      </button>
      {open && (
        <div
          id={menuId}
          className={`menu lang-list is-${align}`}
          role="menu"
          aria-label={t('界面语言')}
          onKeyDown={onMenuKeyDown}
        >
          {LANGUAGES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={lang === option.id}
              lang={option.id === 'zh' ? 'zh-CN' : 'en'}
              onClick={() => choose(option.id)}
            >
              <span className="lang-name">{option.label}</span>
              <CheckIcon className="lang-check" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
