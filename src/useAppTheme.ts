// App-level light/dark mode — distinct from the card THEMES (which control the
// exported PNG). This only skins the app chrome. The choice is persisted and
// applied as a `data-theme` attribute on <html> so CSS can switch on it.

import { useEffect, useState } from 'react'

export type Mode = 'light' | 'dark'

const KEY = 'slicer.mode.v1'

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
    document.documentElement.setAttribute('data-theme', mode)
    localStorage.setItem(KEY, mode)
  }, [mode])

  const toggle = () => setMode((m) => (m === 'light' ? 'dark' : 'light'))
  return [mode, toggle]
}
