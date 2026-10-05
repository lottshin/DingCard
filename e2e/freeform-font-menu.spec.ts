// The text font menu: focus handling, the listbox, pending typeahead, and warming
// the selected web font before export.

import { expect, test } from '@playwright/test'
import {
  clickLocatorCenter,
  freeformElementPositions,
  insertText,
  installDisabledFieldsetFocusTargets,
  openFreeform,
  startWithSettingsPanelOpen,
} from './freeformTools'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context, page }) => {
  await installOfflineFontRoutes(context)
  // The settings panel opens on demand; these tests work in it, so it starts open
  // (e2e/freeform-layout.spec.ts covers the closed default).
  await startWithSettingsPanelOpen(page)
})

test('font menu closes after selection and keeps the text element selected', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const element = page.getByTestId('freeform-element').first()
  const trigger = page.getByTestId('freeform-font-select')
  await element.click()
  await trigger.click()
  await page.getByRole('option').nth(2).click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger).not.toHaveAttribute('aria-controls')
  await expect(trigger).not.toHaveAttribute('aria-activedescendant')
  await expect(element).toHaveAttribute('data-selected', 'true')
  await expect(page.getByTestId('freeform-textbox').first()).toHaveCSS('font-family', /Noto Serif|serif/i)
})

test('font menu Escape restores trigger focus without clearing the canvas selection', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const element = page.getByTestId('freeform-element').first()
  const trigger = page.getByTestId('freeform-font-select')
  await trigger.click()
  await expect(page.getByRole('listbox')).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(element).toHaveAttribute('data-selected', 'true')
})

test('font menu preserves focus according to the outside click target', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  const textInput = page.locator('.freeform-inspector-text')
  const sectionTitle = page.getByTestId('inspector-typography').locator('.inspector-section-title')

  await trigger.click()
  await textInput.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(textInput).toBeFocused()

  await trigger.click()
  await sectionTitle.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page.getByTestId('freeform-element').first()).toHaveAttribute('data-selected', 'true')
})

test('font menu keeps focus on external summary and contenteditable controls', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  await page.evaluate(() => {
    const host = document.createElement('div')
    host.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'z-index: 100',
      'background: white',
      'color: black',
      'padding: 8px',
    ].join(';')

    const details = document.createElement('details')
    details.open = true
    const summary = document.createElement('summary')
    summary.dataset.testid = 'external-summary'
    summary.textContent = '外部摘要'
    details.append(summary, document.createTextNode('摘要内容'))

    const editable = document.createElement('div')
    editable.dataset.testid = 'external-contenteditable'
    editable.setAttribute('contenteditable', '')
    editable.textContent = '外部可编辑内容'
    host.append(details, editable)
    document.body.append(host)
  })

  const summary = page.getByTestId('external-summary')
  const editable = page.getByTestId('external-contenteditable')
  await trigger.click()
  await summary.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(summary).toBeFocused()

  await trigger.click()
  await editable.click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(editable).toBeFocused()
  expect(pageErrors).toEqual([])
})



test('font menu keeps focus on an external tabindex -1 button', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.type = 'button'
    button.tabIndex = -1
    button.dataset.testid = 'external-negative-tabindex-button'
    button.textContent = 'External mouse focus target'
    button.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'z-index: 100',
    ].join(';')
    document.body.append(button)
  })

  const target = page.getByTestId('external-negative-tabindex-button')
  await trigger.click()
  await target.click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(target).toBeFocused()
})

test('font menu keeps focus on a first-legend input in a disabled fieldset', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await installDisabledFieldsetFocusTargets(page)
  const trigger = page.getByTestId('freeform-font-select')
  const target = page.getByTestId('disabled-fieldset-legend-input')
  await expect(target).toBeEnabled()

  await trigger.click()
  await target.click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(target).toBeFocused()
})

test('font menu keeps focus on a link inside a disabled fieldset', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await installDisabledFieldsetFocusTargets(page)
  const trigger = page.getByTestId('freeform-font-select')
  const target = page.getByTestId('disabled-fieldset-link')

  await trigger.click()
  await target.click()

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(target).toBeFocused()
})

