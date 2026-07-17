export interface FreeformDocument {
  documentVersion: 2
  slides: FreeformSlide[]
  activeSlideId: string
}

export interface FreeformSlide {
  id: string
  name: string
  width: number
  height: number
  background: SlideBackground
  elements: FreeformElement[]
}

export type ColorPaint =
  | { type: 'solid'; color: string }
  | { type: 'linear-gradient'; from: string; to: string; angle: number }

export type SlideBackground =
  | ColorPaint
  | { type: 'transparent' }

export interface FreeformElementBase {
  id: string
  type: 'text' | 'image' | 'shape' | 'line'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface FreeformTextElement extends FreeformElementBase {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  textFill: ColorPaint
  align: 'left' | 'center' | 'right'
  fontWeight: 'normal' | 'bold'
}

export interface FreeformImageElement extends FreeformElementBase {
  type: 'image'
  src: string
  alt: string
  fit: 'cover' | 'contain'
}

export interface FreeformShapeElement extends FreeformElementBase {
  type: 'shape'
  shape: 'rect' | 'ellipse' | 'triangle'
  fill: ShapeFill
  stroke: string
  strokeWidth: number
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

export interface SceneNodeState {
  id: string
  name: string
  locked: boolean
  hidden: boolean
}

export type FreeformSceneLeaf = FreeformElement &
  SceneNodeState & {
    /** Internal uniform scale used to preserve visual lengths across groups. */
    scale: number
  }

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

/** Additive v3 model. The shipping FreeformSlide alias remains v2 for now. */
export interface FreeformSlideV3 {
  id: string
  name: string
  width: number
  height: number
  background: SlideBackground
  nodes: FreeformSceneNode[]
}

/** Additive v3 model. The shipping FreeformDocument alias remains v2 for now. */
export interface FreeformDocumentV3 {
  documentVersion: 3
  slides: FreeformSlideV3[]
  activeSlideId: string
}

export type ShapeFill =
  | ColorPaint
  | { type: 'image'; src: string; fit: 'cover' | 'contain' }

export type FreeformAction =
  | { type: 'slide/add-after-active' }
  | { type: 'slide/duplicate'; slideId: string }
  | { type: 'slide/delete'; slideId: string }
  | { type: 'slide/select'; slideId: string }
  | { type: 'slide/update'; slideId: string; patch: Partial<Pick<FreeformSlide, 'name' | 'background'>> }
  | { type: 'slide/resize'; slideId: string; width: number; height: number }
  | { type: 'element/add'; slideId: string; element: FreeformElement }
  | { type: 'element/update'; slideId: string; elementId: string; patch: Partial<FreeformElement> }
  | { type: 'element/delete'; slideId: string; elementIds: string[] }
  | {
      type: 'element/reorder'
      slideId: string
      elementIds: string[]
      direction: 'forward' | 'backward' | 'front' | 'back'
    }
