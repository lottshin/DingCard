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
import { FILTER_PRESETS } from '../../../src/freeform/filterPresets'
import type { FreeformDocument, FreeformNodeStylePatch } from '../../../src/freeform/types'

/** How many of a deck's colours inspect_document lists, the most prominent first. */
const STYLE_COLOR_LIMIT = 12

const STYLES_USAGE = 'looks 是现成的搭配：把它的 palette 和 fontSet 一起给 apply_actions 的 { type: "document/restyle", palette, fontSet }，整套卡片就换成这套搭配；palettes、fontSets 也能单独套。'
  + '字号不小于正文 headingScale 倍的文字换标题字体，其余换正文字体。要换成指定的颜色或字体，用 document/restyle 的 colors / fonts，键取自 inspect_document 的 style。'

const TEXT_STYLES_USAGE = 'patch 直接作为 apply_actions 里 node/update-style 的 patch，一段文字就变成这个样子（填充、效果和加粗一起设好，原来的描边和阴影去掉）。'
  + '效果大小按字号比例算，大标题和小字都能用；backdrop 是深色的（霓虹、故障、极光等）放在深色页面上才好看。'

const FILTER_PRESETS_USAGE = 'patch 直接作为 apply_actions 里 node/update-style 的 patch，图片、形状等元素就换成这个风格（整套替换原来的滤镜）；patch 给 { filter: null } 清除滤镜，回到原图。'

export interface StyleCatalogue {
  /** Ready looks: a palette and the font set that suits it, put on together. */
  looks: StyleLook[]
  palettes: Palette[]
  fontSets: FontSet[]
  /** Texts at least this many times the deck's body size take a font set's heading font. */
  headingScale: number
  usage: string
}

export function listStyles(): StyleCatalogue {
  return {
    looks: STYLE_LOOKS.map((look) => ({ ...look })),
    palettes: PALETTES.map((palette) => ({ ...palette, accents: [...palette.accents] })),
    fontSets: FONT_SETS.map((set) => ({ ...set })),
    headingScale: HEADING_SCALE,
    usage: STYLES_USAGE,
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
export function listTextStyles(): { styles: TextStyleEntry[]; usage: string } {
  return {
    styles: TEXT_STYLE_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      backdrop: preset.backdrop,
      patch: textStylePatch(preset),
    })),
    usage: TEXT_STYLES_USAGE,
  }
}

export interface FilterPresetEntry {
  id: string
  name: string
  /** A node/update-style patch that gives an element this look (v18 filter). */
  patch: FreeformNodeStylePatch
}

/** The ready-made photo looks (滤镜预设). */
export function listFilterPresets(): { presets: FilterPresetEntry[]; usage: string } {
  return {
    presets: FILTER_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      patch: { filter: { ...preset.filter } },
    })),
    usage: FILTER_PRESETS_USAGE,
  }
}
