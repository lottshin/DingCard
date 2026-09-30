export interface HistoryEntry<T> {
  state: T
  /**
   * Human label of the edit that transformed this entry's state into the
   * next state in the timeline (the following past entry, or current).
   */
  label: string
}

export interface HistoryState<T> {
  past: HistoryEntry<T>[]
  current: T
  future: HistoryEntry<T>[]
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], current: initial, future: [] }
}

export function pushHistory<T>(
  history: HistoryState<T>,
  next: T,
  label: string,
): HistoryState<T> {
  if (Object.is(history.current, next)) return history
  return { past: [...history.past, { state: history.current, label }], current: next, future: [] }
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    current: previous.state,
    future: [{ state: history.current, label: previous.label }, ...history.future],
  }
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, { state: history.current, label: next.label }],
    current: next.state,
    future: history.future.slice(1),
  }
}

/**
 * Jump the timeline to any past or future state in one step, moving every
 * skipped state to the other side. Entry labels travel with their edges so
 * undo/redo through a jump reads the same as the original edit sequence.
 */
export function jumpHistory<T>(
  history: HistoryState<T>,
  target: { kind: 'past' | 'future'; index: number },
): HistoryState<T> {
  if (!Number.isInteger(target.index) || target.index < 0) return history
  if (target.kind === 'past') {
    const entry = history.past[target.index]
    if (!entry) return history
    const skipped = history.past.slice(target.index + 1)
    return {
      past: history.past.slice(0, target.index),
      current: entry.state,
      future: [
        ...skipped.map((skippedEntry, offset) => ({
          state: skippedEntry.state,
          label: history.past[target.index + offset].label,
        })),
        { state: history.current, label: history.past[history.past.length - 1].label },
        ...history.future,
      ],
    }
  }
  const entry = history.future[target.index]
  if (!entry) return history
  return {
    past: [
      ...history.past,
      { state: history.current, label: history.future[0].label },
      ...history.future.slice(0, target.index).map((futureEntry, offset) => ({
        state: futureEntry.state,
        label: history.future[offset + 1].label,
      })),
    ],
    current: entry.state,
    future: history.future.slice(target.index + 1),
  }
}
