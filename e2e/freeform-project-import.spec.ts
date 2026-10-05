// 我的项目 imports a freeform document JSON and opens it — invalid input refused,
// legacy document versions included.

import { expect, test } from '@playwright/test'
import {
  openFreeform,
  registerUser,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('我的项目 imports a freeform document JSON and opens it', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `import-${Date.now()}`)

  const importedDocument = {
    documentVersion: 4,
    activeSlideId: 'import-slide-1',
    slides: [
      {
        id: 'import-slide-1',
        name: 'AI 生成页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'import-text-1',
            name: '标题',
            locked: false,
            hidden: false,
            type: 'text',
            x: 80,
            y: 160,
            width: 800,
            height: 200,
            rotation: 0,
            scale: 1,
            text: 'AI 导入的标题',
            fontSize: 64,
            fontFamily: 'PingFang SC',
            textFill: { type: 'solid', color: '#18181b' },
            align: 'left',
            fontWeight: 'bold',
          },
        ],
      },
    ],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'ai-card.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })

  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  await expect(page.getByTestId('freeform-textbox')).toContainText('AI 导入的标题')

  await page.getByTestId('editor-home').click()
  await page.getByRole('link', { name: /^我的项目/ }).click()
  await expect(page.getByTestId('project-card')).toContainText('AI 生成页')
  await expect(page.getByTestId('project-card')).toContainText('自由编辑')
})

test('我的项目 import rejects invalid JSON with an error notice', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `import-bad-${Date.now()}`)

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('不是 JSON'),
  })

  await expect(page.getByRole('heading', { level: 1, name: '我的项目' })).toBeVisible()
  await expect(page.getByText('文件不是有效的 JSON')).toBeVisible()
  // Local mode has no server trash; the entry stays away.
  await expect(page.getByTestId('project-trash')).toHaveCount(0)
})

test('我的项目 imports a v14 polyline document and renders its vertices', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `poly-${Date.now()}`)

  const importedDocument = {
    documentVersion: 14,
    activeSlideId: 'poly-slide-1',
    slides: [
      {
        id: 'poly-slide-1',
        name: '折线页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'poly-line-1',
            name: '山脊',
            locked: false,
            hidden: false,
            type: 'line',
            x: 100,
            y: 200,
            width: 600,
            height: 300,
            rotation: 0,
            scale: 1,
            lineKind: 'line',
            stroke: '#17293c',
            strokeWidth: 10,
            startCap: 'arrow',
            endCap: 'dot',
            points: [
              { x: 0, y: 260 },
              { x: 150, y: 40 },
              { x: 300, y: 240 },
              { x: 450, y: 20 },
              { x: 600, y: 220 },
            ],
          },
          {
            id: 'poly-line-2',
            name: '普通箭头',
            locked: false,
            hidden: false,
            type: 'line',
            x: 140,
            y: 700,
            width: 500,
            height: 40,
            rotation: 0,
            scale: 1,
            lineKind: 'arrow',
            stroke: '#f97316',
            strokeWidth: 8,
          },
        ],
      },
    ],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'polyline.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })

  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()
  await expect(page.getByTestId('freeform-element')).toHaveCount(2)
  const polyline = page.getByTestId('freeform-polyline')
  await expect(polyline).toHaveAttribute(
    'points',
    '0,260 150,40 300,240 450,20 600,220',
  )
  await expect(polyline).toHaveAttribute('marker-start', /arrow-start/)
  await expect(polyline).toHaveAttribute('marker-end', /dot/)
  // A vertex-less line keeps rendering the classic single <line> element.
  await expect(page.locator('.freeform-line', { has: page.getByTestId('freeform-polyline') })).toHaveCount(1)
  await expect(page.locator('.freeform-line line')).toHaveCount(1)
  // Importing already made it a project.
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')

  await page.reload()
  await expect(page.getByTestId('editor-save-state')).toHaveText('已保存')
  await expect(page.getByTestId('freeform-polyline')).toHaveAttribute(
    'points',
    '0,260 150,40 300,240 450,20 600,220',
  )
  await expect(page.getByTestId('freeform-polyline')).toHaveAttribute('marker-start', /arrow-start/)
})

