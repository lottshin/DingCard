import { useCallback, useEffect, useRef } from 'react'

import { store } from '../storage'

export const IMAGE_LEASE_INTERVAL_MS = 5 * 60 * 1000
export const IMAGE_LEASE_RETRY_MS = 30 * 1000

interface LeaseEventTarget {
  addEventListener(type: string, listener: () => void): void
  removeEventListener(type: string, listener: () => void): void
}

export interface ImageLeaseSchedulerDependencies {
  retain(sources: readonly string[]): Promise<void>
  windowTarget: LeaseEventTarget
  documentTarget: LeaseEventTarget
  visibilityState(): string
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(handle: number): void
  setInterval(callback: () => void, delay: number): number
  clearInterval(handle: number): void
}

export interface ImageLeaseScheduler {
  update(
    sources: readonly string[],
    enabled: boolean,
    onError: (error: unknown) => void,
  ): void
  retainNow(): Promise<void>
  dispose(): void
}

function normalizeSources(sources: readonly string[]): string[] {
  return [...new Set(sources.map((source) => source.trim()).filter(Boolean))].sort()
}

function sourcesKey(sources: readonly string[]): string {
  return JSON.stringify(normalizeSources(sources))
}

export function createImageLeaseScheduler(
  dependencies: ImageLeaseSchedulerDependencies,
): ImageLeaseScheduler {
  let sources: string[] = []
  let sourceKey = '[]'
  let enabled = false
  let onError: (error: unknown) => void = () => {}
  let retryHandle: number | null = null
  let intervalHandle: number | null = null
  let listenersAttached = false
  let stateGeneration = 0
  let latestRequest = 0

  const hasActiveSources = () => enabled && sources.length > 0

  const cancelRetry = () => {
    if (retryHandle === null) return
    dependencies.clearTimeout(retryHandle)
    retryHandle = null
  }

  const notifyError = (error: unknown) => {
    try {
      onError(error)
    } catch {
      // A UI notification failure must not create an unhandled background rejection.
    }
  }

  const scheduleRetry = () => {
    if (!hasActiveSources() || retryHandle !== null) return
    retryHandle = dependencies.setTimeout(() => {
      retryHandle = null
      void runRetain(false)
    }, IMAGE_LEASE_RETRY_MS)
  }

  const runRetain = async (rethrow: boolean): Promise<void> => {
    if (!hasActiveSources()) return
    const request = ++latestRequest
    const generation = stateGeneration
    const currentSources = [...sources]
    try {
      await dependencies.retain(currentSources)
      if (request === latestRequest && generation === stateGeneration) cancelRetry()
    } catch (error) {
      if (request === latestRequest && generation === stateGeneration && hasActiveSources()) {
        notifyError(error)
        scheduleRetry()
      }
      if (rethrow) throw error
    }
  }

  const triggerBackgroundRetain = () => {
    if (!hasActiveSources()) return
    cancelRetry()
    void runRetain(false)
  }

  const onOnline = () => triggerBackgroundRetain()
  const onVisibilityChange = () => {
    if (dependencies.visibilityState() === 'visible') triggerBackgroundRetain()
  }

  const detachListeners = () => {
    if (!listenersAttached) return
    dependencies.windowTarget.removeEventListener('online', onOnline)
    dependencies.documentTarget.removeEventListener('visibilitychange', onVisibilityChange)
    listenersAttached = false
  }

  const stopScheduling = () => {
    cancelRetry()
    if (intervalHandle !== null) {
      dependencies.clearInterval(intervalHandle)
      intervalHandle = null
    }
    detachListeners()
  }

  const startScheduling = () => {
    if (!hasActiveSources()) return
    if (!listenersAttached) {
      dependencies.windowTarget.addEventListener('online', onOnline)
      dependencies.documentTarget.addEventListener('visibilitychange', onVisibilityChange)
      listenersAttached = true
    }
    intervalHandle = dependencies.setInterval(
      triggerBackgroundRetain,
      IMAGE_LEASE_INTERVAL_MS,
    )
    triggerBackgroundRetain()
  }

  const scheduler: ImageLeaseScheduler = {
    update(nextSources, nextEnabled, nextOnError) {
      onError = nextOnError
      const normalized = normalizeSources(nextSources)
      const nextKey = JSON.stringify(normalized)
      if (enabled === nextEnabled && sourceKey === nextKey) return

      stateGeneration += 1
      latestRequest += 1
      stopScheduling()
      sources = normalized
      sourceKey = nextKey
      enabled = nextEnabled
      startScheduling()
    },
    retainNow: async () => {
      if (!hasActiveSources()) return
      cancelRetry()
      await runRetain(true)
    },
    dispose() {
      stateGeneration += 1
      latestRequest += 1
      stopScheduling()
      sources = []
      sourceKey = '[]'
      enabled = false
      onError = () => {}
    },
  }
  return scheduler
}

export function useImageLease(
  sources: readonly string[],
  enabled: boolean,
  onError: (error: unknown) => void,
): () => Promise<void> {
  const schedulerRef = useRef<ImageLeaseScheduler | null>(null)
  if (!schedulerRef.current) {
    schedulerRef.current = createImageLeaseScheduler({
      retain: (currentSources) => store.images.retain(currentSources),
      windowTarget: window,
      documentTarget: document,
      visibilityState: () => document.visibilityState,
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
      clearTimeout: (handle) => window.clearTimeout(handle),
      setInterval: (callback, delay) => window.setInterval(callback, delay),
      clearInterval: (handle) => window.clearInterval(handle),
    })
  }

  const scheduler = schedulerRef.current
  const normalizedKey = sourcesKey(sources)

  useEffect(() => {
    scheduler.update(sources, enabled, onError)
  }, [enabled, normalizedKey, onError, scheduler, sources])

  useEffect(() => () => scheduler.dispose(), [scheduler])

  return useCallback(() => scheduler.retainNow(), [scheduler])
}
