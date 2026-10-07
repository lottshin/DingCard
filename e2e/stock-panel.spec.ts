import { expect, test } from '@playwright/test'
import { openToolPanel } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The images drawer's stock photo panel: on this local/offline build it must
// degrade to a setup notice instead of a search box that can only fail.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('stock panel degrades to a setup notice in local mode', async ({ page }) => {
  await page.goto('/#/edit/canvas')

  await openToolPanel(page, 'images')
  const drawer = page.getByTestId('freeform-images-drawer')

  // The drawer keeps its sections: upload, stock library, asset library.
  await expect(drawer.getByTestId('insert-image')).toBeVisible()
  await expect(drawer.getByText('在线图库', { exact: true })).toBeVisible()
  await expect(drawer.getByText('素材库', { exact: true })).toBeVisible()

  const panel = drawer.getByTestId('stock-panel')
  await expect(panel).toBeVisible()
  const notice = panel.getByRole('status')
  await expect(notice).toContainText('在线图库需要服务端')
  await expect(notice).toContainText('Openverse')

  // No search UI in degraded mode — nothing to type into, nothing to click.
  await expect(panel.getByTestId('stock-search-input')).toHaveCount(0)
  await expect(panel.getByTestId('stock-search-submit')).toHaveCount(0)
  await expect(panel.getByTestId('stock-hit')).toHaveCount(0)
})
