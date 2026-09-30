import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { toPng } from 'html-to-image'
import { buildFontEmbedCSS } from '../../fontEmbed'
import { isLatestSaveForDraft } from '../../freeform/history'
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
import { DraftsPanel } from '../../DraftsPanel'
import { Select } from '../../Select'
import { downloadZip } from '../../exportZip'
import { importDraftFromJson, type Draft } from '../../drafts'
import { readLastSession, updateLastSession } from '../../lastSession'
import { store } from '../../storage'
import type { Asset } from '../../assets'
import { assetDocumentSource, markdownImageAlt } from '../assetSource'
import { OperationNotice } from '../OperationNotice'
import { ToolbarDivider, ToolbarGroup, WorkspaceToolbar } from '../WorkspaceToolbar'
import type { WorkspaceShellProps } from '../types'
import { useImageLease } from '../useImageLease'
import {
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
} from '../../ui/icons'
import { TemplateGallery } from '../../templates/TemplateGallery'
import { SaveTemplateDialog } from '../../templates/SaveTemplateDialog'
import type { TemplateDefinition } from '../../templates/types'
import {
  deleteUserTemplate,
  inlineImageRefs,
  listUserTemplates,
  saveUserTemplate,
  userTemplateToDefinition,
  type UserTemplate,
} from '../../templates/userTemplates'

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
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

