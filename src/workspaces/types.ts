import type { User } from '../auth'
import type { Draft } from '../drafts'
import type { TemplateDefinition } from '../templates/types'
import type { Mode } from '../useAppTheme'

export type WorkspaceMode = 'markdown-card' | 'freeform-slide'

/** One-shot instruction from the workbench to an editor; `nonce` makes each unique. */
export type WorkspaceRequest =
  | { nonce: number; kind: 'open'; draftId: string }
  | { nonce: number; kind: 'new'; platformId: string | null; width: number | null; height: number | null }
  | { nonce: number; kind: 'template'; template: TemplateDefinition }
  | { nonce: number; kind: 'import'; url: string; title: string | null }
  | { nonce: number; kind: 'removed'; draftId: string }
  | { nonce: number; kind: 'renamed'; draftId: string; title: string }

export interface WorkspaceMeta {
  title: string
  /** Saved project currently open, if any. */
  draftId: string | null
  /** Edits that leaving would lose: a save that failed, or edits waiting for their account to sign back in. */
  unsaved: boolean
}

/** What the app shell lends every editor's top bar. */
export interface EditorChrome {
  theme: Mode
  authStatus: 'checking' | 'ready' | 'error'
  onHome: () => void
  onToggleTheme: () => void
  onRetryAuth: () => void
  onLogout: () => void
}

export interface WorkspaceShellProps {
  isActive: boolean
  /** The signed-in account, if any. */
  user: User | null
  /**
   * Whose projects the editor opens and saves: the account, this device's
   * guest, or null while the session is still being checked.
   */
  ownerId: string | null
  /** Guest projects just moved into the account (guest id -> moved project). */
  transfer?: ReadonlyMap<string, Draft> | null
  requestAuth: () => void
  chrome: EditorChrome
  request?: WorkspaceRequest | null
  onMetaChange?: (meta: WorkspaceMeta) => void
}
