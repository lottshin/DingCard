// The decoration library: hand-drawn lines, stickers and labels that drop onto
// a page from the Elements panel, and that agents place with the MCP server's
// add_decorations. A decoration is drawn in its own box; it becomes one node
// (a path, or a text with a label effect) or a group of a few, scaled to the
// size it is placed at, and repainted in the colour it is given.

import { randomId } from '../uid'
import {
  arrowHead,
  brushStroke,
  circle,
  coords,
  heart,
  jitter,
  loopPoints,
  polyline,
  roundedPolygon,
  sampleCurve,
  scallop,
  smoothPath,
  sparkle,
  spiralPoints,
  starPoints,
  wavePoints,
  type Point,
} from './decorationGeometry'
import { pathDataBounds } from './pathData'
import type {
  BlendMode,
  FreeformGroupNode,
  FreeformPathElement,
  FreeformSceneNode,
  FreeformShapeElement,
  FreeformTextElement,
  ShadowPaint,
  TextEffect,
} from './types'

export type DecorationCategory = 'hand-drawn' | 'sticker' | 'label'

/** The categories in the order the Elements panel shows them. */
export const DECORATION_CATEGORIES: ReadonlyArray<{ id: DecorationCategory; zh: string; en: string }> = [
  { id: 'hand-drawn', zh: '手绘线条', en: 'Hand-drawn' },
  { id: 'sticker', zh: '贴纸', en: 'Stickers' },
  { id: 'label', zh: '标签', en: 'Labels' },
]

/** What a decoration is painted with: its main colour, and for labels the words on it. */
export interface DecorationPaint {
  color: string
  text: string
}

/** One drawn part, in the decoration box's own coordinates. */
export type DecorationPart =
  | {
      kind: 'path'
      d: string
      fill?: string
      stroke?: string
      strokeWidth?: number
      opacity?: number
      blendMode?: BlendMode
      fillRule?: 'evenodd'
      dash?: number
      shadow?: ShadowPaint
    }
  | {
      kind: 'shape'
      shape: 'rect' | 'ellipse'
      x: number
      y: number
      width: number
      height: number
      fill?: string
      stroke?: string
      strokeWidth?: number
      cornerRadius?: number
    }
  | {
      kind: 'text'
      /** Where the line of words sits; the text box adds its own padding around it. */
      x: number
      y: number
      width: number
      height: number
      text: string
      fontSize: number
      color: string
      fontFamily?: string
      fontWeight?: 'normal' | 'bold'
      letterSpacing?: number
      rotation?: number
      effect?: TextEffect
    }

export interface DecorationDefinition {
  id: string
  zh: string
  en: string
  category: DecorationCategory
  /** Extra words it is searched by, in both languages. */
  keywords: string
  /** The box it is drawn in (its parts' coordinates); it lands at the size of what is drawn, in those proportions. */
  width: number
  height: number
  /** The colour it comes in. */
  color: string
  /** Labels: the words they come with, per interface language. */
  text?: { zh: string; en: string }
  /** Turned this many degrees as it lands (a stamp, a strip of tape). */
  rotation?: number
  /** How wide it lands, as a share of the page's shorter side. */
  share: number
  parts: (paint: DecorationPaint) => DecorationPart[]
}

const INK = '#1c1917'
const RED = '#e8453c'
const YELLOW = '#ffd23f'
const GOLD = '#ffc53d'
const GREEN = '#1f9d63'
const PINK = '#ff7a9c'
const LABEL_FONT = 'PingFang SC, Microsoft YaHei, system-ui, sans-serif'
const HAND_FONT = "'LXGW WenKai TC', cursive"

