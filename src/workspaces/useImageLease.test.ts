import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  IMAGE_LEASE_INTERVAL_MS,
  IMAGE_LEASE_RETRY_MS,
  createImageLeaseScheduler,
} from './useImageLease'

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<() => void>>()

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener()
  }

  count(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

function createHarness(retain = vi.fn<(...sources: [readonly string[]]) => Promise<void>>()) {
  const windowTarget = new FakeEventTarget()
  const documentTarget = new FakeEventTarget()
  let visibilityState: 'hidden' | 'visible' = 'visible'
  const scheduler = createImageLeaseScheduler({
    retain,
    windowTarget,
    documentTarget,
    visibilityState: () => visibilityState,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle),
    setInterval: (callback, delay) => setInterval(callback, delay),
    clearInterval: (handle) => clearInterval(handle),
  })
  return {
    scheduler,
    retain,
    windowTarget,
    documentTarget,
    setVisibilityState(next: 'hidden' | 'visible') {
      visibilityState = next
    },
  }
}

async function flushAsyncWork() {
  await vi.advanceTimersByTimeAsync(0)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('image lease scheduler', () => {
  it('retries an initial failure after 30 seconds without another event and keeps one retry', async () => {
    vi.useFakeTimers()
    const firstError = new Error('first retain failed')
    const secondError = new Error('retry failed')
    const retain = vi.fn()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(secondError)
      .mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const { scheduler } = createHarness(retain)

    scheduler.update(['/uploads/a.png'], true, onError)
    await flushAsyncWork()

    expect(retain).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenLastCalledWith(firstError)
    expect(vi.getTimerCount()).toBe(2) // five-minute interval + one retry

    await vi.advanceTimersByTimeAsync(IMAGE_LEASE_RETRY_MS)
    expect(retain).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenLastCalledWith(secondError)
    expect(vi.getTimerCount()).toBe(2)

    await vi.advanceTimersByTimeAsync(IMAGE_LEASE_RETRY_MS)
    expect(retain).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(1)

    scheduler.dispose()
  })

  it('cancels pending retries on a new active trigger and handles online, visibility and interval', async () => {
    vi.useFakeTimers()
    const retain = vi.fn()
      .mockRejectedValueOnce(new Error('background failed'))
      .mockResolvedValue(undefined)
    const onError = vi.fn()
    const harness = createHarness(retain)

    harness.scheduler.update(['/uploads/a.png'], true, onError)
    await flushAsyncWork()
    expect(vi.getTimerCount()).toBe(2)

    harness.windowTarget.dispatch('online')
    await flushAsyncWork()
    expect(retain).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)

    harness.setVisibilityState('hidden')
    harness.documentTarget.dispatch('visibilitychange')
    await flushAsyncWork()
    expect(retain).toHaveBeenCalledTimes(2)

    harness.setVisibilityState('visible')
    harness.documentTarget.dispatch('visibilitychange')
    await flushAsyncWork()
    expect(retain).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(IMAGE_LEASE_INTERVAL_MS)
    expect(retain).toHaveBeenCalledTimes(4)

    harness.scheduler.dispose()
  })

  it('does not request for disabled or empty sources and ignores equivalent new arrays', async () => {
    vi.useFakeTimers()
    const retain = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness(retain)

    harness.scheduler.update([], true, vi.fn())
    harness.scheduler.update(['/uploads/a.png'], false, vi.fn())
    await flushAsyncWork()
    expect(retain).not.toHaveBeenCalled()

    harness.scheduler.update(
      ['/uploads/b.png', ' /uploads/a.png ', '/uploads/b.png'],
      true,
      vi.fn(),
    )
    await flushAsyncWork()
    expect(retain).toHaveBeenCalledWith(['/uploads/a.png', '/uploads/b.png'])

    harness.scheduler.update(['/uploads/a.png', '/uploads/b.png'], true, vi.fn())
    await flushAsyncWork()
    expect(retain).toHaveBeenCalledTimes(1)

    harness.scheduler.dispose()
  })

  it('rethrows explicit retain failures while notifying and scheduling a retry', async () => {
    vi.useFakeTimers()
    const explicitError = new Error('safe retain failed')
    const retain = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(explicitError)
      .mockResolvedValueOnce(undefined)
    const onError = vi.fn()
    const { scheduler } = createHarness(retain)

    scheduler.update(['/uploads/a.png'], true, onError)
    await flushAsyncWork()
    const retainNow = scheduler.retainNow

    await expect(retainNow()).rejects.toBe(explicitError)
    expect(onError).toHaveBeenLastCalledWith(explicitError)
    expect(vi.getTimerCount()).toBe(2)

    scheduler.update(['/uploads/a.png'], true, onError)
    expect(scheduler.retainNow).toBe(retainNow)
    await vi.advanceTimersByTimeAsync(IMAGE_LEASE_RETRY_MS)
    expect(retain).toHaveBeenCalledTimes(3)

    scheduler.dispose()
  })

  it('removes listeners and timers on dispose', async () => {
    vi.useFakeTimers()
    const retain = vi.fn().mockRejectedValue(new Error('offline'))
    const harness = createHarness(retain)

    harness.scheduler.update(['/uploads/a.png'], true, vi.fn())
    await flushAsyncWork()
    expect(harness.windowTarget.count('online')).toBe(1)
    expect(harness.documentTarget.count('visibilitychange')).toBe(1)
    expect(vi.getTimerCount()).toBe(2)

    harness.scheduler.dispose()
    expect(harness.windowTarget.count('online')).toBe(0)
    expect(harness.documentTarget.count('visibilitychange')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    harness.windowTarget.dispatch('online')
    harness.documentTarget.dispatch('visibilitychange')
    await vi.advanceTimersByTimeAsync(IMAGE_LEASE_INTERVAL_MS + IMAGE_LEASE_RETRY_MS)
    expect(retain).toHaveBeenCalledTimes(1)
  })
})
