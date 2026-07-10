// App-level light/dark mode — distinct from the card THEMES (which control the
// exported PNG). This only skins the app chrome. The choice is persisted and
// applied as a `data-theme` attribute on <html> so CSS can switch on it.

import { useEffect, useState } from 'react'

export type Mode = 'light' | 'dark'

const KEY = 'slicer.mode.v1'

// Shared across toggles so a rapid re-toggle resets the cleanup timer rather
// than leaving a stale one to strip the anim class mid-transition.
let animTimer = 0

function initialMode(): Mode {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  // Fall back to the OS preference on first run.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Returns `[mode, toggle]` — a tuple so callers destructure positionally. */
export function useAppTheme(): [Mode, () => void] {
  const [mode, setMode] = useState<Mode>(initialMode)

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', mode)
    // Keep the UA canvas / scrollbars in step with the theme so toggling
    // doesn't flash. Mirrors the inline boot script in index.html.
    root.style.colorScheme = mode
    localStorage.setItem(KEY, mode)
  }, [mode])

  const toggle = () => {
    // Ease colors only for the switch itself: add the anim class before the
    // attribute flips, remove it once the transition has played out.
    const root = document.documentElement
    root.classList.add('theme-anim')
    window.clearTimeout(animTimer)
    animTimer = window.setTimeout(() => root.classList.remove('theme-anim'), 320)
    setMode((m) => (m === 'light' ? 'dark' : 'light'))
  }
  return [mode, toggle]
}
