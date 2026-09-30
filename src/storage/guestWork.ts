// Work a guest made on this device, and moving it into an account.
//
// A guest's projects and assets live under GUEST_OWNER_ID in this browser.
// When someone signs in they can take them along: each project is saved into
// the account and only then removed from the device, one at a time, so a
// failure part-way never loses or duplicates anything; what failed simply
// stays here for another try.

import type { Asset } from '../assets'
import type { Draft, MarkdownCardDocument, SaveDraftInput } from '../drafts'
import type { Storage } from './types'

export interface GuestWork {
  projects: Draft[]
  assets: Asset[]
}

export interface GuestMoveResult {
  /** Guest project id -> that project as saved in the account. */
  moved: Map<string, Draft>
  movedAssets: number
  /** Projects and assets left on the device because saving them failed. */
  failed: number
  /** Why the first failure happened. */
  error: unknown
}

interface GuestMoveOptions {
  from: Storage
  fromId: string
  to: Storage
  toId: string
  /** Called after each project or asset, moved or not. */
  onProgress?: (done: number, total: number) => void
}

const MARKDOWN_IMAGE_REF = /\((img:[a-z0-9]+)\)/gi

export async function readGuestWork(guest: Storage, guestId: string): Promise<GuestWork> {
  const [projects, assets] = await Promise.all([
    guest.drafts.list(guestId),
    guest.assets.list(guestId).catch(() => [] as Asset[]),
  ])
  return { projects, assets }
}

export function guestWorkCount(work: GuestWork): number {
  return work.projects.length + work.assets.length
}

/** When the guest last made or changed something; 0 for nothing. */
export function newestGuestChange(work: GuestWork): number {
  return Math.max(
    0,
    ...work.projects.map((project) => project.updatedAt),
    ...work.assets.map((asset) => asset.createdAt),
  )
}

/**
 * A server can't read `img:` refs, which only exist in this browser: upload
 * each picture and point the source at the upload instead.
 */
async function uploadMarkdownImages(
  document: MarkdownCardDocument,
  from: Storage,
  to: Storage,
): Promise<Omit<MarkdownCardDocument, 'images'>> {
  const { images = {}, ...rest } = document
  const refs = new Set<string>()
  for (const match of rest.source.matchAll(MARKDOWN_IMAGE_REF)) refs.add(match[1])
  const uploaded = new Map<string, string>()
  for (const ref of refs) {
    const dataUrl = images[ref] ?? from.images.resolve(ref)
    if (dataUrl && dataUrl !== ref) uploaded.set(ref, await to.images.put(dataUrl))
  }
  const source = rest.source.replace(MARKDOWN_IMAGE_REF, (whole, ref: string) => {
    const url = uploaded.get(ref)
    return url ? `(${url})` : whole
  })
  return { ...rest, source }
}

async function projectForAccount(project: Draft, from: Storage, to: Storage): Promise<SaveDraftInput> {
  if (project.mode === 'freeform-slide') {
    // Stored guest canvases carry their pictures inline; the account store uploads them.
    return { mode: 'freeform-slide', title: project.title, document: project.document }
  }
  const document = to.remote ? await uploadMarkdownImages(project.document, from, to) : project.document
  return { mode: 'markdown-card', title: project.title, document }
}

/** Move every guest project and asset into the account, oldest first so the order survives. */
export async function moveGuestWork({ from, fromId, to, toId, onProgress }: GuestMoveOptions): Promise<GuestMoveResult> {
  const work = await readGuestWork(from, fromId)
  const projects = [...work.projects].sort((a, b) => a.updatedAt - b.updatedAt)
  const assets = [...work.assets].sort((a, b) => a.createdAt - b.createdAt)
  const total = projects.length + assets.length
  const result: GuestMoveResult = { moved: new Map(), movedAssets: 0, failed: 0, error: null }
  let done = 0

  const fail = (error: unknown) => {
    result.failed += 1
    if (result.error === null) result.error = error
  }

  for (const project of projects) {
    try {
      const saved = await to.drafts.save(toId, await projectForAccount(project, from, to))
      result.moved.set(project.id, saved)
      await from.drafts.remove(fromId, project.id)
    } catch (error) {
      // Already in the account: a leftover device copy is harmless.
      if (!result.moved.has(project.id)) fail(error)
    }
    onProgress?.(++done, total)
  }

  for (const asset of assets) {
    let added = false
    try {
      await to.assets.add(toId, { dataUrl: asset.src, name: asset.name, width: asset.width, height: asset.height })
      added = true
      result.movedAssets += 1
      await from.assets.remove(fromId, asset.id)
    } catch (error) {
      // Already in the account: a leftover device copy is harmless.
      if (!added) fail(error)
    }
    onProgress?.(++done, total)
  }

  return result
}
