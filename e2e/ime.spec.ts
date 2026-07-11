import { test, expect } from '@playwright/test'

/**
 * Reproduces the reported bug: typing a Chinese (IME) character on a line that
 * is a lazy list-continuation, then pressing Enter, deletes the character.
 *
 * We drive a REAL IME through CDP: Input.imeSetComposition starts/updates the
 * composition (like typing pinyin), Input.insertText commits the candidate (like
 * pressing space/number to pick 是). This is exactly what a Chinese IME does at
 * the browser level, so it exercises the same code path as manual testing.
 */

declare global {
  interface Window {
    __cmView?: {
      state: { doc: { toString(): string } }
      dispatch(spec: unknown): void
    }
  }
}

async function getDoc(page: import('@playwright/test').Page): Promise<string> {
  return page.evaluate(() => window.__cmView!.state.doc.toString())
}

async function setDoc(page: import('@playwright/test').Page, text: string) {
  await page.evaluate((t) => {
    const view = window.__cmView!
    const len = view.state.doc.toString().length
    view.dispatch({ changes: { from: 0, to: len, insert: t }, selection: { anchor: t.length } })
  }, text)
}

test('Markdown workspace is the default workspace', async ({ page }) => {
  await page.goto('/')
  const markdownTab = page.getByRole('tab', { name: 'Markdown 卡片' })
  await expect(markdownTab).toHaveAttribute('data-testid', 'workspace-tab-markdown')
  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')
  await expect(markdownTab).toHaveAttribute('aria-controls', 'workspace-panel-markdown')

  const markdownPanel = page.getByRole('tabpanel', { name: 'Markdown 卡片' })
  await expect(markdownPanel).toHaveAttribute('id', 'workspace-panel-markdown')
  await expect(markdownPanel).toHaveAttribute('aria-labelledby', 'workspace-tab-markdown')
  await expect(markdownPanel.locator('.cm-content')).toBeVisible()
})

test.describe('IME input in Markdown editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForFunction(() => !!window.__cmView)
    await page.locator('.cm-content').click()
  })

  test('Markdown workspace is the default workspace', async ({ page }) => {
    await expect(page.getByText('Markdown')).toBeVisible()
    await expect(page.locator('.cm-content')).toBeVisible()
  })

  test('typing Chinese on a lazy list-continuation line, then Enter, keeps the character', async ({
    page,
  }) => {
    // Structure that triggered the bug: a list item, the caret on the line right
    // below it (lazy continuation), and a `---` after a blank line.
    await setDoc(page, '- 列表项\n\n---\n')
    // Put caret at the start of line 2 (the blank line right after the list item).
    await page.evaluate(() => {
      const view = window.__cmView!
      // line 1 is "- 列表项" (len 4 + marker). Place caret at doc offset after "\n".
      const firstLineEnd = view.state.doc.toString().indexOf('\n')
      view.dispatch({ selection: { anchor: firstLineEnd + 1 } })
    })

    const client = await page.context().newCDPSession(page)
    // Compose pinyin then commit the character 是, like a real IME.
    await client.send('Input.imeSetComposition', { text: 's', selectionStart: 1, selectionEnd: 1 })
    await client.send('Input.imeSetComposition', { text: '是', selectionStart: 1, selectionEnd: 1 })
    await client.send('Input.insertText', { text: '是' })

    await page.waitForTimeout(50)
    const afterCompose = await getDoc(page)
    expect(afterCompose, 'character should be inserted after IME commit').toContain('是')

    await page.keyboard.press('Enter')
    await page.waitForTimeout(50)

    const afterEnter = await getDoc(page)
    // The bug was: 是 gets deleted by Enter. Correct: 是 survives + newline added.
    expect(afterEnter, 'character must survive pressing Enter').toContain('是')
  })

  test('NON-IME: plain "a" typed on a lazy list-continuation line, then Enter', async ({
    page,
  }) => {
    await setDoc(page, '- 列表项\n\n---\n')
    await page.evaluate(() => {
      const view = window.__cmView!
      const firstLineEnd = view.state.doc.toString().indexOf('\n')
      view.dispatch({ selection: { anchor: firstLineEnd + 1 } })
    })

    await page.keyboard.type('a')
    await page.waitForTimeout(50)

    await page.keyboard.press('Enter')
    await page.waitForTimeout(50)
    const afterEnter = await getDoc(page)
    expect(afterEnter, 'plain char must survive Enter').toContain('a')
  })

  test('`---` directly under text (no blank lines) still splits into pages', async ({ page }) => {
    // Markdown would treat `段落一\n---` as a Setext heading; we force it to be a
    // page break instead, so this must yield 2 pages.
    await setDoc(page, '段落一\n---\n段落二')
    await page.waitForTimeout(120) // pagination runs on the next animation frame
    const pageDots = await page.locator('.page-dot').count()
    expect(pageDots, 'a bare --- under text should still page-break').toBe(2)
  })

  test('`---` INSIDE a fenced code block is NOT a page break', async ({ page }) => {
    // A code fence containing a `---` line must stay one code block on one page —
    // splitting on it would break the fence open and swallow the rest as code.
    await setDoc(page, '前文\n\n```\n---\n```\n\n后文')
    await page.waitForTimeout(120)
    const pageDots = await page.locator('.page-dot').count()
    expect(pageDots, 'a --- inside a code fence must not page-break').toBe(1)
    // The following paragraph must still render (not be swallowed by the fence).
    await expect(page.locator('.card-content', { hasText: '后文' }).first()).toBeVisible()
  })
})
