import { useId } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { store } from '../storage'
import { FramedImage } from './FramedImage'
import { PlainTextEditable, type TextSelectionRange } from './PlainTextEditable'
import { splitTextRuns } from './richText'
import { shapeFillToStyle, svgGradientOf, textFillToStyle } from './paint'
import { sceneFilterCss } from './appearance'
import { fitPathData, pathStrokeScale } from './pathData'
import { scenePathKey } from './sceneTree'
import type { ImageDecodeIdentity, ImageDecodeReport } from './imageReadiness'
import type {
  FreeformSceneLeaf,
  FreeformSceneNode,
  ScenePath,
  ShadowPaint,
} from './types'
import { t } from '../i18n'

/** CSS shadow components shared by box-shadow, text-shadow, and drop-shadow. */
function shadowCss(shadow: ShadowPaint): string {
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`
}

/** A node id made safe for an SVG id and its url(#…) reference. */
function svgIdPart(id: string): string {
  return id.replace(/[^\w-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`)
}

export interface SceneNodePointerState {
  locked: boolean
  hidden: boolean
}

export interface FreeformSceneNodeViewProps {
  nodes: readonly FreeformSceneNode[]
  slideId: string
  scopeGeneration?: number
  onImageDecodeReport?: (report: ImageDecodeReport) => void
  presentationOnly?: boolean
  hiddenImageContentPathKey?: string
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
  onTextSelectionChange?: (path: ScenePath, range: TextSelectionRange | null) => void
}

interface SceneNodeBranchProps extends FreeformSceneNodeViewProps {
  node: FreeformSceneNode
  path: ScenePath
  inheritedLocked: boolean
  inheritedHidden: boolean
  selectedKeys: ReadonlySet<string>
  markerIdPrefix: string
}

