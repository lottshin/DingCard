import { expect, test } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

test('Markdown gallery renders four previews and applies a complete document', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('markdown-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.template-tile')).toHaveCount(4)
  await expect(dialog.locator('.template-tile-preview')).toHaveCount(4)
  await expect(dialog.locator('.template-detail-preview')).toBeVisible()
  await expect.poll(() => dialog.locator('.template-markdown-preview .card-content h1').count()).toBeGreaterThan(0)
  await expect(dialog.locator('.template-detail .card')).toHaveCSS('border-radius', '8px')
  const editorialPreview = dialog.getByRole('button', { name: '预览编辑部' })
  const checklistPreview = dialog.getByRole('button', { name: '预览清单' })
  await expect(editorialPreview).toHaveAttribute('aria-pressed', 'true')
  await checklistPreview.click()
  await expect(checklistPreview).toHaveAttribute('aria-pressed', 'true')
  await expect(editorialPreview).toHaveAttribute('aria-pressed', 'false')
  await editorialPreview.click()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('把一件事讲清楚')
  await expect(page.locator('.pane-sub')).toContainText('3 页')
  await expect(page.getByRole('combobox', { name: '主题' })).toContainText('模板 · 编辑部')
})

test('Markdown cancel keeps the current unsaved content intact', async ({ page }) => {
  await page.goto('/')
  const weiboButton = page.getByRole('tablist', { name: '平台' })
    .getByRole('button', { name: '微博', exact: true })
  await weiboButton.click()
  const before = (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()

  await page.getByTestId('markdown-template-button').click()
  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  const useButton = dialog.getByRole('button', { name: '使用这套模板', exact: true })
  await useButton.click()
  const confirm = page.getByRole('alertdialog', { name: '要新建一份模板作品吗？' })
  await expect(confirm).toBeVisible()
  const continueButton = confirm.getByRole('button', { name: '继续编辑', exact: true })
  const createButton = confirm.getByRole('button', { name: '新建模板作品', exact: true })
  await expect(continueButton).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(createButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(continueButton).toBeFocused()
  await continueButton.click()

  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()

  await useButton.click()
  await expect(confirm).toBeVisible()
  await page.locator('.template-confirm-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(confirm).toBeHidden()
  await expect(useButton).toBeFocused()
  await expect(weiboButton).toHaveClass(/on/)
  await expect.poll(async () => (await page.locator('.cm-content').innerText()).replace(/\s+/g, ' ').trim()).toBe(before)
})

test('gallery closes with keyboard or backdrop and restores the trigger focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('markdown-template-button')
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.getByRole('button', { name: '关闭模板中心' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await page.locator('.template-backdrop').click({ position: { x: 2, y: 2 } })
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Freeform gallery renders real layers and starts a fresh history', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('freeform-template-button').click()

  const dialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await expect(dialog.locator('.template-tile')).toHaveCount(4)
  await expect(dialog.locator('.template-freeform-artboard')).toHaveCount(5)
  await expect(dialog.locator('.template-freeform-artboard .freeform-element').first()).toBeVisible()

  await dialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-element')).not.toHaveCount(0)

  await page.getByTestId('freeform-template-button').click()
  const reopenedDialog = page.getByRole('dialog', { name: '从一套成品开始' })
  await reopenedDialog.getByRole('button', { name: '使用这套模板', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '要新建一份模板作品吗？' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.locator('.freeform-thumb')).toHaveCount(3)
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
})

test('gallery stays inside desktop and narrow viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByTestId('markdown-template-button').click()

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    const geometry = await page.locator('.template-dialog').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const body = element.querySelector('.template-dialog-body') as HTMLElement | null
      return {
        left: rect.left,
        right: rect.right,
        viewport: window.innerWidth,
        bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport)
    expect(geometry.bodyOverflow).toBeLessThanOrEqual(1)
  }
})
