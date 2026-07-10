export interface HistoryState<T> {
  past: T[]
  current: T
  future: T[]
}

export function createHistory<T>(initial: T): HistoryState<T> {
  return { past: [], current: initial, future: [] }
}

export function pushHistory<T>(history: HistoryState<T>, next: T): HistoryState<T> {
  if (Object.is(history.current, next)) return history
  return { past: [...history.past, history.current], current: next, future: [] }
}

export function undo<T>(history: HistoryState<T>): HistoryState<T> {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    current: previous,
    future: [history.current, ...history.future],
  }
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.current],
    current: next,
    future: history.future.slice(1),
  }
}
