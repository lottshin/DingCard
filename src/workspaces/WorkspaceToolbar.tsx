import { useEffect, useRef, type ReactNode } from 'react'

interface WorkspaceToolbarProps {
  testId: string
  label: string
  className?: string
  disabled?: boolean
  children: ReactNode
}

export function WorkspaceToolbar({
  testId,
  label,
  className,
  disabled = false,
  children,
}: WorkspaceToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const classes = ['workspace-toolbar', className, disabled ? 'is-disabled' : '']
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (disabled) root.setAttribute('inert', '')
    else root.removeAttribute('inert')
  }, [disabled])

  return (
    <div
      ref={rootRef}
      className={classes}
      data-testid={testId}
      role="toolbar"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      {children}
    </div>
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
