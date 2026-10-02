import { expect, test } from '@playwright/test'
import { installOfflineFontRoutes } from './offlineFonts'

// open_in_editor (MCP) hands a document over at a loopback URL; the editor's
// import link reads it and keeps it as a new project. Other sites are refused.

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

const HANDED = 'http://127.0.0.1:5999/documents/handed.json'

const handedDocument = {
  documentVersion: 16,
  activeSlideId: 'cover',
  slides: [
    {
      id: 'cover',
      name: 'Page 1',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#fde68a' },
      nodes: [{
        id: 'title', name: '标题', locked: false, hidden: false, type: 'text',
        x: 96, y: 160, width: 888, height: 160, rotation: 0, scale: 1,
        text: 'AI 交过来的封面', fontSize: 72, fontFamily: 'PingFang SC',
        textFill: { type: 'solid', color: '#1c1917' }, align: 'left', fontWeight: 'bold',
      }],
    },
    {
      id: 'inside',
      name: 'Page 2',
      width: 1080,
      height: 1440,
      background: { type: 'solid', color: '#ffffff' },
      nodes: [],
    },
  ],
}

test('a document handed over on this computer opens as a new project', async ({ page }) => {
  await page.route(HANDED, (route) => route.fulfill({ json: handedDocument, headers: { 'access-control-allow-origin': '*' } }))
  await page.goto(`/#/edit/canvas/import?url=${encodeURIComponent(HANDED)}&title=${encodeURIComponent('交给编辑器的稿子')}`)

  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-color', 'rgb(253, 230, 138)')
  await expect(page.getByTestId('freeform-thumb')).toHaveCount(2)
  await expect(page.getByTestId('freeform-canvas').locator('.freeform-textbox', { hasText: 'AI 交过来的封面' })).toBeVisible()
  await expect(page.getByTestId('editor-title')).toContainText('交给编辑器的稿子')
  await expect(page).toHaveURL(/#\/edit\/canvas$/)

  // Kept without a first edit, and listed in 我的项目.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存到本机')
  await page.goto('/#/projects')
  await expect(page.getByTestId('project-card').filter({ hasText: '交给编辑器的稿子' })).toHaveCount(1)
})

test('a document from another site is refused', async ({ page }) => {
  let fetched = false
  await page.route('https://example.com/**', (route) => {
    fetched = true
    return route.fulfill({ json: handedDocument })
  })
  await page.goto(`/#/edit/canvas/import?url=${encodeURIComponent('https://example.com/doc.json')}`)
  await expect(page.getByText('只能导入本机上的文档')).toBeVisible()
  expect(fetched).toBe(false)
  await expect(page.getByTestId('freeform-canvas').locator('.freeform-textbox', { hasText: 'AI 交过来的封面' })).toHaveCount(0)
})
