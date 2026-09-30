import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { toPng } from 'html-to-image'
import { AssetDrawer } from '../../app/AssetDrawer'
import { navigate, routes } from '../../app/router'
import { buildFontEmbedCSS } from '../../fontEmbed'
import { collectMarkdownImageSources, parseBlocks, setImageWidth } from '../../markdown'
import { paginate, type Page } from '../../paginate'
import {
  PLATFORMS,
  THEMES,
  FONTS,
  buildConfig,
  DEFAULT_PROFILE,
  resolveTheme,
  themesForPicker,
} from '../../theme'
import type { CardConfig, Profile } from '../../theme'
import { Card } from '../../Card'
import { ProfileModal } from '../../ProfileModal'
import { Select } from '../../Select'
import { downloadZip } from '../../exportZip'
import { deriveMarkdownTitle, type Draft, type MarkdownCardDocument } from '../../drafts'
import { readLastSession, updateLastSession } from '../../lastSession'
import { GUEST_OWNER_ID, isGuestOwner, storeFor } from '../../storage'
import type { Asset } from '../../assets'
import { assetDocumentSource, markdownImageAlt } from '../assetSource'
import { EditorTopBar, type SaveState } from '../EditorTopBar'
import { OperationNotice } from '../OperationNotice'
import { ToolbarDivider, ToolbarGroup, WorkspaceToolbar } from '../WorkspaceToolbar'
import type { WorkspaceShellProps } from '../types'
import { useImageLease } from '../useImageLease'
import { useProjectAutosave } from '../useProjectAutosave'
import {
  AssetsIcon,
  BadgeIcon,
  BoldIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ItalicIcon,
  ListIcon,
  MinusIcon,
  PageBreakIcon,
  PlusIcon,
  QuoteIcon,
  TemplatesIcon,
} from '../../ui/icons'
import { TemplateGallery } from '../../templates/TemplateGallery'
import type { TemplateDefinition } from '../../templates/types'
import { t } from '../../i18n'

// CodeMirror weighs in at roughly half the entry chunk; it is only needed
// once the Markdown editor pane is actually shown, so load it on demand.
const MarkdownEditor = lazy(() =>
  import('../../MarkdownEditor').then((module) => ({ default: module.MarkdownEditor })),
)

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

完成后，点击右上角“打包下载”，即可导出所有卡片。`

const NEW_DOCUMENT_SOURCE = `# 标题

