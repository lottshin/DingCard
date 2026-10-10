import { expect, test } from '@playwright/test'
import { openFreeform, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

// The progress element (v38): the Elements panel inserts a 65% bar sample,
// the inspector edits the share, the style and the colour. v39 names the goal
// and gives the track its own colour.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

async function insertProgress(page: import('@playwright/test').Page) {
  await page.getByTestId('freeform-elements-tool').click()
  await page.getByTestId('insert-progress').click()
  await page.getByTestId('freeform-elements-tool').click()
  await expect(page.getByTestId('freeform-progress')).toBeVisible()
}

test('inserts a progress bar that renders its track, fill, and share and saves', async ({ page }) => {
  await openFreeform(page)
  await insertProgress(page)

  const progress = page.getByTestId('freeform-progress')
  // The 65% sample: one dimmed track, one accent fill two thirds across, and
  // the share riding inside the fill.
  const track = progress.locator('[data-testid="freeform-progress-track"]')
  const fill = progress.locator('[data-testid="freeform-progress-fill"]')
  await expect(track).toHaveCount(1)
  await expect(track).toHaveAttribute('fill', '#1d4ed8')
  await expect(track).toHaveAttribute('opacity', '0.14')
  await expect(fill).toHaveCount(1)
  await expect(fill).toHaveAttribute('fill', '#1d4ed8')
  await expect(fill).toHaveAttribute('width', '312')
  const percent = progress.locator('[data-testid="freeform-progress-percent"]')
  await expect(percent).toHaveText('65%')
  await expect(percent).toHaveAttribute('fill', '#ffffff')

  // The insert autosaves before the undo dance below reads the draft.
  await expect(page.getByTestId('editor-save-state')).toHaveText(/已保存/)

  // Inserting is an edit: undo removes the whole bar, redo brings it back.
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('freeform-progress')).toHaveCount(0)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.getByTestId('freeform-progress')).toBeVisible()

  // The stored draft carries documentVersion 38 (v38 adds the progress).
  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = key ? JSON.parse(localStorage.getItem(key) ?? '[]') : []
    const draft = drafts.find((entry: { mode?: string }) => entry.mode === 'freeform-slide')
    return draft ?? null
  })
  expect(stored).not.toBeNull()
  expect(stored.document.documentVersion).toBe(40)
  expect(stored.document.slides[0].nodes[0].type).toBe('progress')
  expect(stored.document.slides[0].nodes[0].value).toBe(65)

  // The bar survives a reload with its share.
  await page.reload()
  await expect(page.getByTestId('freeform-progress')).toBeVisible()
  await expect(page.getByTestId('freeform-progress').locator('[data-testid="freeform-progress-fill"]')).toHaveCount(1)
  await expect(page.getByTestId('freeform-progress').locator('[data-testid="freeform-progress-percent"]')).toHaveText('65%')
})

test('edits the share, flips to a ring, and recolors in the inspector', async ({ page }) => {
  await startWithSettingsPanelOpen(page)
  await openFreeform(page)
  await insertProgress(page)
  const progress = page.getByTestId('freeform-progress')

  // The inspector mirrors the fresh sample.
  await expect(page.getByTestId('inspector-progress')).toBeVisible()
  await expect(page.getByTestId('progress-value-input')).toHaveValue('65')
  await expect(page.getByTestId('progress-accent-reset')).toHaveCount(0)

  // Typing a share redraws the bar; a tenth is honest, a hundredth refuses.
  await page.getByTestId('progress-value-input').fill('42.5')
  await expect(progress.locator('[data-testid="freeform-progress-percent"]')).toHaveText('42.5%')
  await expect(progress.locator('[data-testid="freeform-progress-fill"]')).toHaveAttribute('width', '204')
  await page.getByTestId('progress-value-input').fill('33.33')
  await expect(progress.locator('[data-testid="freeform-progress-percent"]')).toHaveText('42.5%')

  // 圆环 sweeps from the top with the share in the centre; 横条 returns.
  await page.getByTestId('progress-kind-ring').click()
  await expect(page.getByTestId('progress-kind-ring')).toHaveAttribute('aria-pressed', 'true')
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveCount(1)
  await expect(progress.locator('[data-testid="freeform-progress-fill"]')).toHaveCount(1)
  await expect(progress.locator('[data-testid="freeform-progress-percent"]')).toHaveText('42.5%')
  await expect(progress.locator('[data-testid="freeform-progress-percent"]')).toHaveAttribute('text-anchor', 'middle')
  const fillPath = await progress.locator('[data-testid="freeform-progress-fill"]').getAttribute('d')
  expect(fillPath).toContain('A ')
  await page.getByTestId('progress-kind-bar').click()
  await expect(progress.locator('[data-testid="freeform-progress-fill"]')).toHaveAttribute('width', '204')

  // The accent recolours track, fill and the outside share; 恢复默认 returns to blue.
  await page.getByTestId('progress-kind-ring').click()
  await page.getByRole('button', { name: '进度颜色', exact: true }).click()
  const hex = page.getByLabel('进度颜色 自定义 HEX', { exact: true })
  await hex.fill('#0f766e')
  await hex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(progress.locator('[data-testid="freeform-progress-fill"]')).toHaveAttribute('stroke', '#0f766e')
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('stroke', '#0f766e')
  await page.getByTestId('progress-accent-reset').click()
  await expect(progress.locator('[data-testid="freeform-progress-fill"]')).toHaveAttribute('stroke', '#1d4ed8')
  await expect(page.getByTestId('progress-accent-reset')).toHaveCount(0)

  // 标签 names the goal above the bar: the name sits top-left in ink and the
  // bar drops under it; an empty name clears it again.
  await page.getByTestId('progress-kind-bar').click()
  await page.getByTestId('progress-label-input').fill('读书进度')
  await page.getByTestId('progress-label-input').press('Enter')
  const label = progress.locator('[data-testid="freeform-progress-label"]')
  await expect(label).toHaveText('读书进度')
  await expect(label).toHaveAttribute('text-anchor', 'start')
  await expect(label).toHaveAttribute('fill', '#3f3f46')
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('y', '24')
  await expect(progress.locator('[data-testid="freeform-progress-fill"]')).toHaveAttribute('y', '24')
  await page.getByTestId('progress-label-input').fill('')
  await page.getByTestId('progress-label-input').press('Enter')
  await expect(progress.locator('[data-testid="freeform-progress-label"]')).toHaveCount(0)
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('y', '0')

  // 轨道底色 carries its own colour at full strength; 恢复默认 returns the
  // accent tint.
  await page.getByRole('button', { name: '轨道底色', exact: true }).click()
  const trackHex = page.getByLabel('轨道底色 自定义 HEX', { exact: true })
  await trackHex.fill('#f4f4f5')
  await trackHex.press('Enter')
  await page.keyboard.press('Escape')
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('fill', '#f4f4f5')
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('opacity', '1')
  await page.getByTestId('progress-track-reset').click()
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('fill', '#1d4ed8')
  await expect(progress.locator('[data-testid="freeform-progress-track"]')).toHaveAttribute('opacity', '0.14')
  await expect(page.getByTestId('progress-track-reset')).toHaveCount(0)
})
