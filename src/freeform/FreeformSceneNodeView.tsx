import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { store } from '../storage'
import { PlainTextEditable } from './PlainTextEditable'
import { shapeFillToStyle, textFillToStyle } from './paint'
import { scenePathKey } from './sceneTree'
import type {
  FreeformSceneLeaf,
  FreeformSceneNode,
  ScenePath,
} from './types'

export interface SceneNodePointerState {
  locked: boolean
  hidden: boolean
}

export interface FreeformSceneNodeViewProps {
  nodes: readonly FreeformSceneNode[]
  activeParentPath: ScenePath
  selectedPaths: readonly ScenePath[]
  onNodePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    node: FreeformSceneLeaf,
    path: ScenePath,
    state: SceneNodePointerState,
  ) => void
  onNodeDoubleClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    node: FreeformSceneLeaf,
    path: ScenePath,
    state: SceneNodePointerState,
  ) => void
  onTextChange: (path: ScenePath, text: string) => void
  onTextFocus: (path: ScenePath) => void
}

interface SceneNodeBranchProps extends FreeformSceneNodeViewProps {
  node: FreeformSceneNode
  path: ScenePath
  inheritedLocked: boolean
  inheritedHidden: boolean
  selectedKeys: ReadonlySet<string>
}

function SceneLeafContent({
  leaf,
  readOnly,
  onTextChange,
  onTextFocus,
}: {
  leaf: FreeformSceneLeaf
  readOnly: boolean
  onTextChange: (text: string) => void
  onTextFocus: () => void
}) {
  if (leaf.type === 'text') {
    return (
      <PlainTextEditable
        className="freeform-textbox"
        ariaLabel="文本内容"
        value={leaf.text}
        readOnly={readOnly}
        onFocus={onTextFocus}
        onChange={onTextChange}
        style={{
          fontFamily: leaf.fontFamily,
          fontSize: leaf.fontSize,
          ...textFillToStyle(leaf.textFill),
          textAlign: leaf.align,
          fontWeight: leaf.fontWeight,
        }}
      />
    )
  }

  if (leaf.type === 'image') {
    return (
      <img
        className="freeform-image"
        src={store.images.resolve(leaf.src)}
        alt={leaf.alt}
        draggable={false}
        style={{ objectFit: leaf.fit }}
      />
    )
  }

  if (leaf.type === 'line') {
    const markerId = `arrow-${leaf.id}`
    return (
      <svg
        className="freeform-line"
        data-testid={leaf.lineKind === 'arrow' ? 'freeform-arrow' : 'freeform-line'}
        viewBox={`0 0 ${leaf.width} ${leaf.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {leaf.lineKind === 'arrow' && (
          <defs>
            <marker
              id={markerId}
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill={leaf.stroke} />
            </marker>
          </defs>
        )}
        <line
          x1={leaf.strokeWidth}
          y1={leaf.height / 2}
          x2={leaf.width - leaf.strokeWidth * 2}
          y2={leaf.height / 2}
          stroke={leaf.stroke}
          strokeWidth={leaf.strokeWidth}
          strokeLinecap="round"
          markerEnd={leaf.lineKind === 'arrow' ? `url(#${markerId})` : undefined}
        />
      </svg>
    )
  }

  return (
    <div
      className={`freeform-shape shape-${leaf.shape}`}
      data-testid={leaf.fill.type === 'image' ? 'freeform-shape-image-fill' : 'freeform-shape'}
      style={{
        ...shapeFillToStyle(
          leaf.fill.type === 'image'
            ? { ...leaf.fill, src: store.images.resolve(leaf.fill.src) }
            : leaf.fill,
        ),
        borderColor: leaf.stroke,
        borderWidth: leaf.strokeWidth,
      }}
    />
  )
}

function SceneNodeBranch({
  node,
  path,
  inheritedLocked,
  inheritedHidden,
  selectedKeys,
  ...props
}: SceneNodeBranchProps) {
  const hidden = inheritedHidden || node.hidden
  if (hidden) return null
  const locked = inheritedLocked || node.locked
  const selected = selectedKeys.has(scenePathKey(path))
  const commonData = {
    'data-scene-node-id': node.id,
    'data-scene-root-node': path.length === 1 ? 'true' : undefined,
    'data-selected': selected ? 'true' : 'false',
  }

  if (node.type === 'group') {
    return (
      <div
        className="freeform-scene-group"
        data-testid="freeform-scene-group"
        {...commonData}
        style={{
          position: 'absolute',
          left: node.x,
          top: node.y,
          transform: `rotate(${node.rotation}deg) scale(${node.scale})`,
          transformOrigin: '0 0',
        }}
      >
        {node.children.map((child) => (
          <SceneNodeBranch
            key={child.id}
            {...props}
            node={child}
            path={[...path, child.id]}
            inheritedLocked={locked}
            inheritedHidden={hidden}
            selectedKeys={selectedKeys}
          />
        ))}
      </div>
    )
  }

  const directlyEditable = scenePathKey(path.slice(0, -1)) === scenePathKey(props.activeParentPath)
  const readOnly = locked || !directlyEditable

  return (
    <div
      className="freeform-element"
      data-testid="freeform-element"
      data-scene-leaf="true"
      {...commonData}
      onPointerDown={(event) => {
        props.onNodePointerDown(event, node, path, { locked, hidden })
      }}
      onDoubleClick={(event) => {
        props.onNodeDoubleClick(event, node, path, { locked, hidden })
      }}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `rotate(${node.rotation}deg) scale(${node.scale})`,
      }}
    >
      <SceneLeafContent
        leaf={node}
        readOnly={readOnly}
        onTextChange={(text) => {
          if (!readOnly) props.onTextChange(path, text)
        }}
        onTextFocus={() => {
          if (!readOnly) props.onTextFocus(path)
        }}
      />
    </div>
  )
}

/** Render a complete scene tree without changing its bottom-to-top order. */
export function FreeformSceneNodeView(props: FreeformSceneNodeViewProps) {
  const selectedKeys = new Set(props.selectedPaths.map(scenePathKey))
  return props.nodes.map((node) => (
    <SceneNodeBranch
      key={node.id}
      {...props}
      node={node}
      path={[node.id]}
      inheritedLocked={false}
      inheritedHidden={false}
      selectedKeys={selectedKeys}
    />
  ))
}
