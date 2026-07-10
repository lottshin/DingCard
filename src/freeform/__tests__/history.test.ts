import { describe, expect, it } from 'vitest'
import { createHistory, pushHistory, redo, undo } from '../history'

describe('freeform history', () => {
  it('undoes and redoes document snapshots', () => {
    const first = { value: 1 }
    const second = { value: 2 }
    let history = createHistory(first)

    history = pushHistory(history, second)

    const undone = undo(history)
    expect(undone.current).toEqual(first)
    const redone = redo(undone)
    expect(redone.current).toEqual(second)
  })

  it('clears redo history when a new snapshot is pushed', () => {
    const first = { value: 1 }
    const second = { value: 2 }
    const third = { value: 3 }

    const undone = undo(pushHistory(createHistory(first), second))
    const next = pushHistory(undone, third)

    expect(next.current).toEqual(third)
    expect(next.future).toEqual([])
  })
})
