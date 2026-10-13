// The Markdown toolbar's look picker: every theme drawn on the open
// article's first page, the designed looks first, so a look is chosen by
// what it does to these words rather than by its name. A designed look
// comes with the face its template sets it in; a plain theme keeps the
// article's font.

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Card } from '../../Card'
import { t } from '../../i18n'
import { previewStyle } from '../../templates/previewModel'
import { TEMPLATE_REGISTRY } from '../../templates/registry'
import { buildConfig, PLATFORMS, themesForPicker, type Profile, type Theme } from '../../theme'

/** The face each designed look's template is set in. */
const LOOK_FONTS: ReadonlyMap<string, string> = new Map(TEMPLATE_REGISTRY.flatMap((template) => {
  const document = template.createMarkdown?.()
  return document ? [[document.themeId, document.fontFamily] as const] : []
}))

/** The font a theme is drawn in: its template's for a designed look, the article's otherwise. */
export function lookFont(theme: Theme, articleFont: string): string {
  return (theme.look && LOOK_FONTS.get(theme.id)) || articleFont
}

const THUMB_WIDTH = 92

interface LookPickerProps {
  themeId: string
  fontFamily: string
  radius: number
  profile: Profile
  /** The open article's first page, as the card shows it. */
  firstPageHtml: string
  pageCount: number
  title: string
  onPick: (theme: Theme, fontFamily: string) => void
}

function LookThumb({ theme, html, pageCount, title, fontFamily, radius, profile }: {
  theme: Theme
  html: string
  pageCount: number
  title: string
  fontFamily: string
  radius: number
  profile: Profile
}) {
  const config = buildConfig(PLATFORMS[0], theme, fontFamily)
  const scale = THUMB_WIDTH / config.width
  return (
    <span
      className="doc-preview doc-preview-md look-thumb"
      style={{ width: THUMB_WIDTH, height: Math.round(config.height * scale), ...previewStyle(scale, radius, config) }}
      aria-hidden="true"
    >
      <Card
        html={html}
        config={config}
        profile={profile}
        pageIndex={0}
        pageCount={pageCount}
        pageRole={theme.look && pageCount > 1 ? 'cover' : 'article'}
        showHeader={false}
        title={title}
      />
    </span>
  )
}

export function LookPicker({ themeId, fontFamily, radius, profile, firstPageHtml, pageCount, title, onPick }: LookPickerProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const themes = themesForPicker(themeId)
  const looks = themes.filter((theme) => theme.look)
  const plain = themes.filter((theme) => !theme.look)
  // In the order the panel shows them, for the arrow keys.
  const ordered = [...looks, ...plain]
  const current = ordered.find((theme) => theme.id === themeId) ?? ordered[0]
  const optionId = (index: number) => `${listId}-look-${index}`

  function openPanel() {
    setActive(Math.max(0, ordered.findIndex((theme) => theme.id === themeId)))
    setOpen(true)
  }

  function close(returnFocus: boolean) {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  function choose(index: number) {
    const theme = ordered[index]
    if (!theme) return
    close(true)
    if (theme.id !== themeId || lookFont(theme, fontFamily) !== fontFamily) onPick(theme, lookFont(theme, fontFamily))
  }

  useLayoutEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(optionId(active))}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  // An outside press closes the panel and leaves the focus where it lands.
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  /** How many options a row holds, read from where the options sit. */
  function columns(): number {
    const options = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    const top = options[0]?.offsetTop
    const count = options.filter((option) => option.offsetTop === top).length
    return Math.max(1, count)
  }

  function onListKeyDown(event: ReactKeyboardEvent) {
    const step = (delta: number) => {
      event.preventDefault()
      event.stopPropagation()
      setActive((index) => Math.min(ordered.length - 1, Math.max(0, index + delta)))
    }
    if (event.key === 'ArrowRight') step(1)
    else if (event.key === 'ArrowLeft') step(-1)
    else if (event.key === 'ArrowDown') step(columns())
    else if (event.key === 'ArrowUp') step(-columns())
    else if (event.key === 'Home') step(-ordered.length)
    else if (event.key === 'End') step(ordered.length)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      choose(active)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  const group = (label: string, entries: Theme[], offset: number) => entries.length > 0 && (
    <div className="look-group" role="group" aria-label={label}>
      <div className="look-group-head" aria-hidden="true">{label}</div>
      <div className="look-grid">
        {entries.map((theme, at) => {
          const index = offset + at
          return (
            <div
              key={theme.id}
              id={optionId(index)}
              role="option"
              aria-selected={theme.id === themeId}
              className={`look-option${index === active ? ' active' : ''}${theme.id === themeId ? ' selected' : ''}`}
              data-testid={`look-option-${theme.id}`}
              onPointerEnter={() => setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <LookThumb theme={theme} html={firstPageHtml} pageCount={pageCount} title={title} fontFamily={lookFont(theme, fontFamily)} radius={radius} profile={profile} />
              <span className="look-option-label">{t(theme.label)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="sel look-picker" ref={rootRef} title={t('主题')}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={open ? 'sel-trigger open' : 'sel-trigger'}
        aria-label={t('主题')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        data-testid="markdown-look-picker"
        onClick={() => (open ? close(false) : openPanel())}
        onKeyDown={(event) => {
          if (open) return
          if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault()
            openPanel()
          }
        }}
      >
        <span className="sel-content">
          <span className="sel-swatch" style={{ background: current.background }} aria-hidden="true">
            <span className="sel-swatch-dot" style={{ background: current.accent }} />
          </span>
          <span className="sel-value">{t(current.label)}</span>
        </span>
        <svg className="sel-caret" viewBox="0 0 10 6" width="10" height="6" aria-hidden>
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          className="look-panel"
          role="listbox"
          tabIndex={0}
          aria-label={t('主题')}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKeyDown}
        >
          {group(t('长文版式'), looks, 0)}
          {group(t('基础主题'), plain, looks.length)}
        </div>
      )}
    </div>
  )
}
