import { expect, test, type Page } from '@playwright/test'

interface HarnessSnapshot {
  ready: boolean
  startResult: boolean | null
  unmounted: boolean
  layoutCommitCount: number
  beforeMutationFrameFlushCount: number
  beforeMutationRenderDraftMatchedLastCommit: boolean | null
  overlayWriteCount: number
  lastRenderedDraft: {
    frame: { left: number; top: number; right: number; bottom: number }
    image: { left: number; top: number; right: number; bottom: number }
    framing: { focusX: number; focusY: number; zoom: number }
  } | null
  requestedFrameIds: number[]
  canceledFrameIds: number[]
  listenerAdds: Record<string, number>
  listenerRemoves: Record<string, number>
  activeListeners: Record<string, number>
  captureSetIds: number[]
  captureReleaseIds: number[]
  capturedPointerIds: number[]
}

async function harnessSnapshot(page: Page): Promise<HarnessSnapshot> {
  return page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: { snapshot(): HarnessSnapshot }
    }
  ).__imageCropSessionHarness.snapshot())
}

async function openHarness(
  page: Page,
  initialRenderScale?: 'null' | 'zero' | 'nan',
): Promise<void> {
  const query = initialRenderScale ? `?initialRenderScale=${initialRenderScale}` : ''
  await page.goto(`/e2e/image-crop-session-harness.html${query}`)
  await expect(page.locator('html')).toHaveAttribute('data-image-crop-harness-ready', 'true')
  await page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: { arm(): void }
    }
  ).__imageCropSessionHarness.arm())
}

async function beginPendingPan(
  page: Page,
  pointerId: number,
  screenDelta = 40,
): Promise<void> {
  await page.evaluate(({ id, delta }) => {
    const target = document.querySelector<HTMLElement>('[data-testid="crop-pointer-target"]')
    if (!target) throw new Error('crop pointer target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: id,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: id,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: 20 + delta,
      clientY: 20,
    }))
  }, { id: pointerId, delta: screenDelta })
}

test('image crop session writes the final pointer draft once across React commit', async ({ page }) => {
  await openHarness(page)
  await beginPendingPan(page, 42)
  const beforePointerUp = await harnessSnapshot(page)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 42,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 60,
      clientY: 20,
    }))
  })

  await expect.poll(async () => (await harnessSnapshot(page)).layoutCommitCount)
    .toBeGreaterThan(beforePointerUp.layoutCommitCount)
  const afterPointerUpCommit = await harnessSnapshot(page)
  expect(afterPointerUpCommit.overlayWriteCount - beforePointerUp.overlayWriteCount).toBe(1)
  expect(afterPointerUpCommit.canceledFrameIds).toEqual(beforePointerUp.requestedFrameIds)
  expect(afterPointerUpCommit.captureReleaseIds).toEqual([42])
})

test('image crop session writes a pending finish draft once across React commit', async ({ page }) => {
  await openHarness(page)
  await beginPendingPan(page, 43)
  const beforeFinish = await harnessSnapshot(page)

  await page.evaluate(() => {
    const harness = (
      window as typeof window & {
        __imageCropSessionHarness: {
          finish(): void
        }
      }
    ).__imageCropSessionHarness
    harness.finish()
  })

  await expect.poll(async () => (await harnessSnapshot(page)).layoutCommitCount)
    .toBeGreaterThan(beforeFinish.layoutCommitCount)
  const afterFinishCommit = await harnessSnapshot(page)
  expect(afterFinishCommit.overlayWriteCount - beforeFinish.overlayWriteCount).toBe(1)
  expect(afterFinishCommit.canceledFrameIds).toEqual(beforeFinish.requestedFrameIds)
  expect(afterFinishCommit.captureReleaseIds).toEqual([43])
})

test('image crop session recovers a preview advanced between render and commit', async ({ page }) => {
  await openHarness(page)
  await beginPendingPan(page, 44, 10)
  const beforeRerender = await harnessSnapshot(page)
  expect(beforeRerender.lastRenderedDraft?.image.left).toBeCloseTo(-20)
  expect(beforeRerender.requestedFrameIds).toHaveLength(1)
  expect(beforeRerender.beforeMutationFrameFlushCount).toBe(0)

  await page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: {
        rerenderAndFlushPendingFrameBeforeMutation(): void
      }
    }
  ).__imageCropSessionHarness.rerenderAndFlushPendingFrameBeforeMutation())

  await expect.poll(async () => (await harnessSnapshot(page)).layoutCommitCount)
    .toBeGreaterThan(beforeRerender.layoutCommitCount)
  const afterCommit = await harnessSnapshot(page)
  expect(afterCommit.beforeMutationFrameFlushCount).toBe(1)
  expect(afterCommit.beforeMutationRenderDraftMatchedLastCommit).toBe(true)
  expect(afterCommit.lastRenderedDraft?.image.left).toBeCloseTo(-10)
  expect(afterCommit.overlayWriteCount - beforeRerender.overlayWriteCount).toBe(2)
})

for (const initialScale of [
  { value: 'null', attribute: 'null', pointerId: 54 },
  { value: 'zero', attribute: '0', pointerId: 55 },
  { value: 'nan', attribute: 'NaN', pointerId: 56 },
] as const) {
  test(`image crop session rejects invalid initial render scale ${initialScale.value}`, async ({ page }) => {
    await openHarness(page, initialScale.value)
    await expect(page.locator('html')).toHaveAttribute(
      'data-image-crop-harness-render-scale',
      initialScale.attribute,
    )

    const afterStart = await harnessSnapshot(page)
    expect(afterStart.startResult).toBe(false)
    expect(afterStart.overlayWriteCount).toBe(0)
    expect(afterStart.lastRenderedDraft).toBeNull()

    await beginPendingPan(page, initialScale.pointerId)
    const afterPointer = await harnessSnapshot(page)
    expect(afterPointer.requestedFrameIds).toEqual([])
    expect(afterPointer.canceledFrameIds).toEqual([])
    expect(afterPointer.listenerAdds).toEqual({
      pointermove: 0,
      pointerup: 0,
      pointercancel: 0,
      blur: 0,
    })
    expect(afterPointer.activeListeners).toEqual({
      pointermove: 0,
      pointerup: 0,
      pointercancel: 0,
      blur: 0,
    })
    expect(afterPointer.captureSetIds).toEqual([])
    expect(afterPointer.captureReleaseIds).toEqual([])
    expect(afterPointer.capturedPointerIds).toEqual([])
  })
}

