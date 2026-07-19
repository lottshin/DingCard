import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { groupLocal, sceneNodesBoundsInParent, transformPoint } from '../src/freeform/sceneTransform'
import type { FreeformSceneNode } from '../src/freeform/types'
import { installOfflineFontRoutes } from './offlineFonts'

test.beforeEach(async ({ context }) => {
  await installOfflineFontRoutes(context)
})

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const TEST_PNG_DATA_URL = `data:image/png;base64,${TEST_PNG.toString('base64')}`

function nestedV3Draft() {
  return {
    id: 'nested-v3-draft',
    title: 'Nested v3 scene',
    schemaVersion: 2,
    mode: 'freeform-slide',
    updatedAt: Date.now(),
    document: {
      documentVersion: 3,
      activeSlideId: 'nested-slide',
      slides: [{
        id: 'nested-slide',
        name: 'Nested scene',
        width: 800,
        height: 600,
        background: { type: 'solid', color: '#ffffff' },
        nodes: [{
          id: 'underlay',
          name: 'Underlay',
          locked: false,
          hidden: false,
          type: 'shape',
          x: 40,
          y: 40,
          width: 460,
          height: 320,
          rotation: 0,
          scale: 1,
          shape: 'rect',
          fill: { type: 'solid', color: '#fca5a5' },
          stroke: '#991b1b',
          strokeWidth: 0,
        }, {
          id: 'outer',
          name: 'Outer group',
          locked: false,
          hidden: false,
          type: 'group',
          x: 300,
          y: 200,
          rotation: 0,
          scale: 1.25,
          children: [{
            id: 'visible-leaf',
            name: 'Visible leaf',
            locked: false,
            hidden: false,
            type: 'shape',
            x: -80,
            y: -60,
            width: 80,
            height: 40,
            rotation: 0,
            scale: 1,
            shape: 'rect',
            fill: { type: 'solid', color: '#22c55e' },
            stroke: '#166534',
            strokeWidth: 0,
          }, {
            id: 'scope-text',
            name: 'Scope text',
            locked: false,
            hidden: false,
            type: 'text',
            x: -80,
            y: 0,
            width: 100,
            height: 40,
            rotation: 0,
            scale: 1,
            text: 'Enter group to edit',
            fontSize: 20,
            fontFamily: 'system-ui',
            textFill: { type: 'solid', color: '#111111' },
            align: 'left',
            fontWeight: 'normal',
          }, {
            id: 'locked-inner',
            name: 'Locked inner',
            locked: true,
            hidden: false,
            type: 'group',
            x: 40,
            y: 20,
            rotation: 0,
            scale: 0.5,
            children: [{
              id: 'locked-text',
              name: 'Locked text',
              locked: false,
              hidden: false,
              type: 'text',
              x: 0,
              y: 0,
              width: 200,
              height: 80,
              rotation: 0,
              scale: 1,
              text: 'Read only nested text',
              fontSize: 24,
              fontFamily: 'system-ui',
              textFill: { type: 'solid', color: '#111111' },
              align: 'left',
              fontWeight: 'normal',
            }],
          }, {
            id: 'hidden-inner',
            name: 'Hidden inner',
            locked: false,
            hidden: true,
            type: 'group',
            x: 0,
            y: 0,
            rotation: 0,
            scale: 1,
            children: [{
              id: 'hidden-leaf',
              name: 'Hidden leaf',
              locked: false,
              hidden: false,
              type: 'shape',
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotation: 0,
              scale: 1,
              shape: 'ellipse',
              fill: { type: 'solid', color: '#2563eb' },
              stroke: '#1e3a8a',
              strokeWidth: 0,
            }],
          }],
        }, {
          id: 'scaled-root',
          name: 'Scaled root leaf',
          locked: false,
          hidden: false,
          type: 'shape',
          x: 520,
          y: 400,
          width: 100,
          height: 80,
          rotation: 0,
          scale: 1.5,
          shape: 'rect',
          fill: { type: 'solid', color: '#facc15' },
          stroke: '#854d0e',
          strokeWidth: 0,
        }, {
          id: 'locked-root-leaf',
          name: 'Locked root leaf',
          locked: true,
          hidden: false,
          type: 'shape',
          x: 680,
          y: 20,
          width: 80,
          height: 50,
          rotation: 0,
          scale: 1,
          shape: 'rect',
          fill: { type: 'solid', color: '#94a3b8' },
          stroke: '#334155',
          strokeWidth: 0,
        }, {
          id: 'locked-root-group',
          name: 'Locked root group',
          locked: true,
          hidden: false,
          type: 'group',
          x: 650,
          y: 100,
          rotation: 0,
          scale: 1,
          children: [{
            id: 'locked-root-group-leaf',
            name: 'Locked root group leaf',
            locked: false,
            hidden: false,
            type: 'shape',
            x: 0,
            y: 0,
            width: 100,
            height: 60,
            rotation: 0,
            scale: 1,
            shape: 'ellipse',
            fill: { type: 'solid', color: '#cbd5e1' },
            stroke: '#475569',
            strokeWidth: 0,
          }],
        }],
      }],
    },
  }
}

function nestedPropertyMatrixDraft() {
  const draft = structuredClone(nestedV3Draft())
  const outer = (
    draft.document.slides[0].nodes as unknown as Array<{
      id: string
      type: string
      children?: unknown[]
    }>
  ).find((node) => node.id === 'outer')
  if (!outer || outer.type !== 'group' || !outer.children) {
    throw new Error('nested property matrix fixture requires the outer group')
  }
  outer.children.push({
    id: 'matrix-image',
    name: 'Matrix image',
    locked: false,
    hidden: false,
    type: 'image',
    x: 80,
    y: 100,
    width: 120,
    height: 90,
    rotation: 0,
    scale: 1,
    src: TEST_PNG_DATA_URL,
    alt: 'Nested matrix image',
    fit: 'cover',
  }, {
    id: 'matrix-line',
    name: 'Matrix line',
    locked: false,
    hidden: false,
    type: 'line',
    x: 80,
    y: 220,
    width: 160,
    height: 40,
    rotation: 0,
    scale: 1,
    lineKind: 'line',
    stroke: '#0f172a',
    strokeWidth: 4,
  })
  return draft
}

function groupingDraft() {
  const draft = structuredClone(nestedV3Draft())
  const shape = (
    id: string,
    name: string,
    x: number,
    y: number,
    locked = false,
  ) => ({
    id,
    name,
    locked,
    hidden: false,
    type: 'shape' as const,
    x,
    y,
    width: 80,
    height: 60,
    rotation: 0,
    scale: 1,
    shape: 'rect' as const,
    fill: { type: 'solid' as const, color: '#dbeafe' },
    stroke: '#1d4ed8',
    strokeWidth: 0,
  })
  ;(draft.document.slides[0].nodes as unknown[]) = [
    shape('layer-a', 'Layer A', 80, 80),
    shape('layer-b', 'Layer B', 180, 80),
    shape('layer-c', 'Layer C', 280, 80),
    shape('layer-d', 'Layer D', 380, 80),
    {
      id: 'locked-container',
      name: 'Locked container',
      locked: true,
      hidden: false,
      type: 'group',
      x: 600,
      y: 180,
      rotation: 0,
      scale: 1,
      children: [
        shape('locked-child-a', 'Locked child A', -60, -30),
        shape('locked-child-b', 'Locked child B', 40, -30),
      ],
    },
  ]
  return draft
}

function scopeNavigationDraft() {
  const draft = structuredClone(groupingDraft())
  const shape = (
    id: string,
    name: string,
    x: number,
    y: number,
  ) => ({
    id,
    name,
    locked: false,
    hidden: false,
    type: 'shape' as const,
    x,
    y,
    width: 80,
    height: 60,
    rotation: 0,
    scale: 1,
    shape: 'rect' as const,
    fill: { type: 'solid' as const, color: '#dcfce7' },
    stroke: '#15803d',
    strokeWidth: 0,
  })
  ;(draft.document.slides[0].nodes as unknown[]) = [{
    id: 'scope-outer',
    name: 'Scope outer',
    locked: false,
    hidden: false,
    type: 'group',
    x: 360,
    y: 260,
    rotation: 0,
    scale: 1,
    children: [{
      id: 'scope-inner',
      name: 'Scope inner',
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [shape('scope-leaf', 'Scope leaf', -40, -30)],
    }, shape('outer-leaf', 'Outer leaf', 120, 0)],
  }]
  return draft
}

function textScopeDraft() {
  const draft = structuredClone(scopeNavigationDraft())
  const outer = draft.document.slides[0].nodes[0] as unknown as {
    children: Array<Record<string, unknown>>
  }
  outer.children.push({
    id: 'scope-text-edit',
    name: 'Scope editable text',
    locked: false,
    hidden: false,
    type: 'text',
    x: -140,
    y: 80,
    width: 240,
    height: 60,
    rotation: 0,
    scale: 1,
    text: 'Escape editing first',
    fontSize: 24,
    fontFamily: 'system-ui',
    textFill: { type: 'solid', color: '#111111' },
    align: 'left',
    fontWeight: 'normal',
  })
  return draft
}

function offCenterScopeDraft() {
  const draft = structuredClone(groupingDraft())
  ;(draft.document.slides[0].nodes as unknown[]) = [{
    id: 'offset-parent',
    name: 'Offset parent',
    locked: false,
    hidden: false,
    type: 'group',
    x: 360,
    y: 240,
    rotation: 28,
    scale: 1.25,
    children: [{
      id: 'offset-anchor',
      name: 'Offset anchor',
      locked: false,
      hidden: false,
      type: 'shape',
      x: 125.25,
      y: 78.5,
      width: 120,
      height: 80,
      rotation: 22,
      scale: 1.4,
      shape: 'rect',
      fill: { type: 'solid', color: '#fde68a' },
      stroke: '#92400e',
      strokeWidth: 0,
    }],
  }]
  return draft
}

function deepLayerBranch(depth: number) {
  let node: Record<string, unknown> = {
    id: 'deep-leaf',
    name: 'Deep layer label remains readable',
    locked: false,
    hidden: false,
    type: 'shape',
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    rotation: 0,
    scale: 1,
    shape: 'rect',
    fill: { type: 'solid', color: '#111827' },
    stroke: '#111827',
    strokeWidth: 0,
  }
  for (let level = depth - 1; level >= 1; level -= 1) {
    node = {
      id: `deep-group-${level}`,
      name: `Deep group ${level}`,
      locked: false,
      hidden: false,
      type: 'group',
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      children: [node],
    }
  }
  node.locked = true
  node.hidden = true
  return node
}

function readPngSize(buffer: Buffer) {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function samplePngPixel(
  page: import('@playwright/test').Page,
  filePath: string,
  x: number,
  y: number,
) {
  const buffer = await readFile(filePath)
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(
    async ({ dataUrl, x, y }) => {
      const img = new Image()
      img.src = dataUrl
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas context')
      context.drawImage(img, 0, 0)
      return Array.from(context.getImageData(x, y, 1, 1).data)
    },
    { dataUrl, x, y },
  )
}

async function pngPixelDigest(
  page: import('@playwright/test').Page,
  filePath: string,
) {
  const buffer = await readFile(filePath)
  const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
  return page.evaluate(async (source) => {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas context')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    const digest = await crypto.subtle.digest('SHA-256', pixels)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }, dataUrl)
}

function rgbDistance(a: number[], b: number[]) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 +
      (a[1] - b[1]) ** 2 +
      (a[2] - b[2]) ** 2,
  )
}

function contrastRatio(foreground: string, background: string) {
  const parse = (value: string) => {
    const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
    if (!channels || channels.length !== 3) throw new Error(`Unsupported CSS color: ${value}`)
    return channels.map((channel) => {
      const normalized = channel / 255
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    })
  }
  const luminance = (value: string) => {
    const [red, green, blue] = parse(value)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

async function freeformElementPositions(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      const el = element as HTMLElement
      return {
        x: Number.parseFloat(el.style.left),
        y: Number.parseFloat(el.style.top),
      }
    }),
  )
}

async function freeformCanvasScale(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-canvas').evaluate((canvas) => {
    const element = canvas as HTMLElement
    const logicalWidth = Number.parseFloat(element.style.width)
    const renderedWidth = element.getBoundingClientRect().width
    if (!Number.isFinite(logicalWidth) || logicalWidth <= 0 || renderedWidth <= 0) {
      throw new Error('freeform canvas scale is not measurable')
    }
    return renderedWidth / logicalWidth
  })
}

async function locatorOwnsPoint(
  locator: import('@playwright/test').Locator,
  x: number,
  y: number,
) {
  return locator.evaluate((node, point) => {
    const hit = document.elementFromPoint(point.x, point.y)
    return Boolean(hit && (hit === node || node.contains(hit)))
  }, { x, y })
}

async function freeformStageMetrics(page: import('@playwright/test').Page) {
  return page.locator('.freeform-stage-scroll').evaluate((stage) => {
    const canvas = stage.querySelector<HTMLElement>('[data-testid="freeform-canvas"]')
    if (!canvas) throw new Error('freeform canvas is not ready')
    const stageRect = stage.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const style = getComputedStyle(stage)
    const px = (value: string) => Number.parseFloat(value) || 0
    const borderLeft = px(style.borderLeftWidth)
    const borderRight = px(style.borderRightWidth)
    const borderTop = px(style.borderTopWidth)
    const borderBottom = px(style.borderBottomWidth)
    const paddingLeft = px(style.paddingLeft)
    const paddingRight = px(style.paddingRight)
    const paddingTop = px(style.paddingTop)
    const paddingBottom = px(style.paddingBottom)
    const logicalWidth = Number.parseFloat(canvas.style.width)
    const logicalHeight = Number.parseFloat(canvas.style.height)

    return {
      contentWidth: stageRect.width - borderLeft - borderRight - paddingLeft - paddingRight,
      contentHeight: stageRect.height - borderTop - borderBottom - paddingTop - paddingBottom,
      logicalWidth,
      logicalHeight,
      renderedWidth: canvasRect.width,
      renderedHeight: canvasRect.height,
      stageLeft: stageRect.left + borderLeft,
      stageRight: stageRect.right - borderRight,
      stageTop: stageRect.top + borderTop,
      stageBottom: stageRect.bottom - borderBottom,
      canvasLeft: canvasRect.left,
      canvasRight: canvasRect.right,
      canvasTop: canvasRect.top,
      canvasBottom: canvasRect.bottom,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      clientWidth: stage.clientWidth,
      clientHeight: stage.clientHeight,
      scrollWidth: stage.scrollWidth,
      scrollHeight: stage.scrollHeight,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    }
  })
}

async function expectFreeformCanvasMatchesZoom(
  page: import('@playwright/test').Page,
  zoomPercent: number,
  expectNoOverflow: boolean,
) {
  await expect
    .poll(async () => {
      const metrics = await freeformStageMetrics(page)
      const fitScale = Math.min(
        metrics.contentWidth / metrics.logicalWidth,
        metrics.contentHeight / metrics.logicalHeight,
      )
      const actualScale = metrics.renderedWidth / metrics.logicalWidth
      return actualScale / (fitScale * (zoomPercent / 100))
    })
    .toBeCloseTo(1, 3)

  const metrics = await freeformStageMetrics(page)
  if (expectNoOverflow) {
    expect(metrics.scrollWidth - metrics.clientWidth).toBeLessThanOrEqual(1)
    expect(metrics.scrollHeight - metrics.clientHeight).toBeLessThanOrEqual(1)
  }
  return metrics
}

async function setFreeformZoom(page: import('@playwright/test').Page, target: number) {
  const value = page.locator('.freeform-stage-pane .zoom-value')
  const current = Number.parseInt((await value.textContent()) ?? '', 10)
  if (!Number.isFinite(current) || target % 10 !== 0) throw new Error('invalid zoom target')
  const direction = target > current ? 10 : -10
  const button = page.getByRole('button', {
    name: direction > 0 ? '放大画布' : '缩小画布',
    exact: true,
  })
  for (let zoom = current; zoom !== target; zoom += direction) {
    if (await button.isDisabled()) {
      throw new Error(`freeform zoom stopped at ${zoom}% before reaching ${target}%`)
    }
    await button.click()
  }
  await expect(value).toHaveText(`${target}%`)
}

async function selectFreeformPagePreset(
  page: import('@playwright/test').Page,
  ratio: '1:1' | '9:16' | '16:9',
) {
  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: ratio, exact: true }).click()
}

async function applyFreeformCustomSize(
  page: import('@playwright/test').Page,
  width: number,
  height: number,
) {
  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill(String(width))
  await page.getByLabel('高度 px').fill(String(height))
  await page.getByRole('button', { name: '应用尺寸', exact: true }).click()
}

async function freeformElementBoxes(page: import('@playwright/test').Page) {
  return page.getByTestId('freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      const node = element as HTMLElement
      return {
        x: Number.parseFloat(node.style.left),
        y: Number.parseFloat(node.style.top),
        width: Number.parseFloat(node.style.width),
        height: Number.parseFloat(node.style.height),
      }
    }),
  )
}

function selectedFreeformElements(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="freeform-element"][data-selected="true"]')
}

async function freeformElementKinds(page: import('@playwright/test').Page) {
  return page.locator('.freeform-element').evaluateAll((elements) =>
    elements.map((element) => {
      if (element.querySelector('.freeform-textbox')) return 'text'
      if (element.querySelector('.freeform-shape')) return 'shape'
      if (element.querySelector('.freeform-image')) return 'image'
      return 'unknown'
    }),
  )
}

async function registerUser(page: import('@playwright/test').Page, username: string) {
  await page.getByRole('button', { name: '注册' }).click()
  await page.getByLabel('用户名').fill(username)
  await page.getByLabel('密码').fill('1234')
  await page.getByRole('button', { name: '创建账号' }).click()
}

type ShapeFillFileReaderGate = {
  started: number
  completed: number
  original: typeof FileReader.prototype.readAsDataURL
  releaseAll: () => void
}

type ShapeFillGateWindow = typeof window & {
  __shapeFillFileReaderGate?: ShapeFillFileReaderGate
}

async function installShapeFillFileReaderGate(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const gateWindow = window as ShapeFillGateWindow
    if (gateWindow.__shapeFillFileReaderGate) {
      throw new Error('delayed FileReader gate already installed')
    }

    const pending: Array<() => void> = []
    const original = FileReader.prototype.readAsDataURL
    const state: ShapeFillFileReaderGate = {
      started: 0,
      completed: 0,
      original,
      releaseAll() {
        pending.splice(0).forEach((release) => release())
      },
    }
    gateWindow.__shapeFillFileReaderGate = state
    FileReader.prototype.readAsDataURL = function delayedReadAsDataURL(blob: Blob) {
      state.started += 1
      const reader = this
      pending.push(() => {
        reader.addEventListener('loadend', () => {
          state.completed += 1
        }, { once: true })
        original.call(reader, blob)
      })
    }
  })
}

async function expectShapeFillFileReaderStarted(
  page: import('@playwright/test').Page,
  expected = 1,
) {
  await expect.poll(() => page.evaluate(() => (
    window as ShapeFillGateWindow
  ).__shapeFillFileReaderGate?.started)).toBe(expected)
}

async function releaseShapeFillFileReaderGate(
  page: import('@playwright/test').Page,
  expected = 1,
) {
  await page.evaluate(() => {
    const state = (window as ShapeFillGateWindow).__shapeFillFileReaderGate
    if (!state) throw new Error('delayed FileReader gate missing')
    state.releaseAll()
  })
  await expect.poll(() => page.evaluate(() => (
    window as ShapeFillGateWindow
  ).__shapeFillFileReaderGate?.completed)).toBe(expected)
}

async function restoreShapeFillFileReaderGate(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const gateWindow = window as ShapeFillGateWindow
    const state = gateWindow.__shapeFillFileReaderGate
    if (state) FileReader.prototype.readAsDataURL = state.original
    delete gateWindow.__shapeFillFileReaderGate
  })
}

async function expectVisibleFreeformToolbarButtonsToFit(
  page: import('@playwright/test').Page,
) {
  const toolbarGeometry = await page.getByTestId('freeform-toolbar').evaluate((toolbar) => {
    const toolbarRect = toolbar.getBoundingClientRect()
    const buttons = Array.from(toolbar.querySelectorAll('button'))
      .flatMap((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
          return []
        }
        const hitTarget = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        return [{
          label: (button.getAttribute('aria-label') ?? button.textContent ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          isHitTarget: hitTarget === button || hitTarget?.closest('button') === button,
        }]
      })
      .sort((a, b) => a.left - b.left)

    return {
      buttons,
      toolbar: {
        left: toolbarRect.left,
        right: toolbarRect.right,
        top: toolbarRect.top,
        bottom: toolbarRect.bottom,
      },
      clientWidth: toolbar.clientWidth,
      scrollWidth: toolbar.scrollWidth,
    }
  })

  expect(toolbarGeometry.buttons.length).toBeGreaterThan(0)
  for (const button of toolbarGeometry.buttons) {
    expect.soft(button.left, `${button.label} 超出工具栏左边界`).toBeGreaterThanOrEqual(
      toolbarGeometry.toolbar.left - 0.5,
    )
    expect.soft(button.right, `${button.label} 超出工具栏右边界`).toBeLessThanOrEqual(
      toolbarGeometry.toolbar.right + 0.5,
    )
    expect.soft(button.top, `${button.label} 超出工具栏上边界`).toBeGreaterThanOrEqual(
      toolbarGeometry.toolbar.top - 0.5,
    )
    expect.soft(button.bottom, `${button.label} 超出工具栏下边界`).toBeLessThanOrEqual(
      toolbarGeometry.toolbar.bottom + 0.5,
    )
    expect.soft(button.isHitTarget, `${button.label} 的中心点被其他控件遮挡`).toBe(true)
  }
  for (let index = 0; index < toolbarGeometry.buttons.length - 1; index += 1) {
    const current = toolbarGeometry.buttons[index]
    const next = toolbarGeometry.buttons[index + 1]
    expect.soft(
      current.right,
      `${current.label} [${current.left}, ${current.right}] 与 ${next.label} [${next.left}, ${next.right}] 重叠`,
    ).toBeLessThanOrEqual(next.left + 0.5)
  }
  expect(toolbarGeometry.scrollWidth).toBeLessThanOrEqual(toolbarGeometry.clientWidth)
}

async function setSelectedElementPosition(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
) {
  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  await positionInputs.nth(0).fill(String(x))
  await positionInputs.nth(0).press('Enter')
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(1).press('Enter')
}

async function setSelectedElementBox(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  await positionInputs.nth(0).fill(String(x))
  await positionInputs.nth(0).press('Enter')
  await positionInputs.nth(1).fill(String(y))
  await positionInputs.nth(1).press('Enter')
  await positionInputs.nth(2).fill(String(width))
  await positionInputs.nth(2).press('Enter')
  await positionInputs.nth(3).fill(String(height))
  await positionInputs.nth(3).press('Enter')
}

async function openFreeform(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
}

