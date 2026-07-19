import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { MAX_SCENE_DEPTH } from './constants'
import { scenePathKey } from './sceneTree'
import type { FreeformSceneNode, ScenePath } from './types'

export interface LayerSelectionOptions {
  toggle: boolean
}

export interface FreeformLayersPanelProps {
  nodes: readonly FreeformSceneNode[]
  selectedPaths: readonly ScenePath[]
  hasStructuralLockedSelection: boolean
  onSelect: (path: ScenePath, options: LayerSelectionOptions) => boolean | void
  onRename: (path: ScenePath, name: string) => boolean | void
  onReorder: (
    parentPath: ScenePath,
    nodeIds: readonly string[],
    direction: 'forward' | 'backward' | 'front' | 'back',
  ) => boolean | void
  onDropReorder: (
    parentPath: ScenePath,
    nodeIds: readonly string[],
    targetNodeId: string,
  ) => boolean | void
  onSetLocked: (path: ScenePath, locked: boolean) => boolean | void
  onSetHidden: (path: ScenePath, hidden: boolean) => boolean | void
  onGroup: () => boolean
  onUngroup: () => boolean
}

interface VisibleRow {
  node: FreeformSceneNode
  path: ScenePath
  parentPath: ScenePath
  level: number
}

const ROOT_LAYER_INDENT_PX = 4
const LAYER_INDENT_STEP_PX = 8
const MAX_VISUAL_LAYER_DEPTH = 4

export function layerIndentPx(level: number): number {
  if (!Number.isInteger(level) || level < 1) return ROOT_LAYER_INDENT_PX
  return ROOT_LAYER_INDENT_PX + Math.min(level - 1, MAX_VISUAL_LAYER_DEPTH) * LAYER_INDENT_STEP_PX
}

export function layerDepthLabel(level: number): string | null {
  if (
    !Number.isInteger(level) ||
    level <= MAX_VISUAL_LAYER_DEPTH + 1 ||
    level > MAX_SCENE_DEPTH
  ) return null
  return String(level)
}

function defaultNodeName(node: FreeformSceneNode): string {
  if (node.type === 'text') return '文本'
  if (node.type === 'image') return '图片'
  if (node.type === 'line') return node.lineKind === 'arrow' ? '箭头' : '直线'
  if (node.type === 'group') return '组合'
  return '形状'
}

function hasLockedDescendant(node: FreeformSceneNode, depth = 1): boolean {
  if (node.type !== 'group' || depth > MAX_SCENE_DEPTH) return false
  return node.children.some((child) => (
    child.locked || hasLockedDescendant(child, depth + 1)
  ))
}

function collectVisibleRows(
  nodes: readonly FreeformSceneNode[],
  expanded: ReadonlySet<string>,
  parentPath: ScenePath = [],
  level = 1,
): VisibleRow[] {
  const rows: VisibleRow[] = []
  for (const node of [...nodes].reverse()) {
    const path = [...parentPath, node.id]
    rows.push({ node, path, parentPath: [...parentPath], level })
    if (node.type === 'group' && expanded.has(scenePathKey(path))) {
      rows.push(...collectVisibleRows(node.children, expanded, path, level + 1))
    }
  }
  return rows
}

function collectGroupKeys(nodes: readonly FreeformSceneNode[], parentPath: ScenePath = []): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.type !== 'group') continue
    const path = [...parentPath, node.id]
    keys.push(scenePathKey(path), ...collectGroupKeys(node.children, path))
  }
  return keys
}

function typeIcon(node: FreeformSceneNode) {
  if (node.type === 'group') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="freeform-layer-icon">
        <path d="M3 6.5h5l1.5 2H17v7.5H3z" />
        <path d="M3 6.5V4h5l1.5 2.5" />
      </svg>
    )
  }
  if (node.type === 'text') {
    return <span aria-hidden="true" className="freeform-layer-type-mark">T</span>
  }
  if (node.type === 'image') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="freeform-layer-icon">
        <rect x="3" y="3" width="14" height="14" rx="2" />
        <circle cx="7" cy="7" r="1.2" />
        <path d="m4.5 14 3.2-3.2 2.4 2.3 1.8-1.8 3.6 3.2" />
      </svg>
    )
  }
  if (node.type === 'line') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" className="freeform-layer-icon">
        <path d="m4 16 12-12" />
        {node.lineKind === 'arrow' && <path d="M11 4h5v5" />}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="freeform-layer-icon">
      <path d="m10 2 7 4v8l-7 4-7-4V6z" />
    </svg>
  )
}