写下第一段。内容超出一张卡片会自动分页，也可以单独一行输入 --- 手动分页。`

/** Exported PNGs are rendered at this multiple of the card's CSS size. */
const EXPORT_PIXEL_RATIO = 3

/** Position + target for the right-click "export this page" menu. */
interface Ctx {
  x: number
  y: number
  index: number
}

interface WorkspaceNotice {
  title: string
  detail: string
  tone?: 'info' | 'error'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? t(error.message) : fallback
}

export function MarkdownWorkspace({
  isActive,
  user,
  ownerId,
  transfer = null,
  requestAuth,
  chrome,
  request = null,
  onMetaChange,
}: WorkspaceShellProps) {
  const [source, setSource] = useState(SAMPLE)
  const [platformId, setPlatformId] = useState(PLATFORMS[0].id)
  const [themeId, setThemeId] = useState(THEMES[0].id)
  const [fontFamily, setFontFamily] = useState(FONTS[0].id)
  const [radius, setRadius] = useState(18)
  const [previewScale, setPreviewScale] = useState(1)
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  // The editor (and its CodeMirror chunk) mounts on first activation; once
  // mounted it stays mounted so tab switches keep the typed source.
  const [editorMounted, setEditorMounted] = useState(isActive)

  const [showProfile, setShowProfile] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [active, setActive] = useState(0)
  const [ctx, setCtx] = useState<Ctx | null>(null)

  // Bumped whenever the document is replaced, so a slow session restore can't overwrite it.
  const restoreGenerationRef = useRef(0)
  const handledRequestRef = useRef(0)
  const openDraftRef = useRef<(draft: Draft) => void>(() => {})
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  /** A name the user gave the project; otherwise the title follows the first line. */
  const [customTitle, setCustomTitle] = useState<string | null>(null)
  const [operationNotice, setOperationNotice] = useState<WorkspaceNotice | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)
  // Starts unknown, so an editor opened with a known owner reopens their last project.
  const previousOwnerId = useRef<string | null>(null)
  // The project an account's expired session left unsaved text in (see the owner effect).
  const parkedProjectRef = useRef<{ userId: string; draftId: string | null } | null>(null)
  const [parkedFor, setParkedFor] = useState<string | null>(null)
  const activeOwnerIdRef = useRef<string | null>(ownerId)
  const transferRef = useRef(transfer)
  // What is on screen was asked for (new, a template, a project): don't swap the last session in.
  const explicitDocumentRef = useRef(false)
  const currentDraftIdRef = useRef<string | null>(draftId)
  const draftRevisionRef = useRef(0)
  activeOwnerIdRef.current = ownerId
  transferRef.current = transfer
  currentDraftIdRef.current = draftId
  const ownerStore = storeFor(ownerId ?? GUEST_OWNER_ID)

  const updateDraftId = useCallback((nextDraftId: string | null) => {
    currentDraftIdRef.current = nextDraftId
    setDraftId(nextDraftId)
  }, [])

  const [dirty, setDirty] = useState(false)

  const markDraftDirty = useCallback(() => {
    draftRevisionRef.current += 1
    setSavedAt(null)
    setDirty(true)
  }, [])

  const platform = PLATFORMS.find((p) => p.id === platformId)!
  const theme = resolveTheme(themeId)

  const config: CardConfig = useMemo(
    () => buildConfig(platform, theme, fontFamily),
    [platform, theme, fontFamily],
  )

  const blocks = useMemo(() => parseBlocks(source), [source])
  const imageSources = useMemo(() => collectMarkdownImageSources(source), [source])
  const [pages, setPages] = useState<Page[]>([{ blocks: [], role: 'article' }])

  const showOperationError = useCallback(
    (title: string, error: unknown, fallback: string) => {
      setOperationNotice({ title, detail: errorMessage(error, fallback), tone: 'error' })
    },
    [],
  )
  const handleLeaseError = useCallback(
    (error: unknown) => {
      showOperationError(t('图片资源续租失败'), error, t('暂时无法保护已上传图片，请稍后重试'))
    },
    [showOperationError],
  )
  const handleImageError = useCallback(
    (error: unknown) => {
      showOperationError(t('Markdown 图片上传失败'), error, t('图片处理失败，请稍后重试'))
    },
    [showOperationError],
  )
  const retainNow = useImageLease(
    imageSources,
    ownerId !== null && ownerStore.remote,
    handleLeaseError,
  )
  // Pasted pictures go to whoever owns the document (a guest's stay in this browser).
  const putImage = useCallback(
    (dataUrl: string) => storeFor(activeOwnerIdRef.current ?? GUEST_OWNER_ID).images.put(dataUrl),
    [],
  )

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

  const editorViewRef = useRef<EditorView | null>(null)

  // Stable identity so the memoized MarkdownEditor never re-renders on typing.
  const handleEditorChange = useCallback((next: string) => {
    setSource(next)
    markDraftDirty()
  }, [markDraftDirty])

  const handleInsertSnippet = useCallback((before: string, after = '', placeholder = '') => {
    const view = editorViewRef.current
    if (view) {
      const selection = view.state.selection.main
      const selectedText = view.state.sliceDoc(selection.from, selection.to)
      const textToInsert = selectedText || placeholder
      const replacement = before + textToInsert + after
      view.dispatch({
        changes: { from: selection.from, to: selection.to, insert: replacement },
        selection: {
          anchor: selection.from + before.length,
          head: selection.from + before.length + textToInsert.length,
        },
      })
      view.focus()
    } else {
      setSource((prev) => prev + '\n\n' + before + placeholder + after)
      markDraftDirty()
    }
  }, [markDraftDirty])

  const handleInsertPageBreak = useCallback(() => {
    const view = editorViewRef.current
    if (view) {
      const selection = view.state.selection.main
      const breakText = '\n\n---\n\n'
      view.dispatch({
        changes: { from: selection.to, insert: breakText },
        selection: { anchor: selection.to + breakText.length },
      })
      view.focus()
    } else {
      setSource((prev) => prev + '\n\n---\n\n')
      markDraftDirty()
    }
  }, [markDraftDirty])

  // Autosave: every edit lands in the owner's project a moment later.
  const autosave = useProjectAutosave<number>((saved, _content, revision) => {
    updateDraftId(saved.id)
    const owner = activeOwnerIdRef.current
    if (owner) updateLastSession(owner, { mode: 'markdown-card', markdownDraftId: saved.id })
    if (draftRevisionRef.current === revision) {
      setDirty(false)
      setSavedAt(saved.updatedAt)
    }
  })
  const { schedule: scheduleSave, release: releaseSave, discard: discardSave } = autosave

  // Leaving the editor (for the workbench, say): don't wait out the pause.
  const flushSave = autosave.flush
  useEffect(() => {
    if (!isActive) void flushSave()
  }, [flushSave, isActive])

  // A different owner (signing in or out, or the session check settling): the
  // open project belongs to the previous one.
  useEffect(() => {
    const next = ownerId
    const previous = previousOwnerId.current
    if (previous === next) return
    previousOwnerId.current = next
    // Queued edits still save to the previous owner's project.
    releaseSave()
    setSavedAt(null)
    const parked = parkedProjectRef.current
    if (previous !== null && !isGuestOwner(previous) && isGuestOwner(next) && dirty) {
      // The session ended before these edits were saved: keep them on screen
      // for that account instead of filing them under the guest.
      parkedProjectRef.current = { userId: previous, draftId: currentDraftIdRef.current }
      setParkedFor(previous)
      updateDraftId(null)
      return
    }
    parkedProjectRef.current = null
    setParkedFor(null)
    if (next === null) return
    if (parked) {
      if (parked.userId === next) {
        // Signed back in: the kept edits go into the same project.
        updateDraftId(parked.draftId)
        return
      }
      // Someone else signed in: keep the edits on this device rather than drop them.
      scheduleSave(GUEST_OWNER_ID, null, {
        mode: 'markdown-card',
        ...(customTitle ? { title: customTitle } : {}),
        document: { source, platformId, themeId, fontFamily, profile, radius },
      }, draftRevisionRef.current)
      releaseSave()
    }
    const moved = currentDraftIdRef.current ? transferRef.current?.get(currentDraftIdRef.current) : undefined
    if (moved?.mode === 'markdown-card') {
      // The guest project on screen just moved into this account: keep editing it there.
      openDraft(moved)
      return
    }
    if (previous === null && !parked) {
      // The session check settled: anything typed meanwhile is saved for the
      // owner; otherwise pick up where they left off.
      if (!dirty && !explicitDocumentRef.current) restoreLastProject(next)
      return
    }
    explicitDocumentRef.current = false
    resetDocument(NEW_DOCUMENT_SOURCE, null)
    restoreLastProject(next)
  }, [ownerId])

  // Declared after the owner effect above, so edits are scheduled for the new
  // owner only once the previous owner's saver is gone. The parked check reads
  // the ref: the owner effect may have parked the edits in this same commit.
  useEffect(() => {
    if (!ownerId || !dirty || parkedProjectRef.current) return
    scheduleSave(ownerId, currentDraftIdRef.current, {
      mode: 'markdown-card',
      ...(customTitle ? { title: customTitle } : {}),
      document: { source, platformId, themeId, fontFamily, profile, radius },
    }, draftRevisionRef.current)
  }, [customTitle, dirty, fontFamily, ownerId, parkedFor, platformId, profile, radius, scheduleSave, source, themeId])

  useEffect(() => {
    if (active > pages.length - 1) setActive(Math.max(0, pages.length - 1))
  }, [pages.length, active])

  useEffect(() => {
    if (!isActive) setCtx(null)
  }, [isActive])

  useEffect(() => {
    if (isActive) setEditorMounted(true)
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
      pixelRatio: EXPORT_PIXEL_RATIO,
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
        markDraftDirty()
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
      if (finalR !== radius) {
        setRadius(finalR)
        markDraftDirty()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ---- Projects ---------------------------------------------------------
  /** Swap in another document. Edits still queued for the old one keep saving to it. */
  function loadDocument(
    document: MarkdownCardDocument | null,
    project: { id: string; title: string; updatedAt: number } | null,
  ) {
    releaseSave()
    draftRevisionRef.current += 1
    restoreGenerationRef.current += 1
    parkedProjectRef.current = null
    setParkedFor(null)
    if (document) {
      // Re-register the draft's embedded images so `img:` refs resolve again.
      if (document.images) for (const [ref, url] of Object.entries(document.images)) ownerStore.images.register(ref, url)
      setSource(document.source)
      setPlatformId(document.platformId)
      setThemeId(resolveTheme(document.themeId).id)
      setFontFamily(document.fontFamily)
      setProfile(document.profile)
      setRadius(document.radius)
    }
    updateDraftId(project?.id ?? null)
    setSavedAt(project?.updatedAt ?? null)
    setCustomTitle(project && document && project.title !== deriveMarkdownTitle(document.source) ? project.title : null)
    setDirty(false)
    setActive(0)
    setShowTemplates(false)
  }

  /** A fresh, unsaved document: nothing is stored until the first edit. */
  function resetDocument(nextSource: string, nextPlatformId: string | null) {
    loadDocument(null, null)
    setSource(nextSource)
    if (nextPlatformId && PLATFORMS.some((candidate) => candidate.id === nextPlatformId)) setPlatformId(nextPlatformId)
  }

  function openDraft(d: Draft) {
    if (d.mode !== 'markdown-card') return
    loadDocument(d.document, d)
    const owner = activeOwnerIdRef.current
    if (owner) updateLastSession(owner, { mode: 'markdown-card', markdownDraftId: d.id })
  }
  openDraftRef.current = openDraft

  /** Reopen the owner's last project, unless something else goes on screen first. */
  function restoreLastProject(owner: string) {
    const lastId = readLastSession(owner).markdownDraftId
    if (!lastId) return
    const generation = ++restoreGenerationRef.current
    void storeFor(owner).drafts.list(owner).then(
      (list) => {
        if (activeOwnerIdRef.current !== owner || restoreGenerationRef.current !== generation) return
        const target = list.find((draft) => draft.id === lastId && draft.mode === 'markdown-card')
        if (target) openDraftRef.current(target)
      },
      () => {},
    )
  }

  function renameProject(title: string) {
    setCustomTitle(title)
    markDraftDirty()
  }

  function applyMarkdownTemplate(template: TemplateDefinition) {
    if (template.workspace !== 'markdown') return
    const document = template.createMarkdown?.()
    if (!document) return
    loadDocument(document, null)
  }

  const derivedTitle = deriveMarkdownTitle(source)
  const documentTitle = customTitle ?? (derivedTitle === '未命名草稿' ? t('未命名') : derivedTitle)
  const unsaved = dirty && (ownerId === null || parkedFor !== null || autosave.status === 'error')
  useEffect(() => {
    onMetaChange?.({ title: documentTitle, draftId, unsaved })
  }, [documentTitle, draftId, unsaved, onMetaChange])

  const saveState: SaveState = parkedFor
    ? { kind: 'signed-out' }
    : ownerId === null
      ? { kind: 'none' }
      : autosave.status === 'error'
        ? { kind: 'error', message: autosave.error ?? '' }
        : dirty || autosave.status === 'saving'
          ? { kind: 'saving' }
          : draftId
            ? { kind: 'saved', at: savedAt ?? Date.now(), onDevice: isGuestOwner(ownerId) }
            : { kind: 'none' }

  async function insertAsset(asset: Asset) {
    if (!ownerId) return
    // The user is editing this document now; a late last-session restore must not replace it.
    restoreGenerationRef.current += 1
    try {
      const snippet = `![${markdownImageAlt(asset.name)}](${await assetDocumentSource(asset, ownerId)})`
      const view = editorViewRef.current
      if (view) {
        const { from, to } = view.state.selection.main
        const before = from > 0 && view.state.doc.sliceString(from - 1, from) !== '\n' ? '\n' : ''
        const insert = `${before}${snippet}\n`
        view.dispatch({
          changes: { from, to, insert },
          selection: { anchor: from + insert.length },
          scrollIntoView: true,
        })
        view.focus()
      } else {
        setSource((prev) => `${prev}\n\n${snippet}\n`)
        markDraftDirty()
      }
    } catch (error) {
      showOperationError(t('图片插入失败'), error, t('暂时无法插入这张图片，请稍后重试'))
    }
  }

  // One-shot instructions from the workbench (open / new / template / removed / renamed).
  useEffect(() => {
    if (!request || handledRequestRef.current === request.nonce) return
    if (request.kind === 'open' && !ownerId) return
    handledRequestRef.current = request.nonce
    if (request.kind === 'removed' || request.kind === 'renamed') {
      if (currentDraftIdRef.current !== request.draftId) return
      if (request.kind === 'renamed') {
        setCustomTitle(request.title)
        return
      }
      // The project is gone: drop what was queued for it and start over.
      discardSave()
      resetDocument(NEW_DOCUMENT_SOURCE, null)
      return
    }
    restoreGenerationRef.current += 1
    explicitDocumentRef.current = true
    if (request.kind === 'new') {
      resetDocument(NEW_DOCUMENT_SOURCE, request.platformId)
    } else if (request.kind === 'template') {
      applyMarkdownTemplate(request.template)
    } else if (ownerId && currentDraftIdRef.current !== request.draftId) {
      const owner = ownerId
      const id = request.draftId
      const generation = restoreGenerationRef.current
      void storeFor(owner).drafts.list(owner).then(
        (list) => {
          if (activeOwnerIdRef.current !== owner || restoreGenerationRef.current !== generation) return
          const target = list.find((draft) => draft.id === id && draft.mode === 'markdown-card')
          if (target) openDraft(target)
          else setOperationNotice({ title: t('没有找到这个项目'), detail: t('它可能已经被删除了'), tone: 'error' })
        },
        (error: unknown) => showOperationError(t('项目打开失败'), error, t('暂时无法读取项目，请稍后重试')),
      )
    }
  }, [request, ownerId])

  return (
    <div className="app">
      {isActive && (
        <EditorTopBar
          chrome={chrome}
          user={user}
          requestAuth={requestAuth}
          system="markdown-card"
          title={documentTitle}
          onRename={renameProject}
          save={saveState}
          onRetrySave={() => void autosave.flush()}
          primary={(
            <button
              className="toolbar-primary editor-primary"
              type="button"
              aria-label={exporting ? t('导出中…') : t('打包下载 {n} 页', { n: pages.length })}
              onClick={exportAllZip}
              disabled={exporting}
            >
              <DownloadIcon />
              <span className="editor-primary-label">
                {exporting ? t('导出中…') : t('打包下载 {n} 页', { n: pages.length })}
              </span>
            </button>
          )}
        />
      )}

      <WorkspaceToolbar testId="markdown-toolbar" label={t('Markdown 卡片工具栏')} className="markdown-toolbar">
        <ToolbarGroup>
          <button className='bar-btn' data-testid='markdown-template-button' onClick={() => setShowTemplates(true)}>
            <TemplatesIcon />
            {t('模板')}
          </button>
          <ToolbarDivider />
          <div className="seg" role="tablist" aria-label={t('平台')}>
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                className={p.id === platformId ? 'seg-btn on' : 'seg-btn'}
                onClick={() => {
                  if (p.id === platformId) return
                  setPlatformId(p.id)
                  markDraftDirty()
                }}
              >
                {t(p.label)}
              </button>
            ))}
          </div>

          <Select
            value={themeId}
            onChange={(nextThemeId) => {
              if (nextThemeId === themeId) return
              setThemeId(nextThemeId)
              markDraftDirty()
            }}
            title={t('主题')}
            options={themesForPicker(themeId).map((theme) => ({
              id: theme.id,
              label: t(theme.label),
              swatch: { bg: theme.background, accent: theme.accent },
            }))}
          />

          <Select
            value={fontFamily}
            onChange={(nextFontFamily) => {
              if (nextFontFamily === fontFamily) return
              setFontFamily(nextFontFamily)
              markDraftDirty()
            }}
            title={t('字体')}
            previewFonts
            options={FONTS.map((f) => ({ id: f.id, label: t(f.label) }))}
          />

          <ToolbarDivider />
          <button className="bar-btn" onClick={() => setShowProfile(true)} title={t('卡片署名：头像、昵称、账号')}>
            <BadgeIcon />
            {t('个人资料')}
          </button>
        </ToolbarGroup>

        <ToolbarGroup side="right">
          <button
            className="bar-btn"
            type="button"
            data-testid="editor-assets"
            aria-pressed={assetsOpen}
            title={t('素材库：插入常用图片')}
            onClick={() => setAssetsOpen((open) => !open)}
          >
            <AssetsIcon />
            {t('素材库')}
          </button>
        </ToolbarGroup>
      </WorkspaceToolbar>

      {operationNotice && (
        <OperationNotice
          title={operationNotice.title}
          detail={operationNotice.detail}
          tone={operationNotice.tone}
          onDismiss={() => setOperationNotice(null)}
        />
      )}

      {/* ---------- Body: editor | preview ---------- */}
      <div className="body">
        <section className="pane pane-editor">
          <div className="pane-head">
            <div className="md-format" role="toolbar" aria-label={t('Markdown 格式')}>
              <button
                type="button"
                className="md-format-btn"
                aria-label={t('一级标题')}
                title={t('一级标题')}
                onClick={() => handleInsertSnippet('# ', '\n', t('大标题'))}
              >
                H1
              </button>
              <button
                type="button"
                className="md-format-btn"
                aria-label={t('二级标题')}
                title={t('二级标题')}
                onClick={() => handleInsertSnippet('## ', '\n', t('小标题'))}
              >
                H2
              </button>
              <span className="md-format-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-format-btn"
                aria-label={t('加粗')}
                title={t('加粗')}
                onClick={() => handleInsertSnippet('**', '**', t('重点文字'))}
              >
                <BoldIcon />
              </button>
              <button
                type="button"
                className="md-format-btn"
                aria-label={t('斜体')}
                title={t('斜体')}
                onClick={() => handleInsertSnippet('*', '*', t('斜体文字'))}
              >
                <ItalicIcon />
              </button>
              <span className="md-format-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-format-btn"
                aria-label={t('引用')}
                title={t('引用')}
                onClick={() => handleInsertSnippet('> ', '\n', t('引用金句或核心观点'))}
              >
                <QuoteIcon />
              </button>
              <button
                type="button"
                className="md-format-btn"
                aria-label={t('列表')}
                title={t('列表')}
                onClick={() => handleInsertSnippet('- ', '\n', t('列表要点'))}
              >
                <ListIcon />
              </button>
              <span className="md-format-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-format-btn md-format-btn--label"
                title={t('插入分页（---）')}
                onClick={handleInsertPageBreak}
              >
                <PageBreakIcon />
                {t('分页')}
              </button>
            </div>
            <span className="pane-sub">
              {t('{chars} 字 · {pages} 页', { chars: source.length, pages: pages.length })}
            </span>
          </div>

          {editorMounted ? (
            <Suspense fallback={<div className="cm-host" aria-hidden="true" />}>
              <MarkdownEditor
                value={source}
                onChange={handleEditorChange}
                fontFamily={config.fontFamily}
                putImage={putImage}
                beforeImageUpload={ownerStore.remote ? retainNow : undefined}
                onImageError={handleImageError}
                onViewReady={(v) => {
                  editorViewRef.current = v
                }}
              />
            </Suspense>
          ) : (
            <div className="cm-host" aria-hidden="true" />
          )}
        </section>

        <section className="pane pane-preview" style={cssVars}>
          <div className="pane-head">
            <div className="md-preview-meta">
              <span className="md-preview-title">{t('预览')}</span>
              <span className="md-preview-spec">
                {t(platform.label)} · {config.width * EXPORT_PIXEL_RATIO} × {config.height * EXPORT_PIXEL_RATIO}
              </span>
            </div>
            <div className="zoom-controls" aria-label={t('预览缩放')}>
              <button
                type="button"
                className="zoom-btn"
                aria-label={t('缩小预览')}
                title={t('缩小预览')}
                onClick={() => setPreviewScale((s) => Math.max(0.75, Number((s - 0.1).toFixed(2))))}
                disabled={previewScale <= 0.75}
              >
                <MinusIcon />
              </button>
              <button
                type="button"
                className="zoom-value"
                title={t('恢复 100%')}
                onClick={() => setPreviewScale(1)}
              >
                {Math.round(previewScale * 100)}%
              </button>
              <button
                type="button"
                className="zoom-btn"
                aria-label={t('放大预览')}
                title={t('放大预览')}
                onClick={() => setPreviewScale((s) => Math.min(1.75, Number((s + 0.1).toFixed(2))))}
                disabled={previewScale >= 1.75}
              >
                <PlusIcon />
              </button>
            </div>
          </div>

          <div className="stage-wrap">
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
                    pageIndex={active}
                    pageCount={pages.length}
                    pageRole={pages[active]?.role ?? 'article'}
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
          </div>

          <div className="md-dock-row">
            <div className="md-dock">
              <button
                type="button"
                className="md-dock-btn"
                aria-label={t('上一页')}
                title={t('上一页')}
                onClick={() => setActive((i) => Math.max(0, i - 1))}
                disabled={active === 0}
              >
                <ChevronLeftIcon />
              </button>
              <div className="pager" role="group" aria-label={t('页码')}>
                {pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === active ? 'page-dot active' : 'page-dot'}
                    aria-current={i === active ? 'page' : undefined}
                    title={t('第 {n} 页', { n: i + 1 })}
                    onClick={() => setActive(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="md-dock-btn"
                aria-label={t('下一页')}
                title={t('下一页')}
                onClick={() => setActive((i) => Math.min(pages.length - 1, i + 1))}
                disabled={active >= pages.length - 1}
              >
                <ChevronRightIcon />
              </button>
              <span className="md-dock-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-dock-action"
                title={t('导出当前页为 PNG')}
                onClick={() => exportOne(active)}
                disabled={exporting}
              >
                <DownloadIcon />
                {t('导出本页')}
              </button>
            </div>
            <div className="pager-hint">{t('右键卡片导出单页 · 拖动卡片四角调整圆角 · 拖动图片右下角调整宽度')}</div>
          </div>
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
            {t('导出第 {n} 页 PNG', { n: ctx.index + 1 })}
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              setCtx(null)
              exportAllZip()
            }}
          >
            {t('打包下载全部 {n} 页', { n: pages.length })}
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
            markDraftDirty()
            setShowProfile(false)
          }}
        />
      )}

      {assetsOpen && isActive && (
        <AssetDrawer
          ownerId={ownerId}
          system="markdown-card"
          onInsert={(asset) => void insertAsset(asset)}
          onManage={() => navigate(routes.assets)}
          onClose={() => setAssetsOpen(false)}
        />
      )}

      <TemplateGallery
        open={showTemplates}
        workspace='markdown'
        hasCurrentContent={draftId !== null || draftRevisionRef.current > 0}
        currentIsSaved={ownerId !== null && !unsaved}
        onClose={() => setShowTemplates(false)}
        onApply={applyMarkdownTemplate}
      />
    </div>
  )
}