async function openNestedV3Draft(
  page: import('@playwright/test').Page,
  username: string,
  includeDeepLayer = false,
  createDraft: () => ReturnType<typeof nestedV3Draft> = nestedV3Draft,
) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: '\u4fdd\u5b58\u8349\u7a3f', exact: true }).click()
  await registerUser(page, username)
  await page.getByRole('button', { name: '\u4fdd\u5b58\u8349\u7a3f', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('\u5df2\u4fdd\u5b58')

  const draft = createDraft()
  if (includeDeepLayer) {
    (draft.document.slides[0].nodes as unknown[]).push(deepLayerBranch(25))
  }
  await page.evaluate((draft) => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    localStorage.setItem(key, JSON.stringify([draft]))
  }, draft)
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: /^\u8349\u7a3f(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Nested v3 scene' }).click()
}

async function insertText(page: import('@playwright/test').Page) {
  await page.getByTestId('insert-text').click()
}

async function insertShape(
  page: import('@playwright/test').Page,
  label: '矩形' | '圆形' | '三角形' = '矩形',
) {
  const trigger = page.getByTestId('insert-shape')
  const menu = page.getByRole('menu', { name: '形状' })
  await trigger.click()
  await menu.getByRole('menuitem', { name: label, exact: true }).click()
  await expect(menu).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
}

async function insertImageElementAndShapeFill(page: import('@playwright/test').Page) {
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'image-element.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.getByTestId('freeform-element').filter({ has: page.locator('.freeform-image') }))
    .toHaveCount(1)

  await insertShape(page)
  await page.locator('input.freeform-file').nth(1).setInputFiles({
    name: 'shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(1)
}

async function expectFreeformImagesDecoded(page: import('@playwright/test').Page) {
  await expect.poll(() => page.locator('.freeform-image').evaluate(async (node) => {
    const image = node as HTMLImageElement
    try {
      await image.decode()
      return image.naturalWidth > 0 && image.naturalHeight > 0
    } catch {
      return false
    }
  })).toBe(true)

  await expect.poll(() => page.getByTestId('freeform-shape-image-fill').evaluate(async (node) => {
    const background = getComputedStyle(node).backgroundImage
    const match = background.match(/^url\(["']?(.*?)["']?\)$/)
    if (!match) return false
    const image = new Image()
    image.src = match[1]
    try {
      await image.decode()
      return image.naturalWidth > 0 && image.naturalHeight > 0
    } catch {
      return false
    }
  })).toBe(true)
}

async function insertLine(
  page: import('@playwright/test').Page,
  label: '直线' | '箭头',
) {
  const trigger = page.getByTestId('insert-line')
  const menu = page.getByRole('menu', { name: '线条' })
  await trigger.click()
  await menu.getByRole('menuitem', { name: label, exact: true }).click()
  await expect(menu).toHaveCount(0)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toBeFocused()
}

async function insertTwoSelectedRectangles(page: import('@playwright/test').Page) {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await elements.first().click()
  await expect(selectedFreeformElements(page)).toHaveCount(2)
}

async function insertTwoRectanglesLeavingInspectorFocused(page: import('@playwright/test').Page) {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  return elements
}

test('inspector hierarchy shows only context-relevant sections in contract order', async ({ page }) => {
  const inspector = page.locator('.freeform-properties-tabpanel')
  const sectionIds = () =>
    inspector.locator(':scope > [data-testid^="inspector-"]').evaluateAll((sections) =>
      sections.map((section) => section.getAttribute('data-testid')),
    )
  const expectSections = async (expected: string[]) => {
    await expect.poll(sectionIds).toEqual(expected.map((name) => `inspector-${name}`))
  }

  await openFreeform(page)

  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect(inspector.locator('.inspector-empty')).toContainText('选择')
  await expectSections(['page'])
  const pagePaint = page.getByTestId('page-background-paint')
  await expect(pagePaint.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(pagePaint.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(pagePaint.getByTestId('paint-mode-transparent')).toBeVisible()

  await insertShape(page)
  await setSelectedElementPosition(page, 100, 100)
  await expectSections(['geometry', 'fill', 'stroke', 'arrange', 'danger'])
  const shapeFill = page.getByTestId('inspector-fill').getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(shapeFill.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(shapeFill.getByTestId('paint-mode-image')).toBeVisible()

  await insertText(page)
  await setSelectedElementPosition(page, 420, 180)
  await expectSections(['geometry', 'typography', 'fill', 'arrange', 'danger'])
  const textFill = page.getByTestId('text-fill-paint')
  await expect(textFill.getByTestId('paint-mode-solid')).toBeVisible()
  await expect(textFill.getByTestId('paint-mode-linear-gradient')).toBeVisible()
  await expect(textFill.getByTestId('paint-mode-image')).toHaveCount(0)

  await insertLine(page, '直线')
  await setSelectedElementPosition(page, 760, 300)
  await expectSections(['geometry', 'stroke', 'arrange', 'danger'])
  const lineStroke = page.getByTestId('inspector-stroke')
  await expect(
    lineStroke.getByTestId('line-stroke-color').getByTestId('paint-color-button'),
  ).toBeVisible()
  await expect(lineStroke.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(lineStroke.getByTestId('paint-mode-linear-gradient')).toHaveCount(0)
  await expect(lineStroke.getByTestId('paint-mode-image')).toHaveCount(0)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByTestId('insert-image').click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')
  await expectSections(['geometry', 'fill', 'arrange', 'danger'])
  const imageFill = page.getByTestId('inspector-fill')
  await expect(imageFill.getByRole('button', { name: '填满', exact: true })).toBeVisible()
  await expect(imageFill.getByRole('button', { name: '适应', exact: true })).toBeVisible()
  await expect(imageFill.getByTestId('freeform-paint-field')).toHaveCount(0)
  await expect(page.getByTestId('inspector-stroke')).toHaveCount(0)

  await page.getByTestId('freeform-canvas').click({ position: { x: 10, y: 10 } })
  await expect(selectedFreeformElements(page)).toHaveCount(0)
  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect(inspector.locator('.inspector-empty')).toHaveText('选择对象以编辑属性。')
  await expect(inspector.locator('input[type="number"]')).toHaveCount(0)
  await expect(page.getByTestId('line-stroke-color')).toHaveCount(0)
  await expectSections(['page'])

  const lineElement = page.getByTestId('freeform-element').filter({ has: page.getByTestId('freeform-line') })
  const textElement = page.getByTestId('freeform-element').filter({ has: page.getByTestId('freeform-textbox') })
  await lineElement.click()
  await textElement.click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await expectSections(['arrange'])
})

test('inspector hierarchy never commits stale object sections while undo clears selection', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const inspector = page.locator('.freeform-properties-tabpanel')
  await expect(page.getByTestId('inspector-geometry')).toBeVisible()
  await inspector.evaluate((node) => {
    const snapshots: string[][] = []
    node.setAttribute('data-undo-section-snapshots', '[]')
    const observer = new MutationObserver(() => {
      snapshots.push(
        Array.from(node.querySelectorAll(':scope > [data-testid^="inspector-"]'))
          .map((section) => section.getAttribute('data-testid'))
          .filter((testId): testId is string => testId !== null),
      )
      node.setAttribute('data-undo-section-snapshots', JSON.stringify(snapshots))
    })
    observer.observe(node, { childList: true, subtree: true })
  })

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(page.getByTestId('inspector-page')).toBeVisible()
  await expect
    .poll(async () => {
      const value = await inspector.getAttribute('data-undo-section-snapshots')
      const snapshots = JSON.parse(value ?? '[]') as string[][]
      return snapshots.at(-1)
    })
    .toEqual(['inspector-page'])

  const value = await inspector.getAttribute('data-undo-section-snapshots')
  const snapshots = JSON.parse(value ?? '[]') as string[][]
  expect(snapshots.length).toBeGreaterThan(0)
  for (const snapshot of snapshots) {
    expect(snapshot).not.toContain('inspector-arrange')
    expect(snapshot).not.toContain('inspector-danger')
  }
})

test('shared inspector controls use 32px height, 8px radius, and custom native replacements', async ({ page }) => {
  const expectControlBox = async (control: import('@playwright/test').Locator) => {
    await expect(control).toHaveCSS('height', '32px')
    await expect(control).toHaveCSS('border-radius', '8px')
  }

  await openFreeform(page)

  const pageSection = page.getByTestId('inspector-page')
  await expectControlBox(pageSection.locator('.text-input'))
  await expectControlBox(pageSection.locator('.paint-hex'))

  await insertShape(page)

  const geometry = page.getByTestId('inspector-geometry')
  const shapeSegmentGroup = geometry.locator('.seg.stretch')
  const shapeSegment = geometry.getByRole('button', { name: '矩形', exact: true })
  const geometryNumber = geometry.locator('input[type="number"]').first()
  const shapeFill = page.getByTestId('shape-fill-paint')
  const arrangeButton = page.getByTestId('inspector-arrange').getByRole('button', { name: '后移', exact: true })
  const deleteButton = page.getByTestId('inspector-danger').getByRole('button', { name: '删除', exact: true })
  await expectControlBox(shapeSegmentGroup)
  await expectControlBox(shapeSegment)
  await expectControlBox(geometryNumber)
  await expect(geometryNumber).toHaveCSS('appearance', 'textfield')
  await expectControlBox(shapeFill.getByTestId('paint-color-button'))
  await expectControlBox(arrangeButton)
  await expectControlBox(deleteButton)

  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  const angleNumber = shapeFill.locator('.paint-angle')
  await expectControlBox(angleNumber)

  const gradientStartColor = shapeFill.getByRole('button', { name: '填充 渐变起始色', exact: true })
  await expectControlBox(gradientStartColor)
  await gradientStartColor.click()
  const popover = shapeFill.getByTestId('paint-popover')
  const popoverHex = popover.locator('.paint-popover-hex')
  const channelNumber = popover.locator('.paint-channel-number').first()
  const channelRange = popover.locator('.paint-channel-range').first()
  await expectControlBox(popoverHex)
  await expectControlBox(channelNumber)
  await expect(channelNumber).toHaveCSS('appearance', 'textfield')
  await expect(channelRange).toHaveCSS('appearance', 'none')
  await expect(channelRange).toHaveCSS('height', '8px')
  await expect(channelRange).toHaveCSS('border-radius', '999px')
  await expect(channelRange).toHaveCSS('background-image', /linear-gradient/)
  const css = await readFile('src/styles.css', 'utf8')
  expect(css).toMatch(
    /\.freeform-inspector \.paint-channel-range::-webkit-slider-thumb\s*\{[^}]*background:\s*var\(--text\)/s,
  )
  expect(css).toMatch(
    /\.freeform-inspector \.paint-channel-range::-moz-range-thumb\s*\{[^}]*background:\s*var\(--text\)/s,
  )
  await gradientStartColor.click()

  await expect(page.locator('.freeform-inspector input[type="file"]:visible')).toHaveCount(0)

  await insertText(page)
  await expectControlBox(page.getByTestId('freeform-font-select'))
  await expect(page.locator('.freeform-inspector select:visible')).toHaveCount(0)
})

test('shared inspector controls expose a visible accent focus ring', async ({ page }) => {
  await openFreeform(page)
  const accentColor = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  const expectAccentFocus = async (control: import('@playwright/test').Locator) => {
    // Establish Chromium's keyboard modality so programmatic focus exercises :focus-visible.
    await page.keyboard.press('Tab')
    await control.focus()
    await expect(control).toHaveCSS('outline-color', accentColor)
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
    await expect(control).toHaveCSS('outline-offset', '2px')
  }

  const pageSection = page.getByTestId('inspector-page')
  await expectAccentFocus(pageSection.locator('.text-input'))
  await expectAccentFocus(pageSection.locator('.paint-hex'))

  await insertShape(page)
  const geometry = page.getByTestId('inspector-geometry')
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expectAccentFocus(geometry.getByRole('button', { name: '矩形', exact: true }))
  await expectAccentFocus(geometry.locator('input[type="number"]').first())
  await expectAccentFocus(page.getByTestId('inspector-arrange').getByRole('button', { name: '后移', exact: true }))
  await expectAccentFocus(page.getByTestId('inspector-danger').getByRole('button', { name: '删除', exact: true }))

  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  await expectAccentFocus(shapeFill.locator('.paint-angle'))
  const gradientStartColor = shapeFill.getByRole('button', { name: '填充 渐变起始色', exact: true })
  await expectAccentFocus(gradientStartColor)
  await gradientStartColor.click()
  const popover = shapeFill.getByTestId('paint-popover')
  await expectAccentFocus(popover.locator('.paint-popover-hex'))
  await expectAccentFocus(popover.locator('.paint-channel-number').first())
  await expectAccentFocus(popover.locator('.paint-channel-range').first())
  await expectAccentFocus(popover.locator('.paint-swatch').first())
  await gradientStartColor.click()

  await insertText(page)
  await expectAccentFocus(page.getByTestId('freeform-font-select'))
})

test('inspector danger text remains readable in light and dark themes', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const html = page.locator('html')
  if ((await html.getAttribute('data-theme')) !== 'light') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(html).toHaveAttribute('data-theme', 'light')
  await expect(html).not.toHaveClass(/theme-anim/)

  const danger = page.getByTestId('inspector-danger')
  const title = danger.locator('.inspector-section-title')
  const button = danger.getByRole('button', { name: '删除', exact: true })
  const readContrast = (control: import('@playwright/test').Locator) =>
    control.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
    }))

  const lightTitle = await readContrast(title)
  const lightButton = await readContrast(button)
  expect(contrastRatio(lightTitle.foreground, lightTitle.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(lightButton.foreground, lightButton.background)).toBeGreaterThanOrEqual(4.5)

  await page.getByTestId('theme-toggle').click()
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(html).not.toHaveClass(/theme-anim/)
  const darkTitle = await readContrast(title)
  const darkButton = await readContrast(button)
  expect(contrastRatio(darkTitle.foreground, darkTitle.background)).toBeGreaterThanOrEqual(4.5)
  expect(contrastRatio(darkButton.foreground, darkButton.background)).toBeGreaterThanOrEqual(4.5)
  expect(darkTitle.foreground).not.toBe(lightTitle.foreground)
})

test('global header owns workspace tabs, theme, and account state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  await expect(page.getByTestId('app-header')).toHaveCount(1)
  await expect(page.getByTestId('workspace-tab-markdown')).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await page.getByTestId('theme-toggle').click()
  const theme = await page.locator('html').getAttribute('data-theme')
  expect(theme).toMatch(/^(light|dark)$/)

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)

  await page.getByTestId('account-login').click()
  await expect(page.locator('.form-note')).toContainText('仅保存在此浏览器本地')
  await registerUser(page, `header-${Date.now()}`)

  await expect(page.getByTestId('account-logout')).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/theme-anim/)
  const accountBackground = await page
    .getByTestId('account-logout')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const primaryExportBackground = await page
    .getByTestId('freeform-primary-export')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  const accentBackground = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
  expect(accountBackground).not.toBe(accentBackground)
  expect(accountBackground).not.toBe(primaryExportBackground)
  await page.getByTestId('workspace-tab-markdown').click()
  await expect(page.getByTestId('account-logout')).toBeVisible()
})

test('malformed account storage falls back to a logged-out app shell', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('slicer.users.v1', '{}')
    localStorage.setItem('slicer.session.v1', 'broken-session')
  })
  await page.reload()

  await expect(page.getByTestId('app-header')).toBeVisible()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await expect(page.getByTestId('workspace-tab-markdown')).toHaveAttribute('aria-selected', 'true')
})

test('blocked browser storage keeps the app shell and theme toggle usable', async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('storage blocked', 'SecurityError')
    }
    Storage.prototype.getItem = blocked
    Storage.prototype.setItem = blocked
    Storage.prototype.removeItem = blocked
  })
  await page.goto('/')

  const html = page.locator('html')
  await expect(page.getByTestId('app-header')).toBeVisible()
  const initialTheme = await html.getAttribute('data-theme')
  expect(initialTheme).toMatch(/^(light|dark)$/)

  await page.getByTestId('theme-toggle').click()
  await expect(html).toHaveAttribute('data-theme', initialTheme === 'light' ? 'dark' : 'light')
  await expect(page.getByTestId('app-header')).toBeVisible()
})

test('only the active workspace contextual toolbar is exposed', async ({ page }) => {
  await page.goto('/')

  const markdownToolbar = page.getByTestId('markdown-toolbar')
  await expect(markdownToolbar).toBeVisible()
  await expect(markdownToolbar).toHaveAttribute('role', 'toolbar')
  await expect(markdownToolbar).toHaveCSS('height', '50px')
  await expect(page.getByTestId('freeform-toolbar')).toBeHidden()
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  await expect(markdownToolbar.locator('.bar-btn').first()).toHaveCSS('height', '32px')
  await expect(markdownToolbar.locator('.sel-trigger').first()).toHaveCSS('height', '32px')
  await expect(markdownToolbar.locator('.toolbar-primary')).toHaveCSS('height', '32px')
  const segmentBox = await markdownToolbar.getByRole('tablist', { name: '平台' }).boundingBox()
  expect(segmentBox).toBeTruthy()
  expect(segmentBox!.height).toBeLessThanOrEqual(32)

  const accentColor = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  const focusableControls = [
    markdownToolbar.locator('.seg-btn').first(),
    markdownToolbar.locator('.sel-trigger').first(),
    markdownToolbar.locator('.bar-btn').first(),
    markdownToolbar.locator('.toolbar-primary'),
  ]
  for (const control of focusableControls) {
    await control.focus()
    await expect(control).toHaveCSS('outline-color', accentColor)
    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
  }

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.getByTestId('markdown-toolbar')).toBeHidden()
  const freeformToolbar = page.getByTestId('freeform-toolbar')
  await expect(freeformToolbar).toBeVisible()
  await expect(freeformToolbar).toHaveAttribute('role', 'toolbar')
  await expect(freeformToolbar).toHaveCSS('height', '50px')
  await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
  await expect(page.locator('.workspace-panel:not([hidden]) .toolbar-primary')).toHaveCount(1)
  await expect(page.getByTestId('insert-text')).toHaveCSS('height', '32px')
  await expect(page.getByTestId('insert-shape')).toHaveCSS('height', '32px')
  await expect(freeformToolbar.locator('.toolbar-primary')).toHaveCSS('height', '32px')
  await expect(page.locator('.freeform-thumb.on')).toHaveAttribute('aria-current', 'page')
})

for (const viewport of [
  { name: 'wide', width: 1440, height: 900, railWidth: 152, inspectorWidth: 248 },
  { name: 'compact', width: 1024, height: 768, railWidth: 136, inspectorWidth: 224 },
]) {
  test(`freeform chrome fits the ${viewport.name} desktop viewport`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openFreeform(page)

    const documentOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(documentOverflow).toBeLessThanOrEqual(0)

    const main = page.locator('.freeform-main')
    const mainOverflow = await main.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(mainOverflow).toBeLessThanOrEqual(0)
    await expect(main).toHaveCSS('overflow-x', 'hidden')
    await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
    await expect(page.locator('.freeform-inspector')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toBeVisible()

    const railBox = await page.locator('.freeform-rail').boundingBox()
    const inspectorBox = await page.locator('.freeform-inspector').boundingBox()
    expect(railBox?.width).toBeCloseTo(viewport.railWidth, 0)
    expect(inspectorBox?.width).toBeCloseTo(viewport.inspectorWidth, 0)
    await expect(page.locator('.freeform-slide-list')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.freeform-stage-scroll')).toHaveCSS('overflow-y', 'auto')
    await expect(page.locator('.freeform-inspector')).toHaveCSS('overflow-y', 'auto')

    const themeBox = await page.getByTestId('theme-toggle').boundingBox()
    expect(themeBox?.width).toBeGreaterThanOrEqual(44)
    expect(themeBox?.height).toBeGreaterThanOrEqual(44)
    for (const name of ['缩小画布', '放大画布']) {
      const zoomBox = await page.getByRole('button', { name }).boundingBox()
      expect(zoomBox?.width).toBeGreaterThanOrEqual(44)
      expect(zoomBox?.height).toBeGreaterThanOrEqual(44)
    }
  })
}

test.describe('fit-relative freeform zoom', () => {
  test('withholds the canvas until the first active fit measurement', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('freeform-canvas')).toHaveCount(0)

    await page.getByTestId('workspace-tab-freeform').click()

    await expect(page.getByTestId('freeform-canvas')).toBeVisible()
    await expect(page.locator('.freeform-stage-scroll')).toHaveAttribute('aria-busy', 'false')
    await expect(page.getByTestId('freeform-primary-export')).toBeEnabled()
  })

  for (const viewport of [
    { name: 'wide', width: 1440, height: 900, padding: 32 },
    { name: 'compact', width: 1024, height: 768, padding: 24 },
  ]) {
    test(`fits common ratios at 100% in the ${viewport.name} stage`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFreeform(page)
      await expect(page.locator('.freeform-stage-pane .zoom-value')).toHaveText('100%')

      for (const ratio of ['1:1', '9:16', '16:9'] as const) {
        await selectFreeformPagePreset(page, ratio)
        const metrics = await expectFreeformCanvasMatchesZoom(page, 100, true)
        expect(metrics.paddingLeft).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingRight).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingTop).toBeCloseTo(viewport.padding, 3)
        expect(metrics.paddingBottom).toBeCloseTo(viewport.padding, 3)
      }
    })

    test(`fits minimum and maximum custom pages in the ${viewport.name} stage`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await openFreeform(page)

      await applyFreeformCustomSize(page, 128, 128)
      await expectFreeformCanvasMatchesZoom(page, 100, true)

      await applyFreeformCustomSize(page, 4096, 4096)
      await expectFreeformCanvasMatchesZoom(page, 100, true)
    })
  }

  test('keeps 50% smaller and makes both vertical edges reachable at 110%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '9:16')
    const fitted = await expectFreeformCanvasMatchesZoom(page, 100, true)

    await setFreeformZoom(page, 50)
    const half = await expectFreeformCanvasMatchesZoom(page, 50, true)
    expect(half.renderedHeight).toBeCloseTo(fitted.renderedHeight / 2, 0)

    await page.locator('.freeform-stage-pane .zoom-value').click()
    await expect(page.locator('.freeform-stage-pane .zoom-value')).toHaveText('100%')
    await setFreeformZoom(page, 110)
    await expect
      .poll(async () => {
        const metrics = await freeformStageMetrics(page)
        return metrics.scrollHeight - metrics.clientHeight
      })
      .toBeGreaterThan(1)

    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => { node.scrollTop = 0 })
    const atTop = await freeformStageMetrics(page)
    expect(atTop.canvasTop).toBeCloseTo(atTop.stageTop + atTop.paddingTop, 0)

    await stage.evaluate((node) => { node.scrollTop = node.scrollHeight })
    await expect.poll(async () => (await freeformStageMetrics(page)).scrollTop).toBeGreaterThan(0)
    const atBottom = await freeformStageMetrics(page)
    expect(atBottom.canvasBottom).toBeCloseTo(atBottom.stageBottom - atBottom.paddingBottom, 0)
  })

  test('makes both horizontal edges reachable at 110%', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await selectFreeformPagePreset(page, '16:9')
    await setFreeformZoom(page, 110)
    await expect
      .poll(async () => {
        const metrics = await freeformStageMetrics(page)
        return metrics.scrollWidth - metrics.clientWidth
      })
      .toBeGreaterThan(1)

    const stage = page.locator('.freeform-stage-scroll')
    await stage.evaluate((node) => { node.scrollLeft = 0 })
    const atLeft = await freeformStageMetrics(page)
    expect(atLeft.canvasLeft).toBeCloseTo(atLeft.stageLeft + atLeft.paddingLeft, 0)

    await stage.evaluate((node) => { node.scrollLeft = node.scrollWidth })
    await expect.poll(async () => (await freeformStageMetrics(page)).scrollLeft).toBeGreaterThan(0)
    const atRight = await freeformStageMetrics(page)
    expect(atRight.canvasRight).toBeCloseTo(atRight.stageRight - atRight.paddingRight, 0)
  })

  test('enforces zoom bounds and resets the middle control to 100%', async ({ page }) => {
    await openFreeform(page)
    const shrink = page.getByRole('button', { name: '缩小画布', exact: true })
    const enlarge = page.getByRole('button', { name: '放大画布', exact: true })
    const value = page.locator('.freeform-stage-pane .zoom-value')

    await setFreeformZoom(page, 10)
    await expect(shrink).toBeDisabled()
    await expect(enlarge).toBeEnabled()

    await setFreeformZoom(page, 400)
    await expect(enlarge).toBeDisabled()
    await expect(shrink).toBeEnabled()

    await value.click()
    await expect(value).toHaveText('100%')
    await expect(shrink).toBeEnabled()
    await expect(enlarge).toBeEnabled()
  })

  test('preserves 150% while the viewport, page ratio, and active workspace change', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openFreeform(page)
    await setFreeformZoom(page, 150)
    const wide = await expectFreeformCanvasMatchesZoom(page, 150, false)

    await page.setViewportSize({ width: 1024, height: 768 })
    const compact = await expectFreeformCanvasMatchesZoom(page, 150, false)
    expect(compact.renderedWidth).not.toBeCloseTo(wide.renderedWidth, 0)
    await expect(page.locator('.freeform-stage-pane .zoom-value')).toHaveText('150%')

    await selectFreeformPagePreset(page, '9:16')
    await expectFreeformCanvasMatchesZoom(page, 150, false)
    await expect(page.locator('.freeform-stage-pane .zoom-value')).toHaveText('150%')

    await page.getByTestId('workspace-tab-markdown').click()
    await page.getByTestId('workspace-tab-freeform').click()
    await expectFreeformCanvasMatchesZoom(page, 150, false)
    await expect(page.locator('.freeform-stage-pane .zoom-value')).toHaveText('150%')
  })

  test('uses the live render scale for dragging and resizing at 150%', async ({ page }) => {
    await openFreeform(page)
    await insertShape(page)
    await setSelectedElementBox(page, 100, 100, 120, 100)
    await setFreeformZoom(page, 150)
    const scale = await freeformCanvasScale(page)

    const element = page.getByTestId('freeform-element')
    const elementBox = await element.boundingBox()
    expect(elementBox).toBeTruthy()
    const dragStart = {
      x: elementBox!.x + elementBox!.width / 2,
      y: elementBox!.y + elementBox!.height / 2,
    }
    await page.mouse.move(dragStart.x, dragStart.y)
    await page.mouse.down()
    await page.mouse.move(dragStart.x + 120 * scale, dragStart.y + 80 * scale)
    await page.mouse.up()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 220, y: 180, width: 120, height: 100 },
    ])

    const resizeHandle = page.locator('.element-resize')
    const handleBox = await resizeHandle.boundingBox()
    expect(handleBox).toBeTruthy()
    const resizeStart = {
      x: handleBox!.x + handleBox!.width / 2,
      y: handleBox!.y + handleBox!.height / 2,
    }
    await page.mouse.move(resizeStart.x, resizeStart.y)
    await page.mouse.down()
    await page.mouse.move(resizeStart.x + 60 * scale, resizeStart.y + 40 * scale)
    await page.mouse.up()
    await expect.poll(() => freeformElementBoxes(page)).toEqual([
      { x: 220, y: 180, width: 180, height: 140 },
    ])
  })
})

