interface OperationNoticeProps {
  title: string
  detail?: string
  onDismiss: () => void
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

export function OperationNotice({
  title,
  detail,
  onDismiss,
  onRetry,
  retryLabel = '重试',
  className = '',
}: OperationNoticeProps) {
  return (
    <div
      className={`operation-notice ${className}`.trim()}
      role="alert"
      aria-atomic="true"
    >
      <span className="operation-notice-mark" aria-hidden="true" />
      <div className="operation-notice-copy">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      <div className="operation-notice-actions">
        {onRetry && (
          <button type="button" className="operation-notice-retry" onClick={onRetry}>
            {retryLabel}
          </button>
        )}
        <button
          type="button"
          className="operation-notice-dismiss"
          aria-label="关闭提示"
          title="关闭提示"
          onClick={onDismiss}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8m0-8-8 8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
