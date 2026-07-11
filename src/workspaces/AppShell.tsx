import { useState } from 'react'
import { FreeformWorkspace } from '../freeform/FreeformWorkspace'
import { MarkdownWorkspace } from './markdown/MarkdownWorkspace'
import type { WorkspaceMode } from './types'

export function AppShell() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('markdown-card')

  return (
    <div className="app-shell" data-workspace={workspaceMode}>
      <div className="workspace-switch" role="tablist" aria-label="工作区">
        <button
          type="button"
          className={workspaceMode === 'markdown-card' ? 'workspace-tab on' : 'workspace-tab'}
          onClick={() => setWorkspaceMode('markdown-card')}
          aria-selected={workspaceMode === 'markdown-card'}
        >
          Markdown 卡片
        </button>
        <button
          type="button"
          className={workspaceMode === 'freeform-slide' ? 'workspace-tab on' : 'workspace-tab'}
          onClick={() => setWorkspaceMode('freeform-slide')}
          aria-selected={workspaceMode === 'freeform-slide'}
        >
          自由编辑
        </button>
      </div>

      <div className="workspace-panel" hidden={workspaceMode !== 'markdown-card'}>
        <MarkdownWorkspace />
      </div>
      <div className="workspace-panel" hidden={workspaceMode !== 'freeform-slide'}>
        <FreeformWorkspace />
      </div>
    </div>
  )
}