test('dark mode keeps freeform chrome controls and popovers legible', async ({ page }) => {
  await openFreeform(page)
  const html = page.locator('html')
  if ((await html.getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(html).toHaveAttribute('data-theme', 'dark')
  await expect(html).not.toHaveClass(/theme-anim/)

  const toolbar = page.getByTestId('freeform-toolbar')
  await expect(toolbar).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(toolbar).not.toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  const undoButton = toolbar.getByRole('button', { name: '撤销', exact: true })
  await expect(undoButton).toBeDisabled()
  const undoOpacity = Number(await undoButton.evaluate((button) => getComputedStyle(button).opacity))
  expect(undoOpacity).toBeGreaterThanOrEqual(0.35)
  expect(undoOpacity).toBeLessThan(1)
  await expect(undoButton).toHaveCSS('cursor', 'not-allowed')

  const deletePageButton = page.getByRole('button', { name: '删除页面', exact: true })
  await expect(deletePageButton).toBeDisabled()
  expect(
    Number(await deletePageButton.evaluate((button) => getComputedStyle(button).opacity)),
  ).toBeLessThan(1)
  await expect(deletePageButton).toHaveCSS('cursor', 'not-allowed')

  const pageNumberColors = await page.locator('.freeform-thumb-number').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-rail')!).backgroundColor,
  }))
  expect(contrastRatio(pageNumberColors.foreground, pageNumberColors.background)).toBeGreaterThanOrEqual(4.5)

  const emptyHintColors = await page.locator('.freeform-inspector .inspector-empty').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
  }))
  expect(contrastRatio(emptyHintColors.foreground, emptyHintColors.background)).toBeGreaterThanOrEqual(4.5)

  await page.getByTestId('page-size-trigger').click()
  const pageSizePopover = page.getByTestId('page-size-popover')
  await expect(pageSizePopover).toBeVisible()
  const pageSizeColors = await pageSizePopover.locator('.page-size-popover-heading strong').evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.page-size-popover')!).backgroundColor,
  }))
  expect(contrastRatio(pageSizeColors.foreground, pageSizeColors.background)).toBeGreaterThanOrEqual(4.5)
  await page.keyboard.press('Escape')

  await page.getByTestId('insert-shape').click()
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })
  const menuColors = await rectangle.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('[role="menu"]')!).backgroundColor,
  }))
  expect(contrastRatio(menuColors.foreground, menuColors.background)).toBeGreaterThanOrEqual(4.5)
  await rectangle.click()

  const inspectorTitle = page.getByTestId('inspector-geometry').locator('.inspector-section-title')
  const inspectorColors = await inspectorTitle.evaluate((element) => ({
    foreground: getComputedStyle(element).color,
    background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
  }))
  expect(contrastRatio(inspectorColors.foreground, inspectorColors.background)).toBeGreaterThanOrEqual(4.5)

  for (const locator of [
    page.locator('.freeform-inspector .field-grid label').first(),
    page.locator('.freeform-inspector .field-grid .color-field').first(),
  ]) {
    const colors = await locator.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element.closest('.freeform-inspector')!).backgroundColor,
    }))
    expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5)
  }

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  const range = shapeFill.getByTestId('paint-gradient-angle')
  await expect(range).toBeVisible()
  await expect(range).toHaveCSS('appearance', 'none')
  await expect(range).toHaveCSS('background-image', /linear-gradient/)
})

test('freeform chrome provides visible pressed feedback', async ({ page }) => {
  await openFreeform(page)
  const trigger = page.getByTestId('insert-shape')
  const box = await trigger.boundingBox()
  expect(box).toBeTruthy()
  const idleTransform = await trigger.evaluate((element) => getComputedStyle(element).transform)

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  const pressedTransform = await trigger.evaluate((element) => getComputedStyle(element).transform)
  expect(pressedTransform).not.toBe(idleTransform)
  await page.mouse.up()
  await page.keyboard.press('Escape')
})

test('reduced motion suppresses theme animation transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(() => document.documentElement.classList.add('theme-anim'))

  const longestTransitionMs = await page.getByTestId('app-header').evaluate((element) => {
    const toMilliseconds = (value: string) =>
      value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000
    return Math.max(
      ...getComputedStyle(element)
        .transitionDuration.split(',')
        .map((value) => toMilliseconds(value.trim())),
    )
  })

  expect(longestTransitionMs).toBeLessThanOrEqual(0.01)
})

test('keeps artwork chrome-free on a warm stage in light and dark themes', async ({ page }) => {
  await openFreeform(page)
  const html = page.locator('html')
  const artboard = page.getByTestId('freeform-canvas')
  const stageBox = page.locator('.freeform-stage-box')
  const stage = page.locator('.freeform-stage-scroll')

  for (const theme of ['light', 'dark'] as const) {
    if ((await html.getAttribute('data-theme')) !== theme) {
      await page.getByTestId('theme-toggle').click()
    }
    await expect(html).toHaveAttribute('data-theme', theme)
    await expect(artboard).toHaveCSS('box-shadow', 'none')
    await expect(stageBox).not.toHaveCSS('box-shadow', 'none')

    const channels = await stage.evaluate((element) => {
      const values = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number)
      if (!values || values.length !== 3) throw new Error('stage background must be an RGB color')
      return values
    })
    expect(channels[0]).toBeGreaterThanOrEqual(channels[1])
    expect(channels[1]).toBeGreaterThanOrEqual(channels[2])
    expect(channels[0] - channels[2]).toBeGreaterThanOrEqual(2)
  }
})

test('freeform visual system uses approved runtime tokens and neutral stage rules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openFreeform(page)

  const tokens = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    return Object.fromEntries(
      [
        '--app-header-height',
        '--workspace-toolbar-height',
        '--control-height',
        '--control-radius',
        '--panel-radius',
      ].map((name) => [name, style.getPropertyValue(name).trim()]),
    )
  })
  expect(tokens).toEqual({
    '--app-header-height': '52px',
    '--workspace-toolbar-height': '50px',
    '--control-height': '32px',
    '--control-radius': '8px',
    '--panel-radius': '10px',
  })

  const mainColumns = await page.locator('.freeform-main').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      columns: style.gridTemplateColumns.split(' '),
      gap: style.columnGap,
      padding: style.padding,
      overflowX: style.overflowX,
    }
  })
  expect(mainColumns.columns.at(0)).toBe('152px')
  expect(mainColumns.columns.at(-1)).toBe('248px')
  expect(mainColumns.gap).toBe('0px')
  expect(mainColumns.padding).toBe('0px')
  expect(mainColumns.overflowX).toBe('hidden')
  await expect(page.locator('.freeform-stage-scroll')).toHaveCSS('background-image', 'none')
  await expect(page.locator('.freeform-thumb.on')).toHaveCSS('border-top-width', '2px')

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.getByTestId('freeform-slide-meta')).toHaveCSS('clip-path', 'inset(50%)')
})

test('workspace tabs support arrow, Home, and End keyboard navigation', async ({ page }) => {
  await page.goto('/')

  const markdownTab = page.getByTestId('workspace-tab-markdown')
  const freeformTab = page.getByTestId('workspace-tab-freeform')
  const markdownPanel = page.getByRole('tabpanel', { name: 'Markdown 卡片' })
  const freeformPanel = page.getByRole('tabpanel', { name: '自由编辑' })

  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')
  await expect(markdownTab).toHaveAttribute('tabindex', '0')
  await expect(freeformTab).toHaveAttribute('tabindex', '-1')

  await markdownTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(freeformTab).toBeFocused()
  await expect(freeformTab).toHaveAttribute('aria-selected', 'true')
  await expect(freeformTab).toHaveAttribute('tabindex', '0')
  await expect(markdownTab).toHaveAttribute('tabindex', '-1')
  await expect(freeformPanel).toBeVisible()

  await page.keyboard.press('Home')
  await expect(markdownTab).toBeFocused()
  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')
  await expect(markdownPanel).toBeVisible()

  await page.keyboard.press('End')
  await expect(freeformTab).toBeFocused()
  await expect(freeformTab).toHaveAttribute('aria-selected', 'true')
  await expect(freeformPanel).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect(markdownTab).toBeFocused()
  await expect(markdownTab).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('ArrowLeft')
  await expect(freeformTab).toBeFocused()
  await expect(freeformTab).toHaveAttribute('aria-selected', 'true')
})

test('workspace tab arrow navigation does not nudge selected freeform elements', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementPosition(page, 240, 180)

  const positionInputs = page.locator('.freeform-inspector .field-grid').first().locator('input')
  const readPosition = async () => ({
    x: Number(await positionInputs.nth(0).inputValue()),
    y: Number(await positionInputs.nth(1).inputValue()),
  })
  const before = await readPosition()

  await page.evaluate(() => {
    document.documentElement.dataset.workspaceTabArrowEvents = '0'
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'ArrowLeft') {
          document.documentElement.dataset.workspaceTabArrowEvents = '1'
        }
      },
      { once: true },
    )
  })

  const freeformTab = page.getByTestId('workspace-tab-freeform')
  await freeformTab.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('workspace-tab-markdown')).toBeFocused()
  await expect(page.locator('html')).toHaveAttribute('data-workspace-tab-arrow-events', '0')

  await freeformTab.click()
  await expect.poll(readPosition).toEqual(before)
})

test('account changes reset workspace draft identity', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()

  const accountSuffix = Date.now()
  await page.getByTestId('workspace-tab-freeform').click()
  await insertText(page)
  await page.getByLabel('文本内容').fill('跨账户草稿内容')

  await page.getByRole('button', { name: '保存草稿' }).click()
  await registerUser(page, `draft-${accountSuffix}-a`)
  await page.getByRole('button', { name: '保存草稿' }).click()

  const slideStatus = page.getByTestId('freeform-slide-meta')
  await expect(slideStatus).toContainText('已保存')
  const userADraftIds = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .flatMap((key) =>
        (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
      ),
  )
  expect(userADraftIds).toHaveLength(1)

  await page.getByTestId('account-logout').click()
  await expect(slideStatus).not.toContainText('已保存')
  await expect(page.getByTestId('freeform-element')).toHaveCount(1)
  await expect(page.getByLabel('文本内容')).toContainText('跨账户草稿内容')

  await page.getByTestId('account-login').click()
  await registerUser(page, `draft-${accountSuffix}-b`)
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(slideStatus).toContainText('已保存')

  const draftStores = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('slicer.drafts.'))
      .map((key) => ({
        key,
        ids: (JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{ id: string }>).map(
          (draft) => draft.id,
        ),
      })),
  )
  expect(draftStores).toHaveLength(2)
  expect(draftStores.every((store) => store.ids.length === 1)).toBe(true)
  const allDraftIds = draftStores.flatMap((store) => store.ids)
  expect(allDraftIds).toContain(userADraftIds[0])
  expect(new Set(allDraftIds).size).toBe(allDraftIds.length)
})

test('switches to the freeform workspace and edits a slide', async ({ page }) => {
  await openFreeform(page)

  await expect(page.getByTestId('freeform-slide-meta')).toContainText('1页')
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1080×1440px')
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('1页')
  await expect(page.getByTestId('freeform-slide-size')).toContainText('1920×1080px')

  await insertText(page)
  await expect(page.getByLabel('文本内容')).toBeVisible()

  await insertShape(page)
  await expect(page.getByTestId('freeform-shape')).toBeVisible()
})

test('inserts shapes and lines through accessible toolbar menus', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const shapeTrigger = page.getByTestId('insert-shape')
  await expect(shapeTrigger).toHaveAttribute('aria-haspopup', 'menu')
  await expect(shapeTrigger).not.toHaveClass(/bar-btn/)
  await shapeTrigger.click()
  await expect(shapeTrigger).toHaveAttribute('aria-expanded', 'true')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  await expect(shapeMenu).toBeVisible()
  await shapeMenu.getByRole('menuitem', { name: '矩形' }).click()
  await expect(shapeTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)

  const lineTrigger = page.getByTestId('insert-line')
  await lineTrigger.click()
  const lineMenu = page.getByRole('menu', { name: '线条' })
  await expect(lineMenu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lineMenu).toBeHidden()
  await expect(lineTrigger).toHaveAttribute('aria-expanded', 'false')
  await expect(lineTrigger).toBeFocused()
})

test('keeps dark insert menu triggers in the accent expanded state', async ({ page }) => {
  await openFreeform(page)
  if ((await page.locator('html').getAttribute('data-theme')) !== 'dark') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const expandedColors = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.borderColor = 'var(--accent)'
    probe.style.backgroundColor = 'var(--accent-weak)'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const colors = {
      border: style.borderColor,
      background: style.backgroundColor,
    }
    probe.remove()
    return colors
  })

  const shapeTrigger = page.getByTestId('insert-shape')
  await shapeTrigger.click()
  await expect(shapeTrigger).toHaveCSS('border-color', expandedColors.border)
  await expect(shapeTrigger).toHaveCSS('background-color', expandedColors.background)
})

test('switches insert menus without returning focus to the previous trigger', async ({ page }) => {
  await openFreeform(page)

  const shapeTrigger = page.getByTestId('insert-shape')
  const lineTrigger = page.getByTestId('insert-line')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const lineMenu = page.getByRole('menu', { name: '线条' })

  await shapeTrigger.click()
  await expect(shapeMenu.getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await lineTrigger.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(shapeMenu).toBeHidden()
  await expect(lineMenu).toBeVisible()
  await expect(lineMenu.getByRole('menuitem', { name: '直线' })).toBeFocused()
})

test('keeps focus on an outside toolbar button when closing an insert menu', async ({ page }) => {
  await openFreeform(page)

  const shapeTrigger = page.getByTestId('insert-shape')
  const textButton = page.getByTestId('insert-text')
  const shapeMenu = page.getByRole('menu', { name: '形状' })

  await shapeTrigger.click()
  await expect(shapeMenu).toBeVisible()
  await textButton.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(shapeMenu).toBeHidden()
  await expect(textButton).toBeFocused()
  await expect(page.getByTestId('freeform-textbox')).toHaveCount(1)
})

test('keeps focus on an outside toolbar button when closing the page size popover', async ({ page }) => {
  await openFreeform(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const textButton = page.getByTestId('insert-text')

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await textButton.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(pageSizePopover).toBeHidden()
  await expect(textButton).toBeFocused()
  await expect(page.getByTestId('freeform-textbox')).toHaveCount(1)
})

test('hands focus from the page size popover to an insert menu', async ({ page }) => {
  await openFreeform(page)

  const undo = page.getByRole('button', { name: '撤销' })
  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const shapeTrigger = page.getByTestId('insert-shape')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })

  await expect(undo).toBeDisabled()
  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()
  await shapeTrigger.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(pageSizePopover).toBeHidden()
  await expect(shapeMenu).toBeVisible()
  await expect(rectangle).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('hands focus from an insert menu to the page size popover', async ({ page }) => {
  await openFreeform(page)

  const undo = page.getByRole('button', { name: '撤销' })
  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const selectedPreset = pageSizePopover.getByRole('button', { name: '3:4', exact: true })
  const shapeTrigger = page.getByTestId('insert-shape')
  const shapeMenu = page.getByRole('menu', { name: '形状' })

  await expect(undo).toBeDisabled()
  await shapeTrigger.click()
  await expect(shapeMenu).toBeVisible()
  await pageSizeTrigger.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  await expect(shapeMenu).toBeHidden()
  await expect(pageSizePopover).toBeVisible()
  await expect(selectedPreset).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('closes an insert menu when tabbing to another toolbar trigger', async ({ page }) => {
  await openFreeform(page)

  const shapeTrigger = page.getByTestId('insert-shape')
  const lineTrigger = page.getByTestId('insert-line')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const lineMenu = page.getByRole('menu', { name: '线条' })

  await shapeTrigger.click()
  await expect(shapeMenu.getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await page.keyboard.press('Tab')

  await expect(lineTrigger).toBeFocused()
  await expect(shapeMenu).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(lineMenu).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(1)
})

test('closes the page size popover before keyboard-opening an insert menu', async ({ page }) => {
  await openFreeform(page)

  const pageSizeTrigger = page.getByTestId('page-size-trigger')
  const pageSizePopover = page.getByTestId('page-size-popover')
  const shapeTrigger = page.getByTestId('insert-shape')
  const shapeMenu = page.getByRole('menu', { name: '形状' })

  await pageSizeTrigger.click()
  await expect(pageSizePopover).toBeVisible()

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await shapeTrigger.evaluate((element) => element === document.activeElement)) break
    await page.keyboard.press('Tab')
  }

  await expect(shapeTrigger).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(pageSizePopover).toBeHidden()
  await expect(shapeMenu).toBeVisible()
  await expect(shapeMenu.getByRole('menuitem', { name: '矩形' })).toBeFocused()
  await expect(page.getByRole('menu')).toHaveCount(1)

  await page.keyboard.press('Escape')
  await expect(shapeMenu).toBeHidden()
  await expect(shapeTrigger).toBeFocused()
})

test('keeps the page size popover open when clicking non-focusable content inside it', async ({ page }) => {
  await openFreeform(page)

  const pageSizePopover = page.getByTestId('page-size-popover')
  await page.getByTestId('page-size-trigger').click()
  await expect(pageSizePopover).toBeVisible()
  await expect(pageSizePopover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()

  await pageSizePopover.locator('.page-size-popover-heading').click()

  await expect(pageSizePopover).toBeVisible()
})

test('supports cyclic keyboard selection in insert menus', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const shapeTrigger = page.getByTestId('insert-shape')
  await shapeTrigger.click()
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const rectangle = shapeMenu.getByRole('menuitem', { name: '矩形' })
  const ellipse = shapeMenu.getByRole('menuitem', { name: '圆形' })
  const triangle = shapeMenu.getByRole('menuitem', { name: '三角形' })

  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(triangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rectangle).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(ellipse).toBeFocused()
  await page.keyboard.press('Space')

  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(1)
  await expect(shapeTrigger).toBeFocused()

  await shapeTrigger.click()
  await expect(rectangle).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-shape')).toHaveCount(2)
  await expect(shapeTrigger).toBeFocused()
})

test('closes insert menus without recording history', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const undo = page.getByRole('button', { name: '撤销' })
  const shapeTrigger = page.getByTestId('insert-shape')
  const lineTrigger = page.getByTestId('insert-line')
  const shapeMenu = page.getByRole('menu', { name: '形状' })
  const lineMenu = page.getByRole('menu', { name: '线条' })

  await expect(undo).toBeDisabled()
  await shapeTrigger.click()
  await page.keyboard.press('Escape')
  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await lineTrigger.click()
  await page.getByTestId('freeform-canvas').click({ position: { x: 8, y: 8 } })
  await expect(lineMenu).toBeHidden()
  await expect(lineTrigger).toBeFocused()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()

  await shapeTrigger.click()
  await expect(shapeMenu).toBeVisible()
  const markdownTab = page.getByTestId('workspace-tab-markdown')
  await markdownTab.click()
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
  await expect(markdownTab).toBeFocused()
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(shapeMenu).toBeHidden()
  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
  await expect(undo).toBeDisabled()
})

test('freeform inspector exposes styled paint controls instead of visible native color inputs', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await expect(page.getByTestId('freeform-paint-field').first()).toBeVisible()
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await expect(page.getByTestId('paint-color-button').first()).toBeVisible()
})

test('opens a custom color popover beside the inspector instead of the browser color picker', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const inspector = page.locator('.freeform-inspector')
  await page.getByTestId('page-background-paint').getByTestId('paint-color-button').click()

  const popover = page.getByTestId('paint-popover')
  await expect(popover).toBeVisible()
  await expect(page.getByTestId('page-background-paint').locator('input[type="color"]')).toHaveCount(0)

  const inspectorBox = await inspector.boundingBox()
  const popoverBox = await popover.boundingBox()
  expect(inspectorBox).toBeTruthy()
  expect(popoverBox).toBeTruthy()
  expect(popoverBox!.x).toBeGreaterThanOrEqual(inspectorBox!.x)
  expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(inspectorBox!.x + inspectorBox!.width)
})