test('font menu restores trigger focus for an input disabled by its fieldset', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await installDisabledFieldsetFocusTargets(page)
  const trigger = page.getByTestId('freeform-font-select')
  const target = page.getByTestId('disabled-fieldset-input')
  await expect(target).toBeDisabled()

  await trigger.click()
  await clickLocatorCenter(page, target)

  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('font menu restores trigger focus for disabled or inert outside targets', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  await page.evaluate(() => {
    const host = document.createElement('div')
    host.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'z-index: 100',
    ].join(';')

    const disabledButton = document.createElement('button')
    disabledButton.disabled = true
    disabledButton.dataset.testid = 'external-disabled-target'
    disabledButton.textContent = 'Disabled target'

    const disabledAncestor = document.createElement('button')
    disabledAncestor.disabled = true
    const disabledDescendant = document.createElement('span')
    disabledDescendant.tabIndex = 0
    disabledDescendant.dataset.testid = 'external-disabled-descendant'
    disabledDescendant.textContent = 'Disabled descendant'
    disabledAncestor.append(disabledDescendant)

    const inertButton = document.createElement('button')
    inertButton.inert = true
    inertButton.dataset.testid = 'external-inert-target'
    inertButton.textContent = 'Inert target'

    const inertAncestor = document.createElement('div')
    inertAncestor.inert = true
    const inertDescendant = document.createElement('button')
    inertDescendant.dataset.testid = 'external-inert-descendant'
    inertDescendant.textContent = 'Inert descendant'
    inertAncestor.append(inertDescendant)

    host.append(disabledButton, disabledAncestor, inertButton, inertAncestor)
    document.body.append(host)
  })

  for (const testId of [
    'external-disabled-target',
    'external-disabled-descendant',
    'external-inert-target',
    'external-inert-descendant',
  ]) {
    await trigger.click()
    await clickLocatorCenter(page, page.getByTestId(testId))
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})

test('font listbox exposes active options and isolates keyboard navigation from the canvas', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  const element = page.getByTestId('freeform-element').first()
  const before = await freeformElementPositions(page)
  await trigger.click()

  const listbox = page.getByRole('listbox')
  const options = listbox.getByRole('option')
  const listboxId = await listbox.getAttribute('id')
  expect(listboxId).toBeTruthy()
  await expect(trigger).toHaveAttribute('role', 'combobox')
  await expect(trigger).toHaveAccessibleName('字体')
  await expect(trigger).toHaveAttribute('aria-controls', listboxId!)

  const expectActiveOption = async (index: number) => {
    const optionId = await options.nth(index).getAttribute('id')
    expect(optionId).toBeTruthy()
    await expect(trigger).toHaveAttribute('aria-activedescendant', optionId!)
  }

  await expectActiveOption(0)
  await page.keyboard.press('ArrowDown')
  await expectActiveOption(1)
  await page.keyboard.press('Home')
  await expectActiveOption(0)
  // The seven fonts, then 导入字体… last.
  await page.keyboard.press('End')
  await expectActiveOption(7)
  await expect(options.nth(7)).toHaveText('导入字体…')
  await trigger.dispatchEvent('keydown', {
    key: '思',
    bubbles: true,
    cancelable: true,
  })
  await expectActiveOption(1)
  await page.waitForTimeout(550)
  await page.keyboard.type('Ping')
  await expectActiveOption(0)
  await expect.poll(() => freeformElementPositions(page)).toEqual(before)

  await page.keyboard.press('ArrowDown')
  await expectActiveOption(1)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toContainText('思源黑体')
  await expect(element).toHaveAttribute('data-selected', 'true')
})

test('font menu closes on Tab without trapping focus and handles Space selection', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const trigger = page.getByTestId('freeform-font-select')
  const fontSize = page.getByTestId('inspector-typography').locator('input[type="number"]').first()

  await trigger.click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(fontSize).toBeFocused()

  await trigger.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('listbox')).toBeVisible()
  // The last font sits just above 导入字体….
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toContainText('系统默认')
})

