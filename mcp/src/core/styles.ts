// Deck-wide styles for MCP clients: the curated palettes and font sets that
// `document/restyle` takes by id, and a summary of the colours and fonts a
// document uses (inspect_document's `style`), so a client can pick exact
// replacements.

import {
  deckBodySize,
  deckColors,
  deckFonts,
  FONT_SETS,
  HEADING_SCALE,
  PALETTES,
  STYLE_LOOKS,
  type FontSet,
  type Palette,
  type StyleLook,
} from '../../../src/freeform/restyle'
import { TEXT_STYLE_PRESETS, textStylePatch } from '../../../src/freeform/textStyles'
import type { FreeformDocument, FreeformNodeStylePatch } from '../../../src/freeform/types'

/** How many of a deck's colours inspect_document lists, the most prominent first. */
const STYLE_COLOR_LIMIT = 12

export interface StyleCatalogue {
  /** Ready looks: a palette and the font set that suits it, put on together. */
  looks: StyleLook[]
  palettes: Palette[]
  fontSets: FontSet[]
  /** Texts at least this many times the deck's body size take a font set's heading font. */
  headingScale: number
}

export function listStyles(): StyleCatalogue {
  return {
    looks: STYLE_LOOKS.map((look) => ({ ...look })),
    palettes: PALETTES.map((palette) => ({ ...palette, accents: [...palette.accents] })),
    fontSets: FONT_SETS.map((set) => ({ ...set })),
    headingScale: HEADING_SCALE,
  }
}

export interface DeckStyle {
  /** The deck's colours, the most prominent first: its share of the deck's colour, and where it shows. */
  colors: Array<{ color: string; share: number; uses: Array<'background' | 'fill' | 'text' | 'line' | 'shadow'> }>
  /** The deck's fonts, the one set largest first. */
  fonts: Array<{ fontFamily: string; texts: number; largest: number }>
  /** The size most of its characters are set in; null without text. */
  bodySize: number | null
}

export function deckStyle(document: FreeformDocument): DeckStyle {
  const colors = deckColors(document)
  const total = colors.reduce((sum, entry) => sum + entry.weight, 0)
  const roles = ['background', 'fill', 'text', 'line', 'shadow'] as const
  return {
    colors: colors.slice(0, STYLE_COLOR_LIMIT).map((entry) => ({
      color: entry.color,
      share: total > 0 ? Math.round((entry.weight / total) * 1000) / 1000 : 0,
      uses: roles.filter((role) => entry[role] > 0),
    })),
    fonts: deckFonts(document).map((font) => ({ ...font, largest: Math.round(font.largest * 10) / 10 })),
    bodySize: deckBodySize(document),
  }
}

export interface TextStyleEntry {
  id: string
  name: string
  /** The page colour the look reads best on. */
  backdrop: string
  /** A node/update-style patch that gives a text this look. */
  patch: FreeformNodeStylePatch
}

/** The ready-made text looks (花字). */
export function listTextStyles(): { styles: TextStyleEntry[] } {
  return {
    styles: TEXT_STYLE_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      backdrop: preset.backdrop,
      patch: textStylePatch(preset),
    })),
  }
}