test('uses styled range sliders in the freeform paint controls', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  const range = page.getByTestId('paint-gradient-angle').first()

  await expect(range).toHaveCSS('appearance', 'none')
  await expect(range).toHaveCSS('background-image', /linear-gradient/)
})

test('uses styled scrollbars in the freeform workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  for (const selector of ['.freeform-stage-scroll', '.freeform-rail', '.freeform-inspector']) {
    const scroller = page.locator(selector)
    await expect(scroller).toHaveCSS('scrollbar-width', 'thin')
    await expect(scroller).not.toHaveCSS('scrollbar-color', 'auto')
  }
})

test('uses custom color popovers for shape and line stroke colors', async ({ page }) => {
  await openFreeform(page)
  const inspector = page.locator('.freeform-inspector')
  const expectPopoverInsideInspector = async () => {
    const inspectorBox = await inspector.boundingBox()
    const popoverBox = await page.getByTestId('paint-popover').boundingBox()
    expect(inspectorBox).toBeTruthy()
    expect(popoverBox).toBeTruthy()
    expect(popoverBox!.x).toBeGreaterThanOrEqual(inspectorBox!.x)
    expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(
      inspectorBox!.x + inspectorBox!.width,
    )
  }

  await insertShape(page)
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await page.getByTestId('shape-stroke-color').getByTestId('paint-color-button').click()
  await expect(page.getByTestId('paint-popover')).toBeVisible()
  await expectPopoverInsideInspector()
  await page.keyboard.press('Escape')

  await insertLine(page, '直线')
  await expect(page.locator('.freeform-inspector input[type="color"]:visible')).toHaveCount(0)
  await page.getByTestId('line-stroke-color').getByTestId('paint-color-button').click()
  await expect(page.getByTestId('paint-popover')).toBeVisible()
  await expectPopoverInsideInspector()
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

async function installDisabledFieldsetFocusTargets(page: import('@playwright/test').Page) {
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

    const fieldset = document.createElement('fieldset')
    fieldset.disabled = true
    const legend = document.createElement('legend')
    legend.textContent = 'Disabled fieldset legend '
    const legendInput = document.createElement('input')
    legendInput.dataset.testid = 'disabled-fieldset-legend-input'
    legend.append(legendInput)

    const link = document.createElement('a')
    link.href = '#disabled-fieldset-link'
    link.dataset.testid = 'disabled-fieldset-link'
    link.textContent = 'Enabled fieldset link'

    const disabledInput = document.createElement('input')
    disabledInput.dataset.testid = 'disabled-fieldset-input'
    fieldset.append(legend, link, disabledInput)
    host.append(fieldset)
    document.body.append(host)
  })
}

async function clickLocatorCenter(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
) {
  const box = await target.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

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
  await page.keyboard.press('End')
  await expectActiveOption(6)
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
  await page.keyboard.press('End')
  await page.keyboard.press('Space')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(trigger).toContainText('系统默认')
})

test('font listbox keeps option identity across dynamic options and guards the empty state', async ({ page }) => {
  await page.goto('/')
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
  await page.goto('/')
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

  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await insertText(page)
  await page.getByTestId('freeform-element').first().click()
  await page.getByTestId('freeform-font-select').click()
  await page.locator('[role="option"]').nth(2).click()

  await expect.poll(() => fontFetches.length, { timeout: 5_000 }).toBeGreaterThan(0)
  expect(stylesheetRefetches).toHaveLength(0)
})

test('applies page, shape, and text gradients from the inspector', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-canvas')).toHaveCSS('background-image', /linear-gradient/)

  await insertShape(page)
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('shape-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-shape').last()).toHaveCSS('background-image', /linear-gradient/)

  await insertText(page)
  await page.getByTestId('freeform-element').last().click()
  await page.getByTestId('text-fill-paint').getByTestId('paint-mode-linear-gradient').click()
  await expect(page.getByTestId('freeform-textbox').last()).toHaveCSS('background-image', /linear-gradient/)
})

test('edits Chinese text in the freeform contenteditable textbox without losing text', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox').last()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.fill('中文渐变测试')

  await expect(textbox).toContainText('中文渐变测试')
})

test('pastes plain text into the freeform contenteditable textbox', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  const textbox = page.getByTestId('freeform-textbox').last()
  await textbox.evaluate((node) => {
    const data = new DataTransfer()
    data.setData('text/html', '<b>bold</b>')
    data.setData('text/plain', 'plain text')
    node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  })

  await expect(textbox).toContainText('plain text')
  await expect(textbox.locator('b')).toHaveCount(0)
})

test('compact saved freeform toolbar keeps controls from overlapping', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()

  await page.getByRole('button', { name: '保存草稿' }).click()
  await registerUser(page, `c${Date.now().toString(36).slice(-6)}`)
  await page.getByRole('button', { name: '保存草稿' }).click()

  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  await expect(page.getByRole('button', { name: /^草稿(?: · \d+)?$/ })).toHaveText('草稿 · 1')
  await expect(page.getByTestId('freeform-primary-export')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存草稿', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '草稿 · 1', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打包导出', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出当前页', exact: true })).toBeVisible()
  await expectVisibleFreeformToolbarButtonsToFit(page)
})

function extractCssSelectors(css: string) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectors: string[] = []
  let prelude = ''
  let quote: '"' | "'" | null = null

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const previous = source[index - 1]
    if (quote) {
      prelude += character
      if (character === quote && previous !== '\\') quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      prelude += character
      continue
    }
    if (character === '{') {
      const trimmed = prelude.trim()
      if (trimmed && !trimmed.startsWith('@')) {
        selectors.push(...trimmed.split(',').map((selector) => selector.trim()))
      }
      prelude = ''
      continue
    }
    if (character === '}') {
      prelude = ''
      continue
    }
    prelude += character
  }

  return selectors
}

function findUnscopedWorkspaceChromeSelectors(css: string) {
  const chromeMarkers = [
    '.page-size-',
    '.freeform-insert-',
    '.freeform-add-page',
    '.freeform-thumb-caption',
    '.freeform-thumb-number',
    '.freeform-stage-head',
    '.freeform-stage-box',
    '.toolbar-collapsible-label',
  ]
  return extractCssSelectors(css)
    .filter((selector) => chromeMarkers.some((marker) => selector.includes(marker)))
    .filter((selector) => {
      const withoutThemePrefix = selector.replace(/^\[data-theme=['"]dark['"]\]\s+/, '')
      return !/^(?:\.app-header|\.workspace-toolbar|\.freeform-toolbar|\.freeform-rail|\.freeform-stage-pane|\.freeform-inspector)(?:\s|$)/.test(withoutThemePrefix)
    })
}

test('workspace chrome selectors stay scoped to workspace toolbar', async () => {
  expect(findUnscopedWorkspaceChromeSelectors(`
    @media (max-width: 1100px) {
      .page-size-trigger { color: red; }
      .freeform-insert-trigger { color: red; }
      .freeform-add-page { color: red; }
      .freeform-stage-head .zoom-btn { color: red; }
      .toolbar-collapsible-label { color: red; }
    }
    .page-size-trigger .workspace-toolbar { color: red; }
    .freeform-insert-menu .freeform-toolbar { color: red; }
    .workspace-toolbar .page-size-trigger { content: ".page-size-declaration"; }
    .freeform-toolbar .freeform-insert-trigger { content: ".freeform-insert-declaration"; }
    .freeform-rail .freeform-add-page { color: green; }
    .freeform-stage-pane .freeform-stage-head { color: green; }
    .workspace-toolbar .toolbar-collapsible-label { color: green; }
  `)).toEqual([
    '.page-size-trigger',
    '.freeform-insert-trigger',
    '.freeform-add-page',
    '.freeform-stage-head .zoom-btn',
    '.toolbar-collapsible-label',
    '.page-size-trigger .workspace-toolbar',
    '.freeform-insert-menu .freeform-toolbar',
  ])

  const css = await readFile('src/styles.css', 'utf8')
  const unscoped = findUnscopedWorkspaceChromeSelectors(css)

  expect(unscoped, `裸 workspace chrome 选择器：${unscoped.join(' | ')}`).toEqual([])
})

test('edits preset and custom page sizes from the toolbar popover', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/')
  if ((await page.locator('html').getAttribute('data-theme')) !== 'light') {
    await page.getByTestId('theme-toggle').click()
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('workspace-tab-freeform').click()

  const trigger = page.getByTestId('page-size-trigger')
  const popover = page.getByTestId('page-size-popover')
  const slideSize = page.getByTestId('freeform-slide-size')
  const widthInput = page.getByLabel('宽度 px')
  const heightInput = page.getByLabel('高度 px')
  const applyButton = page.getByRole('button', { name: '应用尺寸' })
  const readAccentColor = () =>
    page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.color = 'var(--accent)'
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    })

  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveCSS('border-color', await readAccentColor())
  await expect(popover.getByRole('button', { name: '3:4', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()

  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await insertShape(page)
  const selectedElement = page.getByTestId('freeform-element').last()
  await expect(selectedElement).toHaveAttribute('data-selected', 'true')

  await trigger.click()
  await expect(popover).toBeVisible()
  await expect(trigger).toHaveCSS('border-color', await readAccentColor())
  await expect(trigger).toContainText('3:4 · 1080×1440px')

  await popover.getByRole('button', { name: '9:16', exact: true }).click()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(popover).toBeHidden()

  await trigger.click()
  await expect(widthInput).toHaveValue('1080')
  await expect(heightInput).toHaveValue('1920')

  await widthInput.fill('100')
  await heightInput.fill('200')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('128.5')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('4097')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await widthInput.fill('')
  await applyButton.click()
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('alert')).toContainText('128')
  await expect(slideSize).toContainText('1080×1920px')

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(selectedElement).toHaveAttribute('data-selected', 'true')

  await trigger.click()
  const markdownTab = page.getByTestId('workspace-tab-markdown')
  await markdownTab.click()
  await expect(popover).toBeHidden()
  await expect(markdownTab).toBeFocused()

  await page.getByTestId('workspace-tab-freeform').click()
  await expect(popover).toBeHidden()
  await trigger.click()
  await expect(popover).toBeVisible()
  await widthInput.fill('1200')
  await heightInput.fill('1600')
  await page.locator('.freeform-stage-head').click()
  await expect(popover).toBeHidden()
  await expect(slideSize).toContainText('1080×1920px')
  await expect(trigger).toBeFocused()

  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(slideSize).toContainText('3:4 · 1080×1440px')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(slideSize).toContainText('9:16 · 1080×1920px')
})

test('reapplying the current page size preserves history and saved state', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()

  const toolbar = page.getByTestId('freeform-toolbar')
  const slideMeta = page.getByTestId('freeform-slide-meta')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await registerUser(page, `same-size-${Date.now()}`)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(slideMeta).toContainText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('page-size-trigger').click()
  await page.getByTestId('page-size-popover').getByRole('button', { name: '3:4', exact: true }).click()

  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(slideMeta).toContainText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)

  await page.getByTestId('page-size-trigger').click()
  await page.getByLabel('宽度 px').fill('1080')
  await page.getByLabel('高度 px').fill('1440')
  await page.getByRole('button', { name: '应用尺寸', exact: true }).click()

  await expect(page.getByTestId('page-size-popover')).toBeHidden()
  await expect(slideMeta).toContainText('已保存')
  await expect(toolbar.locator('button:disabled')).toHaveCount(2)
})

test('sets custom page size and new pages inherit it', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()

  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1080×1920px/)

  await trigger.click()
  await page.getByLabel('宽度 px').fill('1200')
  await page.getByLabel('高度 px').fill('1600')
  await page.getByRole('button', { name: '应用尺寸' }).click()
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/自定义 · 1200×1600px/)

  await page.getByRole('button', { name: '新增页面' }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('2页')
  await expect(page.getByTestId('freeform-slide-size')).toHaveText(/1200×1600px/)
})

test('fills a shape with an image', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '插入图片填充' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles('public/favicon.svg')

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
})

test('persists image element and shape fill through ImageStore', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()

  await insertImageElementAndShapeFill(page)
  await expectFreeformImagesDecoded(page)

  const sessionImageKeys = await page.evaluate(() => {
    const raw = sessionStorage.getItem('slicer.images.v1')
    return Object.keys(raw ? JSON.parse(raw) as Record<string, string> : {})
  })
  expect(sessionImageKeys).toHaveLength(2)

  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await registerUser(page, `image-store-${Date.now()}`)
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

  const persistedDrafts = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    return key ? localStorage.getItem(key) ?? '' : ''
  })
  expect(persistedDrafts).toContain('data:image/png;base64,')
  expect(persistedDrafts).not.toContain('img:')

  await page.evaluate(() => sessionStorage.removeItem('slicer.images.v1'))
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Page 1' }).click()

  await expectFreeformImagesDecoded(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页', exact: true }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  expect(readPngSize(await readFile(downloadPath!))).toEqual({ width: 1080, height: 1440 })
})

test('exports the current slide as a PNG at slide dimensions', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByTestId('page-size-trigger').click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toBe('slide-01.png')
  const path = await download.path()
  expect(path).toBeTruthy()
  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1920 })
  await expect(page.getByRole('button', { name: '导出当前页' })).toBeEnabled()
})

test('exports current freeform slide with gradient pixels and without editor ui', async ({ page }) => {
  await openFreeform(page)

  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await expect(page.getByTestId('freeform-element')).toHaveAttribute('data-selected', 'true')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出当前页' }).click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()

  const size = readPngSize(await readFile(path!))
  expect(size).toEqual({ width: 1080, height: 1440 })

  const topLeft = await samplePngPixel(page, path!, 10, 10)
  const bottomRight = await samplePngPixel(page, path!, 1000, 1300)
  expect(topLeft.slice(0, 3)).not.toEqual(bottomRight.slice(0, 3))

  const accentRgb = await page.evaluate(() => {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    const match = accent.match(/^#([0-9a-f]{6})$/i)
    if (!match) throw new Error(`unexpected accent color: ${accent}`)
    return [
      Number.parseInt(match[1].slice(0, 2), 16),
      Number.parseInt(match[1].slice(2, 4), 16),
      Number.parseInt(match[1].slice(4, 6), 16),
    ]
  })
  const resizeHandleProbe = await samplePngPixel(page, path!, 203, 203)
  expect(rgbDistance(resizeHandleProbe, accentRgb)).toBeGreaterThan(30)
})

test('exports identical artwork pixels across app themes and preview zooms', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.setItem('slicer.mode.v1', 'light'))
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByTestId('page-background-paint').getByTestId('paint-mode-linear-gradient').click()
  await insertText(page)
  await setSelectedElementBox(page, 80, 80, 320, 120)
  await page.locator('.freeform-inspector-text').fill('Theme isolation 主题')
  await insertShape(page)
  await setSelectedElementBox(page, 430, 240, 220, 180)
  await insertLine(page, '直线')
  await setSelectedElementBox(page, 180, 600, 480, 80)
  await expect(page.getByTestId('freeform-element')).toHaveCount(3)

  async function downloadCurrent() {
    const exportButton = page.getByTestId('freeform-primary-export')
    await expect(exportButton).toBeEnabled()
    const downloadPromise = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloadPromise
    const path = await download.path()
    if (!path) throw new Error('missing downloaded PNG path')
    await expect(exportButton).toBeEnabled()
    return path
  }

  await setFreeformZoom(page, 50)
  const lightPath = await downloadCurrent()
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).not.toHaveClass(/theme-anim/)
  await setFreeformZoom(page, 400)
  const darkPath = await downloadCurrent()

  expect(readPngSize(await readFile(lightPath))).toEqual(readPngSize(await readFile(darkPath)))
  expect(await pngPixelDigest(page, lightPath)).toBe(await pngPixelDigest(page, darkPath))
  for (const [x, y] of [[10, 10], [540, 720], [1000, 1300]]) {
    expect(await samplePngPixel(page, lightPath, x, y)).toEqual(
      await samplePngPixel(page, darkPath, x, y),
    )
  }
})

test('renders nested v3 scene with inherited visibility lock and root selection', async ({ page }) => {
  await openNestedV3Draft(page, `nested-v3-${Date.now()}`)

  const leaves = page.locator('[data-scene-leaf="true"]')
  await expect(leaves).toHaveCount(7)
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)

  const logicalBoxes = await leaves.evaluateAll((nodes) => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="freeform-canvas"]')
    if (!canvas) throw new Error('canvas missing')
    const canvasRect = canvas.getBoundingClientRect()
    const scale = canvasRect.width / 800
    return Object.fromEntries(nodes.map((node) => {
      const element = node as HTMLElement
      const rect = element.getBoundingClientRect()
      return [element.dataset.sceneNodeId, {
        x: (rect.left - canvasRect.left) / scale,
        y: (rect.top - canvasRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      }]
    }))
  }) as Record<string, { x: number; y: number; width: number; height: number }>
  const expectedBoxes = {
    underlay: { x: 40, y: 40, width: 460, height: 320 },
    'visible-leaf': { x: 200, y: 125, width: 100, height: 50 },
    'scope-text': { x: 200, y: 200, width: 125, height: 50 },
    'locked-text': { x: 350, y: 225, width: 125, height: 50 },
    'scaled-root': { x: 495, y: 380, width: 150, height: 120 },
  }
  for (const [id, expectedBox] of Object.entries(expectedBoxes)) {
    expect(logicalBoxes[id], id).toBeDefined()
    expect(logicalBoxes[id].x, `${id} x`).toBeCloseTo(expectedBox.x, 1)
    expect(logicalBoxes[id].y, `${id} y`).toBeCloseTo(expectedBox.y, 1)
    expect(logicalBoxes[id].width, `${id} width`).toBeCloseTo(expectedBox.width, 1)
    expect(logicalBoxes[id].height, `${id} height`).toBeCloseTo(expectedBox.height, 1)
  }

  const lockedText = page.locator('[data-scene-node-id="locked-text"] [role="textbox"]')
  await expect(lockedText).toHaveAttribute('contenteditable', 'false')
  await expect(lockedText).toHaveAttribute('aria-readonly', 'true')
  const scopeText = page.locator('[data-scene-node-id="scope-text"] [role="textbox"]')
  await expect(scopeText).toHaveAttribute('contenteditable', 'false')
  await expect(scopeText).toHaveAttribute('aria-readonly', 'true')

  const rootOrder = async () => page.locator(
    '.freeform-artwork-clip > [data-scene-root-node="true"]',
  ).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.sceneNodeId))
  const beforeOrder = await rootOrder()
  expect(beforeOrder).toEqual([
    'underlay',
    'outer',
    'scaled-root',
    'locked-root-leaf',
    'locked-root-group',
  ])

  await page.locator('[data-scene-node-id="visible-leaf"]').click()
  await expect(page.locator('[data-scene-node-id="outer"]')).toHaveAttribute('data-selected', 'true')
  await expect(page.locator('[data-scene-node-id="visible-leaf"]')).toHaveAttribute(
    'data-selected',
    'false',
  )
  expect(await rootOrder()).toEqual(beforeOrder)

  const scaledRoot = page.locator('[data-scene-node-id="scaled-root"]')
  await scaledRoot.click()
  const selectionBox = page.getByTestId('freeform-selection-box')
  await expect(selectionBox).toHaveAttribute('data-element-id', 'scaled-root')

  const beforeArtwork = await scaledRoot.boundingBox()
  const beforeOverlay = await selectionBox.boundingBox()
  expect(beforeArtwork).toBeTruthy()
  expect(beforeOverlay).toBeTruthy()
  const expectBoxesToMatch = (
    actual: NonNullable<typeof beforeArtwork>,
    expected: NonNullable<typeof beforeArtwork>,
    label: string,
  ) => {
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect.soft(
        Math.abs(actual[key] - expected[key]),
        `${label} ${key}`,
      ).toBeLessThanOrEqual(1)
    }
  }
  expectBoxesToMatch(beforeOverlay!, beforeArtwork!, 'initial selection overlay')

  const moveHandle = page.getByTestId('freeform-selection-move')
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  for (const [label, handle] of [
    ['move', moveHandle],
    ['resize', resizeHandle],
  ] as const) {
    const box = await handle.boundingBox()
    expect(box, `${label} handle missing`).toBeTruthy()
    expect(box!.width, `${label} handle width`).toBeGreaterThanOrEqual(28)
    expect(box!.height, `${label} handle height`).toBeGreaterThanOrEqual(28)
    expect(
      await locatorOwnsPoint(handle, box!.x + box!.width / 2, box!.y + box!.height / 2),
      `${label} handle center hit target`,
    ).toBe(true)
  }

  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  expect(Number.isInteger(historyBefore)).toBe(true)
  const interactionScale = await freeformCanvasScale(page)
  const initialLogicalGeometry = await scaledRoot.evaluate((node) => {
    const element = node as HTMLElement
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }
  })
  const resizeStartBox = await resizeHandle.boundingBox()
  expect(resizeStartBox).toBeTruthy()
  const resizeStart = {
    x: resizeStartBox!.x + resizeStartBox!.width / 2,
    y: resizeStartBox!.y + resizeStartBox!.height / 2,
  }
  await page.mouse.move(resizeStart.x, resizeStart.y)
  await page.mouse.down()
  await page.mouse.move(resizeStart.x + 60, resizeStart.y + 45)
  await page.mouse.up()

  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  const resizedArtwork = await scaledRoot.boundingBox()
  const resizedOverlay = await selectionBox.boundingBox()
  const resizedHandle = await resizeHandle.boundingBox()
  const resizedLogicalGeometry = await scaledRoot.evaluate((node) => {
    const element = node as HTMLElement
    return {
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
      width: Number.parseFloat(element.style.width),
      height: Number.parseFloat(element.style.height),
    }
  })
  expect(resizedArtwork).toBeTruthy()
  expect(resizedOverlay).toBeTruthy()
  expect(resizedHandle).toBeTruthy()
  expect(resizedArtwork!.width).toBeGreaterThan(beforeArtwork!.width)
  expect(resizedArtwork!.height).toBeGreaterThan(beforeArtwork!.height)
  const expectedWidth = initialLogicalGeometry.width + 60 / interactionScale / 1.5
  const expectedHeight = initialLogicalGeometry.height + 45 / interactionScale / 1.5
  expect(resizedLogicalGeometry.width).toBeCloseTo(expectedWidth, 3)
  expect(resizedLogicalGeometry.height).toBeCloseTo(expectedHeight, 3)
  expect(resizedLogicalGeometry.x).toBeCloseTo(
    initialLogicalGeometry.x + (expectedWidth - initialLogicalGeometry.width) / 4,
    3,
  )
  expect(resizedLogicalGeometry.y).toBeCloseTo(
    initialLogicalGeometry.y + (expectedHeight - initialLogicalGeometry.height) / 4,
    3,
  )
  expect.soft(Math.abs(resizedArtwork!.x - beforeArtwork!.x), 'resize visual left').toBeLessThanOrEqual(1)
  expect.soft(Math.abs(resizedArtwork!.y - beforeArtwork!.y), 'resize visual top').toBeLessThanOrEqual(1)
  expectBoxesToMatch(resizedOverlay!, resizedArtwork!, 'resized selection overlay')
  expect.soft(
    Math.abs(
      resizedHandle!.x + resizedHandle!.width / 2 - (resizedArtwork!.x + resizedArtwork!.width),
    ),
    'resize handle follows visual right',
  ).toBeLessThanOrEqual(1)
  expect.soft(
    Math.abs(
      resizedHandle!.y + resizedHandle!.height / 2 - (resizedArtwork!.y + resizedArtwork!.height),
    ),
    'resize handle follows visual bottom',
  ).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await expect.poll(async () => {
    const restored = await scaledRoot.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => (
        Math.abs(restored[key] - beforeArtwork![key])
      )),
    )
  }).toBeLessThanOrEqual(1)

  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const canvasScale = await freeformCanvasScale(page)
  await page.mouse.move(
    canvasBox!.x + 490 * canvasScale,
    canvasBox!.y + 370 * canvasScale,
  )
  await page.mouse.down()
  await page.mouse.move(
    canvasBox!.x + 510 * canvasScale,
    canvasBox!.y + 390 * canvasScale,
  )
  await page.mouse.up()
  await expect(scaledRoot).toHaveAttribute('data-selected', 'true')

  const moveHistoryBefore = Number(await workspace.getAttribute('data-history-depth'))
  const moveStartBox = await moveHandle.boundingBox()
  expect(moveStartBox).toBeTruthy()
  const moveStart = {
    x: moveStartBox!.x + moveStartBox!.width / 2,
    y: moveStartBox!.y + moveStartBox!.height / 2,
  }
  await page.mouse.move(moveStart.x, moveStart.y)
  await page.mouse.down()
  await page.mouse.move(moveStart.x + 300, moveStart.y + 160)
  await page.mouse.up()

  await expect(workspace).toHaveAttribute('data-history-depth', String(moveHistoryBefore + 1))
  const movedArtwork = await scaledRoot.boundingBox()
  expect(movedArtwork).toBeTruthy()
  expect(Math.abs(movedArtwork!.x + movedArtwork!.width - canvasBox!.x - canvasBox!.width))
    .toBeLessThanOrEqual(1)
  expect(Math.abs(movedArtwork!.y + movedArtwork!.height - canvasBox!.y - canvasBox!.height))
    .toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '\u64a4\u9500', exact: true }).click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(moveHistoryBefore))
  await expect.poll(async () => {
    const restored = await scaledRoot.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => (
        Math.abs(restored[key] - beforeArtwork![key])
      )),
    )
  }).toBeLessThanOrEqual(1)
})

