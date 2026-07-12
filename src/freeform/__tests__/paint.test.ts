import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRADIENT_ANGLE,
  DEFAULT_PAGE_PAINT,
  DEFAULT_TEXT_PAINT,
  normalizeAngle,
  normalizeColorPaint,
  paintFallbackColor,
  paintToCssBackground,
  shapeFillToStyle,
  slideBackgroundToCss,
  textFillToStyle,
  toGradientPaint,
  toSolidPaint,
} from '../paint'

describe('paint helpers', () => {
  it('renders solid and linear-gradient paints as CSS backgrounds', () => {
    expect(paintToCssBackground({ type: 'solid', color: '#18181b' })).toBe('#18181b')
    expect(
      paintToCssBackground({ type: 'linear-gradient', from: '#ffffff', to: '#f97316', angle: 135 }),
    ).toBe('linear-gradient(135deg, #ffffff, #f97316)')
  })

  it('normalizes angles into stable integer degrees', () => {
    expect(normalizeAngle(-45)).toBe(315)
    expect(normalizeAngle(765.7)).toBe(46)
    expect(normalizeAngle(Number.NaN)).toBe(DEFAULT_GRADIENT_ANGLE)
  })

  it('falls back for malformed paint objects', () => {
    expect(normalizeColorPaint(null, DEFAULT_TEXT_PAINT)).toEqual(DEFAULT_TEXT_PAINT)
    expect(normalizeColorPaint({ type: 'solid', color: 'red' }, DEFAULT_TEXT_PAINT)).toEqual(DEFAULT_TEXT_PAINT)
    expect(
      normalizeColorPaint(
        { type: 'linear-gradient', from: '#fff', to: '#f97316', angle: 'bad' },
        DEFAULT_TEXT_PAINT,
      ),
    ).toEqual(DEFAULT_TEXT_PAINT)
  })

  it('renders slide backgrounds and shape fills consistently', () => {
    expect(slideBackgroundToCss({ type: 'transparent' })).toBe('transparent')
    expect(slideBackgroundToCss(DEFAULT_PAGE_PAINT)).toBe('#ffffff')
    expect(shapeFillToStyle({ type: 'image', src: 'data:image/png;base64,abc', fit: 'contain' })).toMatchObject({
      backgroundImage: 'url("data:image/png;base64,abc")',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    })
  })

  it('renders gradient text with a caret fallback color', () => {
    const style = textFillToStyle({ type: 'linear-gradient', from: '#18181b', to: '#f97316', angle: 90 })
    expect(style.backgroundImage).toBe('linear-gradient(90deg, #18181b, #f97316)')
    expect(style.backgroundClip).toBe('text')
    expect(style.color).toBe('transparent')
    expect(style.caretColor).toBe('#18181b')
    expect(paintFallbackColor({ type: 'linear-gradient', from: '#18181b', to: '#f97316', angle: 90 })).toBe(
      '#18181b',
    )
  })

  it('converts between solid and gradient fills with deterministic defaults', () => {
    expect(toGradientPaint({ type: 'solid', color: '#111111' })).toEqual({
      type: 'linear-gradient',
      from: '#111111',
      to: '#f97316',
      angle: 135,
    })
    expect(toSolidPaint({ type: 'linear-gradient', from: '#222222', to: '#f97316', angle: 90 })).toEqual({
      type: 'solid',
      color: '#222222',
    })
  })
})