export function MarkdownWorkspace({ isActive, user, requestAuth, request = null, onMetaChange }: WorkspaceShellProps) {
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
  const [showDrafts, setShowDrafts] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [userTemplates, setUserTemplates] = useState<readonly UserTemplate[]>([])
  const [exporting, setExporting] = useState(false)
  const [active, setActive] = useState(0)
  const [ctx, setCtx] = useState<Ctx | null>(null)

  const [drafts, setDrafts] = useState<Draft[]>([])
  // 刷新恢复：每账号只尝试一次；openDraftRef 让恢复 effect 不必依赖 openDraft 的函数身份。
  const restoreAttemptedUserIdRef = useRef<string | null>(null)
  // Bumped whenever the document is replaced, so a slow session restore can't overwrite it.
  const restoreGenerationRef = useRef(0)
  const handledRequestRef = useRef(0)
  const openDraftRef = useRef<(draft: Draft) => void>(() => {})
  const [draftId, setDraftId] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [operationNotice, setOperationNotice] = useState<WorkspaceNotice | null>(null)

  const cardRef = useRef<HTMLDivElement>(null)
  const previousUserId = useRef<string | null>(user?.id ?? null)
  const activeUserIdRef = useRef<string | null>(user?.id ?? null)
  const currentDraftIdRef = useRef<string | null>(draftId)
  const draftRevisionRef = useRef(0)
  const draftListGeneration = useRef(0)
  const saveGenerationRef = useRef(0)
  const saveInFlightRef = useRef(false)
  activeUserIdRef.current = user?.id ?? null
  currentDraftIdRef.current = draftId

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
      showOperationError('图片资源续租失败', error, '暂时无法保护已上传图片，请稍后重试')
    },
    [showOperationError],
  )
  const handleImageError = useCallback(
    (error: unknown) => {
      showOperationError('Markdown 图片上传失败', error, '图片处理失败，请稍后重试')
    },
    [showOperationError],
  )
  const retainNow = useImageLease(
    imageSources,
    store.remote && Boolean(user),
    handleLeaseError,
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

  const loadDrafts = useCallback(
    async (uid: string) => {
      const generation = ++draftListGeneration.current
      try {
        const list = await store.drafts.list(uid)
        if (generation !== draftListGeneration.current || activeUserIdRef.current !== uid) return
        setDrafts(list)
      } catch (error) {
        if (generation !== draftListGeneration.current || activeUserIdRef.current !== uid) return
        showOperationError('草稿列表加载失败', error, '暂时无法加载草稿，请稍后重试')
      }
    },
    [showOperationError],
  )

  const refreshDrafts = useCallback(() => {
    const uid = activeUserIdRef.current
    if (!uid) {
      draftListGeneration.current += 1
      setDrafts([])
      return
    }
    void loadDrafts(uid)
  }, [loadDrafts])

  useEffect(() => {
    const nextUserId = user?.id ?? null
    const userChanged = previousUserId.current !== nextUserId
    if (userChanged) {
      previousUserId.current = nextUserId
      draftListGeneration.current += 1
      saveGenerationRef.current += 1
      draftRevisionRef.current += 1
      setDrafts([])
      updateDraftId(null)
      setSavedAt(null)
      setShowDrafts(false)
    }

    if (user) {
      void loadDrafts(user.id)
      setUserTemplates(listUserTemplates(user.id))
    } else {
      draftListGeneration.current += 1
      setDrafts([])
      setUserTemplates([])
    }

    return () => {
      draftListGeneration.current += 1
    }
  }, [loadDrafts, updateDraftId, user])

  // 刷新恢复：账号确认后自动回到本工作台最近打开的草稿（每个账号只尝试
  // 一次；草稿已被删除或读取失败则保持新文档，不提示）。
  useEffect(() => {
    if (!user || restoreAttemptedUserIdRef.current === user.id) return
    restoreAttemptedUserIdRef.current = user.id
    const draftId = readLastSession(user.id).markdownDraftId
    if (!draftId) return
    const uid = user.id
    const generation = ++restoreGenerationRef.current
    void store.drafts.list(uid).then(
      (list) => {
        if (activeUserIdRef.current !== uid || restoreGenerationRef.current !== generation) return
        const target = list.find((draft) => draft.id === draftId && draft.mode === 'markdown-card')
        if (target) openDraftRef.current(target)
      },
      () => {},
    )
  }, [user])

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

  // ---- Drafts -----------------------------------------------------------
  async function handleSaveDraft() {
    if (!user) {
      requestAuth()
      return
    }
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    const uid = user.id
    const startedDraftId = currentDraftIdRef.current
    const revisionSnapshot = draftRevisionRef.current
    const saveGeneration = ++saveGenerationRef.current
    try {
      const saved = await store.drafts.save(uid, {
        id: startedDraftId ?? undefined,
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
      const saveIsCurrent = (
        activeUserIdRef.current === uid &&
        isLatestSaveForDraft(
          saveGeneration,
          saveGenerationRef.current,
          startedDraftId,
          currentDraftIdRef.current,
        )
      )
      if (!saveIsCurrent) {
        if (activeUserIdRef.current === uid) refreshDrafts()
        return
      }
      updateDraftId(saved.id)
      updateLastSession(uid, { markdownDraftId: saved.id })
      setSavedAt(draftRevisionRef.current === revisionSnapshot ? saved.updatedAt : null)
      if (draftRevisionRef.current === revisionSnapshot) setDirty(false)
      setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)])
      refreshDrafts()
    } catch (error) {
      if (
        activeUserIdRef.current !== uid ||
        !isLatestSaveForDraft(
          saveGeneration,
          saveGenerationRef.current,
          startedDraftId,
          currentDraftIdRef.current,
        )
      ) return
      showOperationError('草稿保存失败', error, '暂时无法保存草稿，请稍后重试')
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  function openDraft(d: Draft) {
    if (d.mode !== 'markdown-card') return
    saveGenerationRef.current += 1
    draftRevisionRef.current += 1
    const document = d.document
    // Re-register the draft's embedded images so `img:` refs resolve again.
    if (document.images) for (const [ref, url] of Object.entries(document.images)) store.images.register(ref, url)
    setSource(document.source)
    setPlatformId(document.platformId)
    setThemeId(resolveTheme(document.themeId).id)
    setFontFamily(document.fontFamily)
    setProfile(document.profile)
    setRadius(document.radius)
    updateDraftId(d.id)
    setSavedAt(d.updatedAt)
    setDirty(false)
    setActive(0)
    setShowDrafts(false)
    if (user) updateLastSession(user.id, { markdownDraftId: d.id })
  }
  openDraftRef.current = openDraft

  /** Import a picked/dropped .json file as a draft; markdown drafts open right away. */
  async function importDraftFile(file: File) {
    if (!user) {
      requestAuth()
      return
    }
    const uid = user.id
    let text: string
    try {
      text = await file.text()
    } catch {
      showOperationError('草稿导入失败', new Error('文件读取失败'), '文件读取失败，请重试')
      return
    }
    const outcome = importDraftFromJson(text)
    if (!outcome.ok) {
      showOperationError('草稿导入失败', new Error(outcome.error), '文件无法识别为叮卡文档')
      return
    }
    try {
      const saved = await store.drafts.save(uid, outcome.data)
      if (activeUserIdRef.current !== uid) return
      setDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)])
      refreshDrafts()
      if (saved.mode === 'markdown-card') {
        openDraft(saved)
      } else {
        setOperationNotice({
          title: '已导入自由画布文档',
          detail: '请在自由画布工作台的「我的草稿」打开',
        })
      }
    } catch (error) {
      if (activeUserIdRef.current !== uid) return
      showOperationError('草稿导入失败', error, '暂时无法导入草稿，请稍后重试')
    }
  }

  async function removeDraft(id: string) {
    if (!user) return
    const uid = user.id
    try {
      if (store.remote) await retainNow()
      await store.drafts.remove(uid, id)
      if (activeUserIdRef.current !== uid) return
      setDrafts((current) => current.filter((draft) => draft.id !== id))
      if (id === currentDraftIdRef.current) {
        saveGenerationRef.current += 1
        updateDraftId(null)
        setSavedAt(null)
      }
      if (readLastSession(uid).markdownDraftId === id) {
        updateLastSession(uid, { markdownDraftId: null })
      }
      refreshDrafts()
    } catch (error) {
      if (activeUserIdRef.current !== uid) return
      showOperationError('草稿删除失败', error, '暂时无法删除草稿，请稍后重试')
    }
  }

  const userTemplateDefinitions = useMemo(
    () => userTemplates.map(userTemplateToDefinition),
    [userTemplates],
  )

  const saveTemplateDefaultName = source
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line.length > 0) ?? ''

  function handleOpenSaveTemplate() {
    if (!user) {
      requestAuth()
      return
    }
    setShowSaveTemplate(true)
  }

  function saveAsTemplate(name: string) {
    if (!user) return
    const uid = user.id
    try {
      const resolvedSource = inlineImageRefs(source, store.images.collect(source))
      const saved = saveUserTemplate(uid, {
        name,
        pageCount: pages.length,
        draft: {
          mode: 'markdown-card',
          document: {
            source: resolvedSource,
            platformId,
            themeId,
            fontFamily,
            profile,
            radius,
          },
        },
      })
      if (activeUserIdRef.current === uid) {
        setUserTemplates(listUserTemplates(uid))
      }
      setShowSaveTemplate(false)
      setOperationNotice({
        title: '已存为模板',
        detail: `「${saved.name}」已出现在模板中心，可随时新建同款`,
      })
    } catch (error) {
      showOperationError('模板保存失败', error, '暂时无法保存模板，请稍后重试')
    }
  }

  function removeUserTemplate(id: string) {
    if (!user) return
    const uid = user.id
    try {
      deleteUserTemplate(uid, id)
      if (activeUserIdRef.current === uid) {
        setUserTemplates(listUserTemplates(uid))
      }
    } catch (error) {
      showOperationError('模板删除失败', error, '暂时无法删除模板，请稍后重试')
    }
  }

  function applyMarkdownTemplate(template: TemplateDefinition) {
    if (template.workspace !== 'markdown') return
    const document = template.createMarkdown?.()
    if (!document) return
    saveGenerationRef.current += 1
    draftRevisionRef.current += 1
    restoreGenerationRef.current += 1
    updateDraftId(null)
    setSavedAt(null)
    setDirty(false)
    setSource(document.source)
    setPlatformId(document.platformId)
    setThemeId(resolveTheme(document.themeId).id)
    setFontFamily(document.fontFamily)
    setProfile(document.profile)
    setRadius(document.radius)
    setActive(0)
    setShowDrafts(false)
    setShowTemplates(false)
  }

  function startNewDocument(nextPlatformId: string | null) {
    saveGenerationRef.current += 1
    draftRevisionRef.current += 1
    restoreGenerationRef.current += 1
    updateDraftId(null)
    setSavedAt(null)
    setDirty(false)
    setSource(NEW_DOCUMENT_SOURCE)
    if (nextPlatformId && PLATFORMS.some((candidate) => candidate.id === nextPlatformId)) setPlatformId(nextPlatformId)
    setActive(0)
    setShowDrafts(false)
    setShowTemplates(false)
  }

  const documentTitle = saveTemplateDefaultName || '未命名'
  useEffect(() => {
    onMetaChange?.({ title: documentTitle, draftId, dirty })
  }, [documentTitle, draftId, dirty, onMetaChange])

  async function insertAsset(asset: Asset) {
    // The user is editing this document now; a late last-session restore must not replace it.
    restoreGenerationRef.current += 1
    try {
      const snippet = `![${markdownImageAlt(asset.name)}](${await assetDocumentSource(asset)})`
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
      showOperationError('图片插入失败', error, '暂时无法插入这张图片，请稍后重试')
    }
  }

  // One-shot instructions from the workbench (open / new / template / removed)
  // and the asset drawer (insert-asset).
  useEffect(() => {
    if (!request || handledRequestRef.current === request.nonce) return
    if (request.kind === 'insert-asset') {
      handledRequestRef.current = request.nonce
      void insertAsset(request.asset)
      return
    }
    if (request.kind === 'open' && !user) return
    handledRequestRef.current = request.nonce
    restoreGenerationRef.current += 1
    if (user) restoreAttemptedUserIdRef.current = user.id
    if (request.kind === 'new') {
      startNewDocument(request.platformId)
    } else if (request.kind === 'template') {
      applyMarkdownTemplate(request.template)
    } else if (request.kind === 'removed') {
      setDrafts((current) => current.filter((draft) => draft.id !== request.draftId))
      if (currentDraftIdRef.current === request.draftId) {
        saveGenerationRef.current += 1
        updateDraftId(null)
        setSavedAt(null)
        setDirty(true)
      }
    } else if (user && currentDraftIdRef.current !== request.draftId) {
      const uid = user.id
      const id = request.draftId
      const known = drafts.find((draft) => draft.id === id)
      if (known) {
        openDraft(known)
      } else {
        void store.drafts.list(uid).then(
          (list) => {
            if (activeUserIdRef.current !== uid) return
            const target = list.find((draft) => draft.id === id && draft.mode === 'markdown-card')
            if (target) openDraft(target)
            else setOperationNotice({ title: '没有找到这个项目', detail: '它可能已经被删除了', tone: 'error' })
          },
          (error: unknown) => showOperationError('项目打开失败', error, '暂时无法读取项目，请稍后重试'),
        )
      }
    }
  }, [request, user])

  return (
    <div className="app">
      <WorkspaceToolbar testId="markdown-toolbar" label="Markdown 卡片工具栏">
        <ToolbarGroup>
          <button className='bar-btn' data-testid='markdown-template-button' onClick={() => setShowTemplates(true)}>
            模板
          </button>
          <ToolbarDivider />
          <div className="seg" role="tablist" aria-label="平台">
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
                {p.label}
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
            title="主题"
            options={themesForPicker(themeId).map((t) => ({
              id: t.id,
              label: t.label,
              swatch: { bg: t.background, accent: t.accent },
            }))}
          />

          <Select
            value={fontFamily}
            onChange={(nextFontFamily) => {
              if (nextFontFamily === fontFamily) return
              setFontFamily(nextFontFamily)
              markDraftDirty()
            }}
            title="字体"
            previewFonts
            options={FONTS.map((f) => ({ id: f.id, label: f.label }))}
          />

          <ToolbarDivider />
          <button className="bar-btn" onClick={() => setShowProfile(true)}>
            个人资料
          </button>
        </ToolbarGroup>

        <ToolbarGroup side="right">
          <button className="bar-btn" onClick={handleSaveDraft} disabled={saving}>
            {saving ? '保存中…' : '保存草稿'}
          </button>
          <button
            className="bar-btn"
            data-testid="markdown-save-template-button"
            onClick={handleOpenSaveTemplate}
          >
            存为模板
          </button>
          <button
            className="bar-btn"
            onClick={() => {
              if (!user) {
                requestAuth()
                return
              }
              setShowDrafts(true)
            }}
          >
            我的草稿{user && drafts.length ? ` · ${drafts.length}` : ''}
          </button>

          <button className="toolbar-primary" onClick={exportAllZip} disabled={exporting}>
            {exporting ? '导出中…' : `打包下载 ${pages.length} 页`}
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
            <div className="md-format" role="toolbar" aria-label="Markdown 格式">
              <button
                type="button"
                className="md-format-btn"
                aria-label="一级标题"
                title="一级标题"
                onClick={() => handleInsertSnippet('# ', '\n', '大标题')}
              >
                H1
              </button>
              <button
                type="button"
                className="md-format-btn"
                aria-label="二级标题"
                title="二级标题"
                onClick={() => handleInsertSnippet('## ', '\n', '小标题')}
              >
                H2
              </button>
              <span className="md-format-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-format-btn"
                aria-label="加粗"
                title="加粗"
                onClick={() => handleInsertSnippet('**', '**', '重点文字')}
              >
                <BoldIcon />
              </button>
              <button
                type="button"
                className="md-format-btn"
                aria-label="斜体"
                title="斜体"
                onClick={() => handleInsertSnippet('*', '*', '斜体文字')}
              >
                <ItalicIcon />
              </button>
              <span className="md-format-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-format-btn"
                aria-label="引用"
                title="引用"
                onClick={() => handleInsertSnippet('> ', '\n', '引用金句或核心观点')}
              >
                <QuoteIcon />
              </button>
              <button
                type="button"
                className="md-format-btn"
                aria-label="列表"
                title="列表"
                onClick={() => handleInsertSnippet('- ', '\n', '列表要点')}
              >
                <ListIcon />
              </button>
              <span className="md-format-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-format-btn md-format-btn--label"
                title="插入分页（---）"
                onClick={handleInsertPageBreak}
              >
                <PageBreakIcon />
                分页
              </button>
            </div>
            <span className="pane-sub">
              {source.length} 字 · {pages.length} 页{savedAt ? ' · 已保存' : ''}
            </span>
          </div>

          {editorMounted ? (
            <Suspense fallback={<div className="cm-host" aria-hidden="true" />}>
              <MarkdownEditor
                value={source}
                onChange={handleEditorChange}
                fontFamily={config.fontFamily}
                beforeImageUpload={store.remote ? retainNow : undefined}
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
              <span className="md-preview-title">预览</span>
              <span className="md-preview-spec">
                {platform.label} · {config.width * EXPORT_PIXEL_RATIO} × {config.height * EXPORT_PIXEL_RATIO}
              </span>
            </div>
            <div className="zoom-controls" aria-label="预览缩放">
              <button
                type="button"
                className="zoom-btn"
                aria-label="缩小预览"
                title="缩小预览"
                onClick={() => setPreviewScale((s) => Math.max(0.75, Number((s - 0.1).toFixed(2))))}
                disabled={previewScale <= 0.75}
              >
                <MinusIcon />
              </button>
              <button
                type="button"
                className="zoom-value"
                title="恢复 100%"
                onClick={() => setPreviewScale(1)}
              >
                {Math.round(previewScale * 100)}%
              </button>
              <button
                type="button"
                className="zoom-btn"
                aria-label="放大预览"
                title="放大预览"
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
                aria-label="上一页"
                title="上一页"
                onClick={() => setActive((i) => Math.max(0, i - 1))}
                disabled={active === 0}
              >
                <ChevronLeftIcon />
              </button>
              <div className="pager" role="group" aria-label="页码">
                {pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={i === active ? 'page-dot active' : 'page-dot'}
                    aria-current={i === active ? 'page' : undefined}
                    title={`第 ${i + 1} 页`}
                    onClick={() => setActive(i)}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="md-dock-btn"
                aria-label="下一页"
                title="下一页"
                onClick={() => setActive((i) => Math.min(pages.length - 1, i + 1))}
                disabled={active >= pages.length - 1}
              >
                <ChevronRightIcon />
              </button>
              <span className="md-dock-sep" aria-hidden="true" />
              <button
                type="button"
                className="md-dock-action"
                title="导出当前页为 PNG"
                onClick={() => exportOne(active)}
                disabled={exporting}
              >
                <DownloadIcon />
                导出本页
              </button>
            </div>
            <div className="pager-hint">右键卡片导出单页 · 拖动卡片四角调整圆角 · 拖动图片右下角调整宽度</div>
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
            markDraftDirty()
            setShowProfile(false)
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
          onImportFile={importDraftFile}
        />
      )}

      <TemplateGallery
        open={showTemplates}
        workspace='markdown'
        hasCurrentContent={draftId !== null || draftRevisionRef.current > 0}
        userTemplates={userTemplateDefinitions}
        onDeleteUserTemplate={removeUserTemplate}
        onClose={() => setShowTemplates(false)}
        onApply={applyMarkdownTemplate}
      />

      <SaveTemplateDialog
        open={showSaveTemplate}
        defaultName={saveTemplateDefaultName}
        onClose={() => setShowSaveTemplate(false)}
        onConfirm={saveAsTemplate}
      />
    </div>
  )
}
