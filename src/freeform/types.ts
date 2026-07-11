export interface FreeformDocument {
  documentVersion: 1
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

export type SlideBackground =
  | { type: 'solid'; color: string }
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
  color: string
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

export type ShapeFill =
  | { type: 'solid'; color: string }
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
