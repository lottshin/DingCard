export const PAGE_SIZE_MIN = 128
export const PAGE_SIZE_MAX = 4096

export const pageSizePresets = [
  { ratio: '1:1', width: 1080, height: 1080 },
  { ratio: '3:4', width: 1080, height: 1440 },
  { ratio: '4:3', width: 1440, height: 1080 },
  { ratio: '9:16', width: 1080, height: 1920 },
  { ratio: '16:9', width: 1920, height: 1080 },
] as const
