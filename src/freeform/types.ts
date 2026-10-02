export interface FreeformDocument {
  documentVersion: 18
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
  /** Editor guides (v10); page-relative lines that never render into exports. */
  guides?: FreeformGuide[]
}

/** One ruler-dragged guide line on a page (v10). */
export interface FreeformGuide {
  id: string
  /** 'x' is a vertical line at that x position; 'y' is a horizontal one. */
  axis: 'x' | 'y'
  /** Page-relative position in [0, width] / [0, height]. */
  position: number
}

/** One color stop on a multi-stop gradient; offsets ascend in [0, 1]. */
export interface GradientStop {
  offset: number
  color: string
}

export type ColorPaint =
  | { type: 'solid'; color: string }
  | { type: 'linear-gradient'; from: string; to: string; angle: number }
  | { type: 'linear-gradient'; stops: GradientStop[]; angle: number }
  /** The v12 centered radial gradient; the radius is the box's farthest corner. */
  | { type: 'radial-gradient'; stops: GradientStop[] }

/** A picture filling its box, framed like an image node: shape fills, and page backgrounds (v16). */
export interface ImagePaint {
  type: 'image'
  src: string
  fit: 'cover' | 'contain'
  framing: ImageFraming
}

export type SlideBackground =
  | ColorPaint
  | { type: 'transparent' }
  /** A picture filling the page (v16), under everything on it. */
  | ImagePaint

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

/**
 * CSS-like filter stack; every value is optional inside the object but at
 * least one must be present. 1 means "unchanged" for the multipliers.
 */
export interface SceneFilter {
  brightness?: number
  contrast?: number
  saturation?: number
  blur?: number
  /** Colour-wheel rotation in degrees (v18); 0/360 leaves colours alone. */
  hue?: number
  /** Desaturation towards grey (v18), 0–1. */
  grayscale?: number
  /** Yellowed vintage cast (v18), 0–1. */
  sepia?: number
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export interface FreeformElementBase extends SceneNodeState {
  type: 'text' | 'image' | 'shape' | 'line' | 'path'
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
  /** Filter stack; absent means unfiltered. */
  filter?: SceneFilter
  /** Blend mode against the artwork below; absent means normal. */
  blendMode?: BlendMode
}

/**
 * A text effect (v17), drawn by textEffects.ts. `amount` (0–100) sizes it as a
 * share of the font size; `angle` (0–360, 0 to the right, 90 down) points it;
 * colours are #RRGGBB.
 */
export type TextEffect =
  /** A glow in `color` around the words. */
  | { type: 'neon'; color: string; amount: number }
  /** An outline outside the words, sticker style. */
  | { type: 'outline'; color: string; amount: number }
  /** Only the words' outline, in their own colour. */
  | { type: 'hollow'; amount: number }
  /** Hollow words over a solid copy shifted along `angle`. */
  | { type: 'splice'; color: string; amount: number; angle: number }
  /** A hard shadow shifted along `angle`. */
  | { type: 'offset'; color: string; amount: number; angle: number }
  /** Two fading copies along `angle`. */
  | { type: 'echo'; color: string; amount: number; angle: number }
  /** Copies in two colours split left and right. */
  | { type: 'glitch'; color: string; color2: string; amount: number }
  /** A solid 3D block along `angle`. */
  | { type: 'extrude'; color: string; amount: number; angle: number }
  /** A label block behind each line; `radius` (0–100) rounds it. */
  | { type: 'background'; color: string; amount: number; radius: number }
  /** A highlighter band across the lower part of each line. */
  | { type: 'marker'; color: string; amount: number }

/**
 * Additive styling for a character range [start, end) inside a text
 * element's plain `text`. Canonical spans are sorted, non-overlapping, and
 * carry at least one of bold/color/highlight/underline.
 */
export interface RichTextSpan {
  start: number
  end: number
  bold?: true
  color?: string
  /** Highlight colour behind the characters (v16). */
  highlight?: string
  /** Underlined characters (v16). */
  underline?: true
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
  /** Vertical text flow (v9); absent means horizontal. */
  vertical?: true
  /** One text effect (v17); absent means none. */
  effect?: TextEffect
  /** Text outline color (v8); absent means no outline. */
  stroke?: string
  /** Text outline width in px (v8). */
  strokeWidth?: number
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
  shape: 'rect' | 'ellipse' | 'triangle' | 'star' | 'hexagon'
  fill: ShapeFill
  stroke: string
  strokeWidth: number
  /** Corner radius in px; rendered for rect shapes (overrides the 16px default). */
  cornerRadius?: number
}

/** One endpoint decoration on a line; 'arrow' and 'dot' draw at the endpoint. */
export type LineEndpointCap = 'none' | 'arrow' | 'dot'

/** One vertex of a polyline, in node-local (unrotated) box coordinates. */
export interface LinePoint {
  x: number
  y: number
}

export interface FreeformLineElement extends FreeformElementBase {
  type: 'line'
  lineKind: 'line' | 'arrow'
  stroke: string
  strokeWidth: number
  /** Unified dash length in px (dash = gap); absent means solid. */
  dash?: number
  /** Stroke cap; absent means round. */
  cap?: 'round' | 'butt' | 'square'
  /** Start endpoint decoration (v13); absent defers to lineKind. */
  startCap?: LineEndpointCap
  /** End endpoint decoration (v13); absent defers to lineKind. */
  endCap?: LineEndpointCap
  /**
   * Polyline vertices (v14), 2–64 points inside the node box; absent renders
   * the classic horizontal segment. The first/last point carry the endpoint caps.
   */
  points?: LinePoint[]
}

/** The coordinate space a path's `d` is written in (v15); it stretches to fill the node box. */
export interface PathViewBox {
  x: number
  y: number
  width: number
  height: number
}

/** A path fills with a color paint or not at all; there are no picture fills. */
export type PathFill = ColorPaint | { type: 'transparent' }

/**
 * A vector drawing (v15): SVG path data in its own viewBox, stretched to the
 * node box. The stroke is measured in viewBox units, so it grows and shrinks
 * with the drawing and stays even when the box changes aspect.
 */
export interface FreeformPathElement extends FreeformElementBase {
  type: 'path'
  /** SVG path data in viewBox coordinates. */
  d: string
  viewBox: PathViewBox
  fill: PathFill
  /** Stroke color (#RRGGBB); a strokeWidth of 0 draws no stroke. */
  stroke: string
  /** Stroke width in viewBox units. */
  strokeWidth: number
  /** Unified dash length in viewBox units (dash = gap); absent means solid. */
  dash?: number
  /** Stroke cap; absent means round. */
  cap?: 'round' | 'butt' | 'square'
  /** Stroke corner join; absent means round. */
  join?: 'round' | 'miter' | 'bevel'
  /** How overlapping subpaths fill; absent means nonzero. */
  fillRule?: 'nonzero' | 'evenodd'
}

export type FreeformElement =
  | FreeformTextElement
  | FreeformImageElement
  | FreeformShapeElement
  | FreeformLineElement
  | FreeformPathElement

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
  /** A path's drawing (v15); valid SVG path data in its viewBox. */
  d?: string
  /** A path's coordinate space (v15). */
  viewBox?: PathViewBox
}