test('locked canvas hits preserve an existing selection', async ({ page }) => {
  await openNestedV3Draft(page, `locked-hit-${Date.now()}`)

  const selectedSceneNodeIds = () => page.locator(
    '[data-scene-node-id][data-selected="true"]',
  ).evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.sceneNodeId))
  const unlocked = page.locator('[data-scene-node-id="scaled-root"]')
  const lockedRootLeaf = page.locator('[data-scene-node-id="locked-root-leaf"]')
  const lockedRootDescendant = page.locator('[data-scene-node-id="locked-root-group-leaf"]')
  const effectiveLockedDescendant = page.locator('[data-scene-node-id="locked-text"]')

  const expectLockedHitToKeepSelection = async (
    hit: import('@playwright/test').Locator,
    modifiers?: ('Shift')[],
  ) => {
    await unlocked.click()
    await expect(unlocked).toHaveAttribute('data-selected', 'true')
    await hit.click(modifiers ? { modifiers } : undefined)
    expect.soft(await selectedSceneNodeIds()).toEqual(['scaled-root'])
  }

  await expectLockedHitToKeepSelection(lockedRootLeaf)
  await expectLockedHitToKeepSelection(lockedRootDescendant)
  await expectLockedHitToKeepSelection(lockedRootDescendant, ['Shift'])
  await expectLockedHitToKeepSelection(effectiveLockedDescendant)
})

test('live move ignores ArrowRight before pointerup and commits one history entry', async ({ page }) => {
  await openNestedV3Draft(page, `live-move-up-${Date.now()}`)

  const workspace = page.locator('.freeform-workspace')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')
  const element = page.locator('[data-scene-node-id="scaled-root"]')
  await element.click()
  const before = await element.boundingBox()
  expect(before).toBeTruthy()
  const handle = page.getByTestId('freeform-selection-move')
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 71,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 71,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect.poll(async () => (await element.boundingBox())?.x).not.toBeCloseTo(before!.x, 1)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 71,
      pointerType: 'touch',
    }))
  })

  await expect.soft(workspace).toHaveAttribute('data-history-depth', '1')
  const undo = page.getByRole('button', { name: '\u64a4\u9500', exact: true })
  await undo.click()
  await expect.poll(async () => {
    const restored = await element.boundingBox()
    if (!restored) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => Math.abs(restored[key] - before![key])),
    )
  }).toBeLessThanOrEqual(1)
  await expect.soft(undo).toBeDisabled()
})

test('live move ignores ArrowRight before pointercancel and restores complete history', async ({ page }) => {
  await openNestedV3Draft(page, `live-move-cancel-${Date.now()}`)

  const workspace = page.locator('.freeform-workspace')
  await expect(workspace).toHaveAttribute('data-history-depth', '0')
  const element = page.locator('[data-scene-node-id="scaled-root"]')
  await element.click()
  const before = await element.boundingBox()
  expect(before).toBeTruthy()
  const handle = page.getByTestId('freeform-selection-move')
  const handleBox = await handle.boundingBox()
  expect(handleBox).toBeTruthy()
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 72,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 72,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect.poll(async () => (await element.boundingBox())?.x).not.toBeCloseTo(before!.x, 1)

  await page.keyboard.press('ArrowRight')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 72,
      pointerType: 'touch',
    }))
  })

  const geometryDistanceFromStart = async () => {
    const current = await element.boundingBox()
    if (!current) return Number.POSITIVE_INFINITY
    return Math.max(
      ...(['x', 'y', 'width', 'height'] as const).map((key) => Math.abs(current[key] - before![key])),
    )
  }
  await expect.poll(geometryDistanceFromStart).toBeLessThanOrEqual(1)
  await expect.soft(workspace).toHaveAttribute('data-history-depth', '0')
  const undo = page.getByRole('button', { name: '\u64a4\u9500', exact: true })
  await expect.soft(undo).toBeDisabled()
  if (await undo.isEnabled()) {
    await undo.click()
    await expect.poll(geometryDistanceFromStart).toBeLessThanOrEqual(1)
  }
})

test('saves and restores a freeform draft', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await insertText(page)
  await page.getByLabel('文本内容').fill('保存恢复测试')

  await page.getByRole('button', { name: '保存草稿' }).click()
  await registerUser(page, `freeform-${Date.now()}`)
  await page.getByRole('button', { name: '保存草稿' }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toHaveText(/已保存/)

  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Page 1' }).click()
  await expect(page.getByLabel('文本内容')).toContainText('保存恢复测试')
})

test('exports mixed-size slides as a zip after warning', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  const trigger = page.getByTestId('page-size-trigger')
  await trigger.click()
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await trigger.click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()

  await page.getByRole('button', { name: '打包导出' }).click()
  await expect(page.getByRole('heading', { name: '包含不同尺寸页面' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '继续导出' }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/^freeform-slides-\d{4}-\d{2}-\d{2}\.zip$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const zip = await JSZip.loadAsync(await readFile(path!))
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir).sort()
  expect(names).toEqual(['slide-01.png', 'slide-02.png'])

  const first = await zip.file('slide-01.png')!.async('uint8array')
  const second = await zip.file('slide-02.png')!.async('uint8array')
  expect(readPngSize(Buffer.from(first))).toEqual({ width: 1080, height: 1920 })
  expect(readPngSize(Buffer.from(second))).toEqual({ width: 1920, height: 1080 })
})

test('shows progress while exporting multiple freeform slides', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()
  await page.getByRole('button', { name: '新增页面' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '打包导出' }).click()
  await expect(page.getByRole('button', { name: /导出 \d+\/4/ })).toBeVisible()
  await downloadPromise
})

test('copies, pastes, and deletes the selected element', async ({ page }) => {
  await openFreeform(page)
  await insertText(page)

  await expect(page.locator('.freeform-element')).toHaveCount(1)
  const before = await freeformElementPositions(page)

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')
  await expect(page.locator('.freeform-element')).toHaveCount(2)

  const after = await freeformElementPositions(page)
  expect(after[1].x - before[0].x).toBe(16)
  expect(after[1].y - before[0].y).toBe(16)

  await page.keyboard.press('Delete')
  await expect(page.locator('.freeform-element')).toHaveCount(1)
})

test('hidden freeform workspace does not handle Delete', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await elements.first().click()
  await page.getByTestId('workspace-tab-markdown').click()
  await page.keyboard.press('Delete')
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(elements).toHaveCount(1)
})

test('hidden freeform workspace does not handle undo', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(1)
  await page.getByTestId('workspace-tab-markdown').click()
  await page.keyboard.press('Control+z')
  await page.getByTestId('workspace-tab-freeform').click()
  await expect(elements).toHaveCount(1)
})

test('moves the selected element through layer order', async ({ page }) => {
  await openFreeform(page)
  await insertText(page)
  await insertShape(page)

  await expect(page.locator('.freeform-element')).toHaveCount(2)
  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])

  await page.getByRole('button', { name: '置底' }).click()
  await expect.poll(() => freeformElementKinds(page)).toEqual(['shape', 'text'])

  await page.getByRole('button', { name: '置顶' }).click()

  await expect.poll(() => freeformElementKinds(page)).toEqual(['text', 'shape'])
})

test('inserts line and arrow elements', async ({ page }) => {
  await openFreeform(page)

  await insertLine(page, '直线')
  await expect(page.getByTestId('freeform-line')).toBeVisible()

  await insertLine(page, '箭头')
  await expect(page.getByTestId('freeform-arrow')).toBeVisible()
})

test('multi-selects elements and aligns them left', async ({ page }) => {
  await openFreeform(page)

  await insertText(page)
  await setSelectedElementPosition(page, 100, 120)
  await insertShape(page)
  await setSelectedElementPosition(page, 400, 240)

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 400, y: 240 },
  ])

  await page.locator('.freeform-element').first().click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 120 },
    { x: 100, y: 240 },
  ])
})

test('selection keeps artwork order', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 220, 220)
  await insertShape(page)
  await setSelectedElementBox(page, 180, 180, 220, 220)

  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const point = {
    x: canvasBox!.x + 280 * scale,
    y: canvasBox!.y + 280 * scale,
  }
  const topArtworkIsSelected = () => page.evaluate(({ x, y }) => {
    const hit = document.elementsFromPoint(x, y)
      .map((node) => node.closest<HTMLElement>('[data-testid="freeform-element"]'))
      .find((node): node is HTMLElement => Boolean(node))
    return hit?.getAttribute('data-selected') === 'true'
  }, point)

  expect(await topArtworkIsSelected()).toBe(true)

  await page.mouse.click(
    canvasBox!.x + 120 * scale,
    canvasBox!.y + 120 * scale,
  )
  await expect(page.getByTestId('freeform-element').first()).toHaveAttribute(
    'data-selected',
    'true',
  )

  expect(await topArtworkIsSelected()).toBe(false)
})

test('selection overlay hit targets stay accessible across zooms', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 240, 260, 180, 140)

  const controls = [
    {
      testId: 'freeform-selection-move',
      name: '\u79fb\u52a8\u5bf9\u8c61',
    },
    {
      testId: 'freeform-selection-resize',
      name: '\u8c03\u6574\u5927\u5c0f',
    },
  ] as const

  for (const zoom of [50, 100, 150]) {
    await setFreeformZoom(page, zoom)
    for (const control of controls) {
      const handle = page.getByTestId(control.testId)
      await expect(handle).toHaveAccessibleName(control.name)
      const box = await handle.boundingBox()
      expect(box, `${control.testId} missing at ${zoom}%`).toBeTruthy()
      expect(box!.width, `${control.testId} width at ${zoom}%`).toBeGreaterThanOrEqual(28)
      expect(box!.height, `${control.testId} height at ${zoom}%`).toBeGreaterThanOrEqual(28)

      await handle.focus()
      await expect(handle).toBeFocused()
      expect(await handle.evaluate((node) => {
        const style = getComputedStyle(node)
        const hasOutline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
        return hasOutline || (style.boxShadow !== 'none' && style.boxShadow !== '')
      }), `${control.testId} focus ring at ${zoom}%`).toBe(true)
    }
  }
})

test('selection overlay edge handles keep a real 28px hit span', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  await setSelectedElementBox(page, 0, 0, 180, 140)
  const moveHandle = page.getByTestId('freeform-selection-move')
  const moveBox = await moveHandle.boundingBox()
  expect(moveBox).toBeTruthy()
  const moveX = moveBox!.x + moveBox!.width / 2
  expect(await locatorOwnsPoint(moveHandle, moveX, moveBox!.y + 2)).toBe(true)
  expect(await locatorOwnsPoint(moveHandle, moveX, moveBox!.y + 29)).toBe(true)

  await setSelectedElementBox(page, 900, 1300, 180, 140)
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resizeHandle.boundingBox()
  expect(resizeBox).toBeTruthy()
  const resizeCenterX = resizeBox!.x + resizeBox!.width / 2
  const resizeCenterY = resizeBox!.y + resizeBox!.height / 2
  expect(await locatorOwnsPoint(resizeHandle, resizeBox!.x + 2, resizeCenterY)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeBox!.x + 29, resizeCenterY)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeCenterX, resizeBox!.y + 2)).toBe(true)
  expect(await locatorOwnsPoint(resizeHandle, resizeCenterX, resizeBox!.y + 29)).toBe(true)
})

test('leaf pointercancel cleanup move ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const before = await freeformElementBoxes(page)
  const handle = page.getByTestId('freeform-selection-move')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 41,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 42,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 41,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('leaf pointercancel cleanup resize ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const before = await freeformElementBoxes(page)
  const handle = page.getByTestId('freeform-selection-resize')
  const box = await handle.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }

  await handle.dispatchEvent('pointerdown', {
    pointerId: 51,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 52,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 52,
      pointerType: 'touch',
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'resize',
  )

  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 51,
      pointerType: 'touch',
      clientX: x + 80,
      clientY: y + 60,
    }))
  }, start)
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 51,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('leaf pointercancel cleanup move', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const workspace = page.locator('.freeform-workspace')
  const historyDepth = await workspace.getAttribute('data-history-depth')
  expect(historyDepth).not.toBeNull()
  const before = await freeformElementBoxes(page)
  const elementBox = await page.getByTestId('freeform-element').boundingBox()
  expect(elementBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = {
    x: elementBox!.x + elementBox!.width / 2,
    y: elementBox!.y + elementBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  const overlay = page.getByTestId('freeform-selection-overlay')
  await expect(overlay).toHaveAttribute('data-live-interaction', 'move')
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await expect(overlay).not.toHaveAttribute('data-live-interaction', /.+/)
  await expect(workspace).toHaveAttribute('data-history-depth', historyDepth!)
  await page.mouse.up()
})

test('leaf pointercancel cleanup resize', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const workspace = page.locator('.freeform-workspace')
  const historyDepth = await workspace.getAttribute('data-history-depth')
  expect(historyDepth).not.toBeNull()
  const before = await freeformElementBoxes(page)
  const resizeHandle = page.getByTestId('freeform-selection-resize')
  const handleBox = await resizeHandle.boundingBox()
  expect(handleBox).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = {
    x: handleBox!.x + handleBox!.width / 2,
    y: handleBox!.y + handleBox!.height / 2,
  }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 80 * scale, start.y + 60 * scale)
  const overlay = page.getByTestId('freeform-selection-overlay')
  await expect(overlay).toHaveAttribute('data-live-interaction', 'resize')
  await expect.poll(() => freeformElementBoxes(page)).not.toEqual(before)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await expect(overlay).not.toHaveAttribute('data-live-interaction', /.+/)
  await expect(workspace).toHaveAttribute('data-history-depth', historyDepth!)
  await page.mouse.up()
})

test('drags selected elements together', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 120, 100, 100)

  const elements = page.getByTestId('freeform-element')
  await expect(elements).toHaveCount(2)
  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)

  const firstElementBox = await elements.first().boundingBox()
  expect(firstElementBox).toBeTruthy()
  const start = {
    x: firstElementBox!.x + firstElementBox!.width / 2,
    y: firstElementBox!.y + firstElementBox!.height / 2,
  }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 100 * scale, start.y + 40 * scale)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 200, y: 140 },
    { x: 420, y: 160 },
  ])

  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
  ])
})

test('snapping aligns a dragged element to the page center and hides guides after release', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 490, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('snapping aligns a dragged element to another element left edge', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 700, 120, 140, 100)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (600 - 5) * scale, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 700, y: 100 },
    { x: 700, y: 120 },
  ])
})

test('snapping aligns a selected group by its bounding box', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  const first = page.getByTestId('freeform-element').first()
  const box = await first.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (280 - 5) * scale, start.y)
  await page.mouse.up()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 380, y: 100 },
    { x: 600, y: 120 },
  ])
})

test('snapping hides guides when pointer drag is canceled', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 100, 100)

  const element = page.getByTestId('freeform-element').first()
  const box = await element.boundingBox()
  expect(box).toBeTruthy()
  const start = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
  const scale = await freeformCanvasScale(page)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + (390 - 5) * scale, start.y)
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(1)

  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })))
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
  await page.mouse.up()
})

test('snapping does not apply to keyboard nudges', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 485, 100, 100, 100)
  await page.getByTestId('freeform-element').first().click()
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 486, y: 100 }])
  await expect(page.getByTestId('freeform-snap-line')).toHaveCount(0)
})

test('keyboard nudges all selected elements by arrow key', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('keyboard nudges all selected elements by 10 px with shift arrow', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('Shift+ArrowDown')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 110 },
    { x: 320, y: 130 },
  ])
})

test('keyboard shortcuts work after shift-selecting from an inspector input', async ({ page }) => {
  const elements = await insertTwoRectanglesLeavingInspectorFocused(page)

  await elements.first().click({ modifiers: ['Shift'] })
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('batch copies two selected elements and keeps pasted elements selected', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('ControlOrMeta+C')
  await page.keyboard.press('ControlOrMeta+V')

  await expect(page.getByTestId('freeform-element')).toHaveCount(4)
  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 320, y: 120 },
    { x: 116, y: 116 },
    { x: 336, y: 136 },
  ])
})

test('batch deletes all selected elements', async ({ page }) => {
  await insertTwoSelectedRectangles(page)

  await page.keyboard.press('Delete')

  await expect(page.getByTestId('freeform-element')).toHaveCount(0)
})

test('keyboard shortcuts work after marquee from an inspector input', async ({ page }) => {
  await insertTwoRectanglesLeavingInspectorFocused(page)

  const canvas = page.getByTestId('freeform-canvas')
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 101, y: 100 },
    { x: 321, y: 120 },
  ])
})

test('marquee selects elements by dragging empty canvas', async ({ page }) => {
  await openFreeform(page)
  await expect(page.getByTestId('freeform-canvas')).toBeVisible()

  await insertShape(page)
  await setSelectedElementBox(page, 100, 100, 120, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 320, 140, 120, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 760, 140, 120, 100)

  const canvas = page.getByTestId('freeform-canvas')
  const box = await canvas.boundingBox()
  expect(box).toBeTruthy()
  const scale = await freeformCanvasScale(page)
  const start = { x: box!.x + 70 * scale, y: box!.y + 70 * scale }
  const end = { x: box!.x + 500 * scale, y: box!.y + 290 * scale }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y)
  await page.mouse.up()

  await expect(selectedFreeformElements(page)).toHaveCount(2)

  await page.getByRole('button', { name: '左对齐' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 100 },
    { x: 100, y: 140 },
    { x: 760, y: 140 },
  ])
})

test('distributes selected elements horizontally', async ({ page }) => {
  await openFreeform(page)

  await insertShape(page)
  await setSelectedElementBox(page, 100, 160, 100, 100)
  await insertShape(page)
  await setSelectedElementBox(page, 400, 160, 100, 100)
  expect(await freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 400, y: 160 },
  ])
  await insertShape(page)
  await setSelectedElementBox(page, 800, 160, 100, 100)

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 400, y: 160 },
    { x: 800, y: 160 },
  ])

  await page.locator('.freeform-element').nth(0).click({ modifiers: ['Shift'] })
  await page.locator('.freeform-element').nth(1).click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: '水平均分' }).click()

  await expect.poll(() => freeformElementPositions(page)).toEqual([
    { x: 100, y: 160 },
    { x: 450, y: 160 },
    { x: 800, y: 160 },
  ])
})

