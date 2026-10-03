import { describe, expect, it } from 'vitest'
import {
  applyTextTransform,
  blendOver,
  chooseFont,
  gradientPaint,
  hexOf,
  individualTransform,
  listMarkerText,
  multiplyAffine,
  parseFilter,
  parseGradient,
  parseRgb,
  parseShadows,
  parseTransform,
  pseudoContentText,
  similarityOf,
  splitTopLevel,
} from '../htmlImportCss'

describe('html import css values', () => {
  it('splits lists only at top-level separators', () => {
    expect(splitTopLevel('rgb(1, 2, 3) 10%, rgba(0, 0, 0, 0.5) 90%')).toEqual(['rgb(1, 2, 3) 10%', 'rgba(0, 0, 0, 0.5) 90%'])
    expect(splitTopLevel('rgb(1, 2, 3) 0px 4px', ' ')).toEqual(['rgb(1, 2, 3)', '0px', '4px'])
    expect(splitTopLevel(`"a, b", c`)).toEqual(['"a, b"', 'c'])
  })

  it('reads computed colours', () => {
    expect(parseRgb('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0, a: 1 })
    expect(parseRgb('rgba(0, 0, 0, 0.25)')).toEqual({ r: 0, g: 0, b: 0, a: 0.25 })
    expect(parseRgb('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseRgb('transparent')?.a).toBe(0)
    expect(parseRgb('oklch(0.7 0.1 200)')).toBeNull()
    expect(hexOf({ r: 255, g: 128.4, b: 0 })).toBe('#ff8000')
    expect(hexOf(blendOver({ r: 0, g: 0, b: 0, a: 0.15 }, { r: 255, g: 255, b: 255 }))).toBe('#d9d9d9')
  })

  it('reads linear gradients with angles, sides, corners and stop positions', () => {
    const angled = parseGradient('linear-gradient(135deg, rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)', 100, 100)
    expect(angled).toEqual({ kind: 'linear', angle: 135, stops: [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
    ] })
    expect(parseGradient('linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))', 10, 10)).toMatchObject({ angle: 180 })
    expect(parseGradient('linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))', 10, 10)).toMatchObject({ angle: 90 })
    // A corner direction depends on the box: in a 2:1 box "to top right" is about 63°.
    const corner = parseGradient('linear-gradient(to top right, rgb(0, 0, 0), rgb(255, 255, 255))', 200, 100)
    expect(corner?.kind === 'linear' && corner.angle).toBeCloseTo(26.565, 2)
    const spread = parseGradient('linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 255, 0), rgb(0, 0, 255) 80%)', 100, 10)
    expect(spread?.stops.map((stop) => stop.offset)).toEqual([0, 0.4, 0.8])
    const pixels = parseGradient('linear-gradient(90deg, rgb(255, 0, 0) 20px, rgb(0, 0, 255) 80px)', 100, 10)
    expect(pixels?.stops.map((stop) => stop.offset)).toEqual([0.2, 0.8])
    expect(parseGradient('repeating-linear-gradient(90deg, rgb(0, 0, 0), rgb(1, 1, 1) 10px)', 10, 10)).toBeNull()
    expect(parseGradient('conic-gradient(rgb(0, 0, 0), rgb(1, 1, 1))', 10, 10)).toBeNull()
  })

  it('turns gradients into paints when the stops share one alpha', () => {
    const solid = parseGradient('linear-gradient(90deg, rgb(255, 0, 0), rgb(0, 0, 255))', 100, 10)!
    expect(gradientPaint(solid)).toEqual({ paint: { type: 'linear-gradient', from: '#ff0000', to: '#0000ff', angle: 90 }, alpha: 1 })
    const faded = parseGradient('linear-gradient(90deg, rgba(255, 0, 0, 0.5), rgba(0, 0, 255, 0.5))', 100, 10)!
    expect(gradientPaint(faded)?.alpha).toBe(0.5)
    const overlay = parseGradient('linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.7))', 100, 10)!
    expect(gradientPaint(overlay)).toBeNull()
    // Stops past the ends are cut at 0 and 1 with the colour they have there.
    const wide = parseGradient('linear-gradient(90deg, rgb(0, 0, 0) -100%, rgb(255, 255, 255) 100%)', 100, 10)!
    expect(gradientPaint(wide)?.paint).toMatchObject({ from: '#808080', to: '#ffffff' })
    const circle = parseGradient('radial-gradient(circle, rgb(255, 255, 255) 0%, rgb(0, 0, 0) 100%)', 300, 100)!
    expect(gradientPaint(circle)?.paint).toEqual({ type: 'radial-gradient', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#000000' }] })
    expect(gradientPaint(parseGradient('radial-gradient(rgb(255, 255, 255), rgb(0, 0, 0))', 300, 100)!)).toBeNull()
    expect(gradientPaint(parseGradient('radial-gradient(circle at 20% 30%, rgb(255, 255, 255), rgb(0, 0, 0))', 100, 100)!)).toBeNull()
  })

  it('reads shadows, transforms and filters', () => {
    expect(parseShadows('rgba(0, 0, 0, 0.2) 0px 4px 12px 2px, rgb(255, 0, 0) 1px 1px 0px 0px inset')).toEqual([
      { inset: false, x: 0, y: 4, blur: 12, spread: 2, color: { r: 0, g: 0, b: 0, a: 0.2 } },
      { inset: true, x: 1, y: 1, blur: 0, spread: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
    ])
    expect(parseShadows('none')).toEqual([])
    const turned = parseTransform('matrix(0.866025, 0.5, -0.5, 0.866025, 10, 20)')!
    expect(similarityOf(turned)).toMatchObject({ rotation: 30, exact: true })
    expect(similarityOf(turned).scale).toBeCloseTo(1, 4)
    expect(similarityOf([2, 0, 0, 1, 0, 0]).exact).toBe(false)
    expect(parseTransform('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 0, 1)')).toEqual([1, 0, 0, 1, 5, 6])
    expect(parseTransform('matrix3d(1, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)')).toBeNull()
    const individual = individualTransform('50% 10px', '90deg', '2', { width: 40, height: 10 })!
    expect(individual.map((value) => Math.round(value * 1000) / 1000)).toEqual([0, 2, -2, 0, 20, 10])
    expect(multiplyAffine([1, 0, 0, 1, 5, 0], [2, 0, 0, 2, 0, 0])).toEqual([2, 0, 0, 2, 5, 0])
    const filter = parseFilter('blur(4px) brightness(1.2) saturate(100%) hue-rotate(-30deg) opacity(0.5) invert(1) drop-shadow(rgba(0, 0, 0, 0.3) 0px 2px 4px)')
    expect(filter.filter).toEqual({ blur: 4, brightness: 1.2, hue: 330 })
    expect(filter.opacity).toBe(0.5)
    expect(filter.unsupported).toEqual(['invert'])
    expect(filter.dropShadow).toMatchObject({ y: 2, blur: 4 })
  })

  it('chooses the freeform font a stack names, or the closest kind', () => {
    expect(chooseFont(`"Noto Serif SC", serif`)).toEqual({ fontFamily: `'Noto Serif SC', serif`, replaced: null })
    expect(chooseFont('Inter, "PingFang SC", sans-serif').replaced).toBeNull()
    expect(chooseFont('"Microsoft YaHei", sans-serif')).toEqual({ fontFamily: 'PingFang SC, Microsoft YaHei, system-ui, sans-serif', replaced: null })
    expect(chooseFont('Georgia, serif')).toEqual({ fontFamily: `'Noto Serif SC', serif`, replaced: 'Georgia' })
    expect(chooseFont('Inter, sans-serif')).toEqual({ fontFamily: 'PingFang SC, Microsoft YaHei, system-ui, sans-serif', replaced: 'Inter' })
    expect(chooseFont('"Ma Shan Zheng", cursive').fontFamily).toBe(`'LXGW WenKai TC', cursive`)
    expect(chooseFont('serif').replaced).toBeNull()
  })

  it('applies text-transform and spells out markers and pseudo content', () => {
    expect(applyTextTransform('hello world', 'uppercase')).toBe('HELLO WORLD')
    expect(applyTextTransform('hello world', 'capitalize')).toBe('Hello World')
    expect(listMarkerText('decimal', 3)).toBe('3.')
    expect(listMarkerText('disc', 1)).toBe('•')
    expect(listMarkerText('cjk-decimal', 12)).toBe('一二、')
    expect(listMarkerText('none', 1)).toBeNull()
    expect(pseudoContentText('"★ " attr(data-label)', (name) => (name === 'data-label' ? '热卖' : null))).toEqual({ text: '★ 热卖' })
    expect(pseudoContentText('""', () => null)).toEqual({ text: '' })
    expect(pseudoContentText('counter(item)', () => null)).toEqual({ unsupported: 'counter(item)' })
    expect(pseudoContentText('url("a.png")', () => null)).toEqual({ image: 'a.png' })
    expect(pseudoContentText('none', () => null)).toBeNull()
  })
})
