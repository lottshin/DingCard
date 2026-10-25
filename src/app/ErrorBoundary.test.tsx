import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CrashFallback, ErrorBoundary } from './ErrorBoundary'

describe('ErrorBoundary', () => {
  it('draws what it wraps while nothing fails', () => {
    const markup = renderToStaticMarkup(<ErrorBoundary scope="page"><p>工作台</p></ErrorBoundary>)

    expect(markup).toBe('<p>工作台</p>')
  })

  it('keeps what a part threw, an error or anything else', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('Maximum update depth exceeded')).error?.message).toBe('Maximum update depth exceeded')
    expect(ErrorBoundary.getDerivedStateFromError('坏掉了').error?.message).toBe('坏掉了')
  })

  it('draws the part again once its key changes, and not before', () => {
    const props = { scope: 'editor' as const, children: null }
    const boundary = new ErrorBoundary({ ...props, resetKey: 2 })
    boundary.state = { error: new Error('坏掉了') }
    const setState = vi.fn()
    boundary.setState = setState

    boundary.componentDidUpdate({ ...props, resetKey: 2 })
    expect(setState).not.toHaveBeenCalled()
    boundary.componentDidUpdate({ ...props, resetKey: 1 })
    expect(setState).toHaveBeenCalledWith({ error: null })
  })
})

describe('CrashFallback', () => {
  it('says what failed, shows the error and offers a way back', () => {
    const markup = renderToStaticMarkup(<CrashFallback error={new Error('Maximum update depth exceeded')} scope="editor" />)

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('编辑器出错了')
    expect(markup).toContain('Maximum update depth exceeded')
    expect(markup).toContain('重新加载')
    expect(markup).toContain('回到首页')
    expect(markup).not.toContain('is-full-page')
  })

  it('names a page for the workbench and stands in for the window outermost', () => {
    const markup = renderToStaticMarkup(<CrashFallback error={new TypeError('')} scope="page" fullPage />)

    expect(markup).toContain('页面出错了')
    expect(markup).toContain('TypeError')
    expect(markup).toContain('crash-fallback is-full-page')
  })
})