test('font listbox keeps option identity across dynamic options and guards the empty state', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(async () => {
    const ReactModule = await import('/@id/react')
    const React = ReactModule.default ?? ReactModule
    const ReactDomClientModule = await import('/@id/react-dom/client')
    const ReactDomClient = ReactDomClientModule.default ?? ReactDomClientModule
    const { createRoot } = ReactDomClient
    const { Select } = await import('/src/Select.tsx')

    const alpha = { id: 'alpha one', label: 'Alpha' }
    const bravo = { id: 'bravo/two', label: 'Bravo' }
    const charlie = { id: 'charlie:three', label: 'Charlie' }
    const variants = {
      initial: [alpha, bravo, charlie],
      reordered: [charlie, alpha, bravo],
      shrunk: [alpha, bravo],
      empty: [],
    }
    const host = document.createElement('div')
    host.dataset.testid = 'dynamic-select-harness'
    host.dataset.changeCount = '0'
    document.body.replaceChildren(host)
    const root = createRoot(host)

    const render = (options: Array<{ id: string; label: string }>) => {
      root.render(
        React.createElement(Select, {
          value: bravo.id,
          options,
          onChange: (id: string) => {
            host.dataset.changeCount = String(Number(host.dataset.changeCount) + 1)
            host.dataset.lastChange = id
          },
          title: '动态字体',
          testId: 'dynamic-font-select',
        }),
      )
    }

    window.addEventListener('dynamic-select-options', (event) => {
      const variant = (event as CustomEvent<keyof typeof variants>).detail
      render(variants[variant])
    })
    render(variants.initial)
  })

  const trigger = page.getByTestId('dynamic-font-select')
  const harness = page.getByTestId('dynamic-select-harness')
  await expect(trigger).toHaveAttribute('role', 'combobox')
  await expect(trigger).toHaveAccessibleName('动态字体')
  await trigger.click()

  const listbox = page.getByRole('listbox')
  const alpha = listbox.getByRole('option', { name: 'Alpha' })
  const bravo = listbox.getByRole('option', { name: 'Bravo' })
  const charlie = listbox.getByRole('option', { name: 'Charlie' })
  const alphaId = await alpha.getAttribute('id')
  const bravoId = await bravo.getAttribute('id')
  const charlieId = await charlie.getAttribute('id')
  expect(alphaId).toBeTruthy()
  expect(bravoId).toBeTruthy()
  expect(charlieId).toBeTruthy()

  await page.keyboard.press('End')
  await expect(trigger).toHaveAttribute('aria-activedescendant', charlieId!)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'reordered' }))
  })
  await expect(charlie).toHaveAttribute('id', charlieId!)
  await expect(alpha).toHaveAttribute('id', alphaId!)
  await expect(bravo).toHaveAttribute('id', bravoId!)
  await expect(trigger).toHaveAttribute('aria-activedescendant', charlieId!)

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'shrunk' }))
  })
  await expect(charlie).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'initial' }))
  })
  await expect(charlie).toHaveCount(1)
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)
  await page.keyboard.press('ArrowUp')
  await expect(trigger).toHaveAttribute('aria-activedescendant', alphaId!)
  await page.keyboard.press('ArrowDown')
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)

  await trigger.dispatchEvent('keydown', {
    key: 'C',
    bubbles: true,
    cancelable: true,
  })
  await page.keyboard.press('Escape')
  await trigger.click()
  await trigger.dispatchEvent('keydown', {
    key: 'h',
    bubbles: true,
    cancelable: true,
  })
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'shrunk' }))
  })
  await expect(charlie).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)
  await page.keyboard.press('ArrowUp')
  await expect(trigger).toHaveAttribute('aria-activedescendant', alphaId!)
  await page.keyboard.press('ArrowDown')
  await expect(trigger).toHaveAttribute('aria-activedescendant', bravoId!)

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('dynamic-select-options', { detail: 'empty' }))
  })
  await expect(trigger).toBeDisabled()
  await expect(trigger).toContainText('暂无选项')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await trigger.dispatchEvent('click')
  await trigger.dispatchEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
  })
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(harness).toHaveAttribute('data-change-count', '0')
})

