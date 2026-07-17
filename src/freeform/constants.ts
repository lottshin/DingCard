export const PAGE_SIZE_MIN = 128
export const PAGE_SIZE_MAX = 4096

export const MAX_SCENE_DEPTH = 32
export const MAX_SCENE_NODES_PER_SLIDE = 5000
export const MAX_FREEFORM_SLIDES = 500
export const MIN_EFFECTIVE_SCALE = 1e-4
export const MAX_EFFECTIVE_SCALE = 1e4

export const pageSizePresets = [
  { ratio: '1:1', width: 1080, height: 1080 },
  { ratio: '3:4', width: 1080, height: 1440 },
  { ratio: '4:3', width: 1440, height: 1080 },
  { ratio: '9:16', width: 1080, height: 1920 },
  { ratio: '16:9', width: 1920, height: 1080 },
] as const
