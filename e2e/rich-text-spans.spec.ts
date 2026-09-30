import { expect, test, type Page } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

/**
 * Select [start, end) inside the focused freeform textbox.
 *
 * Headless Chrome does not extend DOM selections for Shift+Arrow keys, so the
 * test drives the exact same path (a real DOM selection inside the editable,
 * observed through the app's selectionchange handling) programmatically.
 */
async function selectTextRange(page: Page, start: number, end: number) {
  await page.evaluate(({ start, end }) => {
    const root = document.querySelector('[data-testid="freeform-textbox"]')
    if (!(root instanceof HTMLElement)) throw new Error('textbox not found')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let count = 0
    let startNode: Node | null = null
    let startOffset = 0
    let endNode: Node | null = null
    let endOffset = 0
    let current = walker.nextNode()
    while (current && (startNode === null || endNode === null)) {
      const length = current.textContent?.length ?? 0
      if (startNode === null && start <= count + length) {
        startNode = current
        startOffset = Math.max(0, Math.min(start - count, length))
      }
      if (endNode === null && end <= count + length) {
        endNode = current
        endOffset = Math.max(0, Math.min(end - count, length))
      }
      count += length
      current = walker.nextNode()
    }
    const selection = document.getSelection()
    const range = document.createRange()
    if (startNode && endNode) {
      range.setStart(startNode, startOffset)
      range.setEnd(endNode, endOffset)
    } else {
      range.setStart(root, 0)
      range.setEnd(root, 0)
    }
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, { start, end })
}

test('rich text spans: select, bold, color, survive edits, and delete', async ({ page }) => {
  await page.goto('/#/edit')
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByTestId('insert-text').click()
  const textbox = page.getByTestId('freeform-textbox')
  await expect(textbox).toBeVisible()
  await textbox.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('重点加粗内容')
  await expect(textbox).toHaveText('重点加粗内容')

  const spansSection = page.getByTestId('inspector-rich-spans')
  await expect(spansSection).toBeVisible()

  // Bold the first two characters.
  await selectTextRange(page, 0, 2)
  await expect(spansSection).toContainText('已选 2 字')
  await spansSection.getByTestId('rich-span-bold').click()

  await expect(textbox.locator('span[style*="font-weight"]')).toHaveText('重点')

  // Blurring rebuilds the content from the model; the span must survive.
  await page.keyboard.press('Escape')
  await expect(textbox.locator('span[style*="font-weight"]')).toHaveText('重点')
  const spanList = page.getByTestId('rich-span-list')
  await expect(spanList.locator('li')).toHaveCount(1)
  await expect(spanList.locator('li').first()).toContainText('重点')

  // Editing the text after the span keeps it anchored to its characters.
  await textbox.click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.keyboard.press('Escape')
  await expect(textbox).toHaveText('重点加粗内容!')
  await expect(textbox.locator('span[style*="font-weight"]')).toHaveText('重点')

  // Color a middle range through a preset swatch.
  await textbox.click()
  await selectTextRange(page, 2, 4)
  await expect(spansSection).toContainText('已选 2 字')
  await spansSection.getByRole('button', { name: '标色 #d92d20' }).click()
  await page.keyboard.press('Escape')

  await expect(textbox.locator('span[style*="color"]')).toHaveText('加粗')
  await expect(spanList.locator('li')).toHaveCount(2)

  // Presentation surfaces (slide thumbnails) render the same runs.
  await expect(page.locator('.freeform-preview-textbox span[style*="font-weight"]')).toHaveText('重点')
  await expect(page.locator('.freeform-preview-textbox span[style*="color"]')).toHaveText('加粗')

  // Deleting a span from the list removes exactly that styling.
  await spanList.locator('li').first().getByRole('button', { name: '删除文字片段' }).click()
  await expect(textbox.locator('span[style*="font-weight"]')).toHaveCount(0)
  await expect(textbox.locator('span[style*="color"]')).toHaveText('加粗')
  await expect(spanList.locator('li')).toHaveCount(1)
})
