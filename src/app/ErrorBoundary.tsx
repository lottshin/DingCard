// When a part of the app throws while it draws, React takes down everything
// under the nearest error boundary; with none, the whole page goes blank
// (black in the dark theme). These boundaries keep a failure to the part that
// failed — one editor, the workbench, or at worst the whole app — and put the
// error and a way back where it was.

import { Component, type ReactNode } from 'react'
import { t } from '../i18n'
import { navigate, routes } from './router'

interface ErrorBoundaryProps {
  children: ReactNode
  /** What the message says failed. */
  scope: 'editor' | 'page'
  /** A new value after a failure draws the part again: another project opened, another page visited. */
  resetKey?: unknown
  /** Stand in for the whole window (the outermost boundary, with nothing around it). */
  fullPage?: boolean
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && !Object.is(previous.resetKey, this.props.resetKey)) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    return error ? <CrashFallback error={error} scope={this.props.scope} fullPage={this.props.fullPage} /> : this.props.children
  }
}

/** The error in place of what failed: 重新加载, or 回到首页 (loaded fresh, so no editor reopens what failed). */
export function CrashFallback({ error, scope, fullPage = false }: { error: Error; scope: 'editor' | 'page'; fullPage?: boolean }) {
  return (
    <div className={fullPage ? 'crash-fallback is-full-page' : 'crash-fallback'} role="alert" data-testid="crash-fallback">
      <b>{scope === 'editor' ? t('编辑器出错了') : t('页面出错了')}</b>
      <code className="crash-fallback-error">{error.message || error.name}</code>
      <div className="crash-fallback-actions">
        <button className="primary" type="button" onClick={() => window.location.reload()}>{t('重新加载')}</button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            navigate(routes.home)
            window.location.reload()
          }}
        >
          {t('回到首页')}
        </button>
      </div>
    </div>
  )
}