test('layers tab exposes a reverse accessible tree with roving keyboard focus', async ({ page }) => {
  await openNestedV3Draft(page, `layers-tree-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  await expect(tablist).toBeVisible()
  await expect(tablist.getByRole('tab')).toHaveCount(2)
  await tablist.getByRole('tab', { name: '图层', exact: true }).click()

  const panel = page.getByRole('tabpanel', { name: '图层' })
  const tree = panel.getByRole('tree', { name: '图层树' })
  await expect(tree).toBeVisible()
  const rows = tree.getByRole('treeitem')
  await expect(rows).toHaveCount(12)
  await expect(rows.first()).toHaveAttribute('aria-label', 'Locked root group')
  await expect(rows.last()).toHaveAttribute('aria-label', 'Underlay')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toHaveAttribute('aria-level', '2')
  await expect(tree.getByRole('treeitem', { name: 'Locked text' })).toHaveAttribute('aria-level', '3')
  const outerGroup = tree.getByRole('treeitem', { name: 'Outer group' })
  const ownedGroupId = await outerGroup.getAttribute('aria-owns')
  expect(ownedGroupId).toBeTruthy()
  await expect(tree.locator(`[id="${ownedGroupId}"]`)).toHaveAttribute('role', 'group')
  await expect(tree.locator('[tabindex="0"]')).toHaveCount(1)

  await rows.first().focus()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group leaf')
  await page.keyboard.press('Home')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('End')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Underlay')
})

test('layers tab keeps independent panel linkage and tree state across tab switches', async ({ page }) => {
  await openNestedV3Draft(page, `layers-tab-state-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  const propertiesTab = tablist.getByRole('tab', { name: '属性', exact: true })
  const layersTab = tablist.getByRole('tab', { name: '图层', exact: true })
  const propertiesPanelId = await propertiesTab.getAttribute('aria-controls')
  const layersPanelId = await layersTab.getAttribute('aria-controls')
  expect(propertiesPanelId).toBeTruthy()
  expect(layersPanelId).toBeTruthy()
  expect(propertiesPanelId).not.toBe(layersPanelId)
  await expect(page.locator(`#${propertiesPanelId}`)).toHaveAttribute('aria-labelledby', await propertiesTab.getAttribute('id'))
  await expect(page.locator(`#${layersPanelId}`)).toHaveAttribute('aria-labelledby', await layersTab.getAttribute('id'))

  await layersTab.click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)

  await propertiesTab.click()
  await expect(page.getByRole('tabpanel', { name: '属性' })).toBeVisible()
  await layersTab.click()
  await expect(page.getByRole('tabpanel', { name: '图层' })).toBeVisible()
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
  await expect(outer).toHaveAttribute('tabindex', '0')
})

test('layers tree selects deep nodes in their parent scope and rejects cross-parent toggles', async ({ page }) => {
  await openNestedV3Draft(page, `layers-selection-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })

  const deepRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await deepRow.click()
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(1)

  const sibling = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await sibling.focus()
  await page.keyboard.press('Space')
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(sibling).toHaveAttribute('aria-selected', 'true')

  const rootRow = tree.getByRole('treeitem', { name: 'Underlay' })
  await rootRow.focus()
  await page.keyboard.press('Space')
  await expect(deepRow).toHaveAttribute('aria-selected', 'true')
  await expect(sibling).toHaveAttribute('aria-selected', 'true')
  await expect(panelLiveRegion(page)).toContainText('只能同时选择同一组内的图层')
})

test('layers tree renames with F2 and reorders siblings with Alt arrows', async ({ page }) => {
  await openNestedV3Draft(page, `layers-edit-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scopeRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await scopeRow.focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await expect(renameInput).toBeVisible()
  await renameInput.fill('')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toBeVisible()

  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowUp')
  const rootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootLabels.indexOf('Underlay')).toBe(3)
  await expect(panelLiveRegion(page)).toContainText('Underlay')
})

test('layers tabs and tree directional keys stay in the panel without canvas nudges', async ({ page }) => {
  await openNestedV3Draft(page, `layers-keyboard-${Date.now()}`)

  const tablist = page.getByRole('tablist', { name: '自由编辑面板' })
  const propertiesTab = tablist.getByRole('tab', { name: '属性', exact: true })
  const layersTab = tablist.getByRole('tab', { name: '图层', exact: true })
  await propertiesTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(layersTab).toHaveAttribute('aria-selected', 'true')
  await expect(layersTab).toBeFocused()
  await expect(page.locator(`#${await layersTab.getAttribute('aria-controls')}`)).toHaveAttribute(
    'aria-labelledby',
    await layersTab.getAttribute('id'),
  )
  await page.keyboard.press('Home')
  await expect(propertiesTab).toHaveAttribute('aria-selected', 'true')
  await expect(propertiesTab).toBeFocused()
  await propertiesTab.focus()
  await page.keyboard.press('End')
  await expect(layersTab).toHaveAttribute('aria-selected', 'true')
  await expect(layersTab).toBeFocused()

  const tree = page.getByRole('tree', { name: '图层树' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await expect(outer).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
  await expect(outer).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Hidden inner')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Outer group')

  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaled.click()
  const before = await page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style')
  await scaled.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute('style', before ?? '')
})

test('layers selection reconciles after delete, undo, and switching the active page', async ({ page }) => {
  await openNestedV3Draft(page, `layers-reconcile-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scopeRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await scopeRow.click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')

  await page.keyboard.press('Delete')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toHaveCount(0)
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)

  await page.keyboard.press('Control+z')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toBeVisible()
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)

  await page.getByRole('button', { name: '复制页面', exact: true }).click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]')).toHaveCount(0)
})

test('layers selection resets when another draft opens in the same workspace mount', async ({ page }) => {
  await openNestedV3Draft(page, `layers-draft-identity-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'outer')

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'other-freeform-draft'
    source.title = 'Other freeform draft'
    source.updatedAt += 1
    source.document.activeSlideId = 'other-slide'
    source.document.slides = [{
      ...source.document.slides[0],
      id: 'other-slide',
      name: 'Other slide',
      nodes: [source.document.slides[0].nodes[0]],
    }]
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Other freeform draft' }).click()

  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
  await expect(page.locator('[data-scene-node-id][data-selected="true"]')).toHaveCount(0)
  await expect(page.getByRole('tree', { name: '图层树' }).getByRole('treeitem')).toHaveCount(1)
})

test('layers reorder keeps a stable same-parent selection and does not write history at boundaries', async ({ page }) => {
  await openNestedV3Draft(page, `layers-reorder-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await underlay.click()
  await scaled.focus()
  await page.keyboard.press('Space')
  await expect(underlay).toHaveAttribute('aria-selected', 'true')
  await expect(scaled).toHaveAttribute('aria-selected', 'true')

  const rootIdsBefore = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await expect(underlay).toHaveAttribute('aria-selected', 'true')
  await expect(scaled).toHaveAttribute('aria-selected', 'true')
  const rootIdsAfterMove = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterMove).not.toEqual(rootIdsBefore)
  expect(rootIdsAfterMove.filter((name) => name === 'Underlay' || name === 'Scaled root leaf')).toEqual([
    'Scaled root leaf',
    'Underlay',
  ])

  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  const rootIdsAfterUndo = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterUndo).toEqual(rootIdsBefore)

  await page.keyboard.press('Control+y')
  const rootIdsAfterRedo = await page.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootIdsAfterRedo).toEqual(rootIdsAfterMove)
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
  await expect(panelLiveRegion(page)).toContainText(/第 \d+ 层/)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()

  await underlay.click()
  await underlay.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layers drag reorders adjacent siblings and rejects cross-parent drops', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await underlay.dragTo(outer)
  const rootsAfterDrop = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterDrop.slice(-2)).toEqual(['Underlay', 'Outer group'])

  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.dragTo(underlay)
  await expect(panelLiveRegion(page)).toContainText('图层只能在同一组内排序')
  const rootsAfterRejectedDrop = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterRejectedDrop).toEqual(rootsAfterDrop)
})

test('layers drag moves a non-adjacent sibling to the exact visual drop position', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-distance-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const source = tree.getByRole('treeitem', { name: 'Underlay' })
  const target = tree.getByRole('treeitem', { name: 'Locked root group', exact: true })
  const initialRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await source.dragTo(target)

  const visualRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(visualRootLabels.slice(0, 2)).toEqual(['Underlay', 'Locked root group'])
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await page.keyboard.press('Control+z')
  const rootsAfterUndo = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  expect(rootsAfterUndo).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layers drag inserts a non-contiguous selection as one block and ignores selected targets', async ({ page }) => {
  await openNestedV3Draft(page, `layers-drag-selection-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scaled = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  const target = tree.getByRole('treeitem', { name: 'Locked root leaf', exact: true })
  await scaled.click()
  await underlay.focus()
  await page.keyboard.press('Space')

  const initialRootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await underlay.dragTo(scaled)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()

  await underlay.dragTo(target)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual([
    'Locked root group',
    'Scaled root leaf',
    'Underlay',
    'Locked root leaf',
    'Outer group',
  ])
  await expect(panelLiveRegion(page)).toContainText('已移动 2 个图层至 Locked root leaf 上方')
  await page.keyboard.press('Control+z')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(initialRootLabels)
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
})

test('layer rename by double click is one undoable and redoable edit', async ({ page }) => {
  await openNestedV3Draft(page, `layers-rename-history-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const row = tree.getByRole('treeitem', { name: 'Scope text' })
  await row.locator('.freeform-layer-name').dblclick()
  const input = page.getByRole('textbox', { name: '重命名图层' })
  await input.fill('Caption layer')
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: 'Caption layer' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()

  await page.keyboard.press('Control+z')
  await expect(tree.getByRole('treeitem', { name: 'Scope text' })).toBeVisible()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
  await page.keyboard.press('Control+y')
  await expect(tree.getByRole('treeitem', { name: 'Caption layer' })).toBeVisible()
  await expect(page.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
})

test('layer rename does not submit while an IME composition is active', async ({ page }) => {
  await openNestedV3Draft(page, `layers-rename-ime-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Scope text' }).press('F2')
  const input = page.getByRole('textbox', { name: '重命名图层' })
  await input.dispatchEvent('compositionstart')
  await input.fill('输入中')
  await input.press('Enter')
  await expect(input).toBeVisible()
  await input.dispatchEvent('compositionend')
  await input.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '输入中' })).toBeVisible()
})

test('layer tree restores deterministic row focus after delete and collapse', async ({ page }) => {
  await openNestedV3Draft(page, `layers-focus-fallback-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()
  await scope.focus()
  await page.keyboard.press('Delete')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Visible leaf')

  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.focus()
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Outer group')
  await expect(tree.getByRole('treeitem', { name: 'Visible leaf' })).toHaveCount(0)
})

test('hides nested layers while preserving tree management, export, and focus fallback', async ({ page }) => {
  await openNestedV3Draft(page, `layers-hide-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')

  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()
  await scope.focus()
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const hideScope = scope.getByRole('button', { name: '隐藏图层 Scope text' })
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await hideScope.dblclick()
  await expect(hideScope).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: '重命名图层' })).toHaveCount(0)
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await page.keyboard.press('Control+z')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await scope.evaluate((element) => {
    element.addEventListener('dragstart', () => {
      ;(element as HTMLElement).dataset.actionDragStarted = 'true'
    }, { once: true })
  })
  const hideScopeBox = await hideScope.boundingBox()
  expect(hideScopeBox).toBeTruthy()
  await page.mouse.move(hideScopeBox!.x + hideScopeBox!.width / 2, hideScopeBox!.y + hideScopeBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(hideScopeBox!.x + 32, hideScopeBox!.y + hideScopeBox!.height / 2)
  await page.mouse.up()
  await expect(scope).not.toHaveAttribute('data-action-drag-started', 'true')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'false')

  await scope.focus()
  await page.keyboard.press('Tab')
  await expect(hideScope).toBeFocused()
  await expect(hideScope).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(hideScope).toHaveAttribute('aria-pressed', 'true')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(scope).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Visible leaf')

  await page.keyboard.press('Control+z')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(1)
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="scope-text"]')).toHaveCount(1)

  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(1)
  await scaledRoot.getByRole('button', { name: '隐藏图层 Scaled root leaf' }).click()
  await expect(scaledRoot).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveCount(0)
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(0)
  await page.keyboard.press('Control+z')

  const visibleLeaf = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await visibleLeaf.focus()
  await visibleLeaf.getByRole('button', { name: '隐藏图层 Visible leaf' }).click()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Scope text')
  await page.keyboard.press('Control+z')

  const lockedGroupLeaf = tree.getByRole('treeitem', { name: 'Locked root group leaf' })
  await lockedGroupLeaf.focus()
  await lockedGroupLeaf.getByRole('button', { name: '隐藏图层 Locked root group leaf' }).click()
  await expect(lockedGroupLeaf).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked root group')
  await page.keyboard.press('Control+z')

  const hiddenGroup = tree.getByRole('treeitem', { name: 'Hidden inner' })
  const hiddenGroupToggle = hiddenGroup.getByRole('button', { name: '隐藏图层 Hidden inner' })
  await expect(hiddenGroupToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(hiddenGroupToggle).toHaveAttribute('title', '显示 Hidden inner')
  const hiddenLeaf = tree.getByRole('treeitem', { name: 'Hidden leaf' })
  const hiddenLeafDescription = await hiddenLeaf.getAttribute('aria-describedby')
  expect(hiddenLeafDescription).toBeTruthy()
  await expect(page.locator(`[id="${hiddenLeafDescription}"]`)).toContainText('受父级隐藏影响')
  await expect(hiddenLeaf.locator('[title="受父级隐藏影响"]')).toBeVisible()

  const hiddenLeafToggle = hiddenLeaf.getByRole('button', { name: '隐藏图层 Hidden leaf' })
  await hiddenLeafToggle.focus()
  await page.keyboard.press('Enter')
  await expect(hiddenLeafToggle).toBeFocused()
  await expect(hiddenLeafToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(panelLiveRegion(page)).toContainText('已设为自身隐藏，仍受父级隐藏影响')

  await hiddenGroupToggle.click()
  await expect(hiddenGroupToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)
  await hiddenLeafToggle.click()
  await expect(hiddenLeafToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(1)

  await hiddenGroupToggle.click()
  await expect(hiddenGroup).toBeVisible()
  await expect(page.locator('[data-scene-node-id="hidden-leaf"]')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Locked inner')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await samplePngPixel(page, path!, 400, 300)).toEqual([252, 165, 165, 255])
})

test('locks nested layers against editing and cancels an active IME composition', async ({ page }) => {
  await openNestedV3Draft(page, `layers-lock-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const scope = tree.getByRole('treeitem', { name: 'Scope text' })
  await scope.click()

  const textbox = page.locator('[data-scene-node-id="scope-text"] [role="textbox"]')
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await textbox.focus()
  await textbox.dispatchEvent('compositionstart')
  await textbox.evaluate((element) => {
    element.textContent = '未授权的组合输入'
  })

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const lockScope = scope.getByRole('button', { name: '锁定图层 Scope text' })
  await expect(lockScope).toHaveAttribute('aria-pressed', 'false')
  const lockScopeBox = await lockScope.boundingBox()
  expect(lockScopeBox).toBeTruthy()
  await page.mouse.move(lockScopeBox!.x + lockScopeBox!.width / 2, lockScopeBox!.y + lockScopeBox!.height / 2)
  await page.mouse.down()
  await expect(textbox).toBeFocused()
  await page.mouse.up()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(lockScope).toHaveAttribute('aria-pressed', 'true')
  await expect(scope).toHaveAttribute('aria-selected', 'true')
  await expect(textbox).toHaveAttribute('contenteditable', 'false')
  await expect(textbox).toHaveAttribute('aria-readonly', 'true')
  await expect(textbox).toHaveCSS('cursor', 'default')
  await expect(textbox).toHaveText('Enter group to edit')
  await textbox.dispatchEvent('compositionend')
  await expect(textbox).toHaveText('Enter group to edit')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const lockBanner = page.getByTestId('freeform-lock-banner')
  await expect(lockBanner).toContainText('已锁定')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
  const unlock = lockBanner.getByRole('button', { name: '解锁 Scope text' })
  await unlock.focus()
  await page.keyboard.press('Enter')
  await expect(lockBanner).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '属性', exact: true })).toBeFocused()
  await expect(textbox).toHaveAttribute('contenteditable', 'true')
  await expect(textbox).toHaveText('Enter group to edit')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
  await page.keyboard.press('Control+z')
  await expect(textbox).toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('Control+y')
  await expect(textbox).toHaveAttribute('contenteditable', 'true')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  const interactionLock = scaledRoot.getByRole('button', { name: '锁定图层 Scaled root leaf' })
  const interactionHide = scaledRoot.getByRole('button', { name: '隐藏图层 Scaled root leaf' })
  const moveHandle = page.getByTestId('freeform-selection-move')
  const moveHandleBox = await moveHandle.boundingBox()
  expect(moveHandleBox).toBeTruthy()
  const interactionHistory = await workspace.getAttribute('data-history-depth')
  const interactionStyleBefore = await page
    .locator('[data-scene-node-id="scaled-root"]')
    .getAttribute('style')
  await page.mouse.move(moveHandleBox!.x + moveHandleBox!.width / 2, moveHandleBox!.y + moveHandleBox!.height / 2)
  await page.mouse.down()
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute('data-live-interaction', 'move')
  await page.mouse.move(
    moveHandleBox!.x + moveHandleBox!.width / 2 + 18,
    moveHandleBox!.y + moveHandleBox!.height / 2 + 10,
  )
  await expect.poll(
    () => page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style'),
  ).not.toBe(interactionStyleBefore)
  const interactionMovedStyle = await page
    .locator('[data-scene-node-id="scaled-root"]')
    .getAttribute('style')
  await interactionLock.evaluate((element) => (element as HTMLButtonElement).click())
  await interactionHide.evaluate((element) => (element as HTMLButtonElement).click())
  await expect(interactionLock).toHaveAttribute('aria-pressed', 'false')
  await expect(interactionHide).toHaveAttribute('aria-pressed', 'false')
  await expect(workspace).toHaveAttribute('data-history-depth', interactionHistory ?? '')
  await page.mouse.up()
  await expect(workspace).toHaveAttribute(
    'data-history-depth',
    String(Number(interactionHistory) + 1),
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    interactionStyleBefore ?? '',
  )
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    interactionMovedStyle ?? '',
  )

  const lockedRoot = tree.getByRole('treeitem', { name: 'Locked root leaf' })
  await lockedRoot.focus()
  await page.keyboard.press('Space')
  await expect(scaledRoot).toHaveAttribute('aria-selected', 'true')
  await expect(lockedRoot).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('freeform-selection-box')).toHaveCount(1)
  await expect(page.getByTestId('freeform-selection-box'))
    .toHaveAttribute('data-element-id', 'scaled-root')
  const rootStyle = await page.locator('[data-scene-node-id="locked-root-leaf"]').getAttribute('style')
  const scaledStyle = await page.locator('[data-scene-node-id="scaled-root"]').getAttribute('style')
  const rootLabels = await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  const savedMeta = await page.getByTestId('freeform-slide-meta').textContent()
  const lockedHistory = await workspace.getAttribute('data-history-depth')
  await scaledRoot.focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  await lockedRoot.focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)

  await page.locator('[data-scene-node-id="locked-root-leaf"]').click({ position: { x: 10, y: 10 } })
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const lockedInspector = page.getByRole('tabpanel', { name: '属性' })
  for (const section of [
    'inspector-geometry',
    'inspector-typography',
    'inspector-fill',
    'inspector-stroke',
    'inspector-arrange',
    'inspector-danger',
  ]) {
    await expect(page.getByTestId(section)).toHaveCount(0)
  }
  await expect(lockedInspector.locator('input, textarea, [role="combobox"]')).toHaveCount(0)
  await page.getByTestId('freeform-lock-banner').getByRole('button').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await page.keyboard.press('Delete')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await expect(page.locator('[data-scene-node-id="locked-root-leaf"]')).toHaveAttribute(
    'style',
    rootStyle ?? '',
  )
  await expect(page.locator('[data-scene-node-id="scaled-root"]')).toHaveAttribute(
    'style',
    scaledStyle ?? '',
  )
  await expect(workspace).toHaveAttribute('data-history-depth', lockedHistory ?? '')
  await expect(page.getByTestId('freeform-slide-meta')).toHaveText(savedMeta ?? '')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await scaledRoot.dragTo(underlay)
  await expect(panelLiveRegion(page)).toContainText('图层已锁定，无法调整层级')
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)
  await lockedRoot.dragTo(underlay)
  expect(await tree.locator('[role="treeitem"][aria-level="1"]').evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label')),
  )).toEqual(rootLabels)
  await expect(workspace).toHaveAttribute('data-history-depth', lockedHistory ?? '')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('freeform-primary-export').click()
  const download = await downloadPromise
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await samplePngPixel(page, path!, 720, 45)).toEqual([148, 163, 184, 255])
})

test('locked layer metadata remains manageable through inherited state and reload', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openNestedV3Draft(page, `layers-lock-metadata-${Date.now()}`, true)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const lockedText = tree.getByRole('treeitem', { name: 'Locked text' })
  const ownLock = lockedText.getByRole('button', { name: '锁定图层 Locked text' })
  await expect(ownLock).toHaveAttribute('aria-pressed', 'false')
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  const lockedTextDescription = await lockedText.getAttribute('aria-describedby')
  expect(lockedTextDescription).toBeTruthy()
  await expect(page.locator(`[id="${lockedTextDescription}"]`)).toContainText('受父级锁定影响')
  await expect(lockedText.locator('[title="受父级锁定影响"]')).toBeVisible()
  await ownLock.click()
  await ownLock.click()
  await expect(ownLock).toHaveAttribute('aria-pressed', 'false')
  await expect(panelLiveRegion(page)).toContainText('已取消自身锁定，仍受父级锁定影响')

  const scaledRoot = tree.getByRole('treeitem', { name: 'Scaled root leaf' })
  await scaledRoot.click()
  await page.keyboard.press('Control+c')
  await lockedText.click()
  const historyBeforePaste = await workspace.getAttribute('data-history-depth')
  const rowCountBeforePaste = await tree.getByRole('treeitem').count()
  await page.keyboard.press('Control+v')
  await expect(tree.getByRole('treeitem')).toHaveCount(rowCountBeforePaste)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBeforePaste ?? '')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const inheritedUnlock = page
    .getByTestId('freeform-lock-banner')
    .getByRole('button', { name: '解锁 Locked inner' })
  await inheritedUnlock.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('alert')).toContainText('图层已锁定，先解锁后再编辑')
  await page.getByRole('alert').getByRole('button', { name: '关闭提示' }).click()
  await inheritedUnlock.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'true')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'false')
  await page.keyboard.press('Control+y')
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'true')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await lockedText.getByRole('button', { name: '锁定图层 Locked text' }).click()
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  const lockedInner = tree.getByRole('treeitem', { name: 'Locked inner' })
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const doubleLockBanner = page.getByTestId('freeform-lock-banner')
  await expect(doubleLockBanner.getByRole('button', { name: '解锁 Locked text' })).toBeVisible()
  await doubleLockBanner.getByRole('button', { name: '解锁 Locked text' }).click()
  await expect(doubleLockBanner.getByRole('button', { name: '解锁 Locked inner' })).toBeVisible()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await lockedText.getByRole('button', { name: '锁定图层 Locked text' }).click()
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await expect(lockedText.getByRole('button', { name: '锁定图层 Locked text' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(lockedText).toHaveAttribute('data-effective-locked', 'true')
  await expect(lockedText).toHaveAttribute('aria-selected', 'true')

  await lockedText.focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await renameInput.fill('Protected caption')
  await page.keyboard.press('Enter')
  const renamed = tree.getByRole('treeitem', { name: 'Protected caption' })
  await renamed.getByRole('button', { name: '隐藏图层 Protected caption' }).click()
  await expect(renamed).toBeVisible()
  await expect(page.locator('[data-scene-node-id="locked-text"]')).toHaveCount(0)

  const deepLayer = tree.getByRole('treeitem', { name: 'Deep layer label remains readable' })
  await expect(deepLayer).toHaveAttribute('aria-level', '25')
  await expect(deepLayer).toHaveAttribute('data-effective-locked', 'true')
  await expect(deepLayer).toHaveAttribute('data-effective-hidden', 'true')
  await expect(deepLayer.locator('[title="受父级隐藏和锁定影响"]')).toBeVisible()
  await expect(deepLayer.locator('.freeform-layer-depth')).toHaveText('25')
  await expect(deepLayer.locator('.freeform-layer-depth')).toHaveAttribute('title', '第 25 层')
  await deepLayer.click()
  await expect(renamed.locator('.freeform-layer-actions')).toHaveCSS('opacity', '1')
  expect(await renamed.getByRole('button', { name: '隐藏图层 Protected caption' }).evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  )).not.toBe('rgba(0, 0, 0, 0)')

  const lightHiddenStyles = await renamed.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!
    const panel = row.closest<HTMLElement>('.freeform-right-panel')!
    const nameStyle = getComputedStyle(name)
    return {
      opacity: nameStyle.opacity,
      color: nameStyle.color,
      background: getComputedStyle(panel).backgroundColor,
    }
  })
  expect(lightHiddenStyles.opacity).toBe('1')
  expect(contrastRatio(lightHiddenStyles.color, lightHiddenStyles.background)).toBeGreaterThanOrEqual(4.5)

  const treeMetrics = await tree.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(treeMetrics.scrollWidth).toBeLessThanOrEqual(treeMetrics.clientWidth)
  expect(await renamed.locator('.freeform-layer-name').evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(50)

  const deepGeometry = await deepLayer.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!.getBoundingClientRect()
    const actions = row.querySelector<HTMLElement>('.freeform-layer-actions')!.getBoundingClientRect()
    const tree = row.closest<HTMLElement>('[role="tree"]')!
    return {
      nameWidth: name.width,
      nameRight: name.right,
      actionsLeft: actions.left,
      treeClientWidth: tree.clientWidth,
      treeScrollWidth: tree.scrollWidth,
    }
  })
  expect(deepGeometry.nameWidth).toBeGreaterThan(40)
  expect(deepGeometry.nameRight).toBeLessThanOrEqual(deepGeometry.actionsLeft + 0.5)
  expect(deepGeometry.treeScrollWidth).toBeLessThanOrEqual(deepGeometry.treeClientWidth)

  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Nested scene' }).click()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const restoredTree = page.getByRole('tree', { name: '图层树' })
  const restored = restoredTree.getByRole('treeitem', { name: 'Protected caption' })
  await expect(restored.getByRole('button', { name: '锁定图层 Protected caption' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(restored.getByRole('button', { name: '隐藏图层 Protected caption' }))
    .toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-scene-node-id="locked-text"]')).toHaveCount(0)
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await restored.hover()
  await expect.poll(
    () => restored.locator('.freeform-layer-actions').evaluate(
      (element) => getComputedStyle(element).opacity,
    ),
  ).toBe('1')
  const darkActionStyles = await restored.locator('.freeform-layer-actions').evaluate((element) => {
    const action = getComputedStyle(element)
    const button = getComputedStyle(element.querySelector('button')!)
    return {
      opacity: action.opacity,
      background: action.backgroundColor,
      color: button.color,
    }
  })
  expect(darkActionStyles.opacity).toBe('1')
  expect(contrastRatio(darkActionStyles.color, darkActionStyles.background)).toBeGreaterThan(3)
  expect(await restored.getByRole('button', { name: '隐藏图层 Protected caption' }).evaluate(
    (button) => getComputedStyle(button).backgroundColor,
  )).not.toBe('rgba(0, 0, 0, 0)')
  const darkHiddenStyles = await restored.evaluate((row) => {
    const name = row.querySelector<HTMLElement>('.freeform-layer-name')!
    const panel = row.closest<HTMLElement>('.freeform-right-panel')!
    const nameStyle = getComputedStyle(name)
    return {
      opacity: nameStyle.opacity,
      color: nameStyle.color,
      background: getComputedStyle(panel).backgroundColor,
    }
  })
  expect(darkHiddenStyles.opacity).toBe('1')
  expect(contrastRatio(darkHiddenStyles.color, darkHiddenStyles.background)).toBeGreaterThanOrEqual(4.5)
  await restored.getByRole('button', { name: '隐藏图层 Protected caption' }).click()
  await expect(page.locator('[data-scene-node-id="locked-text"] [role="textbox"]'))
    .toHaveAttribute('contenteditable', 'false')
})

test('scene property coordinates and path updates', async ({ page }) => {
  await openNestedV3Draft(page, `scene-properties-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const geometry = page.getByTestId('inspector-geometry')
  const x = geometry.getByLabel('X', { exact: true })
  const y = geometry.getByLabel('Y', { exact: true })
  const width = geometry.getByLabel('宽', { exact: true })
  const height = geometry.getByLabel('高', { exact: true })
  await expect(x).toHaveValue('495')
  await expect(y).toHaveValue('380')
  await expect(width).toHaveValue('150')
  await expect(height).toHaveValue('120')

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  await x.fill('520')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore))
  await x.press('Enter')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await x.blur()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(x).toHaveValue('520')
  await expect(y).toHaveValue('380')
  await page.keyboard.press('Control+z')
  await expect(x).toHaveValue('495')

  const historyAfterUndo = await workspace.getAttribute('data-history-depth')
  await width.fill('')
  await width.blur()
  await expect(width).toHaveValue('150')
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterUndo ?? '')
  await width.fill('0')
  await width.blur()
  await expect(width).toHaveValue('150')
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterUndo ?? '')
  await x.fill('510')
  await x.press('Escape')
  await expect(x).toHaveValue('495')
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterUndo ?? '')
  await x.fill('510')
  await page.getByRole('button', { name: '重做', exact: true }).evaluate(
    (button) => (button as HTMLButtonElement).click(),
  )
  await expect(x).toHaveValue('520')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByRole('navigation', { name: '对象路径' })).toContainText('页面')
  await expect(page.getByRole('navigation', { name: '对象路径' })).toContainText('Outer group')
  const textArea = page.getByTestId('inspector-typography').locator('textarea')
  await textArea.fill('Path update survives nesting')
  await expect(page.locator('[data-scene-node-id="scope-text"] [role="textbox"]'))
    .toHaveText('Path update survives nesting')
  const fontSize = page.getByTestId('inspector-typography').getByLabel('字号', { exact: true })
  const textHistory = Number(await workspace.getAttribute('data-history-depth'))
  await fontSize.fill('28')
  await expect(workspace).toHaveAttribute('data-history-depth', String(textHistory))
  await fontSize.press('Enter')
  await expect(workspace).toHaveAttribute('data-history-depth', String(textHistory + 1))
  await expect(fontSize).toHaveValue('28')
})

