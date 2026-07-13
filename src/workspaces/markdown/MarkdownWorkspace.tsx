import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { buildFontEmbedCSS } from '../../fontEmbed'
import { parseBlocks, setImageWidth } from '../../markdown'
import { registerImage } from '../../imageStore'
import { paginate, type Page } from '../../paginate'
import { PLATFORMS, THEMES, FONTS, buildConfig, DEFAULT_PROFILE } from '../../theme'
import type { CardConfig, Profile } from '../../theme'
import { Card } from '../../Card'
import { MarkdownEditor } from '../../MarkdownEditor'
import logoUrl from '../../logo.svg'
import { ProfileModal } from '../../ProfileModal'
import { AuthModal } from '../../AuthModal'
import { DraftsPanel } from '../../DraftsPanel'
import { Select } from '../../Select'
import { downloadZip } from '../../exportZip'
import { useAppTheme } from '../../useAppTheme'
import { current as currentUser, logout as authLogout, type User } from '../../auth'
import { listDrafts, saveDraft, deleteDraft, type Draft } from '../../drafts'

const SAMPLE = `# 图文切片快速上手

把长文粘贴到左侧编辑器，系统会自动切成适合社交媒体阅读的多张卡片。

你可以用 **加粗** 突出重点，也可以用列表把步骤讲清楚：

- 选择发布平台：小红书、微博或推特
- 选择卡片主题和字体
- 粘贴图片后，可在右侧拖拽调整图片宽度
- 右键卡片可单独导出当前页

---

## 手动分页

单独输入一行三个短横线：

\`\`\`
---
\`\`\`

就可以强制从下一张卡片开始。

> 建议每张卡片只讲一个小观点，让读者更容易滑动阅读。

完成后，点击右上角“下载全部分页”，即可打包导出所有图片。`

/** Position + target for the right-click "export this page" menu. */
interface Ctx {
  x: number
  y: number
  index: number
}

type MarkdownWorkspaceProps = {
  isActive: boolean
}

