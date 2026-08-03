import { expect, test, type Page } from '@playwright/test'

interface HarnessSnapshot {
  ready: boolean
  unmounted: boolean
  overlayWriteCount: number
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

async function openHarness(page: Page): Promise<void> {
  await page.goto('/e2e/image-crop-session-harness.html')
  await expect(page.locator('html')).toHaveAttribute('data-image-crop-harness-ready', 'true')
  await page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: { arm(): void }
    }
  ).__imageCropSessionHarness.arm())
}

async function beginPendingPan(page: Page, pointerId: number): Promise<void> {
  await page.evaluate((id) => {
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
      clientX: 60,
      clientY: 20,
    }))
  }, pointerId)
}

test('image crop session writes the final pointer draft once synchronously', async ({ page }) => {
  await openHarness(page)
  await beginPendingPan(page, 42)
  const beforePointerUp = await harnessSnapshot(page)

  const afterPointerUp = await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 42,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: 60,
      clientY: 20,
    }))
    return (
      window as typeof window & {
        __imageCropSessionHarness: { snapshot(): HarnessSnapshot }
      }
    ).__imageCropSessionHarness.snapshot()
  })

  expect(afterPointerUp.overlayWriteCount - beforePointerUp.overlayWriteCount).toBe(1)
  expect(afterPointerUp.canceledFrameIds).toEqual(beforePointerUp.requestedFrameIds)
  expect(afterPointerUp.captureReleaseIds).toEqual([42])
})

test('image crop session writes a pending finish draft once synchronously', async ({ page }) => {
  await openHarness(page)
  await beginPendingPan(page, 43)
  const beforeFinish = await harnessSnapshot(page)

  const afterFinish = await page.evaluate(() => {
    const harness = (
      window as typeof window & {
        __imageCropSessionHarness: {
          finish(): void
          snapshot(): HarnessSnapshot
        }
      }
    ).__imageCropSessionHarness
    harness.finish()
    return harness.snapshot()
  })

  expect(afterFinish.overlayWriteCount - beforeFinish.overlayWriteCount).toBe(1)
  expect(afterFinish.canceledFrameIds).toEqual(beforeFinish.requestedFrameIds)
  expect(afterFinish.captureReleaseIds).toEqual([43])
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
