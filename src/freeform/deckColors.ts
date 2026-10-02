// The deck's own colours for the colour pickers: swatches to reuse, and a
// 全部替换 that carries a colour change to every page (document/restyle).

import { createContext } from 'react'

export interface DeckColorsValue {
  /** The deck's colours (#rrggbb), the most prominent first. */
  colors: readonly string[]
  /** Change one colour to another wherever the deck uses it. */
  replace: (from: string, to: string) => void
}

export const DeckColorsContext = createContext<DeckColorsValue | null>(null)