export function MarkdownWorkspace({ isActive }: MarkdownWorkspaceProps) {
  const [source, setSource] = useState(SAMPLE)
  const [platformId, setPlatformId] = useState(PLATFORMS[0].id)
  const [themeId, setThemeId] = useState(THEMES[0].id)
  const [fontFamily, setFontFamily] = useState(FONTS[0].id)
  const [radius, setRadius] = useState(18)
  const [previewScale, setPreviewScale] = useState(1)
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)

  const [showProfile, setShowProfile] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [active, setActive] = useState(0)
  const [ctx, setCtx] = useState<Ctx | null>(null)

  const [appTheme, toggleAppTheme] = useAppTheme()
  const [user, setUser] = useState<User | null>(() => currentUser())
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)

  const platform = PLATFORMS.find((p) => p.id === platformId)!
  const theme = THEMES.find((t) => t.id === themeId)!

  const config: CardConfig = useMemo(
    () => buildConfig(platform, theme, fontFamily),
    [platform, theme, fontFamily],
  )

  const blocks = useMemo(() => parseBlocks(source), [source])
  const [pages, setPages] = useState<Page[]>([{ blocks: [] }])

  // paginate() measures real DOM nodes. Running it inside render/useMemo mutates
  // document.body and forces layout while React (and CodeMirror) are processing
  // an input event, which corrupts the browser selection/Enter transaction.
  // Measure after the current input + React commit have finished, then publish
  // the result as state. Multiple source changes in one frame collapse naturally.
  // paginate() measures real DOM nodes, so run it after React commits (not during
  // render) via rAF. @uiw/react-codemirror handles the editor's own IME sync, so
  // this no longer interferes with typing.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPages(paginate(blocks, config, profile.headerFirstPageOnly))
    })
    return () => cancelAnimationFrame(frame)
  }, [blocks, config, profile.headerFirstPageOnly])

  // Stable identity so the memoized MarkdownEditor never re-renders on typing.
  const handleEditorChange = useCallback((next: string) => {
    setSource(next)
    setSavedAt(null)
  }, [])

  const refreshDrafts = useCallback(() => {
    setDrafts(user ? listDrafts(user.id) : [])
  }, [user])

  useEffect(() => {
    refreshDrafts()
  }, [refreshDrafts])

  useEffect(() => {
    if (active > pages.length - 1) setActive(Math.max(0, pages.length - 1))
  }, [pages.length, active])

  useEffect(() => {
    if (!isActive) setCtx(null)
  }, [isActive])

  // Dismiss the context menu on any outside click / escape / scroll.
  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [ctx])

  const cssVars = {
    '--card-w': `${config.width}px`,
    '--card-h': `${config.height}px`,
    '--card-pad': `${config.padding}px`,
    '--card-bg': config.background,
    '--card-fg': config.color,
    '--card-accent': config.accent,
    '--card-font': config.fontFamily,
    '--card-fs': `${config.fontSize}px`,
    '--card-lh': String(config.lineHeight),
    '--card-gap': `${config.blockGap}px`,
    '--card-radius': `${radius}px`,
    '--preview-scale': String(previewScale),
    '--preview-w': `${config.width * previewScale}px`,
    '--preview-h': `${config.height * previewScale}px`,
    '--preview-half-w': `${(config.width * previewScale) / 2}px`,
  } as React.CSSProperties

  // ---- Export -----------------------------------------------------------
  // Render page `index` by briefly swapping the visible card to it, letting
  // React paint, then snapshotting the single mounted card node.
  async function renderPage(index: number, fontEmbedCSS?: string): Promise<string | null> {
    setActive(index)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const node = cardRef.current
    if (!node) return null
    return toPng(node, {
      pixelRatio: 3,
      width: config.width,
      height: config.height,
      // Reuse a precomputed font-embed CSS so we don't re-scan and re-fetch the
      // (huge, CJK-subsetted) web fonts on every page. This is the main export
      // cost — computing it once and passing it in makes multi-page export fast.
      fontEmbedCSS,
      // Keep drag handles out of the exported PNG.
      filter: (el) => !(el instanceof HTMLElement && el.classList.contains('img-handle')),
    })
  }

  function saveSingle(dataUrl: string, index: number) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `card-${index + 1}.png`
    a.click()
  }

  // Compute the web-font embed CSS ONCE per export. html-to-image's built-in
  // embedding fetches EVERY unicode-range subset of EVERY loaded CJK family
  // (400+ files → ~20s). Instead we embed only the SELECTED family's subsets
  // that actually cover characters present in the card. System fonts embed
  // nothing at all, so export is instant. Result is reused across pages.
  async function fontEmbedOnce(): Promise<string | undefined> {
    try {
      return await buildFontEmbedCSS(source, fontFamily)
    } catch {
      return undefined // fall back to no explicit embed rather than failing
    }
  }

  // Export one page as a standalone PNG (used by right-click).
  async function exportOne(index: number) {
    setExporting(true)
    const prev = active
    try {
      const fontCSS = await fontEmbedOnce()
      const url = await renderPage(index, fontCSS)
      if (url) saveSingle(url, index)
    } finally {
      setActive(prev)
      setExporting(false)
    }
  }

  // Export every page, bundled into a single .zip.
  async function exportAllZip() {
    if (pages.length === 0) return
    setExporting(true)
    const prev = active
    try {
      const fontCSS = await fontEmbedOnce()
      const urls: string[] = []
      for (let i = 0; i < pages.length; i++) {
        const url = await renderPage(i, fontCSS)
        if (url) urls.push(url)
      }
      if (urls.length) {
        const stamp = new Date().toISOString().slice(0, 10)
        await downloadZip(urls, `cards-${stamp}.zip`)
      }
    } finally {
      setActive(prev)
      setExporting(false)
    }
  }

  // Right-click the card to export the page currently on screen.
  function onCardContext(e: React.MouseEvent) {
    e.preventDefault()
    setCtx({ x: e.clientX, y: e.clientY, index: active })
  }

  // Drag an image's handle in the preview to resize it. During the drag we
  // mutate the wrapper's width directly (live feedback, no re-pagination); on
  // release we write the final width back into the markdown source.
  function onFramePointerDown(e: React.PointerEvent) {
    const target = e.target as HTMLElement
    if (!target.classList.contains('img-handle')) return
    const wrap = target.closest('.img-wrap') as HTMLElement | null
    if (!wrap) return
    e.preventDefault()

    const href = decodeURIComponent(wrap.dataset.href ?? '')
    const startX = e.clientX
    const startW = wrap.getBoundingClientRect().width / previewScale
    // Clamp to the content column so it can't exceed the card width.
    const maxW = config.width - config.padding * 2
    wrap.classList.add('resizing')

    let finalW = startW
    const onMove = (ev: PointerEvent) => {
      finalW = Math.max(60, Math.min(maxW, startW + (ev.clientX - startX) / previewScale))
      wrap.style.width = `${Math.round(finalW)}px`
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      wrap.classList.remove('resizing')
      if (href) {
        // Editor is controlled by `source`; updating state syncs it into CM.
        setSource((s) => setImageWidth(s, href, Math.round(finalW)))
        setSavedAt(null)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Drag any of the card's four corner handles to adjust its border-radius.
  // Dragging a corner toward the card center rounds it more; away flattens it.
  // Live feedback mutates --card-radius on the frame; state is committed on release.
  function onCornerPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const corner = (e.currentTarget as HTMLElement).dataset.corner ?? 'br'
    const frame = (e.currentTarget as HTMLElement).closest('.card-frame') as HTMLElement | null
    if (!frame) return

    // Inward-diagonal unit vector for this corner (toward the card center).
    const dir: Record<string, [number, number]> = {
      tl: [1, 1],
      tr: [-1, 1],
      bl: [1, -1],
      br: [-1, -1],
    }
    const [ux, uy] = dir[corner]
    const startX = e.clientX
    const startY = e.clientY
    const startR = radius
    const maxR = Math.round(Math.min(config.width, config.height) / 2)
    frame.classList.add('rounding')

    let finalR = startR
    const onMove = (ev: PointerEvent) => {
      // Project the drag onto the inward diagonal: toward center => larger radius.
      const proj = ((ev.clientX - startX) * ux + (ev.clientY - startY) * uy) / previewScale
      finalR = Math.max(0, Math.min(maxR, Math.round(startR + proj)))
      frame.style.setProperty('--card-radius', `${finalR}px`)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      frame.classList.remove('rounding')
      frame.style.removeProperty('--card-radius') // hand control back to React state
      setRadius(finalR)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ---- Drafts -----------------------------------------------------------
  function handleSaveDraft() {
    if (!user) {
      setShowAuth(true)
      return
    }
    const saved = saveDraft(user.id, {
      id: draftId ?? undefined,
      mode: 'markdown-card',
      document: {
        source,
        platformId,
        themeId,
        fontFamily,
        profile,
        radius,
      },
    })
    setDraftId(saved.id)
    setSavedAt(saved.updatedAt)
    refreshDrafts()
  }

  function openDraft(d: Draft) {
    if (d.mode !== 'markdown-card') return
    const document = d.document
    // Re-register the draft's embedded images so `img:` refs resolve again.
    if (document.images) for (const [ref, url] of Object.entries(document.images)) registerImage(ref, url)
    setSource(document.source)
    setPlatformId(document.platformId)
    setThemeId(document.themeId)
    setFontFamily(document.fontFamily)
    setProfile(document.profile)
    setRadius(document.radius)
    setDraftId(d.id)
    setActive(0)
    setShowDrafts(false)
  }

  function removeDraft(id: string) {
    if (!user) return
    deleteDraft(user.id, id)
    if (id === draftId) setDraftId(null)
    refreshDrafts()
  }

  function handleLogout() {
    authLogout()
    setUser(null)
    setDraftId(null)
    setDrafts([])
  }

  return (
    <div className="app">
      {/* ---------- Top bar ---------- */}
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="" width="26" height="26" />
          <span className="brand-name">叮卡</span>
        </div>

        <div className="seg" role="tablist" aria-label="平台">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              className={p.id === platformId ? 'seg-btn on' : 'seg-btn'}
              onClick={() => setPlatformId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Select
          value={themeId}
          onChange={setThemeId}
          title="主题"
          options={THEMES.map((t) => ({ id: t.id, label: t.label }))}
        />

        <Select
          value={fontFamily}
          onChange={setFontFamily}
          title="字体"
          previewFonts
          options={FONTS.map((f) => ({ id: f.id, label: f.label }))}
        />

        <button className="bar-btn" onClick={() => setShowProfile(true)}>
          个人资料
        </button>

        <div className="bar-spacer" />

        <button
          className="bar-icon"
          onClick={toggleAppTheme}
          title={appTheme === 'dark' ? '切换到浅色' : '切换到深色'}
          aria-label="切换深浅色"
        >
          {appTheme === 'dark' ? '☀' : '☾'}
        </button>

        <button className="bar-btn" onClick={handleSaveDraft}>
          保存草稿
        </button>
        <button
          className="bar-btn"
          onClick={() => (user ? setShowDrafts(true) : setShowAuth(true))}
        >
          草稿{user && drafts.length ? ` · ${drafts.length}` : ''}
        </button>

        <button className="bar-primary" onClick={exportAllZip} disabled={exporting}>
          {exporting ? '导出中…' : `打包下载 ${pages.length} 页`}
        </button>

        {user ? (
          <button className="bar-user" onClick={handleLogout} title="点击退出登录">
            <span className="bar-user-dot">{user.username.slice(0, 1)}</span>
          </button>
        ) : (
          <button className="bar-btn accent-outline" onClick={() => setShowAuth(true)}>
            登录
          </button>
        )}
      </header>

      {/* ---------- Body: editor | preview ---------- */}
      <div className="body">
        <section className="pane pane-editor">
          <div className="pane-head">
            <span>Markdown</span>
            <span className="pane-sub">
              {source.length} 字 · {pages.length} 页{savedAt ? ' · 已保存' : ''}
            </span>
          </div>
          <MarkdownEditor
            value={source}
            onChange={handleEditorChange}
            fontFamily={config.fontFamily}
          />
        </section>

        <section className="pane pane-preview" style={cssVars}>
          <div className="pane-head">
            <span>
              预览 · 第 {active + 1}/{pages.length} 页
            </span>
            <div className="zoom-controls" aria-label="预览缩放">
              <button
                className="zoom-btn"
                onClick={() => setPreviewScale((s) => Math.max(0.75, Number((s - 0.1).toFixed(2))))}
                disabled={previewScale <= 0.75}
                title="缩小预览"
              >
                −
              </button>
              <button className="zoom-value" onClick={() => setPreviewScale(1)} title="重置为 100%">
                {Math.round(previewScale * 100)}%
              </button>
              <button
                className="zoom-btn"
                onClick={() => setPreviewScale((s) => Math.min(1.75, Number((s + 0.1).toFixed(2))))}
                disabled={previewScale >= 1.75}
                title="放大预览"
              >
                +
              </button>
            </div>
          </div>

          <div className="stage-wrap">
            <button
              className="nav-arrow nav-prev"
              onClick={() => setActive((i) => Math.max(0, i - 1))}
              disabled={active === 0}
              aria-label="上一页"
            >
              ‹
            </button>

            <div className="stage">
              <div className="card-zoom-box">
                <div
                  className="card-frame"
                  onContextMenu={onCardContext}
                  onPointerDown={onFramePointerDown}
                >
                  <Card
                    ref={cardRef}
                    config={config}
                    profile={profile}
                    showHeader={!profile.headerFirstPageOnly || active === 0}
                    html={(pages[active]?.blocks ?? []).map((b) => b.html).join('')}
                  />
                  {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                    <span
                      key={c}
                      className={`corner-handle corner-${c}`}
                      data-corner={c}
                      onPointerDown={onCornerPointerDown}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button
              className="nav-arrow nav-next"
              onClick={() => setActive((i) => Math.min(pages.length - 1, i + 1))}
              disabled={active >= pages.length - 1}
              aria-label="下一页"
            >
              ›
            </button>
          </div>

          <div className="pager">
            {pages.map((_, i) => (
              <button
                key={i}
                className={i === active ? 'page-dot active' : 'page-dot'}
                onClick={() => setActive(i)}
                title={`第 ${i + 1} 页`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="pager-hint">左右箭头翻页 · 右键卡片导出当前页 · 顶栏打包下载全部</div>
        </section>
      </div>

      {/* ---------- Right-click page menu ---------- */}
      {ctx && (
        <div
          className="ctx-menu"
          style={{ left: ctx.x, top: ctx.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-item"
            onClick={() => {
              const i = ctx.index
              setCtx(null)
              exportOne(i)
            }}
          >
            导出第 {ctx.index + 1} 页 PNG
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              setCtx(null)
              exportAllZip()
            }}
          >
            打包下载全部 {pages.length} 页
          </button>
        </div>
      )}

      {/* ---------- Overlays ---------- */}
      {showProfile && (
        <ProfileModal
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSave={(next) => {
            setProfile(next)
            setShowProfile(false)
          }}
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onAuthed={(u) => {
            setUser(u)
            setShowAuth(false)
          }}
        />
      )}

      {showDrafts && (
        <DraftsPanel
          drafts={drafts}
          activeId={draftId}
          onOpen={openDraft}
          onDelete={removeDraft}
          onClose={() => setShowDrafts(false)}
        />
      )}
    </div>
  )
}
