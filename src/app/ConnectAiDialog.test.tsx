import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectAiDialog } from './ConnectAiDialog'

describe('ConnectAiDialog', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens on Claude Code with its command, a copy button, what it needs and the guide', () => {
    const markup = renderToStaticMarkup(<ConnectAiDialog onClose={() => undefined} />)

    expect(markup).toContain('接入 AI')
    expect(markup).toContain('role="tablist"')
    for (const name of ['Claude Code', 'Codex', 'Cursor', 'Claude Desktop']) expect(markup).toContain(`>${name}</button>`)
    expect(markup).toMatch(/aria-selected="true"[^>]*>Claude Code</)
    expect(markup).toContain('在终端里运行')
    expect(markup).toContain('claude mcp add dingcard -- npx -y dingcard-mcp')
    expect(markup).toContain('复制')
    expect(markup).toContain('需要 Node.js 22 以上和本机的 Google Chrome。')
    expect(markup).toContain('href="https://github.com/lottshin/DingCard/blob/master/docs/mcp.md"')
  })

  it('opens on the client picked last time, with where its config goes', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'cursor', setItem: () => undefined })
    const markup = renderToStaticMarkup(<ConnectAiDialog onClose={() => undefined} />)

    expect(markup).toMatch(/aria-selected="true"[^>]*>Cursor</)
    expect(markup).toContain('加进 ~/.cursor/mcp.json')
    expect(markup).toContain('mcpServers')
  })

  it('falls back to the first client when the saved one is unknown', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'vscode', setItem: () => undefined })

    expect(renderToStaticMarkup(<ConnectAiDialog onClose={() => undefined} />)).toMatch(/aria-selected="true"[^>]*>Claude Code</)
  })
})
