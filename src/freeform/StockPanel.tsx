// The online stock photo panel for the images drawer: search a proxied
// library (Pixabay / Unsplash / Pexels, or keyless Openverse), then click a
// hit to import it server-side into the owner's uploads and insert it.
// Offline and guest sessions get a setup notice instead of a search box.

import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { SearchIcon } from '../ui/icons'
import type { StockHit, StockSources, StockStore } from '../storage'

interface StockPanelProps {
  /** The signed-in owner's stock backend; null in local/offline mode. */
  stock: StockStore | null
  /** Insert the imported upload; `natural` keeps the photo's aspect. */
  onInsert: (url: string, alt: string, natural?: { width: number; height: number }) => void
}

interface PanelMessage {
  text: string
  tone: 'info' | 'error'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== '' ? error.message : fallback
}

export function StockPanel({ stock, onInsert }: StockPanelProps) {
  const [sourcesInfo, setSourcesInfo] = useState<StockSources | null>(null)
  const [sourcesState, setSourcesState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [activeSource, setActiveSource] = useState('')
  /** The source the current hits actually came from; imports must reuse it. */
  const [resultSource, setResultSource] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<readonly StockHit[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [message, setMessage] = useState<PanelMessage | null>(null)
  // A late search response must never overwrite a newer one.
  const searchGenerationRef = useRef(0)

  const loadSources = useCallback(() => {
    if (!stock) return
    setSourcesState('loading')
    let cancelled = false
    stock.sources()
      .then((info) => {
        if (cancelled) return
        setSourcesInfo(info)
        setActiveSource((current) => (current !== '' ? current : info.preferred))
        setSourcesState('ready')
      })
      .catch(() => {
        if (!cancelled) setSourcesState('error')
      })
    return () => {
      cancelled = true
    }
  }, [stock])

  useEffect(() => loadSources(), [loadSources])

  async function runSearch(nextPage: number) {
    if (!stock || searching) return
    const q = query.trim()
    if (q === '') return
    const generation = ++searchGenerationRef.current
    setSearching(true)
    setMessage(null)
    try {
      const result = await stock.search(q, activeSource, nextPage)
      if (generation !== searchGenerationRef.current) return
      setHits(nextPage === 1 ? result.results : [...hits, ...result.results])
      setResultSource(result.source)
      setTotal(result.total)
      setPage(result.page)
      setSearched(true)
    } catch (error) {
      if (generation !== searchGenerationRef.current) return
      setMessage({ text: errorMessage(error, t('图库搜索失败，请稍后重试')), tone: 'error' })
    } finally {
      if (generation === searchGenerationRef.current) setSearching(false)
    }
  }

  async function insert(hit: StockHit) {
    if (!stock || importingId !== null) return
    setImportingId(hit.id)
    setMessage(null)
    try {
      const imported = await stock.importImage(resultSource, hit.id)
      onInsert(
        imported.url,
        imported.alt,
        hit.width > 0 && hit.height > 0 ? { width: hit.width, height: hit.height } : undefined,
      )
    } catch (error) {
      setMessage({ text: errorMessage(error, t('图片导入失败，请稍后重试')), tone: 'error' })
    } finally {
      setImportingId(null)
    }
  }

  if (!stock) {
    return (
      <div className="stock-panel" data-testid="stock-panel">
        <div className="stock-degraded" role="status">
          <b>{t('在线图库需要服务端')}</b>
          <span>{t('部署服务端并登录账户后，可以在这里搜索、插入可商用的在线图片；未配置密钥时自动使用 Openverse。')}</span>
        </div>
      </div>
    )
  }

  const chips = sourcesInfo?.sources ?? []
  const resultLabel = chips.find((chip) => chip.id === resultSource)?.label ?? resultSource

  return (
    <div className="stock-panel" data-testid="stock-panel">
      <form
        className="stock-search"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch(1)
        }}
      >
        <label className="search-field">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder={t('搜索在线图片')}
            aria-label={t('搜索在线图片')}
            data-testid="stock-search-input"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="accent"
          type="submit"
          disabled={searching || query.trim() === ''}
          data-testid="stock-search-submit"
        >
          {searching ? t('搜索中…') : t('搜索')}
        </button>
      </form>

      {chips.length > 1 && (
        <div className="stock-sources" role="group" aria-label={t('图库来源')}>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={chip.id === activeSource ? 'stock-source is-active' : 'stock-source'}
              aria-pressed={chip.id === activeSource}
              data-testid={`stock-source-${chip.id}`}
              disabled={!chip.available}
              title={chip.available ? chip.label : t('{label}：未配置密钥', { label: chip.label })}
              onClick={() => setActiveSource(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {message && (
        <p
          className={`asset-drawer-message is-${message.tone}`}
          role={message.tone === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      {sourcesState === 'error' ? (
        <div className="stock-empty">
          <b>{t('图库暂不可用')}</b>
          <button className="ghost" type="button" onClick={loadSources}>{t('重试')}</button>
        </div>
      ) : hits.length === 0 ? (
        searched ? (
          <p className="stock-empty">{t('没有找到「{query}」相关图片', { query: query.trim() })}</p>
        ) : sourcesState === 'loading' ? (
          <p className="stock-empty" role="status">{t('正在读取图库…')}</p>
        ) : (
          <p className="stock-empty">{t('输入关键词，搜索可商用的在线图片。')}</p>
        )
      ) : (
        <div className="stock-grid">
          {hits.map((hit) => (
            <button
              key={`${resultSource}:${hit.id}`}
              className="stock-hit"
              type="button"
              data-testid="stock-hit"
              aria-label={t('插入图库图片')}
              title={hit.author !== '' ? `${resultLabel} · ${hit.author}` : resultLabel}
              onClick={() => void insert(hit)}
            >
              <img src={hit.thumb} alt="" loading="lazy" decoding="async" draggable={false} />
              {importingId === hit.id && (
                <span className="stock-hit-loading" role="status" aria-label={t('正在导入')}>
                  <span className="asset-spinner" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {hits.length > 0 && hits.length < total && (
        <button
          className="ghost stock-more"
          type="button"
          disabled={searching}
          data-testid="stock-load-more"
          onClick={() => void runSearch(page + 1)}
        >
          {searching ? t('加载中…') : t('加载更多')}
        </button>
      )}
    </div>
  )
}
