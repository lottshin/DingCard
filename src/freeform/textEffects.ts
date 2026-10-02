// Text effects (v17), one per text: a glow, an outline around the words,
// hollow words, a hollow splice over an offset copy, an offset shadow, echoes,
// a two-colour glitch, a 3D extrusion, a label background behind each line, or
// a highlighter band. Sizes are shares of the font size (`amount` 0–100), so
// an effect looks the same at any size. Most draw on a copy of the words laid
// out under the text — a gradient fill stays clean and a glow can spread past
// the box; hollow and splice also change the words themselves.

import type { CSSProperties } from 'react'
import { isHexColor } from './paint'
import type { TextEffect } from './types'

export const TEXT_EFFECT_TYPES = [
  'neon', 'outline', 'hollow', 'splice', 'offset', 'echo', 'glitch', 'extrude', 'background', 'marker',
] as const

export type TextEffectType = (typeof TEXT_EFFECT_TYPES)[number]

const EFFECT_KEYS: Record<TextEffectType, readonly string[]> = {
  neon: ['type', 'color', 'amount'],
  outline: ['type', 'color', 'amount'],
  hollow: ['type', 'amount'],
  splice: ['type', 'color', 'amount', 'angle'],
  offset: ['type', 'color', 'amount', 'angle'],
  echo: ['type', 'color', 'amount', 'angle'],
  glitch: ['type', 'color', 'color2', 'amount'],
  extrude: ['type', 'color', 'amount', 'angle'],
  background: ['type', 'color', 'amount', 'radius'],
  marker: ['type', 'color', 'amount'],
}

