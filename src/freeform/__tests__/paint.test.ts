import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GRADIENT_ANGLE,
  DEFAULT_PAGE_PAINT,
  DEFAULT_TEXT_PAINT,
  PAGE_PATTERN_SIZE_DEFAULT,
  isValidPagePattern,
  isValidPagePatternSize,
  normalizeAngle,
  pagePatternFor,
  patternPaintToCssBackground,
  normalizeColorPaint,
  paintFallbackColor,
  paintToCssBackground,
  shapeFillToStyle,
  slideBackgroundToCss,
  svgGradientOf,
  textFillToStyle,
  toGradientPaint,
  toRadialPaint,
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
    expect(shapeFillToStyle({
      type: 'image',
      src: 'data:image/png;base64,abc',
      fit: 'contain',
      framing: { focusX: 0.5, focusY: 0.5, zoom: 1 },
    })).toEqual({})
  })

  it('renders the v32 patterned page as one CSS background shorthand', () => {
    const base = { type: 'pattern', color: '#fdf6ec', patternColor: '#18181b', size: 20 } as const
    // Dots: one tile-sized radial gradient over the base.
    expect(patternPaintToCssBackground({ ...base, pattern: 'dots' }))
      .toBe('radial-gradient(circle, #18181b 26%, transparent 27%) 0 0 / 20px 20px, #fdf6ec')
    // Grid: a horizontal and a vertical hairline per tile.
    expect(patternPaintToCssBackground({ ...base, pattern: 'grid' }))
      .toBe('linear-gradient(#18181b 1px, transparent 1px) 0 0 / 20px 20px, linear-gradient(90deg, #18181b 1px, transparent 1px) 0 0 / 20px 20px, #fdf6ec')
    // Lines: full-width horizontal stripes.
    expect(patternPaintToCssBackground({ ...base, pattern: 'lines' }))
      .toBe('linear-gradient(#18181b 1px, transparent 1px) 0 0 / 100% 20px, #fdf6ec')
    // Checks: two diagonal hairline sets crossing each other.
    const checks = patternPaintToCssBackground({ ...base, pattern: 'checks' })
    expect(checks).toContain('repeating-linear-gradient(45deg, #18181b, #18181b 1px, transparent 1px, transparent 5px)')
    expect(checks).toContain('repeating-linear-gradient(-45deg,')
    expect(checks.endsWith(', #fdf6ec')).toBe(true)
    // The page background renders the same string; sizes round to whole px.
    expect(slideBackgroundToCss({ ...base, pattern: 'dots', size: 20.4 }))
      .toBe('radial-gradient(circle, #18181b 26%, transparent 27%) 0 0 / 20px 20px, #fdf6ec')
  })

  it('derives a pattern from any background, inking light bases and whitening dark ones', () => {
    expect(pagePatternFor(DEFAULT_PAGE_PAINT, 'dots')).toEqual({
      type: 'pattern', color: '#ffffff', patternColor: '#18181b', pattern: 'dots', size: PAGE_PATTERN_SIZE_DEFAULT,
    })
    expect(pagePatternFor({ type: 'solid', color: '#101828' }, 'grid')).toEqual({
      type: 'pattern', color: '#101828', patternColor: '#ffffff', pattern: 'grid', size: 20,
    })
    // A gradient keeps its first colour as the base; a pattern keeps its own colours.
    expect(pagePatternFor({ type: 'linear-gradient', from: '#fef3c7', to: '#f59e0b', angle: 90 }, 'lines').color).toBe('#fef3c7')
    const patterned = pagePatternFor(DEFAULT_PAGE_PAINT, 'dots')
    expect(pagePatternFor(patterned, 'checks')).toEqual({ ...patterned, pattern: 'checks' })
    // The motif and its size answer to their own validators.
    expect(isValidPagePattern('dots')).toBe(true)
    expect(isValidPagePattern('stripes')).toBe(false)
    expect(isValidPagePatternSize(8)).toBe(true)
    expect(isValidPagePatternSize(64)).toBe(true)
    expect(isValidPagePatternSize(7)).toBe(false)
    expect(isValidPagePatternSize(65)).toBe(false)
    expect(isValidPagePatternSize('20')).toBe(false)
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

  it('renders the v12 radial gradient as a centered CSS background', () => {
    const stops = [
      { offset: 0, color: '#fde68a' },
      { offset: 1, color: '#c2410c' },
    ]
    expect(paintToCssBackground({ type: 'radial-gradient', stops })).toBe(
      'radial-gradient(circle farthest-corner at 50% 50%, #fde68a 0%, #c2410c 100%)',
    )
    expect(slideBackgroundToCss({ type: 'radial-gradient', stops })).toBe(
      'radial-gradient(circle farthest-corner at 50% 50%, #fde68a 0%, #c2410c 100%)',
    )
    expect(paintFallbackColor({ type: 'radial-gradient', stops })).toBe('#fde68a')
    expect(textFillToStyle({ type: 'radial-gradient', stops }).backgroundImage).toBe(
      'radial-gradient(circle farthest-corner at 50% 50%, #fde68a 0%, #c2410c 100%)',
    )
  })

  it('converts the radial form to and from the linear form without losing stops', () => {
    const stops = [
      { offset: 0, color: '#fde68a' },
      { offset: 0.5, color: '#f97316' },
      { offset: 1, color: '#c2410c' },
    ]
    const linear = toGradientPaint({ type: 'radial-gradient', stops })
    expect(linear).toEqual({ type: 'linear-gradient', stops, angle: DEFAULT_GRADIENT_ANGLE })
    expect(toRadialPaint(linear)).toEqual({ type: 'radial-gradient', stops })
    expect(toRadialPaint({ type: 'solid', color: '#111111' })).toEqual({
      type: 'radial-gradient',
      stops: [
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#f97316' },
      ],
    })
    expect(toRadialPaint({ type: 'linear-gradient', from: '#111111', to: '#eeeeee', angle: 45 })).toEqual({
      type: 'radial-gradient',
      stops: [
        { offset: 0, color: '#111111' },
        { offset: 1, color: '#eeeeee' },
      ],
    })
    expect(toSolidPaint({ type: 'radial-gradient', stops })).toEqual({ type: 'solid', color: '#fde68a' })
  })
})

describe('SVG gradients for path fills', () => {
  it('lays a linear gradient along the CSS gradient line', () => {
    expect(svgGradientOf({ type: 'solid', color: '#000000' }, 100, 50)).toBeNull()
    const rightward = svgGradientOf({ type: 'linear-gradient', from: '#000000', to: '#ffffff', angle: 90 }, 100, 50)
    expect(rightward).toMatchObject({ kind: 'linear', x1: 0, x2: 100, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] })
    if (rightward?.kind !== 'linear') throw new Error('Expected a linear gradient')
    expect(rightward.y1).toBeCloseTo(25)
    expect(rightward.y2).toBeCloseTo(25)

    // 45deg in a square runs corner to corner, bottom-left to top-right.
    const diagonal = svgGradientOf({ type: 'linear-gradient', stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }], angle: 45 }, 100, 100)
    if (diagonal?.kind !== 'linear') throw new Error('Expected a linear gradient')
    expect([diagonal.x1, diagonal.y1, diagonal.x2, diagonal.y2].map((value) => Math.round(value) || 0)).toEqual([0, 100, 100, 0])
  })

  it('centres a radial gradient out to the farthest corner', () => {
    expect(svgGradientOf({ type: 'radial-gradient', stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] }, 60, 80))
      .toMatchObject({ kind: 'radial', cx: 30, cy: 40, r: 50 })
  })
})
