import { ASSET_MIME_TYPES, assetNameFromFile, type NewAssetInput } from '../assets'
import { downscaleDataUrl } from '../imageStore'

export const ASSET_ACCEPT = ASSET_MIME_TYPES.join(',')
/** Checked before downscaling; the stored copy is much smaller. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024
/** Long edge of the stored copy, matching what the freeform editor keeps for inserted images. */
const MAX_EDGE = 1800

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('无法读取图片'))
    reader.readAsDataURL(file)
  })
}

function measure(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('图片已损坏或无法解码'))
    image.src = dataUrl
  })
}

export function imageFiles(list: FileList | readonly File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'))
}

/** Validate, downscale and measure one picked, dropped or pasted file. */
export async function prepareAssetFile(file: File): Promise<NewAssetInput> {
  if (!ASSET_MIME_TYPES.includes(file.type)) throw new Error('只支持 PNG、JPG、WebP 图片')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('图片超过 25 MB')
  const dataUrl = await downscaleDataUrl(await readAsDataUrl(file), MAX_EDGE)
  const { width, height } = await measure(dataUrl)
  return { dataUrl, name: assetNameFromFile(file.name), width, height }
}
