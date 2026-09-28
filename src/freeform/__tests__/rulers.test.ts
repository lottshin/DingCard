import { describe, expect, it } from 'vitest'

import { pickRulerStep, rulerTicks } from '../rulers'

describe('freeform rulers', () => {
  it('picks the smallest step that keeps labels readable on screen', () => {
    expect(pickRulerStep(0.38)).toBe(200)
    expect(pickRulerStep(1)).toBe(50)
    expect(pickRulerStep(2)).toBe(50)
    expect(pickRulerStep(10)).toBe(5)
    expect(pickRulerStep(50)).toBe(1)
  })

  it('caps the step at the coarsest ladder entry and guards bad scales', () => {
    expect(pickRulerStep(0.01)).toBe(2000)
    expect(pickRulerStep(0)).toBe(2000)
    expect(pickRulerStep(Number.NaN)).toBe(2000)
    expect(pickRulerStep(-1)).toBe(2000)
  })

  it('labels every fifth tick and includes both range edges', () => {
    expect(rulerTicks(0, 1000, 200)).toEqual([
      { position: 0, label: '0' },
      { position: 200, label: null },
      { position: 400, label: null },
      { position: 600, label: null },
      { position: 800, label: null },
      { position: 1000, label: '1000' },
    ])
    expect(rulerTicks(250, 750, 50)).toEqual([
      { position: 250, label: '250' },
      { position: 300, label: null },
      { position: 350, label: null },
      { position: 400, label: null },
      { position: 450, label: null },
      { position: 500, label: '500' },
      { position: 550, label: null },
      { position: 600, label: null },
      { position: 650, label: null },
      { position: 700, label: null },
      { position: 750, label: '750' },
    ])
  })

  it('ticks negative world ranges visible left of the page', () => {
    expect(rulerTicks(-1200, 100, 200)).toEqual([
      { position: -1200, label: null },
      { position: -1000, label: '-1000' },
      { position: -800, label: null },
      { position: -600, label: null },
      { position: -400, label: null },
      { position: -200, label: null },
      { position: 0, label: '0' },
    ])
  })

  it('normalizes negative zero and rejects empty or invalid ranges', () => {
    expect(rulerTicks(-100, 100, 100)).toEqual([
      { position: -100, label: null },
      { position: 0, label: '0' },
      { position: 100, label: null },
    ])
    expect(Object.is(rulerTicks(-100, 100, 100)[1].position, -0)).toBe(false)
    expect(rulerTicks(100, 100, 10)).toEqual([])
    expect(rulerTicks(200, 100, 10)).toEqual([])
    expect(rulerTicks(0, 100, 0)).toEqual([])
    expect(rulerTicks(0, 100, Number.NaN)).toEqual([])
    expect(rulerTicks(Number.NaN, 100, 10)).toEqual([])
  })
})
