import { expect, type Page } from '@playwright/test'

/**
 * The freeform settings panel (properties, layers, history) opens on demand.
 * Specs that work in it start with it open, the way a user who opened it
 * once keeps it.
 */
export async function startWithSettingsPanelOpen(page: Page) {
  await page.addInitScript(() => {
    const key = 'slicer.freeform.prefs.v1'
    try {
      const current = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      if (typeof current.panelOpen !== 'boolean') {
        localStorage.setItem(key, JSON.stringify({ ...current, panelOpen: true }))
      }
    } catch {
      localStorage.setItem(key, JSON.stringify({ panelOpen: true }))
    }
  })
}

type ToolPanel = 'templates' | 'text' | 'images' | 'elements'

function toolTrigger(page: Page, tool: ToolPanel) {
  return page.getByTestId(tool === 'templates' ? 'freeform-template-button' : `freeform-${tool}-tool`)
}

/** Opens a tool rail panel unless it is already open (the rail button toggles). */
export async function openToolPanel(page: Page, tool: ToolPanel) {
  const trigger = toolTrigger(page, tool)
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  await expect(page.getByTestId(`freeform-${tool}-drawer`)).toBeVisible()
}

/** The templates panel's first button opens the full template gallery. */
export async function openFreeformTemplateGallery(page: Page) {
  await openToolPanel(page, 'templates')
  await page.getByTestId('freeform-templates-browse').click()
}

/** Closes a tool rail panel from its rail button, leaving the stage as wide as before. */
export async function closeToolPanel(page: Page, tool: ToolPanel) {
  const trigger = toolTrigger(page, tool)
  if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click()
  await expect(page.getByTestId(`freeform-${tool}-drawer`)).toHaveCount(0)
}

export async function insertFreeformText(page: Page) {
  await openToolPanel(page, 'text')
  await page.getByTestId('insert-text').click()
  await closeToolPanel(page, 'text')
}

export async function insertFreeformShape(page: Page, label = '矩形') {
  await openToolPanel(page, 'elements')
  await page.getByTestId('freeform-elements-drawer')
    .getByRole('group', { name: '形状' })
    .getByRole('button', { name: label, exact: true })
    .click()
  await closeToolPanel(page, 'elements')
}

/** Back to the fitted page (100%): the zoom value in the stage's corner. */
export async function fitFreeformCanvas(page: Page) {
  await page.getByTestId('freeform-zoom-value').click()
  await expect(page.getByTestId('freeform-zoom-value')).toHaveText('100%')
}

/** Opens a page's 「…」 menu in the page list. */
export async function openPageMenu(page: Page, index: number) {
  await page.getByTestId('freeform-thumb-menu').nth(index).click()
  const menu = page.getByTestId('freeform-slide-context-menu')
  await expect(menu).toBeVisible()
  return menu
}

async function currentPageIndex(page: Page) {
  return page.getByTestId('freeform-thumb').evaluateAll((nodes) => (
    nodes.findIndex((node) => node.getAttribute('aria-current') === 'page')
  ))
}

/** Duplicates the current page from its 「…」 menu; the copy becomes current. */
export async function duplicateCurrentPage(page: Page) {
  const menu = await openPageMenu(page, await currentPageIndex(page))
  await menu.getByTestId('freeform-slide-context-menu-duplicate').click()
  await expect(menu).toHaveCount(0)
}