export interface FreeformNodeStylePatch {
  /** A text's effect (v17); `null` removes it. */
  effect?: TextEffect | null
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
  /** Toggle vertical text flow (v9); `false` restores horizontal. */
  vertical?: boolean
  /** Rectangle corner radius in px; `null` clears it. */
  cornerRadius?: number | null
  /** Element opacity in [0, 1]; `1` restores fully opaque. */
  opacity?: number
  /** Replace the element's drop shadow; `null` clears it. */
  shadow?: ShadowPaint | null
  /** Replace the element's filter stack; `null` clears it. */
  filter?: SceneFilter | null
  /** Blend mode against the artwork below; `null` restores normal. */
  blendMode?: BlendMode | null
  fit?: 'cover' | 'contain'
  framing?: ImageFraming
  shape?: 'rect' | 'ellipse' | 'triangle' | 'star' | 'hexagon'
  /** Shape fill, or a path fill (v15; no picture fills on paths). */
  fill?: ShapeFill
  /** Shape/line/path stroke color, or the text outline color; text `null` clears it. */
  stroke?: string | null
  /** Shape/line/path stroke width, or the text outline width; text `null` clears it. */
  strokeWidth?: number | null
  lineKind?: 'line' | 'arrow'
  /** Unified dash length (px on lines, viewBox units on paths); `null` restores a solid stroke. */
  dash?: number | null
  cap?: 'round' | 'butt' | 'square'
  /** Path stroke corner join (v15). */
  join?: 'round' | 'miter' | 'bevel'
  /** Path fill rule for overlapping subpaths (v15). */
  fillRule?: 'nonzero' | 'evenodd'
  /** Line start endpoint decoration (v13); `null` defers to lineKind. */
  startCap?: LineEndpointCap | null
  /** Line end endpoint decoration (v13); `null` defers to lineKind. */
  endCap?: LineEndpointCap | null
  /** Replace the line's polyline vertices (v14) wholesale. */
  points?: LinePoint[]
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
  | { type: 'slide/reorder'; slideId: string; targetIndex: number }
  | {
      type: 'slide/update'
      slideId: string
      patch: Partial<Pick<FreeformSlide, 'name' | 'background'>>
    }
  | { type: 'slide/resize'; slideId: string; width: number; height: number }
  | { type: 'guides/set'; slideId: string; guides: FreeformGuide[] }
  /**
   * Restyle every page at once (restyle.ts): a curated palette or font set,
   * then exact colours and fonts replaced wherever they appear.
   */
  | {
      type: 'document/restyle'
      /** A curated palette id (PALETTES), mapped onto the colours the deck has. */
      palette?: string
      /** A curated font set id (FONT_SETS): its heading font for large text, its body font for the rest. */
      fontSet?: string
      /** #RRGGBB → #RRGGBB, keyed by the colours the deck has now; wins over the palette. */
      colors?: Record<string, string>
      /** Font family → font family, keyed by the families the deck has now; wins over the font set. */
      fonts?: Record<string, string>
    }
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
  /** The v11 no-fill variant: an outline-only shape. */
  | { type: 'transparent' }
  | ImagePaint