test('image crop session snapshots the committed render scale for each pointer segment', async ({ page }) => {
  await openHarness(page)
  const initial = await harnessSnapshot(page)
  expect(initial.startResult).toBe(true)
  expect(initial.lastRenderedDraft?.image.left).toBeCloseTo(-20)

  await beginPendingPan(page, 61, 10)
  await page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: { setRenderScale(value: number | null): void }
    }
  ).__imageCropSessionHarness.setRenderScale(2))
  await expect(page.locator('html')).toHaveAttribute(
    'data-image-crop-harness-render-scale',
    '2',
  )

  const beforeFirstCommit = await harnessSnapshot(page)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', {
    pointerId: 61,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: 30,
    clientY: 20,
  })))
  await expect.poll(async () => (await harnessSnapshot(page)).layoutCommitCount)
    .toBeGreaterThan(beforeFirstCommit.layoutCommitCount)
  const afterFirstSegment = await harnessSnapshot(page)
  expect(afterFirstSegment.lastRenderedDraft?.image.left).toBeCloseTo(-10)

  await beginPendingPan(page, 62, 10)
  const beforeSecondCommit = await harnessSnapshot(page)
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', {
    pointerId: 62,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: 30,
    clientY: 20,
  })))
  await expect.poll(async () => (await harnessSnapshot(page)).layoutCommitCount)
    .toBeGreaterThan(beforeSecondCommit.layoutCommitCount)
  const afterSecondSegment = await harnessSnapshot(page)
  expect(afterSecondSegment.lastRenderedDraft?.image.left).toBeCloseTo(-5)
})

test('image crop session rejects invalid current render scales', async ({ page }) => {
  await openHarness(page)
  const invalidScales = [
    { label: 'null', pointerId: 51 },
    { label: 'zero', pointerId: 52 },
    { label: 'nan', pointerId: 53 },
  ] as const

  for (const item of invalidScales) {
    await page.evaluate((label) => {
      const renderScale = label === 'null' ? null : label === 'zero' ? 0 : Number.NaN
      const harness = (
        window as typeof window & {
          __imageCropSessionHarness: { setRenderScale(value: number | null): void }
        }
      ).__imageCropSessionHarness
      harness.setRenderScale(renderScale)
    }, item.label)
    await expect(page.locator('html')).toHaveAttribute(
      'data-image-crop-harness-render-scale',
      item.label === 'zero' ? '0' : item.label === 'nan' ? 'NaN' : 'null',
    )
    await beginPendingPan(page, item.pointerId)
  }

  const afterInvalidPointers = await harnessSnapshot(page)
  expect(afterInvalidPointers.requestedFrameIds).toEqual([])
  expect(afterInvalidPointers.activeListeners).toEqual({
    pointermove: 0,
    pointerup: 0,
    pointercancel: 0,
    blur: 0,
  })
  expect(afterInvalidPointers.captureSetIds).toEqual([])
  expect(afterInvalidPointers.capturedPointerIds).toEqual([])
})

test('image crop session cleans a pending gesture on real React unmount', async ({ page }) => {
  await openHarness(page)
  await beginPendingPan(page, 41)

  const active = await harnessSnapshot(page)
  expect(active.requestedFrameIds).toHaveLength(1)
  expect(active.activeListeners).toEqual({
    pointermove: 1,
    pointerup: 1,
    pointercancel: 1,
    blur: 1,
  })
  expect(active.captureSetIds).toEqual([41])
  expect(active.capturedPointerIds).toEqual([41])

  await page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: { unmount(): void }
    }
  ).__imageCropSessionHarness.unmount())
  const cleaned = await harnessSnapshot(page)
  expect(cleaned.unmounted).toBe(true)
  expect(cleaned.canceledFrameIds).toEqual(active.requestedFrameIds)
  expect(cleaned.listenerAdds).toEqual({
    pointermove: 1,
    pointerup: 1,
    pointercancel: 1,
    blur: 1,
  })
  expect(cleaned.listenerRemoves).toEqual(cleaned.listenerAdds)
  expect(cleaned.activeListeners).toEqual({
    pointermove: 0,
    pointerup: 0,
    pointercancel: 0,
    blur: 0,
  })
  expect(cleaned.captureReleaseIds).toEqual([41])
  expect(cleaned.capturedPointerIds).toEqual([])

  const writeCountAfterUnmount = cleaned.overlayWriteCount
  await page.evaluate(() => {
    const harness = (
      window as typeof window & {
        __imageCropSessionHarness: {
          fireCanceledFrames(): void
          dispatchLateEvents(): void
        }
      }
    ).__imageCropSessionHarness
    harness.fireCanceledFrames()
    harness.dispatchLateEvents()
  })
  const afterLateWork = await harnessSnapshot(page)
  expect(afterLateWork.overlayWriteCount).toBe(writeCountAfterUnmount)
  expect(afterLateWork.activeListeners).toEqual(cleaned.activeListeners)
  expect(afterLateWork.captureReleaseIds).toEqual(cleaned.captureReleaseIds)
})
