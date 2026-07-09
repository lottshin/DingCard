// Platform presets + visual themes for the cards.

export type HeaderKind = 'none' | 'weibo' | 'twitter'

export interface Platform {
  id: string
  label: string
  // Content-box size in CSS px at display scale. Export multiplies by pixelRatio.
  width: number
  height: number
  // Social header rendered at the top of each card (reduces content height).
  header: HeaderKind
}

export const PLATFORMS: Platform[] = [
  { id: 'rednote', label: '小红书', width: 360, height: 480, header: 'none' }, // 3:4
  { id: 'weibo', label: '微博', width: 360, height: 480, header: 'weibo' },
  { id: 'twitter', label: '推特', width: 360, height: 480, header: 'twitter' },
]

export interface Theme {
  id: string
  label: string
  background: string
  color: string
  accent: string
}

export const THEMES: Theme[] = [
  { id: 'light', label: '简约白', background: '#ffffff', color: '#1a1a1a', accent: '#2563eb' },
  { id: 'warm', label: '暖米色', background: '#faf6f0', color: '#3a3226', accent: '#c2703d' },
  { id: 'dark', label: '深空黑', background: '#1c1c1e', color: '#f2f2f7', accent: '#0a84ff' },
  { id: 'mint', label: '薄荷绿', background: '#eef7f2', color: '#1f3a2e', accent: '#2fa36b' },
]

export const FONTS = [
  { id: 'PingFang SC', label: '苹方 PingFang' },
  { id: "'Noto Sans SC', sans-serif", label: '思源黑体' },
  { id: "'Noto Serif SC', serif", label: '思源宋体' },
  { id: "'LXGW WenKai TC', cursive", label: '霞鹜文楷' },
  { id: "'ZCOOL XiaoWei', serif", label: '站酷小薇' },
  { id: 'Songti SC, serif', label: '系统宋体' },
  { id: 'system-ui, sans-serif', label: '系统默认' },
]

// Inner padding of the card content area (CSS px at display scale).
export const CARD_PADDING = 22

// Typography defaults (CSS px at display scale).
export const FONT_SIZE = 16
export const LINE_HEIGHT = 1.75
// Vertical gap between top-level blocks, must match the CSS in styles.css.
export const BLOCK_GAP = 14

// Approximate rendered height of each header kind (avatar row + its bottom
// margin). The paginator subtracts this from the content area so text never
// slides under the header. Keep in sync with the header markup in Card.tsx.
export const HEADER_HEIGHT: Record<HeaderKind, number> = {
  none: 0,
  weibo: 60,
  twitter: 64,
}

/** User-editable identity shown in the weibo/twitter header. */
export interface Profile {
  nickname: string
  handle: string
  location: string
  avatarColor: string
  avatarImage: string | null // data URL when the user uploads one
  verified: boolean
  headerFirstPageOnly: boolean
}

export const DEFAULT_PROFILE: Profile = {
  nickname: 'Shinve',
  handle: 'Shinve',
  location: '',
  avatarColor: '#1c1c2e',
  avatarImage: null,
  verified: true,
  headerFirstPageOnly: false,
}

export const AVATAR_COLORS = ['#3b82f6', '#e08a2b', '#3a9e5f', '#9b59d0', '#d94a6a']

/**
 * The fully-resolved config the paginator and card renderer both consume.
 * It flattens the chosen platform size, theme colors, and typography into one
 * object so measurement and rendering can never drift apart.
 */
export interface CardConfig {
  width: number
  height: number
  padding: number
  header: HeaderKind
  headerHeight: number
  background: string
  color: string
  accent: string
  fontFamily: string
  fontSize: number
  lineHeight: number
  blockGap: number
}

export function buildConfig(platform: Platform, theme: Theme, fontFamily: string): CardConfig {
  return {
    width: platform.width,
    height: platform.height,
    padding: CARD_PADDING,
    header: platform.header,
    headerHeight: HEADER_HEIGHT[platform.header],
    background: theme.background,
    color: theme.color,
    accent: theme.accent,
    fontFamily,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    blockGap: BLOCK_GAP,
  }
}