test('nested scene paths update every leaf style family', async ({ page }) => {
  await openNestedV3Draft(
    page,
    `scene-property-matrix-${Date.now()}`,
    false,
    nestedPropertyMatrixDraft,
  )
  const tree = page.getByRole('tree', { name: '图层树' })

  const selectLayer = async (name: string) => {
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await tree.getByRole('treeitem', { name, exact: true }).click()
    await page.getByRole('tab', { name: '属性', exact: true }).click()
  }

  await selectLayer('Scope text')
  const textNode = page.locator('[data-scene-node-id="scope-text"]')
  const textBox = textNode.getByTestId('freeform-textbox')
  const fontSelect = page.getByTestId('freeform-font-select')
  await fontSelect.click()
  await page.getByRole('option', { name: '思源宋体', exact: true }).click()
  await expect(fontSelect).toContainText('思源宋体')
  await expect(textBox).toHaveCSS('font-family', /Noto Serif/i)

  const textFill = page.getByTestId('text-fill-paint')
  await textFill.getByLabel('文字颜色 hex', { exact: true }).fill('#3b82f6')
  await expect(textFill.getByLabel('文字颜色 hex', { exact: true })).toHaveValue('#3b82f6')
  await expect(textBox).toHaveCSS('color', 'rgb(59, 130, 246)')

  await selectLayer('Visible leaf')
  const shapeNode = page.locator('[data-scene-node-id="visible-leaf"]')
  const shape = shapeNode.getByTestId('freeform-shape')
  const geometry = page.getByTestId('inspector-geometry')
  await geometry.getByRole('button', { name: '三角形', exact: true }).click()
  await expect(shape).toHaveClass(/shape-triangle/)

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByLabel('填充 hex', { exact: true }).fill('#8b5cf6')
  await expect(shapeFill.getByLabel('填充 hex', { exact: true })).toHaveValue('#8b5cf6')
  await expect(shape).toHaveCSS('background-color', 'rgb(139, 92, 246)')

  const shapeStroke = page.getByTestId('shape-stroke-color').getByTestId('paint-color-button')
  await shapeStroke.click()
  const shapeStrokePopover = page.getByRole('dialog', { name: '形状描边颜色 色板' })
  await shapeStrokePopover.getByLabel('形状描边颜色 自定义 HEX', { exact: true }).fill('#ef4444')
  await expect(shape).toHaveCSS('border-color', 'rgb(239, 68, 68)')
  await page.keyboard.press('Escape')

  const shapeStrokeWidth = page.getByTestId('inspector-stroke').getByLabel('描边宽', { exact: true })
  await shapeStrokeWidth.fill('8')
  await shapeStrokeWidth.press('Enter')
  await expect(shapeStrokeWidth).toHaveValue('8')
  await expect.poll(() => shape.evaluate((node) => getComputedStyle(node).borderWidth)).not.toBe('0px')

  await selectLayer('Matrix image')
  const imageNode = page.locator('[data-scene-node-id="matrix-image"]')
  const imageFill = page.getByTestId('inspector-fill')
  await expect(imageFill.getByRole('button', { name: '填满', exact: true })).toHaveClass(/\bon\b/)
  await imageFill.getByRole('button', { name: '适应', exact: true }).click()
  await expect(imageFill.getByRole('button', { name: '适应', exact: true })).toHaveClass(/\bon\b/)
  await expect(imageNode.locator('.freeform-image')).toHaveCSS('object-fit', 'contain')

  await selectLayer('Matrix line')
  const lineNode = page.locator('[data-scene-node-id="matrix-line"]')
  const lineStroke = page.getByTestId('inspector-stroke')
  await lineStroke.getByRole('button', { name: '箭头', exact: true }).click()
  await expect(lineNode.getByTestId('freeform-arrow')).toHaveCount(1)

  const lineStrokeButton = lineStroke.getByTestId('line-stroke-color').getByTestId('paint-color-button')
  await lineStrokeButton.click()
  const lineStrokePopover = page.getByRole('dialog', { name: '线条颜色 色板' })
  await lineStrokePopover.getByLabel('线条颜色 自定义 HEX', { exact: true }).fill('#14b8a6')
  await expect(lineNode.locator('line')).toHaveAttribute('stroke', '#14b8a6')
  await page.keyboard.press('Escape')

  const lineStrokeWidth = lineStroke.getByLabel('粗细', { exact: true })
  await lineStrokeWidth.fill('10')
  await lineStrokeWidth.press('Enter')
  await expect(lineStrokeWidth).toHaveValue('10')
  await expect(lineNode.locator('line')).toHaveAttribute('stroke-width', '8')
})

test('number inspector preserves precision when an unchanged field blurs', async ({ page }) => {
  await openNestedV3Draft(page, `scene-number-precision-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const x = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })

  await x.fill('495.123456')
  await x.press('Enter')
  const historyAfterCommit = await workspace.getAttribute('data-history-depth')
  await expect(x).toHaveValue('495.12')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  const storedX = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const draft = drafts[0]
    return draft?.document.slides[0].nodes.find((node: { id: string }) => node.id === 'scaled-root')?.x
  })
  expect(storedX).toBeCloseTo(520.123456, 8)

  await x.focus()
  await x.blur()
  await expect(workspace).toHaveAttribute('data-history-depth', historyAfterCommit ?? '')
  await expect(x).toHaveValue('495.12')
})

test('number inspector keeps negative decimal keyboard input intact', async ({ page }) => {
  await openNestedV3Draft(page, `scene-number-intermediate-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const x = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await x.focus()
  await x.press('Control+A')
  for (const key of ['-', '1', '2', '.', '5']) await x.press(key)
  await expect(x).toHaveValue('-12.5')
  await x.press('Enter')
  await expect(x).toHaveValue('-12.5')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
})

test('number inspector keeps sibling drafts while previous fields commit', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const geometry = page.getByTestId('inspector-geometry')
  const xInput = geometry.getByLabel('X', { exact: true })
  const yInput = geometry.getByLabel('Y', { exact: true })
  await geometry.locator('input[type="number"]').evaluateAll((inputs) => {
    const [x, y, width, height] = inputs as HTMLInputElement[]
    const setNativeValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    if (!x || !y || !width || !height || !setNativeValue) {
      throw new Error('geometry inputs unavailable')
    }
    x.focus()
    setNativeValue.call(x, '100')
    x.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    y.focus()
    setNativeValue.call(y, '160')
    y.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    width.focus()
    setNativeValue.call(width, '100')
    width.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    height.focus()
    setNativeValue.call(height, '100')
    height.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })

  await expect.poll(async () => (await freeformElementPositions(page))[0]?.x).toBe(100)
  await expect(yInput).toHaveValue('160')
  await expect(geometry.getByLabel('宽', { exact: true })).toHaveValue('100')
  await expect(geometry.getByLabel('高', { exact: true })).toHaveValue('100')
  await geometry.getByLabel('高', { exact: true }).blur()
  await expect.poll(() => freeformElementPositions(page)).toEqual([{ x: 100, y: 160 }])
})

test('numeric inspector blur is preserved when a pointer gesture is cancelled', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)

  const workspace = page.locator('.freeform-workspace')
  const geometry = page.getByTestId('inspector-geometry')
  const xInput = geometry.getByLabel('X', { exact: true })
  const widthInput = geometry.getByLabel('宽', { exact: true })
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  const before = await freeformElementBoxes(page)
  expect(before).toHaveLength(1)

  await xInput.fill(String(before[0].x + 40))
  const move = page.getByTestId('freeform-selection-move')
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  await move.dispatchEvent('pointerdown', {
    pointerId: 101,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 101,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{
    ...before[0],
    x: before[0].x + 40,
  }])
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))

  await widthInput.fill(String(before[0].width + 40))
  const resize = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).toBeTruthy()
  await resize.dispatchEvent('pointerdown', {
    pointerId: 102,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: resizeBox!.x + resizeBox!.width / 2,
    clientY: resizeBox!.y + resizeBox!.height / 2,
  })
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 102,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual([{
    ...before[0],
    x: before[0].x + 40,
    width: before[0].width + 40,
  }])
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
})

test('number inspector drops an old draft buffer when the draft identity changes', async ({ page }) => {
  await openNestedV3Draft(page, `scene-number-draft-switch-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'number-buffer-other-draft'
    source.title = 'Number buffer other draft'
    source.updatedAt += 1
    source.document.activeSlideId = 'number-buffer-slide'
    source.document.slides = [{
      ...source.document.slides[0],
      id: 'number-buffer-slide',
      name: 'Number buffer slide',
      nodes: source.document.slides[0].nodes.map((node: { id: string; x?: number }) => (
        node.id === 'scaled-root' ? { ...node, x: 120 } : node
      )),
    }]
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })

  await page.getByRole('button', { name: '保存草稿', exact: true }).evaluate(
    (button) => (button as HTMLButtonElement).click(),
  )
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const oldX = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })
  await oldX.fill('510')

  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).evaluate(
    (button) => (button as HTMLButtonElement).click(),
  )
  await page.locator('.draft-item', { hasText: 'Number buffer other draft' }).click()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const newX = page.getByTestId('inspector-geometry').getByLabel('X', { exact: true })
  await expect(newX).toHaveValue('95')
  await expect(page.locator('.freeform-workspace')).toHaveAttribute('data-history-depth', '0')
})

test('nested multi-selection hides unsupported flat alignment controls', async ({ page }) => {
  await openNestedV3Draft(page, `scene-nested-arrange-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scope text' }).click()
  await tree.getByRole('treeitem', { name: 'Visible leaf' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  const arrange = page.getByTestId('inspector-arrange')
  await expect(arrange).toBeVisible()
  await expect(arrange).not.toContainText('对齐与分布')
  await expect(arrange).toContainText('层级')
})

test('multi-selection with a locked descendant is visibly read only', async ({ page }) => {
  await openNestedV3Draft(page, `scene-multi-lock-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Outer group' }).click()
  await tree.getByRole('treeitem', { name: 'Underlay' }).focus()
  await page.keyboard.press('Space')
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await expect(page.getByTestId('freeform-lock-descendant-banner'))
    .toContainText('Locked inner')
  await expect(page.getByTestId('inspector-arrange')).toHaveCount(0)
  await expect(page.getByTestId('inspector-danger')).toHaveCount(0)
})

test('deep inspector breadcrumb keeps the current object discoverable', async ({ page }) => {
  await openNestedV3Draft(page, `scene-breadcrumb-${Date.now()}`, true)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Deep layer label remains readable' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  const breadcrumb = page.getByRole('navigation', { name: '对象路径' })
  const current = breadcrumb.locator('.freeform-inspector-breadcrumb-current')
  await expect(current).toContainText('Deep layer label remains readable')
  await expect(current).toHaveAttribute('title', /Deep layer label remains readable/)
  await expect.poll(() => current.evaluate((node) => node.getBoundingClientRect().width))
    .toBeGreaterThan(40)
})

test('linked group dimensions and lock states', async ({ page }) => {
  await openNestedV3Draft(page, `scene-group-properties-${Date.now()}`)
  const workspace = page.locator('.freeform-workspace')
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  await outer.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-lock-descendant-banner')).toContainText('包含锁定图层')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
  await expect(page.getByTestId('inspector-arrange')).toHaveCount(0)
  await expect(page.getByTestId('inspector-danger')).toHaveCount(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const lockedInner = tree.getByRole('treeitem', { name: 'Locked inner' })
  await lockedInner.getByRole('button', { name: '锁定图层 Locked inner' }).click()
  await outer.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const geometry = page.getByTestId('inspector-geometry')
  await expect(geometry).toBeVisible()
  const centerX = geometry.getByLabel('中心 X', { exact: true })
  const centerY = geometry.getByLabel('中心 Y', { exact: true })
  const width = geometry.getByLabel('宽', { exact: true })
  const height = geometry.getByLabel('高', { exact: true })
  const beforeCenterX = Number(await centerX.inputValue())
  const beforeCenterY = Number(await centerY.inputValue())
  const beforeWidth = Number(await width.inputValue())
  const beforeHeight = Number(await height.inputValue())
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await width.fill(String(beforeWidth * 1.2))
  await width.press('Enter')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(centerX).toHaveValue(String(beforeCenterX))
  await expect(centerY).toHaveValue(String(beforeCenterY))
  await expect(height).toHaveValue(String(beforeHeight * 1.2))

  const rotation = geometry.getByLabel('旋转', { exact: true })
  await rotation.fill('330')
  await rotation.press('Enter')
  await expect(centerX).toHaveValue(String(beforeCenterX))
  await expect(centerY).toHaveValue(String(beforeCenterY))

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await outer.getByRole('button', { name: '锁定图层 Outer group' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-lock-banner')).toContainText('已锁定')
  await expect(page.getByTestId('inspector-geometry')).toHaveCount(0)
})

test('delayed shape image fill cannot write into another draft with the same scene ids', async ({
  page,
}) => {
  await openNestedV3Draft(page, `shape-fill-draft-race-${Date.now()}`)

  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((value) => value.startsWith('slicer.drafts.'))
    if (!key) throw new Error('draft storage key missing')
    const drafts = JSON.parse(localStorage.getItem(key) ?? '[]')
    const source = structuredClone(drafts[0])
    source.id = 'shape-fill-race-target'
    source.title = 'Shape fill race target'
    source.updatedAt += 1
    localStorage.setItem(key, JSON.stringify([...drafts, source]))
  })
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByRole('button', { name: /^草稿(?: · \d+)?$/ })).toContainText('2')

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)

  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'delayed-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Shape fill race target' }).click()
  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill cannot write across account identity changes', async ({ page }) => {
  const accountSuffix = Date.now()
  await openNestedV3Draft(page, `shape-fill-user-race-${accountSuffix}-a`)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'cross-account-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByTestId('account-logout').click()
  await expect(page.getByTestId('account-login')).toBeVisible()
  await page.getByTestId('account-login').click()
  await registerUser(page, `shape-fill-user-race-${accountSuffix}-b`)
  await expect(page.getByTestId('account-logout')).toBeVisible()

  // B saves the same scene ids before A's pending read is released. A stale
  // completion would therefore be visible in B's active document and draft.
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  const bFillBefore = await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    if (!userId) throw new Error('session user missing after registration')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document?: { slides?: Array<{ nodes?: Array<{ id: string; fill?: unknown }> }> }
    }>
    const node = drafts.at(-1)?.document?.slides?.[0]?.nodes?.find((candidate) => (
      candidate.id === 'scaled-root'
    ))
    return node?.fill
  })
  expect(bFillBefore).toMatchObject({ type: 'solid' })

  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Scaled root leaf' })
    .click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const shapeFill = page.getByTestId('shape-fill-paint')
  await expect(shapeFill.getByTestId('paint-mode-solid')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  // Save after release so a late reducer update cannot hide behind an unsaved
  // in-memory state; the persisted B draft must still contain the original fill.
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  const bFillAfter = await page.evaluate(() => {
    const userId = localStorage.getItem('slicer.session.v1')
    if (!userId) throw new Error('session user missing after release')
    const drafts = JSON.parse(localStorage.getItem(`slicer.drafts.${userId}`) ?? '[]') as Array<{
      document?: { slides?: Array<{ nodes?: Array<{ id: string; fill?: unknown }> }> }
    }>
    const node = drafts.at(-1)?.document?.slides?.[0]?.nodes?.find((candidate) => (
      candidate.id === 'scaled-root'
    ))
    return node?.fill
  })
  expect(bFillAfter).toEqual(bFillBefore)

  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill survives the first save of the same document', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByTestId('workspace-tab-freeform').click()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await registerUser(page, `shape-fill-first-save-${Date.now()}`)
  await insertShape(page)

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'first-save-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
  await releaseShapeFillFileReaderGate(page)

  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await restoreShapeFillFileReaderGate(page)
})

test('shape image fill accepts only the newest pending upload', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))

  await installShapeFillFileReaderGate(page)
  const input = page.locator('.freeform-properties-tabpanel input.freeform-file')
  await input.setInputFiles({
    name: 'older-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)
  await input.setInputFiles({
    name: 'newer-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page, 2)

  await releaseShapeFillFileReaderGate(page, 2)
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await restoreShapeFillFileReaderGate(page)
})

test('shape image fill operations are isolated by target path', async ({ page }) => {
  await openNestedV3Draft(page, `shape-fill-target-isolation-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Visible leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'nested-target-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await tree.getByRole('treeitem', { name: 'Scaled root leaf' }).click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'root-target-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page, 2)

  await releaseShapeFillFileReaderGate(page, 2)
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(2)
  await restoreShapeFillFileReaderGate(page)
})

test('manual shape fill changes cancel a pending image upload', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  await installShapeFillFileReaderGate(page)
  const input = page.locator('.freeform-properties-tabpanel input.freeform-file')
  await input.setInputFiles({
    name: 'cancelled-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  const shapeFill = page.getByTestId('shape-fill-paint')
  await shapeFill.getByTestId('paint-mode-linear-gradient').click()
  await expect(shapeFill.getByTestId('paint-mode-linear-gradient')).toHaveClass(/\bon\b/)
  await releaseShapeFillFileReaderGate(page)

  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)
  await expect(page.getByTestId('freeform-shape')).toHaveCSS('background-image', /linear-gradient/)
  await restoreShapeFillFileReaderGate(page)
})

test('pending shape fill does not commit while a live pointer interaction is active', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()

  await installShapeFillFileReaderGate(page)
  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'live-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }
  await move.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'touch',
      clientX: x + 24,
      clientY: y + 18,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await releaseShapeFillFileReaderGate(page)
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-shape-image-fill')).toHaveCount(0)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'touch',
    }))
  })
  await restoreShapeFillFileReaderGate(page)
})

