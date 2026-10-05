import { describe, expect, it } from 'vitest'
import type { Asset } from '../assets'
import type { Draft, SaveDraftInput } from '../drafts'
import { guestWorkCount, moveGuestWork, newestGuestChange, readGuestWork } from './guestWork'
import { createLocalAssetStore, createMemoryAssetBackend } from './localAssets'
import type { Storage } from './types'

const PNG = 'data:image/png;base64,aGlzdG9yaWNhbA=='

const PROFILE = {
  nickname: '',
  handle: '',
  location: '',
  avatarColor: '#000000',
  avatarImage: null,
  verified: false,
  headerFirstPageOnly: true,
}

function markdown(source: string, images?: Record<string, string>): SaveDraftInput {
  return {
    mode: 'markdown-card',
    document: { source, platformId: 'rednote', themeId: 'clean', fontFamily: 'system', profile: PROFILE, radius: 18, images },
  }
}

/** A storage whose drafts and assets live in memory; `remote` decides how Markdown pictures travel. */
function memoryStorage(options: { remote?: boolean; failSaves?: Set<string> } = {}) {
  let clock = 1000
  const drafts = new Map<string, Draft[]>()
  const uploads: string[] = []
  const storage: Storage = {
    remote: options.remote ?? false,
    auth: {
      register: async () => { throw new Error('unused') },
      login: async () => { throw new Error('unused') },
      logout: async () => {},
      current: async () => null,
      onInvalidated: () => () => {},
    },
    shares: {
      list: async () => { throw new Error('unused') },
      create: async () => { throw new Error('unused') },
      revoke: async () => { throw new Error('unused') },
    },
    tokens: {
      list: async () => { throw new Error('unused') },
      create: async () => { throw new Error('unused') },
      revoke: async () => { throw new Error('unused') },
    },
    drafts: {
      list: async (userId) => [...(drafts.get(userId) ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
      save: async (userId, data) => {
        const title = data.title ?? (data.mode === 'markdown-card' ? data.document.source : 'canvas')
        if (options.failSaves?.has(title)) throw new Error(`save failed: ${title}`)
        const list = drafts.get(userId) ?? []
        const draft = {
          id: data.id ?? `${userId}-${list.length + 1}`,
          title,
          schemaVersion: 2,
          updatedAt: ++clock,
          mode: data.mode,
          document: data.document,
        } as Draft
        drafts.set(userId, [...list.filter((item) => item.id !== draft.id), draft])
        return draft
      },
      remove: async (userId, id) => {
        drafts.set(userId, (drafts.get(userId) ?? []).filter((item) => item.id !== id))
      },
      listVersions: async () => [],
      getVersion: async () => { throw new Error('unused') },
      restoreVersion: async () => { throw new Error('unused') },
      listTrash: async () => { throw new Error('unused') },
      restore: async () => { throw new Error('unused') },
      purge: async () => { throw new Error('unused') },
    },
    images: {
      put: async (dataUrl) => {
        uploads.push(dataUrl)
        return `/uploads/${uploads.length}.png`
      },
      resolve: (href) => href,
      isRef: (href) => href.startsWith('img:'),
      register: () => {},
      collect: () => ({}),
      retain: async () => {},
    },
    assets: createLocalAssetStore(createMemoryAssetBackend(), () => ++clock),
  }
  return { storage, uploads }
}

describe('guest work', () => {
  it('counts what the guest made and when it last changed', async () => {
    const { storage } = memoryStorage()
    expect(newestGuestChange(await readGuestWork(storage, 'guest'))).toBe(0)
    await storage.drafts.save('guest', { ...markdown('一'), title: '一' })
    const asset: Asset = await storage.assets.add('guest', { dataUrl: PNG, name: '图', width: 10, height: 10 })
    const work = await readGuestWork(storage, 'guest')
    expect(guestWorkCount(work)).toBe(2)
    expect(newestGuestChange(work)).toBe(asset.createdAt)
  })

  it('moves projects and assets into the account, oldest first, and clears the device', async () => {
    const { storage: device } = memoryStorage()
    const { storage: account } = memoryStorage()
    await device.drafts.save('guest', { ...markdown('旧的'), title: '旧的' })
    await device.drafts.save('guest', { ...markdown('新的'), title: '新的' })
    await device.assets.add('guest', { dataUrl: PNG, name: '头像', width: 20, height: 20 })
    const progress: number[] = []

    const result = await moveGuestWork({ from: device, fromId: 'guest', to: account, toId: 'user-1', onProgress: (done) => progress.push(done) })

    expect(result.failed).toBe(0)
    expect(result.movedAssets).toBe(1)
    expect([...result.moved.values()].map((draft) => draft.title)).toEqual(['旧的', '新的'])
    expect((await account.drafts.list('user-1')).map((draft) => draft.title)).toEqual(['新的', '旧的'])
    expect((await account.assets.list('user-1')).map((asset) => asset.name)).toEqual(['头像'])
    expect(guestWorkCount(await readGuestWork(device, 'guest'))).toBe(0)
    expect(progress).toEqual([1, 2, 3])
  })

  it('uploads Markdown pictures when the account lives on a server', async () => {
    const { storage: device } = memoryStorage()
    const { storage: server, uploads } = memoryStorage({ remote: true })
    await device.drafts.save('guest', {
      ...markdown('![猫|240](img:cat1)\n\n再来一张 ![猫](img:cat1) ![狗](img:dog2)', { 'img:cat1': PNG, 'img:dog2': `${PNG}AA` }),
      title: '宠物',
    })

    const result = await moveGuestWork({ from: device, fromId: 'guest', to: server, toId: 'user-1' })

    const [moved] = [...result.moved.values()]
    if (moved.mode !== 'markdown-card') throw new Error('expected markdown')
    expect(moved.document.source).toBe('![猫|240](/uploads/1.png)\n\n再来一张 ![猫](/uploads/1.png) ![狗](/uploads/2.png)')
    expect(moved.document.images).toBeUndefined()
    expect(uploads).toEqual([PNG, `${PNG}AA`])
  })

  it('leaves what failed on the device and moves the rest', async () => {
    const { storage: device } = memoryStorage()
    const { storage: account } = memoryStorage({ failSaves: new Set(['坏的']) })
    await device.drafts.save('guest', { ...markdown('坏的'), title: '坏的' })
    await device.drafts.save('guest', { ...markdown('好的'), title: '好的' })

    const result = await moveGuestWork({ from: device, fromId: 'guest', to: account, toId: 'user-1' })

    expect(result.failed).toBe(1)
    expect(result.error).toBeInstanceOf(Error)
    expect((await account.drafts.list('user-1')).map((draft) => draft.title)).toEqual(['好的'])
    expect((await device.drafts.list('guest')).map((draft) => draft.title)).toEqual(['坏的'])
  })
})
