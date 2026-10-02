// 花字: ready-made text looks, each a fill plus at most one effect
// (textEffects.ts), applied to a text in one step or inserted as a new
// heading. Every size in them is a share of the font size, so a preset looks
// the same on a 30px caption and a 120px title. Applying one replaces the
// text's fill, effect, outline and shadow, so no earlier look shows through.

import type { ColorPaint, FreeformNodeStylePatch, TextEffect } from './types'

export interface TextStylePreset {
  id: string
  name: string
  /** The colour its tile shows it on: where the look reads best. */
  backdrop: string
  textFill: ColorPaint
  effect: TextEffect | null
}

const solid = (color: string): ColorPaint => ({ type: 'solid', color })

export const TEXT_STYLE_PRESETS: readonly TextStylePreset[] = [
  { id: 'neon-cyan', name: '霓虹青', backdrop: '#0b1020', textFill: solid('#e8fdff'), effect: { type: 'neon', color: '#22d3ee', amount: 55 } },
  { id: 'neon-pink', name: '霓虹粉', backdrop: '#120a1a', textFill: solid('#fff0fa'), effect: { type: 'neon', color: '#f472b6', amount: 55 } },
  { id: 'sticker', name: '贴纸白边', backdrop: '#fbbf24', textFill: solid('#1f2937'), effect: { type: 'outline', color: '#ffffff', amount: 60 } },
  { id: 'candy', name: '糖果描边', backdrop: '#fdf2f8', textFill: solid('#ffffff'), effect: { type: 'outline', color: '#f43f5e', amount: 50 } },
  { id: 'hollow', name: '镂空', backdrop: '#f5f5f4', textFill: solid('#18181b'), effect: { type: 'hollow', amount: 50 } },
  { id: 'splice', name: '错位', backdrop: '#fffbeb', textFill: solid('#18181b'), effect: { type: 'splice', color: '#f59e0b', amount: 50, angle: 45 } },
  { id: 'retro', name: '复古投影', backdrop: '#fef3c7', textFill: solid('#ea580c'), effect: { type: 'offset', color: '#1c1917', amount: 45, angle: 45 } },
  { id: 'echo', name: '回声', backdrop: '#f5f3ff', textFill: solid('#6d28d9'), effect: { type: 'echo', color: '#6d28d9', amount: 45, angle: 0 } },
  { id: 'glitch', name: '故障', backdrop: '#0a0a0a', textFill: solid('#ffffff'), effect: { type: 'glitch', color: '#00e5ff', color2: '#ff2bd6', amount: 45 } },
  { id: 'extrude', name: '立体', backdrop: '#1e1b4b', textFill: solid('#fde047'), effect: { type: 'extrude', color: '#c2410c', amount: 50, angle: 45 } },
  { id: 'label', name: '黑底标签', backdrop: '#f5f5f4', textFill: solid('#ffffff'), effect: { type: 'background', color: '#18181b', amount: 40, radius: 30 } },
  { id: 'tag', name: '黄色底块', backdrop: '#ffffff', textFill: solid('#1c1917'), effect: { type: 'background', color: '#fde047', amount: 35, radius: 12 } },
  { id: 'marker', name: '荧光笔', backdrop: '#ffffff', textFill: solid('#1c1917'), effect: { type: 'marker', color: '#fde68a', amount: 50 } },
  {
    id: 'sunset',
    name: '日落渐变',
    backdrop: '#fff7ed',
    textFill: { type: 'linear-gradient', from: '#f97316', to: '#db2777', angle: 90 },
    effect: null,
  },
  {
    id: 'aurora',
    name: '极光渐变',
    backdrop: '#0b1020',
    textFill: { type: 'linear-gradient', from: '#22d3ee', to: '#a78bfa', angle: 90 },
    effect: { type: 'neon', color: '#818cf8', amount: 30 },
  },
  {
    id: 'gold',
    name: '金色',
    backdrop: '#1c1917',
    textFill: {
      type: 'linear-gradient',
      stops: [{ offset: 0, color: '#fef3c7' }, { offset: 0.55, color: '#f59e0b' }, { offset: 1, color: '#b45309' }],
      angle: 180,
    },
    effect: { type: 'offset', color: '#78350f', amount: 20, angle: 90 },
  },
]

/** Whether the preset's tile is a dark page (its name is then written light). */
export function presetOnDarkPage(preset: TextStylePreset): boolean {
  const value = Number.parseInt(preset.backdrop.slice(1), 16)
  return 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255) < 128
}

export function textStylePreset(id: string): TextStylePreset | undefined {
  return TEXT_STYLE_PRESETS.find((preset) => preset.id === id)
}

/** The style patch that gives a text the preset's look (node/update-style). */
export function textStylePatch(preset: TextStylePreset): FreeformNodeStylePatch {
  return {
    textFill: structuredClone(preset.textFill),
    effect: preset.effect ? { ...preset.effect } : null,
    fontWeight: 'bold',
    stroke: null,
    strokeWidth: null,
    shadow: null,
  }
}