function SceneLeafContent({
  leaf,
  readOnly,
  presentationOnly,
  markerIdPrefix,
  path,
  slideId,
  scopeGeneration,
  onImageDecodeReport,
  hiddenImageContentPathKey,
  onTextChange,
  onTextFocus,
  onTextSelectionChange,
}: {
  leaf: FreeformSceneLeaf
  readOnly: boolean
  presentationOnly: boolean
  markerIdPrefix: string
  path: ScenePath
  slideId: string
  scopeGeneration?: number
  onImageDecodeReport?: (report: ImageDecodeReport) => void
  hiddenImageContentPathKey?: string
  onTextChange: (text: string) => void
  onTextFocus: () => void
  onTextSelectionChange?: (range: TextSelectionRange | null) => void
}) {
  function decodeIdentity(
    logicalSrc: string,
    resolvedSrc: string,
  ): ImageDecodeIdentity | undefined {
    return !presentationOnly
      && scopeGeneration !== undefined
      && onImageDecodeReport
      ? {
          scopeGeneration,
          slideId,
          scenePathKey: scenePathKey(path),
          logicalSrc,
          resolvedSrc,
        }
      : undefined
  }

  if (leaf.type === 'text') {
    const style = {
      fontFamily: leaf.fontFamily,
      fontSize: leaf.fontSize,
      ...textFillToStyle(leaf.textFill),
      textAlign: leaf.align,
      fontWeight: leaf.fontWeight,
      ...(leaf.lineHeight !== undefined ? { lineHeight: leaf.lineHeight } : {}),
      ...(leaf.letterSpacing !== undefined ? { letterSpacing: `${leaf.letterSpacing}px` } : {}),
      ...(leaf.italic ? { fontStyle: 'italic' as const } : {}),
      ...(leaf.vertical ? { writingMode: 'vertical-rl' as const } : {}),
      ...(leaf.stroke !== undefined
        ? {
          WebkitTextStroke: `${leaf.strokeWidth ?? 1}px ${leaf.stroke}`,
          paintOrder: 'stroke fill' as const,
        }
        : {}),
      ...(leaf.shadow ? { textShadow: shadowCss(leaf.shadow) } : {}),
    }
    if (presentationOnly) {
      return (
        <div className="freeform-preview-textbox" style={style}>
          {splitTextRuns(leaf.text, leaf.spans).map((run, index) =>
            run.bold || run.color
              ? (
                <span
                  key={index}
                  style={{
                    ...(run.bold ? { fontWeight: 700 } : {}),
                    ...(run.color ? { color: run.color } : {}),
                  }}
                >
                  {run.text}
                </span>
              )
              : run.text,
          )}
        </div>
      )
    }

    return (
      <PlainTextEditable
        className="freeform-textbox"
        ariaLabel={t('文本内容')}
        value={leaf.text}
        spans={leaf.spans}
        readOnly={readOnly}
        onFocus={onTextFocus}
        onChange={onTextChange}
        onSelectionChange={onTextSelectionChange}
        style={style}
      />
    )
  }

  if (leaf.type === 'image') {
    const resolvedSrc = store.images.resolve(leaf.src)
    const imageContentIsHidden = !presentationOnly
      && hiddenImageContentPathKey === scenePathKey(path)
    return (
      <div
        className="freeform-image-content-layer"
        data-image-crop-hidden={imageContentIsHidden ? 'true' : undefined}
        style={leaf.shadow ? { boxShadow: shadowCss(leaf.shadow) } : undefined}
      >
        <FramedImage
          logicalSrc={leaf.src}
          resolvedSrc={resolvedSrc}
          fit={leaf.fit}
          framing={leaf.framing}
          frameWidth={leaf.width}
          frameHeight={leaf.height}
          className={presentationOnly ? 'freeform-preview-image' : 'freeform-image'}
          alt={presentationOnly ? '' : leaf.alt}
          decodeIdentity={decodeIdentity(leaf.src, resolvedSrc)}
          onDecodeReport={presentationOnly ? undefined : onImageDecodeReport}
        />
      </div>
    )
  }

  if (leaf.type === 'line') {
    const markerId = `${markerIdPrefix}-arrow-${svgIdPart(leaf.id)}`
    const dotMarkerId = `${markerIdPrefix}-dot-${svgIdPart(leaf.id)}`
    const startArrowMarkerId = `${markerIdPrefix}-arrow-start-${svgIdPart(leaf.id)}`
    // lineKind: 'arrow' stays the default end decoration; an explicit cap overrides it.
    const startCap = leaf.startCap ?? 'none'
    const endCap = leaf.endCap ?? (leaf.lineKind === 'arrow' ? 'arrow' : 'none')
    // A v14 vertex list renders an exact polyline; the endpoints carry the caps.
    // overflow: visible keeps endpoint caps/markers from clipping at the box edge.
    const points = leaf.points
      ? leaf.points.map((point) => `${point.x},${point.y}`).join(' ')
      : undefined
    const markerStart = startCap === 'arrow'
      ? `url(#${startArrowMarkerId})`
      : startCap === 'dot'
        ? `url(#${dotMarkerId})`
        : undefined
    const markerEnd = endCap === 'arrow'
      ? `url(#${markerId})`
      : endCap === 'dot'
        ? `url(#${dotMarkerId})`
        : undefined
    return (
      <svg
        className={presentationOnly ? 'freeform-preview-line' : 'freeform-line'}
        data-testid={presentationOnly ? undefined : leaf.lineKind === 'arrow' ? 'freeform-arrow' : 'freeform-line'}
        viewBox={`0 0 ${leaf.width} ${leaf.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          overflow: 'visible',
          ...(leaf.shadow ? { filter: `drop-shadow(${shadowCss(leaf.shadow)})` } : {}),
        }}
      >
        {(endCap === 'arrow' || startCap === 'arrow') && (
          <defs>
            {endCap === 'arrow' && (
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
            )}
            {startCap === 'arrow' && (
              <marker
                id={startArrowMarkerId}
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto-start-reverse"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 12 6 L 0 12 z" fill={leaf.stroke} />
              </marker>
            )}
          </defs>
        )}
        {(startCap === 'dot' || endCap === 'dot') && (
          <defs>
            <marker
              id={dotMarkerId}
              markerWidth="4"
              markerHeight="4"
              refX="2"
              refY="2"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <circle cx="2" cy="2" r="2" fill={leaf.stroke} />
            </marker>
          </defs>
        )}
        {points !== undefined ? (
          <polyline
            data-testid={presentationOnly ? undefined : 'freeform-polyline'}
            points={points}
            fill="none"
            stroke={leaf.stroke}
            strokeWidth={leaf.strokeWidth}
            strokeLinecap={leaf.cap ?? 'round'}
            strokeLinejoin="round"
            strokeDasharray={leaf.dash !== undefined ? `${leaf.dash} ${leaf.dash}` : undefined}
            markerStart={markerStart}
            markerEnd={markerEnd}
          />
        ) : (
          <line
            x1={leaf.strokeWidth}
            y1={leaf.height / 2}
            x2={leaf.width - leaf.strokeWidth * 2}
            y2={leaf.height / 2}
            stroke={leaf.stroke}
            strokeWidth={leaf.strokeWidth}
            strokeLinecap={leaf.cap ?? 'round'}
            strokeDasharray={leaf.dash !== undefined ? `${leaf.dash} ${leaf.dash}` : undefined}
            markerStart={markerStart}
            markerEnd={markerEnd}
          />
        )}
      </svg>
    )
  }

  if (leaf.type === 'path') {
    // The drawing is redrawn in box pixels, then stroked at one even width.
    const strokeScale = pathStrokeScale(leaf.viewBox, leaf.width, leaf.height)
    const gradient = leaf.fill.type === 'transparent'
      ? null
      : svgGradientOf(leaf.fill, leaf.width, leaf.height)
    const paintId = `${markerIdPrefix}-paint-${svgIdPart(leaf.id)}`
    const fill = leaf.fill.type === 'transparent'
      ? 'none'
      : leaf.fill.type === 'solid'
        ? leaf.fill.color
        : `url(#${paintId})`
    // Three decimals keep float noise out of the markup.
    const strokeWidth = Math.round(leaf.strokeWidth * strokeScale * 1000) / 1000
    const dash = leaf.dash !== undefined ? Math.round(leaf.dash * strokeScale * 1000) / 1000 : undefined
    return (
      <svg
        className={presentationOnly ? 'freeform-preview-path' : 'freeform-path'}
        data-testid={presentationOnly ? undefined : 'freeform-path'}
        viewBox={`0 0 ${leaf.width} ${leaf.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          overflow: 'visible',
          ...(leaf.shadow ? { filter: `drop-shadow(${shadowCss(leaf.shadow)})` } : {}),
        }}
      >
        {gradient && (
          <defs>
            {gradient.kind === 'linear' ? (
              <linearGradient
                id={paintId}
                gradientUnits="userSpaceOnUse"
                x1={gradient.x1}
                y1={gradient.y1}
                x2={gradient.x2}
                y2={gradient.y2}
              >
                {gradient.stops.map((stop, index) => (
                  <stop key={index} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            ) : (
              <radialGradient
                id={paintId}
                gradientUnits="userSpaceOnUse"
                cx={gradient.cx}
                cy={gradient.cy}
                r={gradient.r}
              >
                {gradient.stops.map((stop, index) => (
                  <stop key={index} offset={stop.offset} stopColor={stop.color} />
                ))}
              </radialGradient>
            )}
          </defs>
        )}
        <path
          d={fitPathData(leaf.d, leaf.viewBox, leaf.width, leaf.height) ?? ''}
          fill={fill}
          fillRule={leaf.fillRule ?? 'nonzero'}
          stroke={leaf.strokeWidth > 0 ? leaf.stroke : 'none'}
          strokeWidth={strokeWidth}
          strokeLinecap={leaf.cap ?? 'round'}
          strokeLinejoin={leaf.join ?? 'round'}
          strokeDasharray={dash !== undefined ? `${dash} ${dash}` : undefined}
        />
      </svg>
    )
  }

  const imageFill = leaf.fill.type === 'image' ? leaf.fill : null
  const resolvedFillSrc = imageFill ? store.images.resolve(imageFill.src) : ''
  return (
    <div
      className={`${presentationOnly ? 'freeform-preview-shape' : 'freeform-shape'} shape-${leaf.shape}`}
      data-testid={presentationOnly ? undefined : leaf.fill.type === 'image' ? 'freeform-shape-image-fill' : 'freeform-shape'}
      style={{
        ...(imageFill ? {} : shapeFillToStyle(leaf.fill)),
        borderColor: leaf.stroke,
        borderWidth: leaf.strokeWidth,
        ...(leaf.shape === 'rect' && leaf.cornerRadius !== undefined
          ? { borderRadius: `${leaf.cornerRadius}px` }
          : {}),
        ...(leaf.shadow
          ? (leaf.shape === 'triangle' || leaf.shape === 'star' || leaf.shape === 'hexagon')
            ? { filter: `drop-shadow(${shadowCss(leaf.shadow)})` }
            : { boxShadow: shadowCss(leaf.shadow) }
          : {}),
      }}
    >
      {imageFill && (
        <FramedImage
          logicalSrc={imageFill.src}
          resolvedSrc={resolvedFillSrc}
          fit={imageFill.fit}
          framing={imageFill.framing}
          frameWidth={leaf.width}
          frameHeight={leaf.height}
          className="freeform-shape-image"
          alt={presentationOnly ? '' : leaf.name}
          decodeIdentity={decodeIdentity(imageFill.src, resolvedFillSrc)}
          onDecodeReport={presentationOnly ? undefined : onImageDecodeReport}
        />
      )}
    </div>
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
  // Previews carry the node id too (the headless check measures them by it).
  const commonData = props.presentationOnly
    ? { 'data-preview-node-id': node.id }
    : {
        'data-scene-node-id': node.id,
        'data-scene-root-node': path.length === 1 ? 'true' : undefined,
        'data-selected': selected ? 'true' : 'false',
      }

  if (node.type === 'group') {
    return (
      <div
        className={props.presentationOnly ? 'freeform-preview-group' : 'freeform-scene-group'}
        data-testid={props.presentationOnly ? undefined : 'freeform-scene-group'}
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

  const directlyEditable = !props.presentationOnly
    && scenePathKey(path.slice(0, -1)) === scenePathKey(props.activeParentPath)
  const readOnly = locked || !directlyEditable

  return (
    <div
      className={props.presentationOnly ? 'freeform-preview-element' : 'freeform-element'}
      data-testid={props.presentationOnly ? undefined : 'freeform-element'}
      data-scene-leaf={props.presentationOnly ? undefined : 'true'}
      {...commonData}
      onPointerDown={props.presentationOnly
        ? undefined
        : (event) => props.onNodePointerDown(event, node, path, { locked, hidden })}
      onDoubleClick={props.presentationOnly
        ? undefined
        : (event) => props.onNodeDoubleClick(event, node, path, { locked, hidden })}
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `rotate(${node.rotation}deg) scale(${node.scale})`,
        opacity: node.opacity,
        filter: node.filter ? sceneFilterCss(node.filter) : undefined,
        mixBlendMode: node.blendMode ?? undefined,
      }}
    >
      <SceneLeafContent
        leaf={node}
        readOnly={readOnly}
        presentationOnly={Boolean(props.presentationOnly)}
        markerIdPrefix={props.markerIdPrefix}
        path={path}
        slideId={props.slideId}
        scopeGeneration={props.scopeGeneration}
        onImageDecodeReport={props.onImageDecodeReport}
        hiddenImageContentPathKey={props.hiddenImageContentPathKey}
        onTextChange={(text) => {
          if (!readOnly) props.onTextChange(path, text)
        }}
        onTextFocus={() => {
          if (!readOnly) props.onTextFocus(path)
        }}
        onTextSelectionChange={(range) => {
          if (!readOnly) props.onTextSelectionChange?.(path, range)
        }}
      />
    </div>
  )
}

/** Render a complete scene tree without changing its bottom-to-top order. */
export function FreeformSceneNodeView(props: FreeformSceneNodeViewProps) {
  const markerIdPrefix = useId().replace(/:/g, '')
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
      markerIdPrefix={markerIdPrefix}
    />
  ))
}