test('font listbox fully resets pending typeahead when unmounted', async ({ page }) => {
  await page.goto('/#/edit')
  await page.evaluate(async () => {
    const ReactModule = await import('/@id/react')
    const React = ReactModule.default ?? ReactModule
    const ReactDomClientModule = await import('/@id/react-dom/client')
    const ReactDomClient = ReactDomClientModule.default ?? ReactDomClientModule
    const { createRoot } = ReactDomClient
    const { Select } = await import('/src/Select.tsx')

    const host = document.createElement('div')
    host.dataset.testid = 'unmount-select-harness'
    document.body.replaceChildren(host)

    const originalSetTimeout = globalThis.setTimeout.bind(globalThis)
    const originalClearTimeout = globalThis.clearTimeout.bind(globalThis)
    let trackedHandle: number | null = null
    globalThis.setTimeout = ((
      callback: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      const isTypeaheadTimer = delay === 500
      const handle = originalSetTimeout(() => {
        if (isTypeaheadTimer && handle === trackedHandle) {
          host.dataset.timerExecuted = 'true'
        }
        callback(...args)
      }, delay)
      if (isTypeaheadTimer) {
        trackedHandle = handle
        host.dataset.timerScheduled = 'true'
      }
      return handle
    }) as typeof globalThis.setTimeout
    globalThis.clearTimeout = ((handle?: number) => {
      if (handle === trackedHandle) {
        host.dataset.timerCancelled = 'true'
        host.dataset.timerClearStack = new Error().stack ?? ''
      }
      originalClearTimeout(handle)
    }) as typeof globalThis.clearTimeout

    const root = createRoot(host)
    root.render(
      React.createElement(Select, {
        value: 'alpha',
        options: [
          { id: 'alpha', label: 'Alpha' },
          { id: 'bravo', label: 'Bravo' },
        ],
        onChange: () => undefined,
        title: 'Unmount select',
        testId: 'unmount-font-select',
      }),
    )

    window.addEventListener(
      'unmount-dynamic-select',
      () => {
        root.unmount()
        globalThis.setTimeout = originalSetTimeout
        globalThis.clearTimeout = originalClearTimeout
      },
      { once: true },
    )
  })

  const host = page.getByTestId('unmount-select-harness')
  const trigger = page.getByTestId('unmount-font-select')
  await trigger.click()
  await trigger.dispatchEvent('keydown', {
    key: 'B',
    bubbles: true,
    cancelable: true,
  })
  await expect(host).toHaveAttribute('data-timer-scheduled', 'true')

  await page.evaluate(() => {
    window.dispatchEvent(new Event('unmount-dynamic-select'))
  })
  await expect(trigger).toHaveCount(0)
  await expect(host).toHaveAttribute('data-timer-cancelled', 'true')
  await expect(host).toHaveAttribute('data-timer-clear-stack', /clearTypeahead/)
  await page.waitForTimeout(550)
  await expect(host).not.toHaveAttribute('data-timer-executed')
})

test('warms the selected web font before export is clicked', async ({ page }) => {
  await page.route(/^https?:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    headers: { 'access-control-allow-origin': '*' },
    body: `
      @font-face {
        font-family: 'Noto Serif SC';
        font-style: normal;
        font-weight: 700;
        src: url('https://fonts.gstatic.com/s/test-font.woff2') format('woff2');
        unicode-range: U+0-10FFFF;
      }
    `,
  }))
  await page.route(/^https?:\/\/fonts\.gstatic\.com\//, (route) => route.fulfill({
    status: 200,
    contentType: 'font/woff2',
    headers: { 'access-control-allow-origin': '*' },
    body: Buffer.from('offline-font-fixture'),
  }))
  const fontFetches: string[] = []
  const stylesheetRefetches: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' && request.url().includes('fonts.gstatic.com')) {
      fontFetches.push(request.url())
    }
    if (request.resourceType() === 'fetch' && request.url().includes('fonts.googleapis.com')) {
      stylesheetRefetches.push(request.url())
    }
  })

  await page.goto('/#/edit/canvas')
  await insertText(page)
  await page.getByTestId('freeform-element').first().click()
  await page.getByTestId('freeform-font-select').click()
  await page.locator('[role="option"]').nth(2).click()

  await expect.poll(() => fontFetches.length, { timeout: 5_000 }).toBeGreaterThan(0)
  expect(stylesheetRefetches).toHaveLength(0)
})
