import { describe, expect, it } from 'vitest'

import { reduceFreeformDocument } from '../document'
import { normalizeFreeformDocument } from '../sceneDocument'
import { copyStylePatch } from '../styleClipboard'
import {
  defaultTextEffect,
  isValidTextEffect,
  TEXT_EFFECT_TYPES,
  textEffectLayer,
  textEffectWordsStyle,
} from '../textEffects'
import { TEXT_STYLE_PRESETS, textStylePatch } from '../textStyles'
import type { FreeformDocument, FreeformTextElement, TextEffect } from '../types'

function title(overrides: Partial<FreeformTextElement> = {}): FreeformTextElement {
  return {
    id: 'title', name: '标题', locked: false, hidden: false, type: 'text',
    x: 80, y: 120, width: 900, height: 200, rotation: 0, scale: 1,
    text: '花字效果', fontSize: 100, fontFamily: 'PingFang SC',
    textFill: { type: 'solid', color: '#18181b' }, align: 'left', fontWeight: 'bold',
    stroke: '#ffffff', strokeWidth: 4, shadow: { color: '#000000', blur: 10, offsetX: 0, offsetY: 4 },
    ...overrides,
  }
}

function deck(node: FreeformTextElement, documentVersion: number = 17): FreeformDocument {
  return {
    documentVersion,
    activeSlideId: 'page',
    slides: [{ id: 'page', name: 'Page 1', width: 1080, height: 1440, background: { type: 'solid', color: '#ffffff' }, nodes: [node] }],
  } as FreeformDocument
}

