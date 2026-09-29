// 上次会话记忆：刷新后恢复上一次使用的工作区与最近打开的草稿。
//
// 记录按账号隔离（`slicer.last-session.<uid>`），与草稿存储同一套
// localStorage 约定：读取容忍损坏数据（回退默认值），写入在存储被禁用
// 或写满时静默放弃——恢复功能自动降级，绝不影响编辑本身。

import type { WorkspaceMode } from './workspaces/types'

const KEY_PREFIX = 'slicer.last-session.'

const DEFAULT_SESSION: LastSession = {
  mode: 'markdown-card',
  markdownDraftId: null,
  freeformDraftId: null,
}

export interface LastSession {
  /** 上次使用的工作区。 */
  mode: WorkspaceMode
  /** Markdown 工作台最近打开的草稿 id；null 表示无记录。 */
  markdownDraftId: string | null
  /** 自由画布最近打开的草稿 id；null 表示无记录。 */
  freeformDraftId: string | null
}

function keyFor(userId: string): string {
  return KEY_PREFIX + userId
}

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === 'markdown-card' || value === 'freeform-slide'
}

function isDraftId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** 读取某账号的上次会话记录；无记录或数据损坏时返回默认值。 */
export function readLastSession(userId: string): LastSession {
  if (!userId) return { ...DEFAULT_SESSION }
  let parsed: unknown = null
  try {
    const raw = localStorage.getItem(keyFor(userId))
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    return { ...DEFAULT_SESSION }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_SESSION }
  }
  const record = parsed as Record<string, unknown>
  return {
    mode: isWorkspaceMode(record.mode) ? record.mode : DEFAULT_SESSION.mode,
    markdownDraftId: isDraftId(record.markdownDraftId) ? record.markdownDraftId : null,
    freeformDraftId: isDraftId(record.freeformDraftId) ? record.freeformDraftId : null,
  }
}

/** 合并写入某账号的上次会话记录；存储不可用时静默放弃。 */
export function updateLastSession(userId: string, patch: Partial<LastSession>): void {
  if (!userId) return
  const next: LastSession = { ...readLastSession(userId), ...patch }
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(next))
  } catch {
    // 浏览器存储被禁用或已满：放弃记录即可，刷新恢复自动降级。
  }
}
