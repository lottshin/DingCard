import { useId } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { store } from '../storage'
import { FramedImage } from './FramedImage'
import { PlainTextEditable, type TextSelectionRange } from './PlainTextEditable'
import { isStyledRun, splitParagraphRuns, textRunStyle, type TextRun } from './richText'
import { paintFallbackColor, shapeFillToStyle, svgGradientOf, textFillToStyle } from './paint'
import { bubbleClipPath, starClipPath } from './shapeGeometry'
import { QR_ECL_DEFAULT } from './qrCode'
import { barChartGeometry, lineChartGeometry, radarChartGeometry, ringChartGeometry, type ChartLegendItem } from './charts'
import { qrMatrix, qrModulePaths } from './qrMatrix'
import { sceneFilterCss } from './appearance'
import { fitPathData, pathStrokeScale } from './pathData'
import { effectHollowsWords, textEffectLayer, textEffectWordsStyle } from './textEffects'
import { keepsEmptyLine, textLayoutAttributes, textLayoutStyle } from './textLayout'
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
    // What lays the words out; the effect layer copies it so its words land exactly under the text's.
    const layout = textLayoutStyle(leaf)
    const layoutAttributes = textLayoutAttributes(leaf)
    const effect = leaf.effect
    const effectLayer = effect ? textEffectLayer(effect, leaf.fontSize) : null
    const textColor = leaf.textFill.type === 'solid' ? leaf.textFill.color : paintFallbackColor(leaf.textFill)
    const style = {
      ...layout,
      ...textFillToStyle(leaf.textFill),
      ...(leaf.stroke !== undefined
        ? {
          WebkitTextStroke: `${leaf.strokeWidth ?? 1}px ${leaf.stroke}`,
          paintOrder: 'stroke fill' as const,
        }
        : {}),
      ...(leaf.shadow ? { textShadow: shadowCss(leaf.shadow) } : {}),
      ...(effect ? textEffectWordsStyle(effect, leaf.fontSize, textColor) : {}),
      // Above the effect layer, which sits under it in the same box.
      ...(effectLayer ? { position: 'relative' as const } : {}),
    }
    const paragraphs = splitParagraphRuns(leaf.text, leaf.spans)
    // Gradient text shows its gradient through see-through glyphs; styled runs
    // that paint over it fall back to the gradient's first colour. Hollow words keep only their outline.
    const runFallbackColor = leaf.textFill.type === 'solid' || effectHollowsWords(effect)
      ? undefined
      : paintFallbackColor(leaf.textFill)
    // The effect's copy of the words needs only what moves them: weight and size.
    const layerRun = (run: TextRun, index: number) => {
      if (!run.bold && run.fontSize === undefined) return run.text
      const { fontWeight, fontSize } = textRunStyle({ text: '', bold: run.bold, fontSize: run.fontSize }, undefined, leaf.fontSize)
      return <span key={index} style={{ fontWeight, fontSize }}>{run.text}</span>
    }
    const layer = effectLayer && (
      <div className="freeform-text-effect" aria-hidden="true" {...layoutAttributes} style={{ ...layout, ...effectLayer.style }}>
        {paragraphs.map((paragraph, index) => (
          <div key={index}>
            {effectLayer.band
              ? <span className="freeform-text-effect-band" style={effectLayer.band}>{paragraph.map(layerRun)}</span>
              : paragraph.map(layerRun)}
            {keepsEmptyLine(paragraph, index, paragraphs.length) && <br />}
          </div>
        ))}
      </div>
    )
    if (presentationOnly) {
      return (
        <>
          {layer}
          <div className="freeform-preview-textbox" {...layoutAttributes} style={style}>
            {paragraphs.map((paragraph, index) => (
              <div key={index}>
                {paragraph.map((run, runIndex) =>
                  isStyledRun(run)
                    ? <span key={runIndex} style={textRunStyle(run, runFallbackColor, leaf.fontSize)}>{run.text}</span>
                    : run.text,
                )}
                {keepsEmptyLine(paragraph, index, paragraphs.length) && <br />}
              </div>
            ))}
          </div>
        </>
      )
    }

    return (
      <>
      {layer}
      <PlainTextEditable
        className="freeform-textbox"
        ariaLabel={t('文本内容')}
        value={leaf.text}
        spans={leaf.spans}
        baseFontSize={leaf.fontSize}
        attributes={layoutAttributes}
        runFallbackColor={runFallbackColor}
        readOnly={readOnly}
        onFocus={onTextFocus}
        onChange={onTextChange}
        onSelectionChange={onTextSelectionChange}
        style={style}
      />
      </>
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
        style={{
          ...(leaf.shadow ? { boxShadow: shadowCss(leaf.shadow) } : {}),
          // Rounded corners clip the picture; the shadow follows the same radius.
          ...(leaf.cornerRadius !== undefined
            ? { borderRadius: `${leaf.cornerRadius}px`, overflow: 'hidden' }
            : {}),
          // The frame shows when both colour and width are set; it follows the radius.
          ...(leaf.stroke !== undefined && leaf.strokeWidth !== undefined
            ? { border: `${leaf.strokeWidth}px solid ${leaf.stroke}` }
            : {}),
          ...(leaf.filter ? { filter: sceneFilterCss(leaf.filter) } : {}),
        }}
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
    const paintId = `${markerIdPrefix}-paint-${svgIdPart(leaf.id)}`
    // Three decimals keep float noise out of the markup.
    const strokeWidth = Math.round(leaf.strokeWidth * strokeScale * 1000) / 1000
    const dash = leaf.dash !== undefined ? Math.round(leaf.dash * strokeScale * 1000) / 1000 : undefined
    const boxPathData = fitPathData(leaf.d, leaf.viewBox, leaf.width, leaf.height) ?? ''
    // A picture fill turns the outline into an image frame: the picture sits
    // in a div clipped to the path (like shape picture fills), the stroke
    // redraws on top so its width keeps scaling with the drawing.
    const imageFill = leaf.fill.type === 'image' ? leaf.fill : null
    const resolvedFillSrc = imageFill ? store.images.resolve(imageFill.src) : ''
    const strokePath = (
      <path
        d={boxPathData}
        fill={imageFill ? 'none' : leaf.fill.type === 'transparent'
          ? 'none'
          : leaf.fill.type === 'solid'
            ? leaf.fill.color
            : `url(#${paintId})`}
        fillRule={leaf.fillRule ?? 'nonzero'}
        stroke={leaf.strokeWidth > 0 ? leaf.stroke : 'none'}
        strokeWidth={strokeWidth}
        strokeLinecap={leaf.cap ?? 'round'}
        strokeLinejoin={leaf.join ?? 'round'}
        strokeDasharray={dash !== undefined ? `${dash} ${dash}` : undefined}
      />
    )
    if (imageFill) {
      return (
        <div
          className="freeform-path-image-root"
          style={leaf.shadow ? { filter: `drop-shadow(${shadowCss(leaf.shadow)})` } : undefined}
        >
          <div
            className="freeform-path-image-clip"
            data-testid={presentationOnly ? undefined : 'freeform-path-image-fill'}
            style={{ clipPath: `path("${boxPathData}")` }}
          >
            <FramedImage
              logicalSrc={imageFill.src}
              resolvedSrc={resolvedFillSrc}
              fit={imageFill.fit}
              framing={imageFill.framing}
              frameWidth={leaf.width}
              frameHeight={leaf.height}
              className="freeform-path-image"
              alt={presentationOnly ? '' : leaf.name}
              decodeIdentity={decodeIdentity(imageFill.src, resolvedFillSrc)}
              onDecodeReport={presentationOnly ? undefined : onImageDecodeReport}
            />
          </div>
          <svg
            className={presentationOnly ? 'freeform-preview-path' : 'freeform-path'}
            data-testid={presentationOnly ? undefined : 'freeform-path'}
            viewBox={`0 0 ${leaf.width} ${leaf.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={{ overflow: 'visible' }}
          >
            {strokePath}
          </svg>
        </div>
      )
    }
    // Picture fills returned above; what is left paints with a colour.
    const colorFill = leaf.fill.type === 'image' ? null : leaf.fill
    const gradient = colorFill && colorFill.type !== 'transparent'
      ? svgGradientOf(colorFill, leaf.width, leaf.height)
      : null
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
        {strokePath}
      </svg>
    )
  }

  if (leaf.type === 'chart') {
    // One to three labelled series drawn as bars, a ring, or a line. The view
    // box is the node box in px, so labels size with the element.
    const showValues = leaf.showValues === true
    const fontSize = Math.max(9, Math.min(leaf.height * 0.062, 15))
    const fontColor = '#3f3f46'
    const commonText = {
      textAnchor: 'middle' as const,
      fontFamily: 'inherit',
      fontSize,
      fill: fontColor,
    }
    const tickFont = Math.max(8, Math.min(leaf.height * 0.055, 12))
    const axisMarks = (axis: { ticks: Array<{ y: number; text: string }>; leftPad: number } | null) => (
      axis ? (
        <>
          {axis.ticks.map((tick, index) => (
            <g key={index} data-testid="freeform-chart-axis">
              <line
                x1={axis.leftPad - 2}
                y1={tick.y}
                x2={leaf.width}
                y2={tick.y}
                stroke={fontColor}
                strokeWidth={1}
                opacity={0.2}
              />
              <text
                x={axis.leftPad - 5}
                y={tick.y + tickFont * 0.35}
                textAnchor="end"
                fontFamily="inherit"
                fontSize={tickFont}
                fill={fontColor}
                opacity={0.8}
              >
                {tick.text}
              </text>
            </g>
          ))}
        </>
      ) : null
    )
    const legend = (items: ChartLegendItem[], scale: number) => items.map((item, index) => (
      <g key={index} data-testid="freeform-chart-legend-item">
        <rect
          x={item.x}
          y={item.y - scale * 0.62}
          width={scale * 0.62}
          height={scale * 0.62}
          rx={scale * 0.16}
          fill={item.color}
        />
        <text
          x={item.x + scale * 0.62 + scale * 0.34}
          y={item.y}
          textAnchor="start"
          fontFamily="inherit"
          fontSize={scale}
          fill={fontColor}
        >
          {item.text}
        </text>
      </g>
    ))
    return (
      <svg
        className={presentationOnly ? 'freeform-preview-chart' : 'freeform-chart'}
        data-testid={presentationOnly ? undefined : 'freeform-chart'}
        viewBox={`0 0 ${Math.max(1, leaf.width)} ${Math.max(1, leaf.height)}`}
        aria-hidden="true"
        style={leaf.shadow ? { filter: `drop-shadow(${shadowCss(leaf.shadow)})` } : undefined}
      >
        {leaf.chartKind === 'bar' && (() => {
          const chart = barChartGeometry(leaf.width, leaf.height, leaf.labels, leaf.series, {
            showValues,
            mode: leaf.barMode ?? 'grouped',
          })
          return (
            <>
              {legend(chart.legend, fontSize)}
              {axisMarks(chart.axis)}
              {chart.bars.map((bar, index) => (
                <rect
                  key={index}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx={Math.min(bar.width / 4, 6)}
                  fill={bar.color}
                />
              ))}
              <line x1={chart.axis ? chart.axis.leftPad - 2 : 0} y1={chart.baseline.y} x2={leaf.width} y2={chart.baseline.y} stroke={fontColor} strokeWidth={1} opacity={0.35} />
              {chart.labels.map((label, index) => (
                <text key={index} x={label.x} y={label.y} {...commonText}>
                  {label.lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={label.x} dy={lineIndex === 0 ? 0 : fontSize * 1.2}>{line}</tspan>
                  ))}
                </text>
              ))}
              {chart.values.map((value, index) => (
                <text key={index} x={value.x} y={value.y} {...commonText} fontWeight={600}>{value.text}</text>
              ))}
              {chart.percents.map((percent, index) => (
                <text key={index} x={percent.x} y={percent.y} {...commonText} fontWeight={600} fill="#ffffff">{percent.text}</text>
              ))}
            </>
          )
        })()}
        {leaf.chartKind === 'line' && (() => {
          const chart = lineChartGeometry(leaf.width, leaf.height, leaf.labels, leaf.series, { showValues })
          return (
            <>
              {legend(chart.legend, fontSize)}
              {axisMarks(chart.axis)}
              {chart.lines.map((line, lineIndex) => (
                <g key={lineIndex}>
                  {line.area && <path d={line.area} fill={line.color} opacity={0.14} />}
                  {line.points.length > 1 && (
                    <polyline
                      points={line.points.map((point) => `${point.x},${point.y}`).join(' ')}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={Math.max(2, leaf.height * 0.012)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {line.dots.map((dot, index) => (
                    <circle key={index} cx={dot.x} cy={dot.y} r={Math.max(3, leaf.height * 0.014)} fill={line.color} />
                  ))}
                  {line.values.map((value, index) => (
                    <text key={index} x={value.x} y={value.y} {...commonText} fontWeight={600}>{value.text}</text>
                  ))}
                </g>
              ))}
              <line x1={chart.axis.leftPad - 2} y1={chart.baseline.y} x2={leaf.width} y2={chart.baseline.y} stroke={fontColor} strokeWidth={1} opacity={0.35} />
              {chart.labels.map((label, index) => (
                <text key={index} x={label.x} y={label.y} {...commonText}>
                  {label.lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={label.x} dy={lineIndex === 0 ? 0 : fontSize * 1.2}>{line}</tspan>
                  ))}
                </text>
              ))}
            </>
          )
        })()}
        {leaf.chartKind === 'radar' && (() => {
          const chart = radarChartGeometry(leaf.width, leaf.height, leaf.labels, leaf.series, { showValues })
          return (
            <>
              {legend(chart.legend, fontSize)}
              {chart.rings.map((d, index) => (
                <path
                  key={index}
                  d={d}
                  fill="none"
                  stroke={fontColor}
                  strokeWidth={index === 0 ? 1 : 0.6}
                  opacity={index === 0 ? 0.35 : 0.18}
                />
              ))}
              {chart.axes.map((axis, index) => (
                <line
                  key={index}
                  x1={axis.x1}
                  y1={axis.y1}
                  x2={axis.x2}
                  y2={axis.y2}
                  stroke={fontColor}
                  strokeWidth={0.6}
                  opacity={0.18}
                  data-testid="freeform-chart-axis"
                />
              ))}
              {chart.series.map((entry, index) => (
                <g key={index}>
                  <path d={entry.d} fill={entry.color} opacity={0.18} />
                  <path d={entry.d} fill="none" stroke={entry.color} strokeWidth={Math.max(2, leaf.height * 0.012)} strokeLinejoin="round" />
                  {entry.values.map((value, valueIndex) => (
                    <text key={valueIndex} x={value.x} y={value.y} {...commonText} fontWeight={600}>{value.text}</text>
                  ))}
                </g>
              ))}
              {chart.labels.map((label, index) => (
                <text key={index} x={label.x} y={label.y} {...commonText}>
                  {label.lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={label.x} dy={lineIndex === 0 ? 0 : fontSize * 1.2}>{line}</tspan>
                  ))}
                </text>
              ))}
            </>
          )
        })()}
        {leaf.chartKind === 'ring' && (() => {
          const chart = ringChartGeometry(leaf.series, { showValues })
          return (
            <>
              {chart.segments.length === 0
                ? <circle cx={50} cy={50} r={34} fill="none" stroke={chart.track} strokeWidth={17} />
                : chart.segments.map((segment, index) => (
                  <path key={index} d={segment.d} fill={segment.color} data-testid="freeform-chart-segment" />
                ))}
              {chart.segments.map((segment, index) => (
                segment.label && (
                  <text
                    key={index}
                    x={segment.label.x}
                    y={segment.label.y}
                    textAnchor="middle"
                    fontFamily="inherit"
                    fontSize={7}
                    fontWeight={600}
                    fill="#ffffff"
                  >
                    {segment.label.text}
                  </text>
                )
              ))}
              {legend(chart.legend, 6.5)}
            </>
          )
        })()}
      </svg>
    )
  }

  if (leaf.type === 'qrcode') {
    // The spec's quiet zone: 2 modules of background on every side. The SVG
    // scales to the node box and stays square (meet) inside it.
    const quiet = 2
    const style = leaf.moduleStyle ?? 'square'
    // A logo covers the centre, so its code is generated at the highest
    // error correction no matter what the stored level says.
    const hasLogo = leaf.logoSrc !== undefined && leaf.logoSrc !== ''
    const matrix = qrMatrix(leaf.payload, hasLogo ? 'H' : leaf.ecl ?? QR_ECL_DEFAULT)
    const total = (matrix ? matrix.size : 21) + quiet * 2
    const paths = matrix ? qrModulePaths(matrix, quiet, style) : null
    const logoSrc = leaf.logoSrc !== undefined && leaf.logoSrc !== ''
      ? store.images.resolve(leaf.logoSrc)
      : ''
    // The logo sits on a light plate at a quarter of the code's edge: big
    // enough to read, small enough for H to recover what it covers.
    const logoSize = total * 0.25
    const logoCorner = (total - logoSize) / 2
    return (
      <svg
        className={presentationOnly ? 'freeform-preview-qrcode' : 'freeform-qrcode'}
        data-testid={presentationOnly ? undefined : 'freeform-qrcode'}
        viewBox={`0 0 ${total} ${total}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={leaf.shadow ? { filter: `drop-shadow(${shadowCss(leaf.shadow)})` } : undefined}
      >
        <rect x={0} y={0} width={total} height={total} fill={leaf.light} />
        {paths && (style === 'square'
          ? <path d={`${paths.finder}${paths.data}`} fill={leaf.dark} />
          : (
            <>
              <path d={paths.finder} fill={leaf.dark} />
              <path
                d={paths.data}
                fill={leaf.dark}
                stroke={style === 'rounded' ? leaf.dark : undefined}
                strokeWidth={style === 'rounded' ? 0.42 : undefined}
                strokeLinejoin={style === 'rounded' ? 'round' : undefined}
              />
            </>
          ))}
        {logoSrc && (
          <>
            <rect
              data-testid="freeform-qrcode-logo-plate"
              x={logoCorner - 0.5}
              y={logoCorner - 0.5}
              width={logoSize + 1}
              height={logoSize + 1}
              rx={1.5}
              fill={leaf.light}
            />
            <image
              data-testid="freeform-qrcode-logo"
              href={logoSrc}
              x={logoCorner}
              y={logoCorner}
              width={logoSize}
              height={logoSize}
              preserveAspectRatio="xMidYMid meet"
            />
          </>
        )}
      </svg>
    )
  }

  const imageFill = leaf.fill.type === 'image' ? leaf.fill : null
  const resolvedFillSrc = imageFill ? store.images.resolve(imageFill.src) : ''
  // Parametric shapes clip inline: a star with an explicit inner ratio and
  // every bubble compute their polygon; the fixed shapes keep their class.
  const parametricClipPath = leaf.shape === 'star' && leaf.starInnerRatio !== undefined
    ? starClipPath(leaf.starInnerRatio)
    : leaf.shape === 'bubble'
      ? bubbleClipPath(leaf.width, leaf.height, leaf.bubbleTailX ?? 0.5)
      : null
  // Clipped shapes cannot carry a box shadow: it would draw the rectangle.
  const clippedShape = leaf.shape === 'triangle'
    || leaf.shape === 'star'
    || leaf.shape === 'hexagon'
    || leaf.shape === 'diamond'
    || leaf.shape === 'pentagon'
    || leaf.shape === 'heart'
    || leaf.shape === 'bubble'
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
        ...(parametricClipPath ? { clipPath: parametricClipPath } : {}),
        ...(leaf.shadow
          ? clippedShape
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
