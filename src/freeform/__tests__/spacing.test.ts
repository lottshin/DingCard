import { describe, expect, it } from 'vitest'

import { equalGapSnap, equalSpaceSnap, type SpaceGuideBox } from '../spacing'

const box = (id: string, left: number, top: number, width: number, height: number): SpaceGuideBox => ({
  id,
  left,
  top,
  right: left + width,
  bottom: top + height,
})

describe('equal spacing guides', () => {
  it('snaps nearly equal horizontal gaps to their average', () => {
    // 左卡 0–100, moving 140–236, 右卡 280–380: gaps 40 and 44.
    // The snap moves to gaps 42/42: moving start 142, dx +2.
    const left = box('左卡', 0, 0, 100, 100)
    const right = box('右卡', 280, 0, 100, 100)
    const moving = box('中间', 140, 0, 96, 100)
    const snap = equalGapSnap('x', moving, [left, right])
    expect(snap).toEqual({
      dx: 2,
      dy: 0,
      gaps: [{ gap: 42, axis: 'x', before: '左卡', after: '右卡' }],
    })
  })

  it('stays quiet when the gaps already match or are far apart', () => {
    const left = box('左卡', 0, 0, 100, 100)
    const right = box('右卡', 280, 0, 100, 100)
    // Gaps 40 and 40: already equal, nothing to say.
    const exact = box('中间', 140, 0, 100, 100)
    expect(equalGapSnap('x', exact, [left, right])).toBeNull()
    // Gaps 40 and 20: a deliberate placement, not a slip.
    const far = box('中间', 140, 0, 120, 100)
    expect(equalGapSnap('x', far, [left, right])).toBeNull()
  })

  it('needs both neighbours on the axis, overlapping by half', () => {
    const left = box('左卡', 0, 0, 100, 100)
    const right = box('右卡', 280, 0, 100, 100)
    const moving = box('中间', 140, 0, 96, 100)
    // Only one neighbour present: quiet.
    expect(equalGapSnap('x', moving, [left])).toBeNull()
    expect(equalGapSnap('x', moving, [right])).toBeNull()
    // A neighbour in a band that barely overlaps does not count either.
    const drift = box('远处卡', 0, 440, 100, 100)
    expect(equalGapSnap('y', moving, [drift])).toBeNull()
  })

  it('picks the axis with the smaller nudge when both qualify', () => {
    // x: gaps 40/44 → nudge 2. y: gaps 40/38 → nudge 1. y wins.
    const left = box('左卡', 0, 0, 100, 100)
    const right = box('右卡', 280, 0, 100, 100)
    const top = box('上卡', 160, 0, 100, 100)
    const bottom = box('下卡', 160, 278, 100, 100)
    const moving = box('中间', 140, 140, 96, 100)
    const snap = equalSpaceSnap(moving, [left, right, top, bottom])
    expect(snap?.dx).toBe(0)
    expect(snap?.dy).toBe(-1)
    expect(snap?.gaps[0]).toMatchObject({ axis: 'y', gap: 39 })
  })

  it('moves vertical gaps the same way', () => {
    // Gaps 40 and 44 → snap to 42 each.
    const top = box('上卡', 0, 0, 100, 100)
    const bottom = box('下卡', 0, 280, 100, 100)
    const moving = box('中间', 0, 140, 100, 96)
    const snap = equalGapSnap('y', moving, [top, bottom])
    expect(snap).toEqual({
      dx: 0,
      dy: 2,
      gaps: [{ gap: 42, axis: 'y', before: '上卡', after: '下卡' }],
    })
  })
})
