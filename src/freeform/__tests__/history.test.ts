import { describe, expect, it } from 'vitest'
import {
  createHistory,
  isLatestSaveForDraft,
  jumpHistory,
  pushHistory,
  redo,
  undo,
} from '../history'

describe('freeform history', () => {
  it('undoes and redoes labeled document snapshots', () => {
    const first = { value: 1 }
    const second = { value: 2 }
    let history = createHistory(first)

    history = pushHistory(history, second, '编辑')

    expect(history.past).toEqual([{ state: first, label: '编辑' }])
    const undone = undo(history)
    expect(undone.current).toEqual(first)
    expect(undone.past).toEqual([])
    expect(undone.future).toEqual([{ state: second, label: '编辑' }])
    const redone = redo(undone)
    expect(redone.current).toEqual(second)
    // The label rides the edge, so redo re-labels the past entry identically.
    expect(redone.past).toEqual([{ state: first, label: '编辑' }])
    expect(redone.future).toEqual([])
  })

  it('clears redo history when a new snapshot is pushed', () => {
    const first = { value: 1 }
    const second = { value: 2 }
    const third = { value: 3 }

    const undone = undo(pushHistory(createHistory(first), second, '编辑'))
    const next = pushHistory(undone, third, '再编辑')

    expect(next.current).toEqual(third)
    expect(next.future).toEqual([])
  })

  it('jumps back to any past state, moving skipped states to the future', () => {
    const s0 = { value: 0 }
    const s1 = { value: 1 }
    const s2 = { value: 2 }
    const s3 = { value: 3 }
    let history = createHistory(s0)
    history = pushHistory(history, s1, '插入对象')
    history = pushHistory(history, s2, '移动对象')
    history = pushHistory(history, s3, '更改样式')

    const jumped = jumpHistory(history, { kind: 'past', index: 1 })
    expect(jumped.current).toEqual(s1)
    expect(jumped.past.map((entry) => [entry.state, entry.label])).toEqual([[s0, '插入对象']])
    expect(jumped.future.map((entry) => [entry.state, entry.label])).toEqual([
      [s2, '移动对象'],
      [s3, '更改样式'],
    ])

    // Jumping to the newest past state matches undo exactly.
    const asUndo = jumpHistory(history, { kind: 'past', index: 2 })
    expect(asUndo).toEqual(undo(history))
  })

  it('jumps forward to any future state, relabeling the traversed edges', () => {
    const s0 = { value: 0 }
    const s1 = { value: 1 }
    const s2 = { value: 2 }
    let history = createHistory(s0)
    history = pushHistory(history, s1, '插入对象')
    history = pushHistory(history, s2, '移动对象')
    history = undo(history)
    history = undo(history)

    const jumped = jumpHistory(history, { kind: 'future', index: 1 })
    expect(jumped.current).toEqual(s2)
    expect(jumped.past.map((entry) => [entry.state, entry.label])).toEqual([
      [s0, '插入对象'],
      [s1, '移动对象'],
    ])
    expect(jumped.future).toEqual([])

    // Jumping to the oldest future state matches redo exactly.
    const asRedo = jumpHistory(history, { kind: 'future', index: 0 })
    expect(asRedo).toEqual(redo(history))

    // Undo/redo through a jump keeps the original labels readable.
    const roundTrip = undo(jumped)
    expect(roundTrip.current).toEqual(s1)
    expect(roundTrip.future[0]).toEqual({ state: s2, label: '移动对象' })
  })

  it('ignores invalid jump targets', () => {
    const history = pushHistory(
      pushHistory(createHistory({ value: 0 }), { value: 1 }, '编辑'),
      { value: 2 },
      '再编辑',
    )
    expect(jumpHistory(history, { kind: 'past', index: -1 })).toBe(history)
    expect(jumpHistory(history, { kind: 'past', index: 2 })).toBe(history)
    expect(jumpHistory(history, { kind: 'past', index: 1.5 })).toBe(history)
    expect(jumpHistory(history, { kind: 'future', index: 0 })).toBe(history)
  })

  it('accepts save results only from the latest request for the same draft identity', () => {
    expect(isLatestSaveForDraft(2, 2, null, null)).toBe(true)
    expect(isLatestSaveForDraft(1, 2, null, null)).toBe(false)
    expect(isLatestSaveForDraft(2, 2, 'draft-a', 'draft-b')).toBe(false)
    expect(isLatestSaveForDraft(2, 2, null, 'created-by-another-save')).toBe(false)
  })
})