describe('text effects', () => {
  it('takes exactly the keys each type has, in range', () => {
    for (const type of TEXT_EFFECT_TYPES) {
      expect(isValidTextEffect(defaultTextEffect(type, '#18181b')), type).toBe(true)
    }
    expect(isValidTextEffect({ type: 'neon', color: '#22d3ee', amount: 50, angle: 0 })).toBe(false)
    expect(isValidTextEffect({ type: 'neon', color: 'cyan', amount: 50 })).toBe(false)
    expect(isValidTextEffect({ type: 'neon', color: '#22d3ee', amount: 101 })).toBe(false)
    expect(isValidTextEffect({ type: 'extrude', color: '#000000', amount: 50, angle: 361 })).toBe(false)
    expect(isValidTextEffect({ type: 'sparkle', amount: 50 })).toBe(false)
  })

  it('sizes every effect by the font size, so it looks the same at any size', () => {
    const neon: TextEffect = { type: 'neon', color: '#22d3ee', amount: 50 }
    expect(textEffectLayer(neon, 100)?.style.textShadow).toContain('0 0 30px')
    expect(textEffectLayer(neon, 50)?.style.textShadow).toContain('0 0 15px')
    // An outline is a stroke twice its width on the copy, half of it under the words.
    expect(textEffectLayer({ type: 'outline', color: '#ffffff', amount: 50 }, 100)?.style.WebkitTextStroke).toBe('10px #ffffff')
    // An offset shadow goes along its angle: 90 is straight down.
    expect(textEffectLayer({ type: 'offset', color: '#000000', amount: 50, angle: 90 }, 100)?.style.textShadow).toBe('0px 6px 0 #000000')
    // A 3D block is one shadow per pixel of depth, then a soft one under it.
    const extrude = textEffectLayer({ type: 'extrude', color: '#c2410c', amount: 50, angle: 45 }, 100)!.style.textShadow as string
    expect(extrude.match(/#c2410c/g)).toHaveLength(10)
    expect(extrude).toContain('rgba(0, 0, 0, 0.25)')
  })

  it('draws label backgrounds and highlighter bands one per line, without moving the words', () => {
    const label = textEffectLayer({ type: 'background', color: '#18181b', amount: 50, radius: 50 }, 100)!
    expect(label.band).toMatchObject({ backgroundColor: '#18181b', paddingInline: '24px', marginInline: '-24px', borderRadius: '30px' })
    const marker = textEffectLayer({ type: 'marker', color: '#fde68a', amount: 50 }, 100)!
    expect(marker.band?.backgroundImage).toContain('#fde68a 58%')
  })

  it('leaves hollow and spliced words only their outline, in the text colour', () => {
    expect(textEffectLayer({ type: 'hollow', amount: 50 }, 100)).toBeNull()
    expect(textEffectWordsStyle({ type: 'hollow', amount: 50 }, 100, '#18181b')).toMatchObject({
      WebkitTextFillColor: 'transparent',
      WebkitTextStroke: '3.4px #18181b',
      background: 'none',
    })
    expect(textEffectWordsStyle({ type: 'splice', color: '#f59e0b', amount: 50, angle: 45 }, 100, '#18181b').WebkitTextStroke).toBe('2px #18181b')
    expect(textEffectWordsStyle({ type: 'neon', color: '#22d3ee', amount: 50 }, 100, '#18181b')).toEqual({})
  })

  it('picks new effects to suit the words: outlines and labels that stand off them', () => {
    expect(defaultTextEffect('outline', '#18181b')).toMatchObject({ color: '#ffffff' })
    expect(defaultTextEffect('outline', '#ffffff')).toMatchObject({ color: '#18181b' })
    expect(defaultTextEffect('background', '#ffffff')).toMatchObject({ color: '#18181b' })
    expect(defaultTextEffect('neon', '#f472b6')).toMatchObject({ color: '#f472b6' })
  })

  it('is a v17 text key: kept, copied with the style, set and cleared by the reducer', () => {
    const effect: TextEffect = { type: 'glitch', color: '#00e5ff', color2: '#ff2bd6', amount: 45 }
    const document = normalizeFreeformDocument(deck(title({ effect })))!
    expect(document.slides[0].nodes[0]).toMatchObject({ effect })
    // A v16 document can't carry one.
    expect(normalizeFreeformDocument(deck(title({ effect }), 16))).toBeNull()
    expect(copyStylePatch(document.slides[0].nodes[0])).toMatchObject({ effect })

    const changed = reduceFreeformDocument(document, {
      type: 'node/update-style', slideId: 'page', updates: [{ path: ['title'], patch: { effect: { ...effect, amount: 80 } } }],
    })
    expect((changed.slides[0].nodes[0] as FreeformTextElement).effect).toMatchObject({ amount: 80 })
    const cleared = reduceFreeformDocument(changed, { type: 'node/update-style', slideId: 'page', updates: [{ path: ['title'], patch: { effect: null } }] })
    expect('effect' in cleared.slides[0].nodes[0]).toBe(false)
    // An invalid effect changes nothing.
    expect(reduceFreeformDocument(document, {
      type: 'node/update-style', slideId: 'page', updates: [{ path: ['title'], patch: { effect: { type: 'neon', color: 'red', amount: 50 } as TextEffect } }],
    })).toBe(document)
  })
})

describe('花字 presets', () => {
  it('each gives a text its fill, effect and weight, replacing its outline and shadow, as a valid document', () => {
    const ids = new Set<string>()
    for (const preset of TEXT_STYLE_PRESETS) {
      expect(ids.has(preset.id), preset.id).toBe(false)
      ids.add(preset.id)
      const document = deck(title())
      const next = reduceFreeformDocument(document, {
        type: 'node/update-style', slideId: 'page', updates: [{ path: ['title'], patch: textStylePatch(preset) }],
      })
      expect(next, preset.id).not.toBe(document)
      expect(normalizeFreeformDocument(next), preset.id).not.toBeNull()
      const node = next.slides[0].nodes[0] as FreeformTextElement
      expect(node.textFill, preset.id).toEqual(preset.textFill)
      expect(node.effect, preset.id).toEqual(preset.effect ?? undefined)
      expect(node.stroke, preset.id).toBeUndefined()
      expect(node.shadow, preset.id).toBeUndefined()
      expect(node.fontWeight).toBe('bold')
    }
    expect(ids.size).toBe(16)
  })
})
