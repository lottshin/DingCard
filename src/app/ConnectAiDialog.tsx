import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useT } from '../i18n'
import { CheckIcon, CopyIcon } from '../ui/icons'
import { AI_CLIENTS, MCP_GUIDE_URL, isAiClientId, type AiClient, type AiClientId } from './aiClients'

const CLIENT_KEY = 'dingcard.connect-client.v1'

function readClient(): AiClientId {
  try {
    const saved = localStorage.getItem(CLIENT_KEY)
    if (isAiClientId(saved)) return saved
  } catch {
    // A per-browser convenience; the first client is a fine default.
  }
  return AI_CLIENTS[0].id
}

function writeClient(id: AiClientId) {
  try {
    localStorage.setItem(CLIENT_KEY, id)
  } catch {
    // The dialog still switches; it just won't remember next time.
  }
}

/**
 * 接入 AI：how each MCP client starts dingcard-mcp from npm, one tab per
 * client, copied in one click. The last client picked opens next time.
 */
export function ConnectAiDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const baseId = useId()
  const titleId = `${baseId}-title`
  const panelId = `${baseId}-panel`
  const tabsRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLElement>(null)
  const [clientId, setClientId] = useState<AiClientId>(readClient)
  const [copied, setCopied] = useState<AiClientId | null>(null)
  const client = AI_CLIENTS.find((item) => item.id === clientId) ?? AI_CLIENTS[0]

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    tabsRef.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus()
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (copied === null) return
    const timer = window.setTimeout(() => setCopied(null), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const choose = (id: AiClientId) => {
    setClientId(id)
    setCopied(null)
    writeClient(id)
  }

  const onTabsKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = AI_CLIENTS.findIndex((item) => item.id === client.id)
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % AI_CLIENTS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + AI_CLIENTS.length) % AI_CLIENTS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = AI_CLIENTS.length - 1
    else return
    event.preventDefault()
    choose(AI_CLIENTS[next].id)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(client.snippet)
      setCopied(client.id)
    } catch {
      // No clipboard access: select the snippet so ⌘C still works.
      if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current)
    }
  }

  return (
    <div className="modal-backdrop connect-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal connect-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="connect-ai-dialog">
        <div className="modal-head">
          <h3 id={titleId}>{t('接入 AI')}</h3>
        </div>

        <div className="connect-tabs" role="tablist" aria-label={t('AI 客户端')} ref={tabsRef} onKeyDown={onTabsKeyDown}>
          {AI_CLIENTS.map((item) => (
            <button
              key={item.id}
              id={`${baseId}-tab-${item.id}`}
              type="button"
              role="tab"
              className="connect-tab"
              aria-selected={item.id === client.id}
              aria-controls={panelId}
              tabIndex={item.id === client.id ? 0 : -1}
              data-testid={`connect-ai-tab-${item.id}`}
              onClick={() => choose(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className="connect-panel" role="tabpanel" id={panelId} aria-labelledby={`${baseId}-tab-${client.id}`}>
          <div className="connect-panel-head">
            <span>{clientHint(client, t)}</span>
            <button type="button" className="ghost connect-copy" data-testid="connect-ai-copy" onClick={() => void copy()}>
              {copied === client.id ? <CheckIcon /> : <CopyIcon />}
              {copied === client.id ? t('已复制') : t('复制')}
            </button>
          </div>
          <pre className="connect-code" data-testid="connect-ai-snippet"><code ref={codeRef}>{client.snippet}</code></pre>
        </div>

        <p className="connect-needs">{t('需要 Node.js 22 以上和本机的 Google Chrome。')}</p>

        <div className="modal-foot connect-foot">
          <a className="ghost connect-guide" href={MCP_GUIDE_URL} target="_blank" rel="noreferrer">{t('MCP 文档')}</a>
          <button type="button" className="ghost" onClick={onClose}>{t('关闭')}</button>
        </div>
      </div>
    </div>
  )
}

/** Where the snippet goes: a terminal, or the client's MCP config file. */
function clientHint(client: AiClient, t: ReturnType<typeof useT>): string {
  switch (client.id) {
    case 'cursor':
      return t('加进 {file}', { file: '~/.cursor/mcp.json' })
    case 'claude-desktop':
      return t('加进 {file}（{menu}）', { file: 'claude_desktop_config.json', menu: 'Settings → Developer → Edit Config' })
    default:
      return t('在终端里运行')
  }
}
