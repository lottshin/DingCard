import { expect, test, type Page } from '@playwright/test'
import { insertFreeformText, startWithSettingsPanelOpen } from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  await startWithSettingsPanelOpen(page)
})

/** The saved project's first text, as stored on this device. */
async function storedText(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    const drafts = JSON.parse((key && localStorage.getItem(key)) || '[]') as Array<{ document: { slides: Array<{ nodes: Array<Record<string, unknown>> }> } }>
    return drafts[0]?.document.slides[0].nodes.find((node) => node.type === 'text') ?? null
  })
}

/** Select [start, end) of the editing textbox's characters (one paragraph, spans included). */
async function selectTextRange(page: Page, start: number, end: number) {
  await page.evaluate(({ start, end }) => {
    const root = document.querySelector('[data-testid="freeform-textbox"]')
    if (!root) throw new Error('textbox not found')
    const point = (offset: number): [Node, number] => {
      let count = 0
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const length = node.textContent?.length ?? 0
        if (offset <= count + length) return [node, offset - count]
        count += length
      }
      throw new Error('offset past the text')
    }
    const range = document.createRange()
    range.setStart(...point(start))
    range.setEnd(...point(end))
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
  }, { start, end })
}

async function typeText(page: Page, lines: string[]) {
  await insertFreeformText(page)
  const textbox = page.getByTestId('freeform-textbox')
  await textbox.click()
  await page.keyboard.press('ControlOrMeta+a')
  for (const [index, line] of lines.entries()) {
    if (index > 0) await page.keyboard.press('Enter')
    await page.keyboard.type(line)
  }
  return textbox
}

test('Enter starts a paragraph that is saved with the text', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const textbox = await typeText(page, ['第一行', '第二行'])
  await page.keyboard.press('Escape')

  // The editor rebuilds its paragraphs from the model, and the model kept the break.
  await expect(textbox.locator(':scope > div')).toHaveText(['第一行', '第二行'])
  await expect(page.getByText('已保存到本机')).toBeVisible()
  expect((await storedText(page))?.text).toBe('第一行\n第二行')
})

test('a line break at the end shows no extra line once editing ends', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const textbox = await typeText(page, ['第一行'])
  const lastLineHeight = () => textbox.evaluate((root) => root.lastElementChild?.getBoundingClientRect().height ?? -1)
  await page.keyboard.press('Enter')
  // While editing, the caret sits on a new, empty line.
  await expect.poll(lastLineHeight).toBeGreaterThan(0)
  await page.keyboard.press('Escape')

  // As in the export: a trailing break makes no line of its own.
  await expect(textbox.locator(':scope > div')).toHaveCount(2)
  await expect(textbox.locator(':scope > div:last-child > br')).toHaveCount(0)
  await expect.poll(lastLineHeight).toBe(0)
  await expect(page.getByText('已保存到本机')).toBeVisible()
  expect((await storedText(page))?.text).toBe('第一行\n')
})

test('justify, vertical alignment, paragraph spacing and lists lay the paragraphs out', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const textbox = await typeText(page, ['准备咖啡豆', '水温九十二度', '两分半钟完成'])
  await page.keyboard.press('Escape')
  const toolbar = page.getByTestId('freeform-context-toolbar')

  await toolbar.getByRole('button', { name: '文字两端对齐' }).click()
  await expect(textbox).toHaveCSS('text-align', 'justify')

  await page.getByTestId('text-vertical-align').getByRole('button', { name: '文字垂直居中' }).click()
  await expect(textbox).toHaveCSS('justify-content', 'safe center')

  const spacing = page.getByLabel('段间距')
  await spacing.fill('20')
  await spacing.press('Enter')
  await expect(textbox.locator(':scope > div').nth(1)).toHaveCSS('margin-top', '20px')

  // The list button walks plain → bullets → numbers → plain; the markers are drawn, not typed.
  const list = toolbar.getByTestId('ctx-text-list')
  await list.click()
  await expect(textbox).toHaveAttribute('data-list', 'bullet')
  const marker = (index: number) => textbox.locator(':scope > div').nth(index).evaluate((element) => getComputedStyle(element, '::before').content)
  expect(await marker(0)).toBe('"•"')
  await list.click()
  await expect(textbox).toHaveAttribute('data-list', 'number')
  expect(await marker(2)).toContain('counter(')
  await expect(textbox.locator(':scope > div')).toHaveText(['准备咖啡豆', '水温九十二度', '两分半钟完成'])
  await list.click()
  await expect(textbox).not.toHaveAttribute('data-list', /.+/)

  await page.getByTestId('text-list').getByRole('button', { name: '编号列表' }).click()
  await expect(page.getByText('已保存到本机')).toBeVisible()
  expect(await storedText(page)).toMatchObject({ align: 'justify', verticalAlign: 'middle', paragraphSpacing: 20, list: 'number' })
})

test('selected words can be struck through and sized on their own', async ({ page }) => {
  await page.goto('/#/edit/canvas')
  const textbox = await typeText(page, ['原价199现价99'])
  const spans = page.getByTestId('inspector-rich-spans')

  await selectTextRange(page, 2, 5)
  await spans.getByTestId('rich-span-strike').click()
  await expect(textbox.locator('span')).toHaveCSS('text-decoration-line', 'line-through')

  await selectTextRange(page, 7, 9)
  const size = spans.getByTestId('rich-span-size')
  const before = Number(await size.locator('.rich-span-size-value').textContent())
  await spans.getByTestId('rich-span-size-up').click()
  await spans.getByTestId('rich-span-size-up').click()
  const bigger = Number(await size.locator('.rich-span-size-value').textContent())
  expect(bigger).toBeGreaterThan(before)
  const sized = textbox.locator('span').filter({ hasText: '99' }).last()
  await expect(sized).toHaveCSS('font-size', `${bigger}px`)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('rich-span-list')).toContainText('删除线')
  await expect(page.getByTestId('rich-span-list')).toContainText(`字号 ${bigger}`)
  await expect(page.getByText('已保存到本机')).toBeVisible()
  const stored = await storedText(page) as { spans?: Array<Record<string, unknown>> } | null
  expect(stored?.spans).toEqual([{ start: 2, end: 5, strike: true }, { start: 7, end: 9, fontSize: bigger }])
})
