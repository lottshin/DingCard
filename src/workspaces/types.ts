import type { Asset } from '../assets'
import type { User } from '../auth'
import type { TemplateDefinition } from '../templates/types'

export type WorkspaceMode = 'markdown-card' | 'freeform-slide'

/** One-shot instruction from the workbench to an editor; `nonce` makes each unique. */
export type WorkspaceRequest =
  | { nonce: number; kind: 'open'; draftId: string }
  | { nonce: number; kind: 'new'; platformId: string | null; width: number | null; height: number | null }
  | { nonce: number; kind: 'template'; template: TemplateDefinition }
  | { nonce: number; kind: 'removed'; draftId: string }
  /** Put a library image into the open document, as an edit. */
  | { nonce: number; kind: 'insert-asset'; asset: Asset }

export interface WorkspaceMeta {
  title: string
  /** Saved draft currently open, if any. */
  draftId: string | null
  /** Edited since it was last opened or saved. */
  dirty: boolean
}

export interface WorkspaceShellProps {
  isActive: boolean
  user: User | null
  requestAuth: () => void
  request?: WorkspaceRequest | null
  onMetaChange?: (meta: WorkspaceMeta) => void
}