test('delayed shape image fill follows the original nested path after same-document selection changes', async ({
  page,
}) => {
  await openNestedV3Draft(page, `shape-fill-selection-race-${Date.now()}`)
  const tree = page.getByRole('tree', { name: '图层树' })

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const shapeRow = tree.getByRole('treeitem', { name: 'Visible leaf' })
  await shapeRow.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()

  await installShapeFillFileReaderGate(page)

  await page.locator('.freeform-properties-tabpanel input.freeform-file').setInputFiles({
    name: 'same-document-shape-fill.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expectShapeFillFileReaderStarted(page)

  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const textRow = tree.getByRole('treeitem', { name: 'Scope text' })
  await textRow.click()
  await expect(textRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]'))
    .toHaveCount(1)

  await releaseShapeFillFileReaderGate(page)
  await expect.poll(() => page.evaluate(() => {
    const images = JSON.parse(sessionStorage.getItem('slicer.images.v1') ?? '{}')
    return Object.keys(images).length
  })).toBeGreaterThan(0)

  await expect(textRow).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-scene-node-id="scope-text"][data-selected="true"]'))
    .toHaveCount(1)
  await shapeRow.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByTestId('freeform-shape-image-fill')).toBeVisible()
  await expect(page.getByTestId('shape-fill-paint').getByTestId('paint-mode-image'))
    .toHaveClass(/\bon\b/)

  await restoreShapeFillFileReaderGate(page)
})

test('groups non-contiguous layers from the panel and ungroups promoted paths', async ({ page }) => {
  await openNestedV3Draft(page, `group-panel-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const layerA = tree.getByRole('treeitem', { name: 'Layer A' })
  const layerC = tree.getByRole('treeitem', { name: 'Layer C' })
  await layerA.click()
  await layerC.focus()
  await page.keyboard.press('Space')
  await expect(layerA).toHaveAttribute('aria-selected', 'true')
  await expect(layerC).toHaveAttribute('aria-selected', 'true')

  const historyBefore = Number(await workspace.getAttribute('data-history-depth'))
  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(page.getByTestId('freeform-slide-meta')).not.toContainText('已保存')

  const selectedGroup = page.locator('.freeform-scene-group[data-selected="true"]')
  await expect(selectedGroup).toHaveCount(1)
  const groupId = await selectedGroup.getAttribute('data-scene-node-id')
  expect(groupId).toBeTruthy()
  const rootIdsAfterGroup = await page.locator('.freeform-artwork-clip > [data-scene-node-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
  expect(rootIdsAfterGroup).toEqual(['layer-b', groupId, 'layer-d', 'locked-container'])
  const groupedChildIds = await selectedGroup.locator(':scope > [data-scene-node-id]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-scene-node-id')))
  expect(groupedChildIds).toEqual(['layer-a', 'layer-c'])

  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 2))
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)
  const selectedLabels = await tree.locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(selectedLabels).toEqual(['Layer C', 'Layer A'])
  const allIds = await page.getByTestId('freeform-canvas').locator('[data-scene-node-id]')
    .evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-scene-node-id')).filter(Boolean),
  )
  expect(new Set(allIds).size).toBe(allIds.length)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(workspace).toHaveAttribute('data-history-depth', String(historyBefore + 1))
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(page.getByTestId('freeform-canvas').locator('[data-selected="true"]')).toHaveCount(0)
})

test('group and ungroup shortcuts share the command layer for nested groups', async ({ page }) => {
  await openNestedV3Draft(page, `group-shortcuts-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ControlOrMeta+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(workspace).toHaveAttribute('data-history-depth', '1')

  const layerC = tree.getByRole('treeitem', { name: 'Layer C' })
  await layerC.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ControlOrMeta+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(2)
  await expect(workspace).toHaveAttribute('data-history-depth', '2')

  await page.keyboard.press('ControlOrMeta+Shift+g')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)
  await expect(workspace).toHaveAttribute('data-history-depth', '3')
  const selectedLabels = await tree.locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label')))
  expect(selectedLabels).toEqual(['Layer C', '组'])
})

test('grouping rejects locked selections and locked parent insertion without dirty history', async ({ page }) => {
  await openNestedV3Draft(page, `group-locked-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const lockedA = tree.getByRole('treeitem', { name: 'Locked child A' })
  const lockedB = tree.getByRole('treeitem', { name: 'Locked child B' })
  await lockedA.click()
  await lockedB.focus()
  await page.keyboard.press('Space')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const savedMeta = await page.getByTestId('freeform-slide-meta').textContent()

  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
  await expect(page.getByTestId('freeform-slide-meta')).toHaveText(savedMeta ?? '')

  await page.keyboard.press('ControlOrMeta+g')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')

  await page.getByTestId('insert-text').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toHaveCount(0)

  await tree.getByRole('treeitem', { name: 'Locked container' }).click()
  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('锁定')
})

test('group command rejects a single layer without changing history', async ({ page }) => {
  await openNestedV3Draft(page, `group-single-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const workspace = page.locator('.freeform-workspace')
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })
    .click()
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await page.getByTestId('freeform-group-selection').click()
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByRole('alert')).toContainText('至少选择两个同级图层')
})

test('focused ungroup button keeps Enter as a native button command', async ({ page }) => {
  await openNestedV3Draft(page, `group-button-enter-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  await page.getByTestId('freeform-group-selection').click()
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(1)

  const ungroupButton = page.getByTestId('freeform-ungroup-selection')
  await ungroupButton.focus()
  await page.keyboard.press('Enter')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', '')
})

test('canvas group scope enters by double click or Enter and exits one level per Escape', async ({ page }) => {
  await openNestedV3Draft(page, `group-scope-${Date.now()}`, false, scopeNavigationDraft)
  const workspace = page.locator('.freeform-workspace')
  const canvas = page.getByTestId('freeform-canvas')
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  await leaf.click()
  await expect(page.locator('[data-scene-node-id="scope-outer"][data-selected="true"]')).toHaveCount(1)
  await leaf.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await expect(canvas.locator('[data-selected="true"]')).toHaveCount(0)
  await expect(page.getByTestId('freeform-scope-breadcrumb')).toContainText('页面')
  await expect(page.getByTestId('freeform-scope-breadcrumb')).toContainText('Scope outer')

  await page.locator('[data-scene-node-id="scope-leaf"]').click()
  await expect(page.locator('[data-scene-node-id="scope-inner"][data-selected="true"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await expect(canvas.locator('[data-selected="true"]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', '')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(page.getByTestId('freeform-slide-meta')).toContainText('已保存')
})

test('nested text consumes the first Escape before leaving its group scope', async ({ page }) => {
  await openNestedV3Draft(page, `group-text-escape-${Date.now()}`, false, textScopeDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const editable = page.locator('[data-scene-node-id="scope-text-edit"] [contenteditable="true"]')
  await page.locator('[data-scene-node-id="scope-text-edit"]').dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await editable.click()
  await expect(editable).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(editable).not.toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-active-group-path', '')
})

test('IME composition keeps Escape inside nested text editing until composition ends', async ({ page }) => {
  await openNestedV3Draft(page, `group-text-ime-escape-${Date.now()}`, false, textScopeDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const editable = page.locator('[data-scene-node-id="scope-text-edit"] [contenteditable="true"]')
  await page.locator('[data-scene-node-id="scope-text-edit"]').dblclick()
  await page.getByTestId('freeform-canvas').locator('[data-scene-node-id="scope-text-edit"]')
    .click()
  await expect(editable).toBeFocused()
  await editable.dispatchEvent('compositionstart')

  await page.keyboard.press('Escape')
  await expect(editable).toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')

  await editable.dispatchEvent('compositionend')
  await page.keyboard.press('Escape')
  await expect(editable).not.toBeFocused()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
})

test('paint popover consumes Escape before leaving a nested group scope', async ({ page }) => {
  await openNestedV3Draft(page, `group-paint-escape-${Date.now()}`, false, scopeNavigationDraft)
  const canvas = page.getByTestId('freeform-canvas')
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')

  await leaf.click()
  await leaf.dblclick()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer')
  await leaf.click()
  await page.keyboard.press('Enter')
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await leaf.click()
  await expect(leaf).toHaveAttribute('data-selected', 'true')

  await page.getByRole('tab', { name: '属性', exact: true }).click()
  const trigger = page.getByTestId('shape-fill-paint').getByTestId('paint-color-button')
  await trigger.click()
  const popover = page.getByRole('dialog', { name: '填充 颜色 色板' })
  await expect(popover).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(canvas).toHaveAttribute('data-active-group-path', 'scope-outer/scope-inner')
  await expect(leaf).toHaveAttribute('data-selected', 'true')
  await expect(trigger).toBeFocused()
})

test('panel structure commands reject while a live pointer interaction is active', async ({ page }) => {
  await openNestedV3Draft(page, `group-live-move-${Date.now()}`, false, groupingDraft)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  await tree.getByRole('treeitem', { name: 'Layer A' }).click()
  const layerB = tree.getByRole('treeitem', { name: 'Layer B' })
  await layerB.focus()
  await page.keyboard.press('Space')
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }
  await move.dispatchEvent('pointerdown', {
    pointerId: 81,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'touch',
      clientX: x + 40,
      clientY: y + 30,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  const rootOrderBeforeReorder = await tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')))
  const liveGeometryBeforeReorder = await freeformElementBoxes(page)
  await tree.getByRole('treeitem', { name: 'Layer A' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect.poll(() => freeformElementBoxes(page)).toEqual(liveGeometryBeforeReorder)
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .resolves.toEqual(rootOrderBeforeReorder)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer A' }).dragTo(
    tree.getByRole('treeitem', { name: 'Layer D' }),
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect.poll(() => freeformElementBoxes(page)).toEqual(liveGeometryBeforeReorder)
  await expect(tree.locator('[role="treeitem"][aria-level="1"]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))))
    .resolves.toEqual(rootOrderBeforeReorder)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer A' }).focus()
  await page.keyboard.press('F2')
  const renameInput = page.getByRole('textbox', { name: '重命名图层' })
  await renameInput.fill('Blocked rename')
  await renameInput.press('Enter')
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: 'Layer A' })).toHaveCount(1)
  await expect(tree.getByRole('treeitem', { name: 'Blocked rename' })).toHaveCount(0)

  await page.getByRole('button', { name: '关闭提示' }).click()
  await page.getByTestId('insert-text').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: '文本' })).toHaveCount(0)

  await page.getByTestId('freeform-group-selection').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await expect(tree.getByRole('treeitem', { name: '组' })).toHaveCount(0)

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 81,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')

  await page.getByRole('button', { name: '关闭提示' }).click()
  await tree.getByRole('treeitem', { name: 'Layer C' }).click()
  const resize = page.getByTestId('freeform-selection-resize')
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).toBeTruthy()
  const resizeStart = {
    x: resizeBox!.x + resizeBox!.width / 2,
    y: resizeBox!.y + resizeBox!.height / 2,
  }
  await resize.dispatchEvent('pointerdown', {
    pointerId: 82,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: resizeStart.x,
    clientY: resizeStart.y,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'resize',
  )
  await page.getByTestId('freeform-ungroup-selection').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 82,
      pointerType: 'touch',
    }))
  })
})

test('save and export reject a transient live pointer snapshot', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }

  await move.dispatchEvent('pointerdown', {
    pointerId: 83,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 83,
      pointerType: 'touch',
      clientX: x + 32,
      clientY: y + 20,
    }))
  }, start)
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.getByRole('dialog', { name: '登录' })).toHaveCount(0)

  await page.getByRole('button', { name: '关闭提示' }).click()
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.getByTestId('freeform-primary-export').click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await page.waitForTimeout(100)
  expect(downloads).toEqual([])
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 83,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
})

test('a second pointer cannot replace an active transform owner', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const workspace = page.locator('.freeform-workspace')
  const historyBefore = await workspace.getAttribute('data-history-depth')
  const before = await freeformElementBoxes(page)
  const move = page.getByTestId('freeform-selection-move').first()
  const resize = page.getByTestId('freeform-selection-resize').first()
  const moveBox = await move.boundingBox()
  const resizeBox = await resize.boundingBox()
  expect(moveBox).toBeTruthy()
  expect(resizeBox).toBeTruthy()

  await move.dispatchEvent('pointerdown', {
    pointerId: 85,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: moveBox!.x + moveBox!.width / 2,
    clientY: moveBox!.y + moveBox!.height / 2,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await resize.dispatchEvent('pointerdown', {
    pointerId: 86,
    pointerType: 'touch',
    isPrimary: false,
    button: 0,
    clientX: resizeBox!.x + resizeBox!.width / 2,
    clientY: resizeBox!.y + resizeBox!.height / 2,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 86,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 85,
      pointerType: 'touch',
    }))
  })
  await expect.poll(() => freeformElementBoxes(page)).toEqual(before)
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('marquee pointercancel cleans up and ignores foreign pointer streams', async ({ page }) => {
  await openFreeform(page)
  await insertShape(page)
  const canvas = page.getByTestId('freeform-canvas')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).toBeTruthy()
  const start = {
    x: canvasBox!.x + 8,
    y: canvasBox!.y + 8,
  }

  await canvas.evaluate((node, point) => {
    const target = node.querySelector('.freeform-artwork-clip')
    if (!target) throw new Error('artwork target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 87,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
    }))
  }, start)
  await page.evaluate(({ x, y }) => {
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 88,
      pointerType: 'touch',
      clientX: x + 300,
      clientY: y + 300,
    }))
  }, start)
  await expect(page.locator('.freeform-marquee')).toHaveCount(1)
  const marqueeStyle = await page.locator('.freeform-marquee').getAttribute('style')

  await page.evaluate(({ x, y }) => {
    const target = document.querySelector<HTMLElement>('.freeform-artwork-clip')
    if (!target) throw new Error('artwork target missing')
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 89,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
      clientX: x + 10,
      clientY: y + 10,
    }))
  }, start)
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.locator('.freeform-marquee')).toHaveAttribute('style', marqueeStyle ?? '')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 88,
      pointerType: 'touch',
    }))
  })
  await expect(page.locator('.freeform-marquee')).toHaveAttribute('style', marqueeStyle ?? '')
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 87,
      pointerType: 'touch',
    }))
  })
  await expect(page.locator('.freeform-marquee')).toHaveCount(0)
})

test('layer tree reports structural read-only state for a group with locked descendants', async ({ page }) => {
  await openNestedV3Draft(page, `group-locked-descendant-reorder-${Date.now()}`)
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const tree = page.getByRole('tree', { name: '图层树' })
  const workspace = page.locator('.freeform-workspace')
  const outer = tree.getByRole('treeitem', { name: 'Outer group' })
  const underlay = tree.getByRole('treeitem', { name: 'Underlay' })
  await underlay.click()
  const historyBefore = await workspace.getAttribute('data-history-depth')

  await outer.focus()
  await expect(outer).toHaveAttribute('aria-selected', 'false')
  await expect(outer).toHaveAttribute('draggable', 'false')
  await page.keyboard.press('Alt+ArrowUp')
  await expect(page.getByTestId('freeform-layer-live')).toContainText('锁定')
  await expect(workspace).toHaveAttribute('data-history-depth', historyBefore ?? '')
})

test('opening another draft cannot be rolled back by an old pointer cancellation', async ({ page }) => {
  await openNestedV3Draft(page, `group-live-open-${Date.now()}`, false, groupingDraft)
  const workspace = page.locator('.freeform-workspace')
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  await page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })
    .click()
  const move = page.getByTestId('freeform-selection-move').first()
  const moveBox = await move.boundingBox()
  expect(moveBox).toBeTruthy()
  const start = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  }

  await move.dispatchEvent('pointerdown', {
    pointerId: 84,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: start.x,
    clientY: start.y,
  })
  await expect(page.getByTestId('freeform-selection-overlay')).toHaveAttribute(
    'data-live-interaction',
    'move',
  )

  await page.getByRole('button', { name: /^草稿(?: · \d+)?$/ }).click()
  await page.locator('.draft-item', { hasText: 'Nested v3 scene' }).click()
  await expect(page.getByRole('alert')).toContainText('请先结束当前变换')
  await expect(page.locator('.drawer')).toBeVisible()
  await expect(workspace).toHaveAttribute('data-history-depth', '0')

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      pointerId: 84,
      pointerType: 'touch',
    }))
  })
  await expect(page.getByRole('tree', { name: '图层树' })
    .getByRole('treeitem', { name: 'Layer A' })).toHaveCount(1)
})

test('nested insertion preserves the active scope pre-insertion world center', async ({ page }) => {
  const fixture = offCenterScopeDraft()
  const parent = fixture.document.slides[0].nodes[0] as unknown as FreeformSceneNode
  if (parent.type !== 'group') throw new Error('offset fixture parent must be a group')
  const bounds = sceneNodesBoundsInParent(parent.children)
  if (!bounds) throw new Error('offset fixture bounds missing')
  const localCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  const worldCenter = transformPoint(
    groupLocal(parent.x, parent.y, parent.rotation, parent.scale),
    localCenter,
  )

  await openNestedV3Draft(page, `group-offset-center-${Date.now()}`, false, () => structuredClone(fixture))
  const anchor = page.locator('[data-scene-node-id="offset-anchor"]')
  await anchor.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'offset-parent')
  const parentLocator = page.locator('[data-scene-node-id="offset-parent"]')
  const leafWorldCenter = async (leaf: import('@playwright/test').Locator) => {
    const geometry = await leaf.evaluate((node) => {
      const parseNumber = (value: string, label: string) => {
        const parsed = Number.parseFloat(value)
        if (!Number.isFinite(parsed)) throw new Error(`invalid ${label}: ${value}`)
        return parsed
      }
      const readTransform = (element: HTMLElement) => {
        const rotation = element.style.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]
        const scale = element.style.transform.match(/scale\((-?[\d.]+)\)/)?.[1]
        if (rotation === undefined || scale === undefined) {
          throw new Error(`invalid scene transform: ${element.style.transform}`)
        }
        return {
          x: parseNumber(element.style.left, 'x'),
          y: parseNumber(element.style.top, 'y'),
          rotation: parseNumber(rotation, 'rotation'),
          scale: parseNumber(scale, 'scale'),
        }
      }
      const element = node as HTMLElement
      const groups: ReturnType<typeof readTransform>[] = []
      let ancestor = element.parentElement?.closest<HTMLElement>('.freeform-scene-group') ?? null
      while (ancestor) {
        groups.push(readTransform(ancestor))
        ancestor = ancestor.parentElement?.closest<HTMLElement>('.freeform-scene-group') ?? null
      }
      return {
        leaf: {
          x: parseNumber(element.style.left, 'leaf x'),
          y: parseNumber(element.style.top, 'leaf y'),
          width: parseNumber(element.style.width, 'leaf width'),
          height: parseNumber(element.style.height, 'leaf height'),
        },
        groups,
      }
    })
    let center = {
      x: geometry.leaf.x + geometry.leaf.width / 2,
      y: geometry.leaf.y + geometry.leaf.height / 2,
    }
    geometry.groups.forEach((group) => {
      center = transformPoint(
        groupLocal(group.x, group.y, group.rotation, group.scale),
        center,
      )
    })
    return center
  }

  await insertText(page)
  const textNode = parentLocator.locator(':scope > [data-selected="true"]')
  const textCenter = await leafWorldCenter(textNode)
  expect(textCenter.x).toBeCloseTo(worldCenter.x, 3)
  expect(textCenter.y).toBeCloseTo(worldCenter.y, 3)

  await insertShape(page)
  const shapeNode = parentLocator.locator(':scope > [data-selected="true"]')
  const shapeCenter = await leafWorldCenter(shapeNode)
  expect(shapeCenter.x).toBeCloseTo(worldCenter.x, 3)
  expect(shapeCenter.y).toBeCloseTo(worldCenter.y, 3)
})

test('inserts all new scene nodes under the active group path', async ({ page }) => {
  await openNestedV3Draft(page, `group-insert-${Date.now()}`, false, scopeNavigationDraft)
  const leaf = page.locator('[data-scene-node-id="scope-leaf"]')
  await leaf.dblclick()
  await expect(page.getByTestId('freeform-canvas')).toHaveAttribute('data-active-group-path', 'scope-outer')
  const outer = page.locator('[data-scene-node-id="scope-outer"]')
  const directLeaves = () => outer.locator(':scope > [data-scene-leaf="true"]')
  await expect(directLeaves()).toHaveCount(1)

  await insertText(page)
  await expect(directLeaves()).toHaveCount(2)
  await insertShape(page)
  await expect(directLeaves()).toHaveCount(3)
  await page.getByTestId('insert-line').click()
  await page.getByRole('menu', { name: '线条' }).getByRole('menuitem', { name: '直线', exact: true }).click()
  await expect(directLeaves()).toHaveCount(4)
  await page.locator('input.freeform-file').first().setInputFiles({
    name: 'nested-image.png',
    mimeType: 'image/png',
    buffer: TEST_PNG,
  })
  await expect(directLeaves()).toHaveCount(5)
  await expect(outer.locator(':scope > [data-selected="true"]')).toHaveCount(1)
  const canvasBox = await page.getByTestId('freeform-canvas').boundingBox()
  const insertedBoxes = await directLeaves().evaluateAll((nodes) => nodes.slice(1).map((node) => {
    const box = node.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }))
  expect(canvasBox).not.toBeNull()
  insertedBoxes.forEach((box) => {
    expect(box.right).toBeGreaterThan(canvasBox!.x)
    expect(box.bottom).toBeGreaterThan(canvasBox!.y)
    expect(box.left).toBeLessThan(canvasBox!.x + canvasBox!.width)
    expect(box.top).toBeLessThan(canvasBox!.y + canvasBox!.height)
  })
})

function panelLiveRegion(page: import('@playwright/test').Page) {
  return page.locator('[data-testid="freeform-layer-live"]')
}