test('polyline vertex handles drag vertices and double-click edits them', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await openFreeform(page)
  await page.getByTestId('account-login').click()
  await registerUser(page, `vertex-${Date.now()}`)

  const importedDocument = {
    documentVersion: 14,
    activeSlideId: 'vertex-slide-1',
    slides: [
      {
        id: 'vertex-slide-1',
        name: '顶点页',
        width: 1080,
        height: 1440,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [
          {
            id: 'vertex-line-1',
            name: '山脊',
            locked: false,
            hidden: false,
            type: 'line',
            x: 200,
            y: 300,
            width: 600,
            height: 300,
            rotation: 0,
            scale: 1,
            lineKind: 'line',
            stroke: '#17293c',
            strokeWidth: 10,
            points: [
              { x: 0, y: 260 },
              { x: 200, y: 40 },
              { x: 400, y: 260 },
              { x: 600, y: 40 },
            ],
          },
        ],
      },
    ],
  }

  await page.goto('/#/projects')
  await page.getByTestId('project-import-input').setInputFiles({
    name: 'vertex.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(importedDocument)),
  })
  await expect(page.getByTestId('freeform-toolbar')).toBeVisible()

  const polyline = page.getByTestId('freeform-polyline')
  const readPoints = async () => {
    const raw = await polyline.getAttribute('points')
    return (raw ?? '').split(' ').map((pair) => pair.split(',').map(Number))
  }

  // Selecting the polyline reveals one handle per vertex.
  await page.locator('[data-scene-node-id="vertex-line-1"]').click()
  const handle = (index: number) => page.getByTestId(`freeform-vertex-handle-${index}`)
  await expect(handle(0)).toBeVisible()
  await expect(handle(3)).toBeVisible()
  await expect(page.getByTestId('freeform-vertex-handle-4')).toHaveCount(0)

  // Drag vertex 1 toward the bottom right; only that vertex moves.
  const box = await handle(1).boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 60, { steps: 4 })
  await page.mouse.up()
  const afterDrag = await readPoints()
  expect(afterDrag).toHaveLength(4)
  expect(afterDrag[0]).toEqual([0, 260])
  expect(afterDrag[1][0]).toBeGreaterThan(200)
  expect(afterDrag[1][1]).toBeGreaterThan(40)
  expect(afterDrag[2]).toEqual([400, 260])
  expect(afterDrag[3]).toEqual([600, 40])

  // Double-click near the midpoint of the first segment inserts a vertex there.
  const first = await handle(0).boundingBox()
  const second = await handle(1).boundingBox()
  expect(first).toBeTruthy()
  expect(second).toBeTruthy()
  await page.mouse.dblclick(
    (first!.x + first!.width / 2 + second!.x + second!.width / 2) / 2,
    (first!.y + first!.height / 2 + second!.y + second!.height / 2) / 2,
  )
  const afterAdd = await readPoints()
  expect(afterAdd).toHaveLength(5)
  expect(afterAdd[0]).toEqual([0, 260])
  expect(afterAdd[1][0]).toBeGreaterThan(0)
  expect(afterAdd[1][0]).toBeLessThan(afterAdd[2][0])

  // Double-clicking a vertex handle removes that vertex.
  await handle(2).dblclick()
  const afterRemove = await readPoints()
  expect(afterRemove).toHaveLength(4)

  // The history panel recorded each vertex edit with its own label.
  await page.getByRole('tab', { name: '历史', exact: true }).click()
  await expect(page.getByTestId('freeform-history-panel')).toBeVisible()
  for (const label of ['拖动顶点', '添加顶点', '删除顶点']) {
    await expect(
      page.locator('[data-testid="freeform-history-item"]').filter({
        has: page.locator('.freeform-history-label', { hasText: label }),
      }),
    ).toHaveCount(1)
  }

  // Undo walks the three vertex edits back to the imported shape.
  for (let step = 0; step < 3; step += 1) {
    await page.keyboard.press('ControlOrMeta+z')
  }
  await expect(polyline).toHaveAttribute('points', '0,260 200,40 400,260 600,40')
})
