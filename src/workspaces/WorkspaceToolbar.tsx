import type { ReactNode } from 'react'

interface WorkspaceToolbarProps {
  testId: string
  label: string
  className?: string
  children: ReactNode
}

export function WorkspaceToolbar({ testId, label, className, children }: WorkspaceToolbarProps) {
  const classes = ['workspace-toolbar', className].filter(Boolean).join(' ')

  return (
    <header className={classes} data-testid={testId} aria-label={label}>
      {children}
    </header>
  )
}

export function ToolbarGroup({
  side = 'left',
  children,
}: {
  side?: 'left' | 'right'
  children: ReactNode
}) {
  return <div className={`toolbar-group toolbar-group-${side}`}>{children}</div>
}

export function ToolbarDivider() {
  return <span className="toolbar-divider" aria-hidden="true" />
}
