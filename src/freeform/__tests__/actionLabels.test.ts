import { describe, expect, it } from 'vitest'

import { describeFreeformAction } from '../actionLabels'
import type { FreeformAction } from '../types'

const action = (partial: Record<string, unknown>): FreeformAction =>
  partial as unknown as FreeformAction

describe('freeform action labels', () => {
  it('labels slide actions distinctly', () => {
    expect(describeFreeformAction(action({ type: 'slide/add-after-active' }))).toBe('新增页面')
    expect(describeFreeformAction(action({ type: 'slide/duplicate', slideId: 'a' }))).toBe('复制页面')
    expect(describeFreeformAction(action({ type: 'slide/delete', slideId: 'a' }))).toBe('删除页面')
    expect(describeFreeformAction(action({ type: 'slide/select', slideId: 'a' }))).toBe('切换页面')
    expect(describeFreeformAction(action({
      type: 'slide/reorder', slideId: 'a', targetIndex: 0,
    }))).toBe('调整页面顺序')
    expect(describeFreeformAction(action({
      type: 'slide/update', slideId: 'a', patch: { name: 'x' },
    }))).toBe('重命名页面')
    expect(describeFreeformAction(action({
      type: 'slide/update', slideId: 'a', patch: { background: { type: 'solid', color: '#fff' } },
    }))).toBe('更改页面背景')
    expect(describeFreeformAction(action({
      type: 'slide/resize', slideId: 'a', width: 100, height: 100,
    }))).toBe('调整页面尺寸')
  })

  it('labels node and group actions by what the user did', () => {
    expect(describeFreeformAction(action({
      type: 'node/set-locked', slideId: 'a', path: ['n'], locked: true,
    }))).toBe('锁定对象')
    expect(describeFreeformAction(action({
      type: 'node/set-hidden', slideId: 'a', path: ['n'], hidden: false,
    }))).toBe('显示对象')
    expect(describeFreeformAction(action({
      type: 'node/update-content', slideId: 'a', updates: [],
    }))).toBe('编辑内容')
    expect(describeFreeformAction(action({
      type: 'node/update-style', slideId: 'a', updates: [],
    }))).toBe('更改样式')
    expect(describeFreeformAction(action({
      type: 'node/update-style', slideId: 'a', updates: [{
        path: ['line-1'], patch: { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
      }],
    }))).toBe('调整顶点')
    expect(describeFreeformAction(action({
      type: 'node/update-geometry', slideId: 'a', updates: [],
    }))).toBe('移动对象')
    expect(describeFreeformAction(action({
      type: 'node/delete', slideId: 'a', parentPath: [], nodeIds: ['n'],
    }))).toBe('删除对象')
    expect(describeFreeformAction(action({
      type: 'node/insert-children', slideId: 'a', parentPath: [], nodes: [],
    }))).toBe('插入对象')
    expect(describeFreeformAction(action({
      type: 'group/create', slideId: 'a', parentPath: [], nodeIds: [],
    }))).toBe('编组')
    expect(describeFreeformAction(action({
      type: 'group/ungroup', slideId: 'a', parentPath: [], groupIds: [], mode: 'one-level',
    }))).toBe('解组')
  })
})
