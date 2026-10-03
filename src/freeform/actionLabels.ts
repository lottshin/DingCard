import type { FreeformAction } from './types'

/** Human timeline label for one committed edit action. */
export function describeFreeformAction(action: FreeformAction): string {
  switch (action.type) {
    case 'slide/add-after-active': return '新增页面'
    case 'slide/duplicate': return '复制页面'
    case 'slide/insert': return action.replaceSlideId !== undefined ? '替换页面' : '插入页面'
    case 'slide/delete': return '删除页面'
    case 'slide/select': return '切换页面'
    case 'slide/reorder': return '调整页面顺序'
    case 'slide/update':
      if (action.patch?.background && !action.patch?.name) return '更改页面背景'
      if (action.patch?.name && !action.patch?.background) return '重命名页面'
      return '更新页面'
    case 'slide/resize': return '调整页面尺寸'
    case 'guides/set': return '调整参考线'
    case 'document/restyle':
      if (action.palette !== undefined) return '更换配色'
      if (action.fontSet !== undefined) return '更换字体组合'
      return action.fonts !== undefined && action.colors === undefined ? '替换字体' : '替换颜色'
    case 'node/set-locked': return action.locked ? '锁定对象' : '解锁对象'
    case 'node/set-hidden': return action.hidden ? '隐藏对象' : '显示对象'
    case 'node/rename': return '重命名对象'
    case 'node/update-content': return '编辑内容'
    case 'node/update-style':
      if (
        action.updates.length > 0
        && action.updates.every((update) => (
          Object.keys(update.patch).length === 1 && 'points' in update.patch
        ))
      ) {
        return '调整顶点'
      }
      return '更改样式'
    case 'node/update-geometry': return '移动对象'
    case 'node/update-image-crop': return '调整裁切'
    case 'node/delete': return '删除对象'
    case 'node/reorder': return '调整层级'
    case 'node/reorder-above': return '调整层级'
    case 'node/clone': return '复制对象'
    case 'node/insert-children': return '插入对象'
    case 'group/create': return '编组'
    case 'group/ungroup': return '解组'
    default: return '编辑'
  }
}