/** Effects whose look runs along a direction: their `angle`, 0 to the right, 90 straight down. */
export const ANGLED_TEXT_EFFECTS: ReadonlySet<TextEffectType> = new Set(['splice', 'offset', 'echo', 'extrude'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function within(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export function isTextEffectType(value: unknown): value is TextEffectType {
  return typeof value === 'string' && (TEXT_EFFECT_TYPES as readonly string[]).includes(value)
}

/** Exactly the keys its type takes: colours #RRGGBB, amount and radius 0–100, angle 0–360. */
export function isValidTextEffect(value: unknown): value is TextEffect {
  if (!isRecord(value) || !isTextEffectType(value.type)) return false
  const keys = EFFECT_KEYS[value.type]
  if (Object.keys(value).length !== keys.length || !keys.every((key) => key in value)) return false
  return keys.every((key) => {
    if (key === 'type') return true
    if (key === 'color' || key === 'color2') return isHexColor(value[key])
    if (key === 'angle') return within(value[key], 0, 360)
    return within(value[key], 0, 100)
  })
}

export function textEffectsEqual(a: TextEffect | undefined, b: TextEffect | undefined): boolean {
  if (!a || !b) return a === b
  const keys = EFFECT_KEYS[a.type]
  return a.type === b.type && keys.every((key) => (a as unknown as Record<string, unknown>)[key] === (b as unknown as Record<string, unknown>)[key])
}

function lightness(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  return (0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255)) / 255
}

function darker(hex: string, share: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (shift: number) => Math.round(((value >> shift) & 255) * (1 - share)).toString(16).padStart(2, '0')
  return `#${channel(16)}${channel(8)}${channel(0)}`
}

/**
 * A fresh effect of `type` for words in `textColor`: the glow and echoes in
 * their own colour, an outline, label or shadow that stands off them, a 3D
 * block a shade darker.
 */
export function defaultTextEffect(type: TextEffectType, textColor: string): TextEffect {
  const lightWords = lightness(textColor) > 0.6
  switch (type) {
    case 'neon': return { type, color: textColor, amount: 50 }
    case 'outline': return { type, color: lightWords ? '#18181b' : '#ffffff', amount: 50 }
    case 'hollow': return { type, amount: 50 }
    case 'splice': return { type, color: '#f59e0b', amount: 50, angle: 45 }
    case 'offset': return { type, color: lightWords ? '#18181b' : '#f59e0b', amount: 45, angle: 45 }
    case 'echo': return { type, color: textColor, amount: 45, angle: 0 }
    case 'glitch': return { type, color: '#00e5ff', color2: '#ff2bd6', amount: 45 }
    case 'extrude': return { type, color: darker(textColor, 0.45), amount: 50, angle: 45 }
    case 'background': return { type, color: lightWords ? '#18181b' : '#fde047', amount: 40, radius: 30 }
    case 'marker': return { type, color: '#fde68a', amount: 50 }
  }
}

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`

function along(distance: number, angle: number): [number, number] {
  const radians = (angle * Math.PI) / 180
  return [Math.cos(radians) * distance, Math.sin(radians) * distance]
}

export interface TextEffectLayer {
  /** For the copy of the words under the text. */
  style: CSSProperties
  /** For a span around that copy's words: label backgrounds and highlighter bands, one per line. */
  band?: CSSProperties
}

/** What the effect draws under the words; null when it only changes the words (hollow). */
export function textEffectLayer(effect: TextEffect, fontSize: number): TextEffectLayer | null {
  const strength = effect.amount / 50
  switch (effect.type) {
    case 'hollow':
      return null
    case 'neon': {
      const [near, mid, far] = [0.04, 0.12, 0.3].map((share) => px(fontSize * share * strength))
      return {
        style: { textShadow: `0 0 ${near} ${rgba(effect.color, 0.95)}, 0 0 ${mid} ${rgba(effect.color, 0.8)}, 0 0 ${far} ${rgba(effect.color, 0.55)}` },
      }
    }
    case 'outline': {
      // A stroke twice the width, half of it hidden under the words: an outline outside them.
      const width = fontSize * 0.05 * strength
      return { style: { color: effect.color, WebkitTextFillColor: effect.color, WebkitTextStroke: `${px(width * 2)} ${effect.color}` } }
    }
    case 'splice':
    case 'offset': {
      const [dx, dy] = along(fontSize * (effect.type === 'splice' ? 0.07 : 0.06) * strength, effect.angle)
      return { style: { textShadow: `${px(dx)} ${px(dy)} 0 ${effect.color}` } }
    }
    case 'echo': {
      const [dx, dy] = along(fontSize * 0.07 * strength, effect.angle)
      return { style: { textShadow: `${px(dx)} ${px(dy)} 0 ${rgba(effect.color, 0.45)}, ${px(dx * 2)} ${px(dy * 2)} 0 ${rgba(effect.color, 0.2)}` } }
    }
    case 'glitch': {
      const offset = fontSize * 0.035 * strength
      return { style: { textShadow: `${px(-offset)} 0 0 ${effect.color}, ${px(offset)} 0 0 ${effect.color2}` } }
    }
    case 'extrude': {
      const depth = fontSize * 0.1 * strength
      const layers = Math.max(1, Math.min(40, Math.round(depth)))
      const [ux, uy] = along(1, effect.angle)
      const steps = Array.from({ length: layers }, (_, index) => {
        const reach = (depth / layers) * (index + 1)
        return `${px(ux * reach)} ${px(uy * reach)} 0 ${effect.color}`
      })
      // A soft shadow under the block grounds it.
      steps.push(`${px(ux * (depth + 2))} ${px(uy * (depth + 2) + 2)} ${px(fontSize * 0.12)} rgba(0, 0, 0, 0.25)`)
      return { style: { textShadow: steps.join(', ') } }
    }
    case 'background': {
      // Padding along the line widens each line's block; the matching negative margin keeps the words where they are.
      const inline = fontSize * (0.1 + 0.14 * strength)
      const block = fontSize * (0.02 + 0.05 * strength)
      return {
        style: {},
        band: {
          backgroundColor: effect.color,
          paddingInline: px(inline),
          paddingBlock: px(block),
          marginInline: px(-inline),
          borderRadius: px(fontSize * 0.6 * (effect.radius / 100)),
        },
      }
    }
    case 'marker': {
      const top = 92 - (12 + 0.44 * effect.amount)
      const inline = fontSize * 0.08
      return {
        style: {},
        band: {
          backgroundImage: `linear-gradient(to bottom, transparent ${top}%, ${effect.color} ${top}%, ${effect.color} 92%, transparent 92%)`,
          paddingInline: px(inline),
          marginInline: px(-inline),
        },
      }
    }
  }
}

/** What the effect changes on the words themselves: hollow and splice leave only an outline in the text's colour. */
export function textEffectWordsStyle(effect: TextEffect, fontSize: number, color: string): CSSProperties {
  if (effect.type !== 'hollow' && effect.type !== 'splice') return {}
  const width = Math.max(1, fontSize * (effect.type === 'hollow' ? 0.012 + 0.022 * (effect.amount / 50) : 0.02))
  return {
    background: 'none',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    WebkitTextStroke: `${px(width)} ${color}`,
    paintOrder: 'normal',
  }
}

/** Whether the effect hides the words' own fill (their colour shows only as the outline). */
export function effectHollowsWords(effect: TextEffect | undefined): boolean {
  return effect?.type === 'hollow' || effect?.type === 'splice'
}
