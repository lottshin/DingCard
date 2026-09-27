export interface FreeformDocument {
  documentVersion: 6
  slides: FreeformSlide[]
  activeSlideId: string
}

export interface ImageFraming {
  focusX: number
  focusY: number
  zoom: number
}

export interface FreeformSlide {
  id: string
  name: string
  width: number
  height: number
  background: SlideBackground
  nodes: FreeformSceneNode[]
}

export type ColorPaint =
  | { type: 'solid'; color: string }
  | { type: 'linear-gradient'; from: string; to: string; angle: number }

export type SlideBackground =
  | ColorPaint
  | { type: 'transparent' }

export interface SceneNodeState {
  id: string
  name: string
  locked: boolean
  hidden: boolean
}

/** Drop shadow in px; rendered per leaf kind (box/text shadow or drop-shadow). */
export interface ShadowPaint {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export interface FreeformElementBase extends SceneNodeState {
  type: 'text' | 'image' | 'shape' | 'line'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** Internal uniform scale used to preserve visual lengths across groups. */
  scale: number
  /** Element opacity in [0, 1]; absent means fully opaque. */
  opacity?: number
  /** Drop shadow; absent means none. */
  shadow?: ShadowPaint
}

/**
 * Additive styling for a character range [start, end) inside a text
 * element's plain `text`. Canonical spans are sorted, non-overlapping, and
 * carry at least one of bold/color.
 */
export interface RichTextSpan {
  start: number
  end: number
  bold?: true
  color?: string
}

export interface FreeformTextElement extends FreeformElementBase {
  type: 'text'
  text: string
  /** Optional rich text spans over `text`; absent means plain text. */
  spans?: RichTextSpan[]
  fontSize: number
  fontFamily: string
  textFill: ColorPaint
  align: 'left' | 'center' | 'right'
  fontWeight: 'normal' | 'bold'
  /** Unitless line-height multiplier; absent uses the browser default. */
  lineHeight?: number
  /** Letter spacing in px; may be negative for tighter tracking. */
  letterSpacing?: number
  /** Italic text; absent means upright. */
  italic?: true
}

export interface FreeformImageElement extends FreeformElementBase {
  type: 'image'
  src: string
  alt: string
  fit: 'cover' | 'contain'
  framing: ImageFraming
}

export interface FreeformShapeElement extends FreeformElementBase {
  type: 'shape'
  shape: 'rect' | 'ellipse' | 'triangle'
  fill: ShapeFill
  stroke: string
  strokeWidth: number
  /** Corner radius in px; rendered for rect shapes (overrides the 16px default). */
  cornerRadius?: number
}

export interface FreeformLineElement extends FreeformElementBase {
  type: 'line'
  lineKind: 'line' | 'arrow'
  stroke: string
  strokeWidth: number
}

export type FreeformElement =
  | FreeformTextElement
  | FreeformImageElement
  | FreeformShapeElement
  | FreeformLineElement

/**
 * A scene path contains node IDs from a slide root to one node. The empty
 * path represents the slide-root container rather than a node.
 */
export type ScenePath = readonly string[]

export type FreeformSceneLeaf = FreeformElement

export interface FreeformGroupNode extends SceneNodeState {
  type: 'group'
  /** Group origin in its direct parent's coordinate system. */
  x: number
  y: number
  rotation: number
  scale: number
  children: FreeformSceneNode[]
}

export type FreeformSceneNode = FreeformSceneLeaf | FreeformGroupNode

export type SceneIdFactory = () => string

export interface FreeformNodeContentPatch {
  text?: string
  src?: string
  alt?: string
}

export interface FreeformNodeStylePatch {
  fontSize?: number
  fontFamily?: string
  textFill?: ColorPaint
  align?: 'left' | 'center' | 'right'
  fontWeight?: 'normal' | 'bold'
  /** Replace the text element's spans wholesale; `[]` clears them. */
  spans?: RichTextSpan[]
  /** Unitless line-height multiplier; `null` clears it back to the browser default. */
  lineHeight?: number | null
  /** Letter spacing in px (negative tightens); `null` clears it. */
  letterSpacing?: number | null
  /** Toggle italics; `false` clears the stored italic flag. */
  italic?: boolean
  /** Rectangle corner radius in px; `null` clears it. */
  cornerRadius?: number | null
  /** Element opacity in [0, 1]; `1` restores fully opaque. */
  opacity?: number
  /** Replace the element's drop shadow; `null` clears it. */
  shadow?: ShadowPaint | null
  fit?: 'cover' | 'contain'
  framing?: ImageFraming
  shape?: 'rect' | 'ellipse' | 'triangle'
  fill?: ShapeFill
  stroke?: string
  strokeWidth?: number
  lineKind?: 'line' | 'arrow'
}

export interface FreeformNodeGeometryPatch {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  scale?: number
}

export interface FreeformImageCropPatch {
  x: number
  y: number
  width: number
  height: number
  framing: ImageFraming
}

export interface FreeformNodeContentUpdate {
  path: ScenePath
  patch: FreeformNodeContentPatch
}

export interface FreeformNodeStyleUpdate {
  path: ScenePath
  patch: FreeformNodeStylePatch
}

export interface FreeformNodeGeometryUpdate {
  path: ScenePath
  patch: FreeformNodeGeometryPatch
}

/** Path-based action model for the current recursive scene runtime. */
export type FreeformAction =
  | { type: 'slide/add-after-active'; slideId?: string }
  | {
      type: 'slide/duplicate'
      slideId: string
      duplicateSlideId?: string
      nodeIdFactory?: SceneIdFactory
    }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/select'; slideId: string }
  | {
      type: 'slide/update'
      slideId: string
      patch: Partial<Pick<FreeformSlide, 'name' | 'background'>>
    }
  | { type: 'slide/resize'; slideId: string; width: number; height: number }
  | { type: 'node/set-locked'; slideId: string; path: ScenePath; locked: boolean }
  | { type: 'node/set-hidden'; slideId: string; path: ScenePath; hidden: boolean }
  | { type: 'node/rename'; slideId: string; path: ScenePath; name: string }
  | { type: 'node/update-content'; slideId: string; updates: FreeformNodeContentUpdate[] }
  | { type: 'node/update-style'; slideId: string; updates: FreeformNodeStyleUpdate[] }
  | { type: 'node/update-geometry'; slideId: string; updates: FreeformNodeGeometryUpdate[] }
  | {
      type: 'node/update-image-crop'
      slideId: string
      path: ScenePath
      patch: FreeformImageCropPatch
    }
  | { type: 'node/delete'; slideId: string; parentPath: ScenePath; nodeIds: string[] }
  | {
      type: 'node/reorder'
      slideId: string
      parentPath: ScenePath
      nodeIds: string[]
      direction: 'forward' | 'backward' | 'front' | 'back'
    }
  | {
      type: 'node/reorder-above'
      slideId: string
      parentPath: ScenePath
      nodeIds: string[]
      targetNodeId: string
    }
  | {
      type: 'node/clone'
      slideId: string
      parentPath: ScenePath
      nodeIds: string[]
      idFactory?: SceneIdFactory
    }
  | {
      type: 'node/insert-children'
      slideId: string
      parentPath: ScenePath
      nodes: FreeformSceneNode[]
      index?: number
    }
  | {
      type: 'group/create'
      slideId: string
      parentPath: ScenePath
      nodeIds: string[]
      groupId?: string
      name?: string
    }
  | {
      type: 'group/ungroup'
      slideId: string
      parentPath: ScenePath
      groupIds: string[]
      mode: 'one-level' | 'all-level'
    }
  /**
   * Legacy root-leaf adapters retained only for reducer and migration tests.
   * The shipping workspace uses path-based node actions exclusively.
   */
  | { type: 'element/add'; slideId: string; element: FreeformElement }
  | {
      type: 'element/update'
      slideId: string
      elementId: string
      patch: Partial<FreeformElement>
    }
  | { type: 'element/delete'; slideId: string; elementIds: string[] }
  | {
      type: 'element/reorder'
      slideId: string
      elementIds: string[]
      direction: 'forward' | 'backward' | 'front' | 'back'
    }

export type ShapeFill =
  | ColorPaint
  | { type: 'image'; src: string; fit: 'cover' | 'contain'; framing: ImageFraming }
