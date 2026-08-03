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

test('image crop session cleans a pending gesture on real React unmount', async ({ page }) => {
  await page.goto('/e2e/image-crop-session-harness.html')
  await expect(page.locator('html')).toHaveAttribute('data-image-crop-harness-ready', 'true')
  await page.evaluate(() => (
    window as typeof window & {
      __imageCropSessionHarness: { arm(): void }
    }
  ).__imageCropSessionHarness.arm())

  await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>('[data-testid="crop-pointer-target"]')
    if (!target) throw new Error('crop pointer target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX: 20,
      clientY: 20,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 41,
      pointerType: 'mouse',
      isPrimary: true,
      buttons: 1,
      clientX: 60,
      clientY: 20,
    }))
  })

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
