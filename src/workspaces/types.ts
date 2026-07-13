import type { User } from '../auth'

export type WorkspaceMode = 'markdown-card' | 'freeform-slide'

export interface WorkspaceShellProps {
  isActive: boolean
  user: User | null
  requestAuth: () => void
}