function channels(color: string): [number, number, number] {
  const value = Number.parseInt(color.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** `color` moved `amount` (0–1) of the way to `other`. */
export function mixColor(color: string, other: string, amount: number): string {
  const from = channels(color)
  const to = channels(other)
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Words that read on `color`: white wherever white reaches the 3:1 a label's
 * large bold words need (badges look printed in white), ink on light colours.
 */
export function wordsOn(color: string): string {
  const [red, green, blue] = channels(color).map((channel) => {
    const scaled = channel / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return 1.05 / (luminance + 0.05) >= 3 ? '#ffffff' : INK
}

const stroked = (d: string, color: string, strokeWidth: number): DecorationPart => ({ kind: 'path', d, stroke: color, strokeWidth })
const filled = (d: string, color: string, outline?: { color: string; width: number }): DecorationPart => ({
  kind: 'path',
  d,
  fill: color,
  ...(outline ? { stroke: outline.color, strokeWidth: outline.width } : {}),
})
const OUTLINE = { color: INK, width: 4 }

/** A curve through the points with an open arrowhead where it ends, pointing the way the curve runs. */
function curvedArrow(points: readonly Point[], head: number, spread = 30): string {
  const samples = sampleCurve(points, 12)
  const tip = samples[samples.length - 1]
  const from = samples[samples.length - 4]
  return smoothPath(points) + arrowHead(tip, from, head, spread)
}

/** Short strokes radiating from (cx, cy) at the given angles (degrees, 0 to the right, clockwise), from `inner` to `outer`. */
function rays(cx: number, cy: number, angles: readonly number[], inner: number, outer: number | readonly number[]): string {
  return angles.map((angle, index) => {
    const radians = (angle * Math.PI) / 180
    const reach = typeof outer === 'number' ? outer : outer[index]
    const from: Point = [cx + Math.cos(radians) * inner, cy + Math.sin(radians) * inner]
    const to: Point = [cx + Math.cos(radians) * reach, cy + Math.sin(radians) * reach]
    return polyline([from, to])
  }).join('')
}

/** A capsule from radius `inner` to `outer` along `angle` around (cx, cy), `width` across. */
function ray(cx: number, cy: number, angle: number, inner: number, outer: number, width: number): string {
  const radians = (angle * Math.PI) / 180
  const [ux, uy] = [Math.cos(radians), Math.sin(radians)]
  const [nx, ny] = [-uy * (width / 2), ux * (width / 2)]
  const corner = (reach: number, side: number): Point => [cx + ux * reach + nx * side, cy + uy * reach + ny * side]
  const r = width / 2
  return `M${coords(corner(inner, 1))}L${coords(corner(outer, 1))}A${r} ${r} 0 0 0 ${coords(corner(outer, -1))}`
    + `L${coords(corner(inner, -1))}A${r} ${r} 0 0 0 ${coords(corner(inner, 1))}Z`
}

/** Petals around (cx, cy): `count` circles of `radius` at `distance`, drawn as one outline. */
function petals(cx: number, cy: number, count: number, distance: number, radius: number): string {
  const half = Math.PI / count
  const middle = distance * Math.cos(half)
  const along = Math.sqrt(Math.max(0, radius * radius - (distance * Math.sin(half)) ** 2))
  // Where neighbouring petals meet, on the outside.
  const valleys = Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (2 * index + 1) * half
    return [cx + Math.cos(angle) * (middle + along), cy + Math.sin(angle) * (middle + along)] as Point
  })
  const start = valleys[count - 1]
  return `M${coords(start)}${valleys.map((valley) => `A${radius} ${radius} 0 1 1 ${coords(valley)}`).join('')}Z`
}

/** Words centred on one line in a box, for labels (the line is as tall as the box). */
function words(
  paint: DecorationPaint,
  box: { x: number; y: number; width: number; height: number },
  fontSize: number,
  color: string,
  options: Partial<Extract<DecorationPart, { kind: 'text' }>> = {},
): DecorationPart {
  return {
    kind: 'text',
    ...box,
    text: paint.text,
    fontSize,
    color,
    fontFamily: LABEL_FONT,
    fontWeight: 'bold',
    ...options,
  }
}

export const DECORATIONS: readonly DecorationDefinition[] = [
  // --- Hand-drawn lines: a pen's marks around and under words ---
  {
    id: 'circle-scribble',
    zh: '手绘圈',
    en: 'Scribble circle',
    category: 'hand-drawn',
    keywords: '圈 圈出 圆圈 重点 强调 circle ring highlight',
    width: 240,
    height: 140,
    color: RED,
    share: 0.4,
    parts: ({ color }) => [filled(brushStroke(loopPoints(120, 70, 104, 54, { turns: 1.1, start: 196, tilt: -5, spread: 0.08, seed: 3 }), 8, { tip: 0.3, taper: 0.12, peak: 0.25 }), color)],
  },
  {
    id: 'underline-brush',
    zh: '手绘下划线',
    en: 'Brush underline',
    category: 'hand-drawn',
    keywords: '下划线 划线 强调 underline swoosh',
    width: 320,
    height: 44,
    color: RED,
    share: 0.42,
    parts: ({ color }) => [filled(brushStroke([[10, 34], [70, 25], [160, 19], [250, 17], [310, 21]], 16, { tip: 0.12, taper: 0.45, peak: 0.3 }), color)],
  },
  {
    id: 'underline-wave',
    zh: '波浪线',
    en: 'Wavy line',
    category: 'hand-drawn',
    keywords: '波浪 下划线 曲线 wave squiggle underline',
    width: 300,
    height: 40,
    color: RED,
    share: 0.4,
    parts: ({ color }) => [stroked(smoothPath(wavePoints(8, 20, 284, 9, 4).map(([x, y], index) => [x, y + jitter(7, index) * 1.5] as Point)), color, 5)],
  },
  {
    id: 'underline-double',
    zh: '双下划线',
    en: 'Double underline',
    category: 'hand-drawn',
    keywords: '下划线 双线 强调 double underline',
    width: 300,
    height: 40,
    color: INK,
    share: 0.4,
    parts: ({ color }) => [stroked(smoothPath([[8, 14], [110, 10], [210, 12], [292, 9]]) + smoothPath([[36, 31], [140, 27], [262, 30]]), color, 4.5)],
  },
  {
    id: 'arrow-curved',
    zh: '弧形箭头',
    en: 'Curved arrow',
    category: 'hand-drawn',
    keywords: '箭头 指向 弯 arrow curve point',
    width: 200,
    height: 150,
    color: INK,
    share: 0.26,
    parts: ({ color }) => [stroked(curvedArrow([[16, 132], [44, 84], [104, 46], [182, 34]], 28), color, 5)],
  },
  {
    id: 'arrow-loop',
    zh: '绕圈箭头',
    en: 'Loop arrow',
    category: 'hand-drawn',
    keywords: '箭头 绕圈 指向 arrow loop curl',
    width: 280,
    height: 150,
    color: INK,
    share: 0.32,
    parts: ({ color }) => [stroked(curvedArrow([[12, 120], [70, 112], [128, 86], [150, 50], [128, 22], [102, 40], [112, 84], [164, 112], [222, 106], [266, 74]], 28), color, 5)],
  },
  {
    id: 'emphasis-marks',
    zh: '强调线',
    en: 'Emphasis marks',
    category: 'hand-drawn',
    keywords: '强调 惊叹 亮点 闪 emphasis accent shine',
    width: 100,
    height: 100,
    color: INK,
    share: 0.12,
    parts: ({ color }) => [filled([-104, -62, -20].map((angle, index) => {
      const radians = (angle * Math.PI) / 180
      const reach = [70, 76, 68][index]
      return brushStroke([[14 + Math.cos(radians) * 26, 86 + Math.sin(radians) * 26], [14 + Math.cos(radians) * reach, 86 + Math.sin(radians) * reach]], 9, { tip: 0.35, taper: 0.5 })
    }).join(''), color)],
  },
  {
    id: 'radiate',
    zh: '放射线',
    en: 'Burst lines',
    category: 'hand-drawn',
    keywords: '放射 发光 亮点 爆炸 burst rays shine',
    width: 120,
    height: 120,
    color: INK,
    share: 0.16,
    parts: ({ color }) => [stroked(rays(60, 60, [-90, -45, 0, 45, 90, 135, 180, 225], 30, [54, 46, 54, 46, 54, 46, 54, 46]), color, 5)],
  },
  {
    id: 'check-hand',
    zh: '手绘对勾',
    en: 'Hand-drawn check',
    category: 'hand-drawn',
    keywords: '对勾 勾 正确 完成 check tick yes',
    width: 130,
    height: 110,
    color: GREEN,
    share: 0.16,
    parts: ({ color }) => [filled(brushStroke([[12, 56], [32, 76], [50, 96], [80, 58], [122, 12]], 15, { tip: 0.3, taper: 0.3, peak: 0.3 }), color)],
  },
  {
    id: 'cross-hand',
    zh: '手绘叉',
    en: 'Hand-drawn cross',
    category: 'hand-drawn',
    keywords: '叉 错误 不要 避雷 cross wrong no',
    width: 110,
    height: 110,
    color: RED,
    share: 0.14,
    parts: ({ color }) => [filled(
      brushStroke([[18, 16], [56, 54], [94, 96]], 14, { tip: 0.3, taper: 0.3 }) + brushStroke([[92, 18], [56, 56], [16, 94]], 14, { tip: 0.3, taper: 0.3 }),
      color,
    )],
  },
  {
    id: 'star-hand',
    zh: '手绘星星',
    en: 'Hand-drawn star',
    category: 'hand-drawn',
    keywords: '星星 星 收藏 star doodle',
    width: 140,
    height: 136,
    color: INK,
    share: 0.16,
    parts: ({ color }) => {
      const points = starPoints(70, 74, 62, 27, 5).map(([x, y], index) => [x + jitter(5, index) * 2, y + jitter(9, index) * 2] as Point)
      return [stroked(polyline([...points, points[0], [points[0][0] + (points[1][0] - points[0][0]) * 0.25, points[0][1] + (points[1][1] - points[0][1]) * 0.25]]), color, 5)]
    },
  },
  {
    id: 'heart-hand',
    zh: '手绘爱心',
    en: 'Hand-drawn heart',
    category: 'hand-drawn',
    keywords: '爱心 心 喜欢 heart love doodle',
    width: 140,
    height: 128,
    color: RED,
    share: 0.16,
    parts: ({ color }) => [stroked(smoothPath([[70, 38], [56, 16], [30, 10], [12, 28], [10, 52], [26, 78], [50, 100], [70, 120], [91, 99], [115, 77], [131, 51], [128, 27], [110, 10], [84, 15], [72, 34], [66, 48]]), color, 5.5)],
  },
  {
    id: 'spiral',
    zh: '螺旋',
    en: 'Spiral',
    category: 'hand-drawn',
    keywords: '螺旋 旋转 晕 spiral swirl',
    width: 120,
    height: 120,
    color: INK,
    share: 0.14,
    parts: ({ color }) => [stroked(smoothPath(spiralPoints(60, 60, 52, 2.6, 36)), color, 5)],
  },
  {
    id: 'corner-frame',
    zh: '取景框',
    en: 'Corner frame',
    category: 'hand-drawn',
    keywords: '框 边框 角 取景 frame corners brackets',
    width: 260,
    height: 180,
    color: INK,
    share: 0.44,
    parts: ({ color }) => [stroked('M8 52V8H52M208 8H252V52M252 128V172H208M52 172H8V128', color, 6)],
  },
  {
    id: 'zigzag',
    zh: '锯齿线',
    en: 'Zigzag',
    category: 'hand-drawn',
    keywords: '锯齿 折线 下划线 zigzag underline',
    width: 280,
    height: 36,
    color: INK,
    share: 0.38,
    parts: ({ color }) => [stroked(polyline(Array.from({ length: 11 }, (_, index) => [8 + index * 26.4, index % 2 === 0 ? 27 : 9] as Point)), color, 5)],
  },
  {
    id: 'marker-band',
    zh: '荧光笔',
    en: 'Highlighter',
    category: 'hand-drawn',
    keywords: '荧光笔 高亮 涂抹 马克笔 highlighter marker',
    width: 320,
    height: 64,
    color: '#ffe14d',
    share: 0.42,
    parts: ({ color }) => [{
      kind: 'path',
      d: smoothPath([[16, 14], [110, 11], [210, 12], [304, 9], [312, 20], [306, 30], [313, 41], [302, 54], [200, 52], [100, 55], [18, 53], [9, 43], [15, 33], [8, 23]], true),
      fill: color,
      blendMode: 'multiply',
    }],
  },

  // --- Stickers: small flat drawings, most with a cartoon outline ---
  {
    id: 'sparkle',
    zh: '闪光',
    en: 'Sparkle',
    category: 'sticker',
    keywords: '闪光 星光 亮 闪 sparkle shine twinkle',
    width: 100,
    height: 100,
    color: GOLD,
    share: 0.1,
    parts: ({ color }) => [filled(sparkle(50, 50, 48, 0.14), color)],
  },
  {
    id: 'sparkles',
    zh: '闪闪',
    en: 'Sparkles',
    category: 'sticker',
    keywords: '闪光 星光 亮晶晶 闪 sparkles shine twinkle',
    width: 150,
    height: 150,
    color: GOLD,
    share: 0.14,
    parts: ({ color }) => [filled(sparkle(62, 84, 56, 0.14) + sparkle(122, 32, 24, 0.16) + sparkle(126, 122, 14, 0.18), color)],
  },
  {
    id: 'star',
    zh: '星星',
    en: 'Star',
    category: 'sticker',
    keywords: '星星 星 五角星 收藏 star',
    width: 130,
    height: 126,
    color: YELLOW,
    share: 0.13,
    parts: ({ color }) => [filled(roundedPolygon(starPoints(65, 69, 58, 25, 5), 7), color, OUTLINE)],
  },
  {
    id: 'heart',
    zh: '爱心',
    en: 'Heart',
    category: 'sticker',
    keywords: '爱心 心 喜欢 点赞 heart love like',
    width: 130,
    height: 118,
    color: '#ff5c7a',
    share: 0.13,
    parts: ({ color }) => [filled(heart(8, 8, 114, 104), color, OUTLINE)],
  },
  {
    id: 'flower',
    zh: '小花',
    en: 'Flower',
    category: 'sticker',
    keywords: '花 小花 花朵 春天 flower blossom',
    width: 130,
    height: 130,
    color: PINK,
    share: 0.13,
    parts: ({ color }) => [
      filled(petals(65, 65, 5, 33, 27), color, OUTLINE),
      filled(circle(65, 65, 15), YELLOW, OUTLINE),
    ],
  },
  {
    id: 'sun',
    zh: '太阳',
    en: 'Sun',
    category: 'sticker',
    keywords: '太阳 晴天 阳光 夏天 sun sunny',
    width: 150,
    height: 150,
    color: '#ffb627',
    share: 0.15,
    parts: ({ color }) => [filled(
      circle(75, 75, 33) + [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => ray(75, 75, angle, 45, 66, 11)).join(''),
      color,
      OUTLINE,
    )],
  },
  {
    id: 'cloud',
    zh: '云朵',
    en: 'Cloud',
    category: 'sticker',
    keywords: '云 云朵 天气 cloud',
    width: 190,
    height: 120,
    color: '#ffffff',
    share: 0.18,
    parts: ({ color }) => [filled('M38 104H154A27 27 0 0 0 162 51A37 37 0 0 0 96 32A31 31 0 0 0 46 56A25 25 0 0 0 38 104Z', color, OUTLINE)],
  },
  {
    id: 'speech-bubble',
    zh: '对话气泡',
    en: 'Speech bubble',
    category: 'sticker',
    keywords: '对话 气泡 说话 聊天 speech bubble chat',
    width: 190,
    height: 150,
    color: '#ffffff',
    share: 0.2,
    parts: ({ color }) => [filled('M50 10H140A40 40 0 0 1 180 50V70A40 40 0 0 1 140 110H86L40 140L54 110H50A40 40 0 0 1 10 70V50A40 40 0 0 1 50 10Z', color, OUTLINE)],
  },
  {
    id: 'crown',
    zh: '皇冠',
    en: 'Crown',
    category: 'sticker',
    keywords: '皇冠 王冠 第一 冠军 crown king winner',
    width: 150,
    height: 112,
    color: YELLOW,
    share: 0.15,
    parts: ({ color }) => [filled(
      roundedPolygon([[24, 100], [14, 36], [48, 62], [75, 26], [102, 62], [136, 36], [126, 100]], 5)
        + circle(14, 30, 8) + circle(75, 18, 8) + circle(136, 30, 8),
      color,
      OUTLINE,
    )],
  },
  {
    id: 'medal',
    zh: '奖章',
    en: 'Medal',
    category: 'sticker',
    keywords: '奖章 勋章 荣誉 冠军 第一 medal award badge winner',
    width: 150,
    height: 190,
    color: '#f5b301',
    share: 0.15,
    parts: ({ color }) => [
      filled(polyline([[46, 112], [74, 126], [60, 184], [47, 168], [30, 178]], true) + polyline([[104, 112], [76, 126], [90, 184], [103, 168], [120, 178]], true), RED, OUTLINE),
      filled(scallop(75, 75, 66, 18, 0.07), color, OUTLINE),
      filled(circle(75, 75, 45), mixColor(color, '#ffffff', 0.4), { color: INK, width: 3 }),
      filled(roundedPolygon(starPoints(75, 78, 27, 11.5, 5), 3), mixColor(color, '#000000', 0.12)),
    ],
  },
  {
    id: 'flame',
    zh: '火苗',
    en: 'Flame',
    category: 'sticker',
    keywords: '火 火苗 火热 爆款 热门 fire flame hot',
    width: 110,
    height: 150,
    color: '#ff5a36',
    share: 0.12,
    parts: ({ color }) => [
      filled('M55 8C70 38 98 56 98 94C98 124 78 142 55 142C32 142 12 124 12 96C12 72 26 60 34 42C38 58 44 64 50 66C47 44 50 26 55 8Z', color, OUTLINE),
      filled('M56 72C66 88 76 98 76 113C76 127 67 135 55 135C43 135 34 127 34 114C34 102 41 94 45 86C48 94 52 98 56 98C54 89 54 80 56 72Z', YELLOW),
    ],
  },
  {
    id: 'lightning',
    zh: '闪电',
    en: 'Lightning',
    category: 'sticker',
    keywords: '闪电 电 快 能量 lightning bolt flash',
    width: 100,
    height: 150,
    color: YELLOW,
    share: 0.11,
    parts: ({ color }) => [filled(roundedPolygon([[64, 8], [18, 84], [48, 84], [34, 142], [84, 60], [54, 60], [74, 8]], 4), color, OUTLINE)],
  },
  {
    id: 'smile',
    zh: '笑脸',
    en: 'Smiley',
    category: 'sticker',
    keywords: '笑脸 开心 微笑 表情 smile happy face',
    width: 130,
    height: 130,
    color: YELLOW,
    share: 0.13,
    parts: ({ color }) => [
      filled(circle(65, 65, 57), color, OUTLINE),
      filled(`${circle(46, 52, 7)}${circle(84, 52, 7)}M36 74Q65 112 94 74Q65 96 36 74Z`, INK),
    ],
  },
  {
    id: 'rainbow',
    zh: '彩虹',
    en: 'Rainbow',
    category: 'sticker',
    keywords: '彩虹 雨后 希望 rainbow',
    width: 210,
    height: 120,
    color: '#ff6b6b',
    share: 0.22,
    parts: ({ color }) => [94, 78, 62, 46].map((radius, index) => stroked(
      `M${105 - radius} 112A${radius} ${radius} 0 0 1 ${105 + radius} 112`,
      [color, '#ffb23f', '#ffe066', '#4cc38a'][index],
      15,
    )),
  },
  {
    id: 'balloon',
    zh: '气球',
    en: 'Balloon',
    category: 'sticker',
    keywords: '气球 生日 派对 庆祝 balloon party birthday',
    width: 110,
    height: 196,
    color: '#ff6b6b',
    share: 0.12,
    parts: ({ color }) => [
      stroked(smoothPath([[55, 136], [48, 152], [60, 168], [50, 182], [56, 192]]), INK, 3),
      filled('M55 8C84 8 102 34 102 64C102 98 78 124 55 124C32 124 8 98 8 64C8 34 26 8 55 8ZM55 124L47 138H63Z', color, OUTLINE),
      stroked('M28 56C30 40 40 28 54 24', '#ffffff', 6),
    ],
  },
  {
    id: 'gift',
    zh: '礼物',
    en: 'Gift',
    category: 'sticker',
    keywords: '礼物 礼盒 生日 节日 福利 gift present',
    width: 140,
    height: 140,
    color: '#ff7a9c',
    share: 0.13,
    parts: ({ color }) => [
      filled(`${polyline([[18, 64], [122, 64], [122, 132], [18, 132]], true)}${polyline([[10, 42], [130, 42], [130, 66], [10, 66]], true)}`, color, OUTLINE),
      filled(`${polyline([[60, 42], [80, 42], [80, 132], [60, 132]], true)}`, YELLOW, OUTLINE),
      filled('M70 42C58 18 30 14 30 30C30 42 50 44 70 42ZM70 42C82 18 110 14 110 30C110 42 90 44 70 42Z', YELLOW, OUTLINE),
    ],
  },
  {
    id: 'clover',
    zh: '四叶草',
    en: 'Clover',
    category: 'sticker',
    keywords: '四叶草 幸运 好运 草 clover lucky',
    width: 130,
    height: 150,
    color: '#4cc38a',
    share: 0.13,
    parts: ({ color }) => [
      stroked(smoothPath([[65, 66], [68, 104], [80, 128], [96, 142]]), INK, 5),
      filled(petals(65, 62, 4, 27, 25), color, OUTLINE),
    ],
  },
  {
    id: 'tape',
    zh: '胶带',
    en: 'Tape',
    category: 'sticker',
    keywords: '胶带 和纸胶带 贴 照片 tape washi',
    width: 220,
    height: 64,
    color: '#f4b6b0',
    rotation: -6,
    share: 0.24,
    parts: ({ color }) => [{
      kind: 'path',
      d: polyline([[14, 10], [206, 10], [212, 18], [206, 26], [212, 34], [206, 42], [212, 50], [206, 56], [14, 56], [8, 48], [14, 40], [8, 32], [14, 24], [8, 16]], true),
      fill: color,
      opacity: 0.85,
    }],
  },
  {
    id: 'paperclip',
    zh: '回形针',
    en: 'Paper clip',
    category: 'sticker',
    keywords: '回形针 别针 夹子 笔记 paperclip clip',
    width: 70,
    height: 170,
    color: '#8b939e',
    share: 0.1,
    parts: ({ color }) => [stroked('M40 60V118A12 12 0 0 1 16 118V30A20 20 0 0 1 56 30V136A26 26 0 0 1 4 136V44', color, 6)],
  },
  {
    id: 'dots',
    zh: '点阵',
    en: 'Dot grid',
    category: 'sticker',
    keywords: '点阵 波点 圆点 网点 dots grid pattern',
    width: 150,
    height: 150,
    color: '#ff8a3d',
    share: 0.16,
    parts: ({ color }) => [filled(Array.from({ length: 25 }, (_, index) => circle(11 + (index % 5) * 32, 11 + Math.floor(index / 5) * 32, 6)).join(''), color)],
  },

  // --- Labels: words on a badge, ribbon, stamp or note ---
  {
    id: 'pill',
    zh: '胶囊标签',
    en: 'Pill label',
    category: 'label',
    keywords: '标签 胶囊 新 角标 pill tag badge new',
    width: 200,
    height: 56,
    color: '#ff4d4f',
    text: { zh: 'NEW', en: 'NEW' },
    share: 0.2,
    parts: (paint) => [words(paint, { x: 0, y: 0, width: 200, height: 56 }, 38, wordsOn(paint.color), {
      letterSpacing: 2,
      effect: { type: 'background', color: paint.color, amount: 60, radius: 100 },
    })],
  },
  {
    id: 'outline-pill',
    zh: '描边标签',
    en: 'Outline label',
    category: 'label',
    keywords: '标签 描边 分类 话题 outline tag',
    width: 240,
    height: 76,
    color: INK,
    text: { zh: '干货分享', en: 'Must read' },
    share: 0.24,
    parts: (paint) => [
      { kind: 'shape', shape: 'rect', x: 2, y: 2, width: 236, height: 72, stroke: paint.color, strokeWidth: 3, cornerRadius: 36 },
      words(paint, { x: 0, y: 14, width: 240, height: 48 }, 32, paint.color, { letterSpacing: 4 }),
    ],
  },
  {
    id: 'burst-badge',
    zh: '爆炸贴',
    en: 'Burst badge',
    category: 'label',
    keywords: '爆炸 促销 限时 特价 角标 burst sale badge',
    width: 180,
    height: 180,
    color: '#ff4d4f',
    text: { zh: '限时', en: 'SALE' },
    share: 0.18,
    parts: (paint) => [
      filled(roundedPolygon(starPoints(90, 90, 86, 68, 16), 3), paint.color),
      words(paint, { x: 22, y: 63, width: 136, height: 54 }, 42, wordsOn(paint.color), { rotation: -10 }),
    ],
  },
  {
    id: 'price-tag',
    zh: '价签',
    en: 'Price sticker',
    category: 'label',
    keywords: '价格 价签 优惠 到手价 price tag',
    width: 170,
    height: 170,
    color: '#ff4d4f',
    text: { zh: '¥99', en: '$99' },
    share: 0.17,
    parts: (paint) => [
      { kind: 'shape', shape: 'ellipse', x: 4, y: 4, width: 162, height: 162, fill: paint.color },
      { kind: 'path', d: circle(85, 85, 68), stroke: wordsOn(paint.color), strokeWidth: 2.5, dash: 7 },
      words(paint, { x: 10, y: 52, width: 150, height: 66 }, 56, wordsOn(paint.color), { letterSpacing: -1 }),
    ],
  },
  {
    id: 'ribbon',
    zh: '飘带',
    en: 'Ribbon banner',
    category: 'label',
    keywords: '飘带 横幅 丝带 推荐 标题 ribbon banner',
    width: 340,
    height: 110,
    color: '#d9382f',
    text: { zh: '年度推荐', en: 'TOP PICK' },
    share: 0.36,
    parts: (paint) => [
      filled(polyline([[8, 36], [66, 36], [66, 98], [8, 98], [28, 67]], true) + polyline([[332, 36], [274, 36], [274, 98], [332, 98], [312, 67]], true), mixColor(paint.color, '#000000', 0.2)),
      filled(polyline([[44, 82], [66, 82], [66, 98]], true) + polyline([[296, 82], [274, 82], [274, 98]], true), mixColor(paint.color, '#000000', 0.45)),
      filled(polyline([[44, 16], [296, 16], [296, 82], [44, 82]], true), paint.color),
      words(paint, { x: 44, y: 24, width: 252, height: 50 }, 38, wordsOn(paint.color), { letterSpacing: 4 }),
    ],
  },
  {
    id: 'section-tag',
    zh: '分节标题',
    en: 'Section tag',
    category: 'label',
    keywords: '分节 小标题 章节 第一部分 section part chapter',
    width: 240,
    height: 76,
    color: INK,
    text: { zh: 'PART 01', en: 'PART 01' },
    share: 0.24,
    parts: (paint) => [
      filled(polyline([[22, 6], [234, 6], [218, 70], [6, 70]], true), paint.color),
      words(paint, { x: 20, y: 16, width: 200, height: 44 }, 34, wordsOn(paint.color), { letterSpacing: 3, fontFamily: 'system-ui, sans-serif' }),
    ],
  },
  {
    id: 'stamp',
    zh: '印章',
    en: 'Stamp',
    category: 'label',
    keywords: '印章 盖章 推荐 认证 stamp seal approved',
    width: 160,
    height: 160,
    color: '#d6332a',
    text: { zh: '推荐', en: 'BEST' },
    rotation: -12,
    share: 0.16,
    parts: (paint) => [
      stroked(circle(80, 80, 73), paint.color, 6),
      stroked(circle(80, 80, 62), paint.color, 2),
      filled(polyline(starPoints(80, 36, 9, 4, 5), true), paint.color),
      filled(polyline(starPoints(80, 124, 9, 4, 5), true), paint.color),
      words(paint, { x: 16, y: 54, width: 128, height: 52 }, 44, paint.color, { letterSpacing: 2 }),
    ],
  },
  {
    id: 'number',
    zh: '序号',
    en: 'Number badge',
    category: 'label',
    keywords: '序号 编号 数字 步骤 number step badge',
    width: 100,
    height: 100,
    color: INK,
    text: { zh: '01', en: '01' },
    share: 0.1,
    parts: (paint) => [
      { kind: 'shape', shape: 'ellipse', x: 2, y: 2, width: 96, height: 96, fill: paint.color },
      words(paint, { x: 0, y: 24, width: 100, height: 52 }, 44, wordsOn(paint.color)),
    ],
  },
  {
    id: 'speech-label',
    zh: '对话框',
    en: 'Speech label',
    category: 'label',
    keywords: '对话框 气泡 划重点 提示 speech callout',
    width: 230,
    height: 130,
    color: INK,
    text: { zh: '划重点', en: 'Key point' },
    share: 0.24,
    parts: (paint) => [
      filled('M34 6H196A28 28 0 0 1 224 34V68A28 28 0 0 1 196 96H78L34 124L46 96H34A28 28 0 0 1 6 68V34A28 28 0 0 1 34 6Z', paint.color),
      words(paint, { x: 6, y: 26, width: 218, height: 50 }, 36, wordsOn(paint.color), { letterSpacing: 2 }),
    ],
  },
  {
    id: 'sticky-note',
    zh: '便利贴',
    en: 'Sticky note',
    category: 'label',
    keywords: '便利贴 便签 笔记 待办 sticky note memo',
    width: 220,
    height: 220,
    color: '#ffe066',
    text: { zh: '今日待办', en: 'To do' },
    share: 0.26,
    parts: (paint) => [
      { kind: 'path', d: polyline([[14, 14], [206, 14], [206, 168], [168, 206], [14, 206]], true), fill: paint.color, shadow: { color: '#b9ae8c', blur: 14, offsetX: 0, offsetY: 6 } },
      filled(polyline([[206, 168], [168, 206], [174, 174]], true), mixColor(paint.color, '#000000', 0.16)),
      words(paint, { x: 34, y: 38, width: 152, height: 48 }, 32, mixColor(paint.color, INK, 0.85), { fontFamily: HAND_FONT, fontWeight: 'normal' }),
    ],
  },
  {
    id: 'hang-tag',
    zh: '吊牌',
    en: 'Hang tag',
    category: 'label',
    keywords: '吊牌 标签 价格 促销 tag sale',
    width: 240,
    height: 110,
    color: YELLOW,
    text: { zh: 'SALE', en: 'SALE' },
    share: 0.24,
    parts: (paint) => [
      { kind: 'path', d: `M62 10H224A12 12 0 0 1 236 22V88A12 12 0 0 1 224 100H62L14 55Z${circle(46, 55, 9)}`, fill: paint.color, stroke: INK, strokeWidth: 3, fillRule: 'evenodd' },
      words(paint, { x: 66, y: 29, width: 160, height: 52 }, 40, wordsOn(paint.color), { letterSpacing: 4 }),
    ],
  },
  {
    id: 'coupon',
    zh: '票券',
    en: 'Coupon',
    category: 'label',
    keywords: '票券 优惠券 券 满减 折扣 coupon ticket voucher',
    width: 340,
    height: 130,
    color: '#f25a2c',
    text: { zh: '满100减20', en: '20% OFF' },
    share: 0.34,
    parts: (paint) => [
      filled('M20 10H244A12 12 0 0 0 268 10H320A14 14 0 0 1 334 24V106A14 14 0 0 1 320 120H268A12 12 0 0 0 244 120H20A14 14 0 0 1 6 106V24A14 14 0 0 1 20 10Z', paint.color),
      { kind: 'path', d: 'M256 32V98', stroke: wordsOn(paint.color), strokeWidth: 3, dash: 6 },
      filled(roundedPolygon(starPoints(301, 65, 17, 7.5, 5), 2), wordsOn(paint.color)),
      words(paint, { x: 14, y: 42, width: 232, height: 46 }, 36, wordsOn(paint.color)),
    ],
  },
]

const BY_ID = new Map(DECORATIONS.map((decoration) => [decoration.id, decoration]))
const BY_NAME = new Map(DECORATIONS.map((decoration) => [decoration.zh, decoration]))

export function decorationById(id: string): DecorationDefinition | undefined {
  return BY_ID.get(id)
}

/** The decoration a layer is named after (placed decorations take the Chinese name). */
export function decorationByName(name: string): DecorationDefinition | undefined {
  return BY_NAME.get(name)
}

/** Decorations matching every word of the query (id, either name or a keyword); an empty query returns them all. */
export function searchDecorations(query: string): DecorationDefinition[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...DECORATIONS]
  return DECORATIONS.filter((decoration) => {
    const haystack = `${decoration.id} ${decoration.zh} ${decoration.en} ${decoration.keywords}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

export interface DecorationPlacement {
  /** The box's left and top on the page (or in the group it goes into). */
  x: number
  y: number
  width: number
  /** Only a single drawing stretches to it; anything else keeps its proportions. */
  height?: number
  color?: string
  text?: string
  language?: 'zh' | 'en'
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** A text box's padding (styles.css .freeform-textbox): the words sit this far inside it. */
const TEXT_PADDING = 8

function partBounds(part: DecorationPart): Box {
  if (part.kind === 'path') {
    const drawn = pathDataBounds(part.d) ?? { x: 0, y: 0, width: 1, height: 1 }
    // Room for half the stroke on every side, so nothing is drawn outside the box.
    const pad = part.stroke ? (part.strokeWidth ?? 4) / 2 : 0
    return { x: drawn.x - pad, y: drawn.y - pad, width: Math.max(1, drawn.width + pad * 2), height: Math.max(1, drawn.height + pad * 2) }
  }
  if (part.kind === 'shape' && part.stroke) {
    const pad = (part.strokeWidth ?? 2) / 2
    return { x: part.x - pad, y: part.y - pad, width: part.width + pad * 2, height: part.height + pad * 2 }
  }
  return { x: part.x, y: part.y, width: part.width, height: part.height }
}

const boundsCache = new Map<string, Box>()

/** What a decoration draws, in its own coordinates: the box it lands as. */
export function decorationBounds(definition: DecorationDefinition): Box {
  const cached = boundsCache.get(definition.id)
  if (cached) return cached
  const boxes = definition.parts({ color: definition.color, text: definition.text?.zh ?? '' }).map(partBounds)
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  const bounds = {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  }
  boundsCache.set(definition.id, bounds)
  return bounds
}

/** Whether a decoration is a single drawing that can stretch out of its proportions. */
export function decorationStretches(definition: DecorationDefinition): boolean {
  const parts = definition.parts({ color: definition.color, text: '' })
  return parts.length === 1 && parts[0].kind === 'path'
}

const PART_NAMES = { path: '图形', shape: '形状', text: '文本' } as const

const round = (value: number) => Math.round(value * 100) / 100

function partNode(part: DecorationPart, map: (box: Box) => Box, uniform: number, name: string, id: string): FreeformSceneNode {
  const state = { id, name, locked: false, hidden: false }
  const bounds = partBounds(part)
  const box = map(bounds)
  const geometry = { x: round(box.x), y: round(box.y), width: Math.max(1, round(box.width)), height: Math.max(1, round(box.height)), rotation: 0, scale: 1 }
  if (part.kind === 'path') {
    const node: FreeformPathElement = {
      ...state,
      type: 'path',
      ...geometry,
      d: part.d,
      viewBox: { x: round(bounds.x), y: round(bounds.y), width: round(bounds.width), height: round(bounds.height) },
      fill: part.fill ? { type: 'solid', color: part.fill } : { type: 'transparent' },
      stroke: part.stroke ?? INK,
      strokeWidth: part.stroke ? part.strokeWidth ?? 4 : 0,
      ...(part.opacity !== undefined ? { opacity: part.opacity } : {}),
      ...(part.blendMode ? { blendMode: part.blendMode } : {}),
      ...(part.fillRule ? { fillRule: part.fillRule } : {}),
      ...(part.dash !== undefined ? { dash: part.dash } : {}),
      ...(part.shadow ? {
        shadow: { color: part.shadow.color, blur: round(part.shadow.blur * uniform), offsetX: round(part.shadow.offsetX * uniform), offsetY: round(part.shadow.offsetY * uniform) },
      } : {}),
    }
    return node
  }
  if (part.kind === 'shape') {
    const inner = map({ x: part.x, y: part.y, width: part.width, height: part.height })
    const node: FreeformShapeElement = {
      ...state,
      type: 'shape',
      ...geometry,
      x: round(inner.x),
      y: round(inner.y),
      width: Math.max(1, round(inner.width)),
      height: Math.max(1, round(inner.height)),
      shape: part.shape,
      fill: part.fill ? { type: 'solid', color: part.fill } : { type: 'transparent' },
      stroke: part.stroke ?? 'transparent',
      strokeWidth: part.stroke ? round((part.strokeWidth ?? 2) * uniform) : 0,
      ...(part.cornerRadius !== undefined ? { cornerRadius: round(part.cornerRadius * uniform) } : {}),
    }
    return node
  }
  const fontSize = Math.max(1, Math.round(part.fontSize * uniform * 10) / 10)
  const node: FreeformTextElement = {
    ...state,
    type: 'text',
    // The words keep their line; the box grows by the padding a text box draws inside itself.
    x: round(box.x - TEXT_PADDING),
    y: round(box.y - TEXT_PADDING),
    width: round(box.width + TEXT_PADDING * 2),
    height: round(box.height + TEXT_PADDING * 2),
    rotation: part.rotation ?? 0,
    scale: 1,
    text: part.text,
    fontSize,
    fontFamily: part.fontFamily ?? LABEL_FONT,
    textFill: { type: 'solid', color: part.color },
    align: 'center',
    fontWeight: part.fontWeight ?? 'bold',
    lineHeight: round(box.height / fontSize),
    ...(part.letterSpacing !== undefined ? { letterSpacing: round(part.letterSpacing * uniform) } : {}),
    ...(part.effect ? { effect: { ...part.effect } } : {}),
  }
  return node
}

/**
 * The node a decoration becomes, filling `placement` with what it draws: one
 * node when it is drawn in one part, else a group of its parts (centred on
 * the box, as groups are). `color` repaints what is drawn in the decoration's
 * own colour; labels take `text`, or their sample words in `language`.
 */
export function createDecorationNode(
  definition: DecorationDefinition,
  placement: DecorationPlacement,
  newId: () => string = () => randomId(),
): FreeformSceneNode {
  const color = placement.color ?? definition.color
  const text = placement.text ?? definition.text?.[placement.language ?? 'zh'] ?? ''
  const parts = definition.parts({ color, text })
  const bounds = decorationBounds(definition)
  const sx = placement.width / bounds.width
  const height = decorationStretches(definition) && placement.height !== undefined ? placement.height : bounds.height * sx
  const sy = height / bounds.height
  const uniform = Math.sqrt(sx * sy)
  const rotation = definition.rotation ?? 0
  const map = (box: Box): Box => ({
    x: placement.x + (box.x - bounds.x) * sx,
    y: placement.y + (box.y - bounds.y) * sy,
    width: box.width * sx,
    height: box.height * sy,
  })

  if (parts.length === 1) {
    const node = partNode(parts[0], map, uniform, definition.zh, newId())
    return node.type === 'group' ? node : { ...node, rotation: node.rotation + rotation }
  }
  const centre = { x: placement.x + placement.width / 2, y: placement.y + height / 2 }
  const children = parts.map((part) => {
    const node = partNode(part, map, uniform, PART_NAMES[part.kind], newId())
    return node.type === 'group' ? node : { ...node, x: round(node.x - centre.x), y: round(node.y - centre.y) }
  })
  const group: FreeformGroupNode = {
    id: newId(),
    name: definition.zh,
    locked: false,
    hidden: false,
    type: 'group',
    x: round(centre.x),
    y: round(centre.y),
    rotation,
    scale: 1,
    children,
  }
  return group
}

/** How big a decoration lands on a page: `share` of its shorter side across, in its own proportions. */
export function decorationSize(definition: DecorationDefinition, page: { width: number; height: number }): { width: number; height: number } {
  const bounds = decorationBounds(definition)
  const width = Math.max(24, Math.round(Math.min(page.width, page.height) * definition.share))
  return { width, height: Math.max(1, Math.round((width * bounds.height) / bounds.width)) }
}
