// 滤镜预设: ready-made photo looks, each a SceneFilter stack (v18) applied to
// an element in one step. Applying one replaces the whole filter, so no earlier
// look shows through; the sliders then fine-tune on top. Every tile previews on
// the same colourful swatch with the same sceneFilterCss the canvas renders,
// so the gallery shows exactly what the element gets. 原图 is not a preset —
// clearing the filter is.

import { sceneFilterCss } from './appearance'
import type { SceneFilter } from './types'

export interface FilterPreset {
  id: string
  name: string
  filter: SceneFilter
}

/** Shared colourful swatch every preset tile previews on. */
export const FILTER_PRESET_SWATCH = 'linear-gradient(135deg, #f43f5e 0%, #fbbf24 45%, #38bdf8 100%)'

export const FILTER_PRESETS: readonly FilterPreset[] = [
  { id: 'mono', name: '黑白', filter: { grayscale: 1, contrast: 1.1 } },
  { id: 'vintage', name: '复古', filter: { sepia: 0.45, contrast: 1.05, brightness: 1.05 } },
  { id: 'sunny', name: '暖阳', filter: { sepia: 0.25, saturation: 1.2, brightness: 1.05 } },
  { id: 'cool', name: '冷调', filter: { hue: 345, saturation: 1.05, brightness: 1.02 } },
  { id: 'film', name: '胶片', filter: { sepia: 0.2, saturation: 1.25, contrast: 0.95, brightness: 1.05 } },
  { id: 'faded', name: '褪色', filter: { saturation: 0.6, contrast: 0.85, brightness: 1.12 } },
  { id: 'punch', name: '高对比', filter: { contrast: 1.4, saturation: 1.2 } },
  { id: 'soft', name: '柔焦', filter: { blur: 2, brightness: 1.05 } },
]

export function filterPresetCss(preset: FilterPreset): string {
  return sceneFilterCss(preset.filter)
}