function expandIcon(expanded: boolean) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="freeform-layer-expand-icon">
      <path d={expanded ? 'm4 6 4 4 4-4' : 'm6 4 4 4-4 4'} />
    </svg>
  )
}

function visibilityIcon(visible: boolean) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="freeform-layer-action-icon">
      <path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z" />
      <circle cx="10" cy="10" r="2.2" />
      {!visible && <path d="m3 3 14 14" />}
    </svg>
  )
}

function lockIcon(locked: boolean) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="freeform-layer-action-icon">
      <rect x="4" y="8" width="12" height="9" rx="2" />
      <path d={locked ? 'M7 8V6a3 3 0 0 1 6 0v2' : 'M7 8V6a3 3 0 0 1 5.7-1.3'} />
    </svg>
  )
}

function inheritedStateIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="freeform-layer-inherited-icon">
      <path d="M6.2 9.8 4.8 11.2a2.1 2.1 0 0 1-3-3l2.1-2.1a2.1 2.1 0 0 1 3 0" />
      <path d="m9.8 6.2 1.4-1.4a2.1 2.1 0 0 1 3 3l-2.1 2.1a2.1 2.1 0 0 1-3 0" />
      <path d="m5.6 10.4 4.8-4.8" />
    </svg>
  )
}

/** Accessible recursive layer tree with own-state visibility and lock controls. */
export function FreeformLayersPanel({
  nodes,
  selectedPaths,
  hasStructuralLockedSelection,
  onSelect,
  onRename,
  onReorder,
  onDropReorder,
  onSetLocked,
  onSetHidden,
  onGroup,
  onUngroup,
}: FreeformLayersPanelProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(collectGroupKeys(nodes)),
  )
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const treeRef = useRef<HTMLDivElement>(null)
  const dragPathRef = useRef<ScenePath | null>(null)
  const renameCompositionRef = useRef(false)
  const knownGroupKeysRef = useRef<Set<string>>(new Set())
  const previousRowsRef = useRef<VisibleRow[]>([])
  const treeId = useId().replace(/:/g, '')

  const rows = useMemo(() => collectVisibleRows(nodes, expandedKeys), [nodes, expandedKeys])
  const rowByKey = useMemo(() => new Map(rows.map((row) => [scenePathKey(row.path), row])), [rows])
  const selectedKeys = useMemo(
    () => new Set(selectedPaths.map(scenePathKey)),
    [selectedPaths],
  )

  useEffect(() => {
    const validGroups = new Set(collectGroupKeys(nodes))
    const knownGroups = knownGroupKeysRef.current
    knownGroupKeysRef.current = validGroups
    setExpandedKeys((current) => {
      const next = new Set([...current].filter((key) => validGroups.has(key)))
      validGroups.forEach((key) => {
        if (!knownGroups.has(key)) next.add(key)
      })
      return next.size === current.size && [...next].every((key) => current.has(key)) ? current : next
    })
  }, [nodes])

  useEffect(() => {
    if (rows.length === 0) {
      setFocusedKey(null)
      previousRowsRef.current = rows
      return
    }
    if (!focusedKey) {
      setFocusedKey(scenePathKey(rows[0].path))
      previousRowsRef.current = rows
      return
    }
    if (!rowByKey.has(focusedKey)) {
      const previousRows = previousRowsRef.current
      const removedIndex = previousRows.findIndex((row) => scenePathKey(row.path) === focusedKey)
      const removed = previousRows[removedIndex]
      const candidateFrom = (indices: number[]) => indices
        .map((index) => previousRows[index])
        .find((candidate) =>
          candidate &&
          rowByKey.has(scenePathKey(candidate.path)) &&
          (!removed || scenePathKey(candidate.parentPath) === scenePathKey(removed.parentPath)),
        )
      const after = candidateFrom(
        Array.from({ length: Math.max(0, previousRows.length - removedIndex - 1) }, (_, offset) => removedIndex + offset + 1),
      )
      const before = candidateFrom(
        Array.from({ length: Math.max(0, removedIndex) }, (_, offset) => removedIndex - offset - 1),
      )
      const parent = removed?.parentPath.length
        ? rowByKey.get(scenePathKey(removed.parentPath))
        : undefined
      const fallback = after ?? before ?? parent ?? rows[0]
      const nextKey = scenePathKey(fallback.path)
      const active = document.activeElement
      const shouldRestoreFocus =
        active === document.body ||
        active === null ||
        Boolean(active && treeRef.current?.contains(active))
      setFocusedKey(nextKey)
      if (shouldRestoreFocus) requestAnimationFrame(() => rowRefs.current.get(nextKey)?.focus())
    }
    previousRowsRef.current = rows
  }, [focusedKey, rowByKey, rows])

  useEffect(() => {
    if (!focusedKey) return
    const row = rowRefs.current.get(focusedKey)
    if (row && document.activeElement?.getAttribute('role') === 'treeitem') row.focus()
  }, [focusedKey])

  function focusRow(key: string | null) {
    if (!key) return
    setFocusedKey(key)
    rowRefs.current.get(key)?.focus()
    requestAnimationFrame(() => rowRefs.current.get(key)?.focus())
  }

  function announce(message: string) {
    setAnnouncement('')
    requestAnimationFrame(() => setAnnouncement(message))
  }

  function runStructureCommand(command: 'group' | 'ungroup') {
    const changed = command === 'group' ? onGroup() : onUngroup()
    announce(
      changed
        ? command === 'group' ? '所选图层已组合' : '所选组合已解组'
        : command === 'group' ? '无法组合所选图层' : '无法解组所选图层',
    )
  }

  function toggleExpanded(path: ScenePath) {
    const key = scenePathKey(path)
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function beginRename(row: VisibleRow) {
    renameCompositionRef.current = false
    setRenamingKey(scenePathKey(row.path))
    setRenameValue(row.node.name)
    requestAnimationFrame(() => {
      const input = rowRefs.current.get(scenePathKey(row.path))?.querySelector('input')
      if (input instanceof HTMLInputElement) {
        input.focus()
        input.select()
      }
    })
  }

  function commitRename(row: VisibleRow) {
    renameCompositionRef.current = false
    const nextName = renameValue.trim() || defaultNodeName(row.node)
    const changed = onRename(row.path, nextName)
    setRenamingKey(null)
    setRenameValue('')
    if (changed !== false) announce(`${nextName} 已重命名`)
  }

  function handleSelect(row: VisibleRow, toggle: boolean) {
    const accepted = onSelect(row.path, { toggle })
    if (accepted === false) announce('只能同时选择同一组内的图层')
  }

  function focusAfterHide(row: VisibleRow) {
    const siblings = rows.filter(
      (candidate) => scenePathKey(candidate.parentPath) === scenePathKey(row.parentPath),
    )
    const index = siblings.findIndex(
      (candidate) => scenePathKey(candidate.path) === scenePathKey(row.path),
    )
    const fallback = siblings[index + 1]
      ?? siblings[index - 1]
      ?? (row.parentPath.length > 0 ? rowByKey.get(scenePathKey(row.parentPath)) : undefined)
    if (fallback) focusRow(scenePathKey(fallback.path))
  }

  function setRowHidden(row: VisibleRow, hidden: boolean, inheritedHidden: boolean) {
    const changed = onSetHidden(row.path, hidden)
    if (changed === false) return
    announce(
      inheritedHidden
        ? `${row.node.name}${hidden ? ' 已设为自身隐藏' : ' 已取消自身隐藏'}，仍受父级隐藏影响`
        : `${row.node.name}${hidden ? ' 已隐藏' : ' 已显示'}`,
    )
    if (hidden && !inheritedHidden) focusAfterHide(row)
  }

  function setRowLocked(row: VisibleRow, locked: boolean, inheritedLocked: boolean) {
    const changed = onSetLocked(row.path, locked)
    if (changed === false) return
    announce(
      inheritedLocked
        ? `${row.node.name}${locked ? ' 已设为自身锁定' : ' 已取消自身锁定'}，仍受父级锁定影响`
        : `${row.node.name}${locked ? ' 已锁定' : ' 已解锁'}`,
    )
    focusRow(scenePathKey(row.path))
  }

  function handleTreeKeyDown(
    row: VisibleRow,
    event: KeyboardEvent<HTMLDivElement>,
    structureLocked: boolean,
  ) {
    const key = event.key
    const rowKey = scenePathKey(row.path)
    if (renamingKey === rowKey) return

    if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
      event.preventDefault()
      event.stopPropagation()
      const direction = key === 'ArrowUp' ? 'forward' : 'backward'
      const changed = onReorder(row.parentPath, [row.node.id], direction)
      if (changed !== false) {
        const siblingRows = rows.filter(
          (candidate) => scenePathKey(candidate.parentPath) === scenePathKey(row.parentPath),
        )
        const currentIndex = siblingRows.findIndex(
          (candidate) => scenePathKey(candidate.path) === rowKey,
        )
        const nextIndex = Math.max(
          0,
          Math.min(siblingRows.length - 1, currentIndex + (direction === 'forward' ? -1 : 1)),
        )
        announce(`${row.node.name} 已移至第 ${nextIndex + 1} 层`)
        focusRow(rowKey)
      } else if (structureLocked) {
        announce('图层已锁定，无法调整层级')
      }
      return
    }

    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      const index = rows.findIndex((candidate) => scenePathKey(candidate.path) === rowKey)
      const nextIndex = key === 'Home'
        ? 0
        : key === 'End'
          ? rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))
      focusRow(scenePathKey(rows[nextIndex].path))
      return
    }

    if (key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      if (row.node.type !== 'group') return
      const expanded = expandedKeys.has(rowKey)
      if (!expanded) {
        toggleExpanded(row.path)
        return
      }
      const child = rows.find((candidate) =>
        candidate.parentPath.length === row.path.length &&
        candidate.parentPath.every((id, index) => id === row.path[index]),
      )
      if (child) focusRow(scenePathKey(child.path))
      return
    }

    if (key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      if (row.node.type === 'group' && expandedKeys.has(rowKey)) {
        toggleExpanded(row.path)
        return
      }
      if (row.parentPath.length > 0) focusRow(scenePathKey(row.parentPath))
      return
    }

    if (key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      handleSelect(row, false)
      return
    }

    if (key === ' ') {
      event.preventDefault()
      event.stopPropagation()
      handleSelect(row, true)
      return
    }

    if (key === 'F2') {
      event.preventDefault()
      event.stopPropagation()
      beginRename(row)
      return
    }

  }

  function handleDrop(row: VisibleRow, event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const sourcePath = dragPathRef.current
    dragPathRef.current = null
    if (!sourcePath) return
    const sourceRow = rowByKey.get(scenePathKey(sourcePath))
    if (!sourceRow) return
    const sameParent = scenePathKey(sourceRow.parentPath) === scenePathKey(row.parentPath)
    if (!sameParent) {
      announce('图层只能在同一组内排序')
      return
    }
    if (sourceRow.node.id === row.node.id) return
    const sourceSelected = selectedKeys.has(scenePathKey(sourceRow.path))
    if (sourceSelected && selectedKeys.has(scenePathKey(row.path))) return
    const movingCount = sourceSelected
      ? selectedPaths.filter(
          (path) => scenePathKey(path.slice(0, -1)) === scenePathKey(row.parentPath),
        ).length
      : 1
    const siblingRows = rows.filter((candidate) =>
      scenePathKey(candidate.parentPath) === scenePathKey(row.parentPath),
    )
    const sourceIndex = siblingRows.findIndex((candidate) => scenePathKey(candidate.path) === scenePathKey(sourcePath))
    const targetIndex = siblingRows.findIndex((candidate) => scenePathKey(candidate.path) === scenePathKey(row.path))
    if (sourceIndex < 0 || targetIndex < 0) return
    const changed = onDropReorder(row.parentPath, [sourceRow.node.id], row.node.id)
    if (changed !== false) {
      announce(
        movingCount > 1
          ? `已移动 ${movingCount} 个图层至 ${row.node.name} 上方`
          : `${sourceRow.node.name} 已移至第 ${targetIndex + 1} 层`,
      )
    } else if (sourceSelected && hasStructuralLockedSelection) {
      announce('图层已锁定，无法调整层级')
    }
  }

  function childGroupId(path: ScenePath): string {
    return `freeform-${treeId}-group-${encodeURIComponent(scenePathKey(path))}`
  }

  function rowStatusId(path: ScenePath): string {
    return `freeform-${treeId}-status-${encodeURIComponent(scenePathKey(path))}`
  }

  function renderRows(
    children: readonly FreeformSceneNode[],
    parentPath: ScenePath,
    level: number,
    inheritedLocked = false,
    inheritedHidden = false,
  ) {
    return [...children].reverse().map((node) => {
      const path = [...parentPath, node.id]
      const key = scenePathKey(path)
      const row: VisibleRow = { node, path, parentPath: [...parentPath], level }
      const expanded = node.type === 'group' && expandedKeys.has(key)
      const selected = selectedKeys.has(key)
      const editing = renamingKey === key
      const depthLabel = layerDepthLabel(level)
      const effectiveLocked = inheritedLocked || node.locked
      const effectiveHidden = inheritedHidden || node.hidden
      const hasLockedChild = hasLockedDescendant(node)
      const structureLocked = (
        effectiveLocked ||
        hasLockedChild ||
        (selected && hasStructuralLockedSelection)
      )
      const rowClassName = [
        'freeform-layer-row',
        selected ? 'is-selected' : '',
        effectiveLocked ? 'is-effectively-locked' : '',
        structureLocked && !effectiveLocked ? 'is-structurally-locked' : '',
        effectiveHidden ? 'is-effectively-hidden' : '',
      ].filter(Boolean).join(' ')
      const statusId = rowStatusId(path)
      const statusText = [
        node.hidden ? '自身隐藏' : '自身可见',
        inheritedHidden ? '受父级隐藏影响，当前隐藏' : `当前${node.hidden ? '隐藏' : '可见'}`,
        node.locked ? '自身锁定' : '自身未锁定',
        inheritedLocked ? '受父级锁定影响，当前锁定' : `当前${node.locked ? '锁定' : '未锁定'}`,
        hasLockedChild
          ? '包含锁定后代，结构只读'
          : selected && hasStructuralLockedSelection
            ? '当前选择包含锁定图层，结构只读'
            : '',
      ].join('；')
      const visibilityLabel = `隐藏图层 ${node.name}`
      const visibilityTitle = `${node.hidden ? '显示' : '隐藏'} ${node.name}`
      const lockLabel = `锁定图层 ${node.name}`
      const lockTitle = `${node.locked ? '解锁' : '锁定'} ${node.name}`
      const inheritedStateTitle = [
        inheritedHidden ? '隐藏' : '',
        inheritedLocked ? '锁定' : '',
      ].filter(Boolean).join('和')
      return (
        <div key={key} className="freeform-layer-branch">
          <div
            ref={(element) => {
              if (element) rowRefs.current.set(key, element)
              else rowRefs.current.delete(key)
            }}
            className={rowClassName}
            role="treeitem"
            aria-label={node.name}
            aria-level={level}
            aria-selected={selected}
            aria-expanded={node.type === 'group' ? expanded : undefined}
            aria-owns={node.type === 'group' && expanded ? childGroupId(path) : undefined}
            aria-describedby={statusId}
            data-effective-locked={effectiveLocked ? 'true' : 'false'}
            data-structural-locked={structureLocked ? 'true' : 'false'}
            data-effective-hidden={effectiveHidden ? 'true' : 'false'}
            tabIndex={focusedKey === key ? 0 : -1}
            draggable={!editing && !structureLocked}
            style={{ paddingLeft: layerIndentPx(level) }}
            onFocus={() => setFocusedKey(key)}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              if (editing) return
              handleSelect(row, event.shiftKey || event.ctrlKey || event.metaKey)
            }}
            onDoubleClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              beginRename(row)
            }}
            onKeyDown={(event) => handleTreeKeyDown(row, event, structureLocked)}
            onDragStart={() => {
              if (structureLocked) return
              dragPathRef.current = row.path
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDrop(row, event)}
          >
            {depthLabel && (
              <span
                className="freeform-layer-depth"
                aria-hidden="true"
                title={`第 ${depthLabel} 层`}
              >
                {depthLabel}
              </span>
            )}
            {node.type === 'group' ? (
              <button
                className="freeform-layer-expand"
                type="button"
                aria-label={expanded ? '折叠图层组' : '展开图层组'}
                tabIndex={-1}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  toggleExpanded(path)
                  focusRow(key)
                }}
              >
                {expandIcon(expanded)}
              </button>
            ) : <span className="freeform-layer-expand-spacer" aria-hidden="true" />}
            <span className="freeform-layer-type" aria-hidden="true">
              {typeIcon(node)}
              {(inheritedHidden || inheritedLocked) && (
                <span
                  className="freeform-layer-inherited-state"
                  title={`受父级${inheritedStateTitle}影响`}
                >
                  {inheritedStateIcon()}
                </span>
              )}
            </span>
            {editing ? (
              <input
                className="freeform-layer-rename"
                aria-label="重命名图层"
                value={renameValue}
                onChange={(event) => setRenameValue(event.currentTarget.value)}
                onBlur={() => commitRename(row)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    if (event.nativeEvent.isComposing || renameCompositionRef.current) return
                    event.preventDefault()
                    commitRename(row)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    renameCompositionRef.current = false
                    setRenamingKey(null)
                    setRenameValue('')
                  }
                }}
                onCompositionStart={() => {
                  renameCompositionRef.current = true
                }}
                onCompositionEnd={() => {
                  renameCompositionRef.current = false
                }}
              />
            ) : (
              <span
                className="freeform-layer-name"
                title={node.name}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  beginRename(row)
                }}
              >
                {node.name}
              </span>
            )}
            <span id={statusId} className="sr-only">{statusText}</span>
            <span className="freeform-layer-actions">
              <button
                className="freeform-layer-action"
                type="button"
                aria-label={visibilityLabel}
                aria-pressed={node.hidden}
                title={visibilityTitle}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onKeyDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onDragStart={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (event.detail > 1) return
                  setRowHidden(row, !node.hidden, inheritedHidden)
                }}
              >
                {visibilityIcon(!node.hidden)}
              </button>
              <button
                className="freeform-layer-action"
                type="button"
                aria-label={lockLabel}
                aria-pressed={node.locked}
                title={lockTitle}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onKeyDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onDragStart={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (event.detail > 1) return
                  setRowLocked(row, !node.locked, inheritedLocked)
                }}
              >
                {lockIcon(node.locked)}
              </button>
            </span>
          </div>
          {node.type === 'group' && expanded && (
            <div
              id={childGroupId(path)}
              className="freeform-layer-children"
              role="group"
            >
              {renderRows(
                node.children,
                path,
                level + 1,
                effectiveLocked,
                effectiveHidden,
              )}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="freeform-layers-panel">
      <div className="freeform-layers-heading">
        <span className="freeform-layers-title">
          图层
          <span className="freeform-layers-count">{rows.length}</span>
        </span>
        <div className="freeform-layers-commands" role="group" aria-label="图层组合操作">
          <button
            className="freeform-layers-command"
            type="button"
            data-testid="freeform-group-selection"
            title="组合所选图层 (Ctrl+G)"
            onClick={() => runStructureCommand('group')}
          >
            组合
          </button>
          <button
            className="freeform-layers-command"
            type="button"
            data-testid="freeform-ungroup-selection"
            title="解组所选图层 (Ctrl+Shift+G)"
            onClick={() => runStructureCommand('ungroup')}
          >
            解组
          </button>
        </div>
      </div>
      <div
        ref={treeRef}
        className="freeform-layer-tree"
        role="tree"
        aria-label="图层树"
        aria-multiselectable="true"
        onDragEnd={() => {
          dragPathRef.current = null
        }}
      >
        {renderRows(nodes, [], 1)}
      </div>
      <div className="freeform-layer-live" data-testid="freeform-layer-live" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  )
}
