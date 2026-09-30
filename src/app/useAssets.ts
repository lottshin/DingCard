import { useCallback, useEffect, useRef, useState } from 'react'
import { sortAssets, type Asset } from '../assets'
import type { User } from '../auth'
import { store } from '../storage'
import { prepareAssetFile } from './assetFiles'
import { errorText } from './errors'

export interface PendingUpload {
  id: string
  name: string
}

export interface UploadOutcome {
  added: Asset[]
  failed: { name: string; error: string }[]
}

export interface AssetsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Newest first. */
  assets: Asset[]
  error: string | null
  uploads: PendingUpload[]
  reload: () => void
  upload: (files: readonly File[]) => Promise<UploadOutcome>
  rename: (asset: Asset, name: string) => Promise<void>
  remove: (asset: Asset) => Promise<void>
}

/** The signed-in user's asset library. Guests have none. */
export function useAssets(user: User | null): AssetsState {
  const userId = user?.id ?? null
  const [assets, setAssets] = useState<Asset[]>([])
  const [status, setStatus] = useState<AssetsState['status']>(userId ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const generationRef = useRef(0)
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const reload = useCallback(() => {
    const generation = ++generationRef.current
    if (!userId) {
      setAssets([])
      setStatus('idle')
      setError(null)
      return
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    store.assets.list(userId).then(
      (list) => {
        if (generation !== generationRef.current) return
        setAssets(sortAssets(list))
        setStatus('ready')
        setError(null)
      },
      (reason: unknown) => {
        if (generation !== generationRef.current) return
        setStatus('error')
        setError(errorText(reason, '暂时无法读取素材库，请稍后重试'))
      },
    )
  }, [userId])

  useEffect(() => {
    reload()
    setUploads([])
    return () => {
      generationRef.current += 1
    }
  }, [reload])

  const upload = useCallback(async (files: readonly File[]): Promise<UploadOutcome> => {
    const uid = userIdRef.current
    const outcome: UploadOutcome = { added: [], failed: [] }
    if (!uid || files.length === 0) return outcome
    const pending = files.map((file) => ({ id: crypto.randomUUID(), name: file.name }))
    setUploads((current) => [...pending, ...current])

    // One at a time: each upload may run server-side GC under the user's asset lock.
    for (const [index, file] of files.entries()) {
      try {
        const asset = await store.assets.add(uid, await prepareAssetFile(file))
        if (userIdRef.current !== uid) break
        outcome.added.push(asset)
        setAssets((current) => sortAssets([asset, ...current]))
        setStatus('ready')
      } catch (reason) {
        outcome.failed.push({ name: file.name, error: errorText(reason, '上传失败，请稍后重试') })
      } finally {
        setUploads((current) => current.filter((item) => item.id !== pending[index].id))
      }
    }
    return outcome
  }, [])

  const rename = useCallback(async (asset: Asset, name: string) => {
    const uid = userIdRef.current
    if (!uid) return
    const next = await store.assets.rename(uid, asset.id, name)
    if (userIdRef.current !== uid) return
    setAssets((current) => current.map((item) => (item.id === next.id ? next : item)))
  }, [])

  const remove = useCallback(async (asset: Asset) => {
    const uid = userIdRef.current
    if (!uid) return
    await store.assets.remove(uid, asset.id)
    if (userIdRef.current !== uid) return
    setAssets((current) => current.filter((item) => item.id !== asset.id))
  }, [])

  return { status, assets, error, uploads, reload, upload, rename, remove }
}

/** A notice for the upload's outcome, or null when nothing needs saying. */
export function uploadNotice(outcome: UploadOutcome): { title: string; detail?: string; tone: 'info' | 'error' } | null {
  const { added, failed } = outcome
  if (failed.length === 0) {
    return added.length > 0 ? { title: `已上传 ${added.length} 张图片`, tone: 'info' } : null
  }
  const [first] = failed
  const more = failed.length > 1 ? `，另有 ${failed.length - 1} 张也没上传` : ''
  return {
    title: added.length > 0 ? `上传了 ${added.length} 张，${failed.length} 张没有上传` : `${failed.length} 张图片没有上传`,
    detail: `「${first.name}」${first.error}${more}`,
    tone: 'error',
  }
}
