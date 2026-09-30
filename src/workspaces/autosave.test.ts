import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Draft, SaveDraftInput } from '../drafts'
import { flushAllAutosaves, ProjectAutosaver, type AutosaveContent } from './autosave'

const DOCUMENT = {
  source: '# 标题',
  platformId: 'rednote',
  themeId: 'clean',
  fontFamily: 'system',
  profile: {
    nickname: '',
    handle: '',
    location: '',
    avatarColor: '#000000',
    avatarImage: null,
    verified: false,
    headerFirstPageOnly: true,
  },
  radius: 18,
}

function content(source: string): AutosaveContent {
  return { mode: 'markdown-card', document: { ...DOCUMENT, source } }
}

function draftFor(input: SaveDraftInput, id: string): Draft {
  if (input.mode !== 'markdown-card') throw new Error('markdown only')
  return { id, title: input.title ?? 'T', schemaVersion: 2, updatedAt: 1, mode: 'markdown-card', document: input.document }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ProjectAutosaver', () => {
  it('saves once edits pause, with only the latest content', async () => {
    const save = vi.fn(async (input: SaveDraftInput) => draftFor(input, 'p1'))
    const onSaved = vi.fn()
    const saver = new ProjectAutosaver(save, null, { onSaved, onError: vi.fn() }, 500)

    saver.schedule(content('a'), 1)
    await vi.advanceTimersByTimeAsync(300)
    saver.schedule(content('ab'), 2)
    await vi.advanceTimersByTimeAsync(300)
    expect(save).not.toHaveBeenCalled()
    expect(saver.busy).toBe(true)

    await vi.advanceTimersByTimeAsync(250)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({ id: undefined, document: { source: 'ab' } })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), content('ab'), 2)
    expect(saver.id).toBe('p1')
    expect(saver.busy).toBe(false)
  })

  it('never creates the project twice: edits during the first save reuse its id', async () => {
    const first = deferred<Draft>()
    const save = vi.fn((input: SaveDraftInput) => (
      save.mock.calls.length === 1 ? first.promise : Promise.resolve(draftFor(input, input.id ?? 'dup'))
    ))
    const saver = new ProjectAutosaver(save, null, { onSaved: vi.fn(), onError: vi.fn() }, 100)

    saver.schedule(content('a'), undefined)
    await vi.advanceTimersByTimeAsync(100)
    saver.schedule(content('ab'), undefined)
    await vi.advanceTimersByTimeAsync(100)
    // The second save waits for the first one.
    expect(save).toHaveBeenCalledTimes(1)

    first.resolve(draftFor(save.mock.calls[0][0], 'p1'))
    await vi.runAllTimersAsync()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toMatchObject({ id: 'p1', document: { source: 'ab' } })
  })

  it('keeps failed content for a retry and reports the error', async () => {
    const save = vi.fn<(input: SaveDraftInput) => Promise<Draft>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (input) => draftFor(input, 'p1'))
    const onError = vi.fn()
    const onSaved = vi.fn()
    const saver = new ProjectAutosaver(save, 'p1', { onSaved, onError }, 100)

    saver.schedule(content('a'), undefined)
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(saver.busy).toBe(true)

    await saver.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toMatchObject({ id: 'p1', document: { source: 'a' } })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(saver.busy).toBe(false)
  })

  it('still saves queued content after detaching, without telling the editor', async () => {
    const save = vi.fn(async (input: SaveDraftInput) => draftFor(input, 'p1'))
    const onSaved = vi.fn()
    const saver = new ProjectAutosaver(save, 'p1', { onSaved, onError: vi.fn() }, 1000)

    saver.schedule(content('last words'), undefined)
    await saver.detach()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toMatchObject({ id: 'p1', document: { source: 'last words' } })
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('drops queued content when cancelled', async () => {
    const save = vi.fn(async (input: SaveDraftInput) => draftFor(input, 'p1'))
    const saver = new ProjectAutosaver(save, 'p1', { onSaved: vi.fn(), onError: vi.fn() }, 100)

    saver.schedule(content('gone'), undefined)
    saver.cancel()
    await vi.runAllTimersAsync()
    await saver.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('flushes every saver that still has work', async () => {
    const save = vi.fn(async (input: SaveDraftInput) => draftFor(input, input.id ?? 'new'))
    const a = new ProjectAutosaver(save, 'a', { onSaved: vi.fn(), onError: vi.fn() }, 5000)
    const b = new ProjectAutosaver(save, 'b', { onSaved: vi.fn(), onError: vi.fn() }, 5000)

    a.schedule(content('a'), undefined)
    b.schedule(content('b'), undefined)
    await flushAllAutosaves()
    expect(save.mock.calls.map(([input]) => input.id).sort()).toEqual(['a', 'b'])
    expect(a.busy || b.busy).toBe(false)
  })
})
