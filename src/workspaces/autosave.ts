// Background saving for the project open in an editor.
//
// Every edit hands the latest content to the project's autosaver; it saves
// after a short pause, one request at a time, carrying the id the first save
// returned into every later one. When the editor moves on to another project
// (or the account changes) it detaches the saver: whatever is still queued is
// saved in the background, but the editor no longer hears about it.

import type { Draft, SaveDraftInput } from '../drafts'

/** Pause after the last edit before saving. */
export const AUTOSAVE_DELAY_MS = 700

/** What an editor hands over: the project minus its id, which the saver owns. */
export type AutosaveContent = DistributiveOmit<SaveDraftInput, 'id'>

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export interface AutosaveListener<Tag> {
  /** A save request finished. `tag` is whatever the editor passed with that content. */
  onSaved: (draft: Draft, content: AutosaveContent, tag: Tag) => void
  onError: (error: unknown) => void
}

interface Queued<Tag> {
  content: AutosaveContent
  tag: Tag
}

type SavedListener = (draft: Draft, ownerId: string | null) => void

const active = new Set<ProjectAutosaver<unknown>>()
const savedListeners = new Set<SavedListener>()

/** Save everything every editor still has queued (before logging out, or when the page hides). */
export function flushAllAutosaves(): Promise<void> {
  return Promise.all([...active].map((saver) => saver.flush())).then(() => undefined)
}

/** Hear about every project an autosaver writes, detached ones included (the workbench list). */
export function onAutosaved(listener: SavedListener): () => void {
  savedListeners.add(listener)
  return () => {
    savedListeners.delete(listener)
  }
}

export class ProjectAutosaver<Tag = undefined> {
  private draftId: string | null
  private queued: Queued<Tag> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private chain: Promise<void> = Promise.resolve()
  private saving = 0
  private listening = true

  constructor(
    private readonly save: (input: SaveDraftInput) => Promise<Draft>,
    draftId: string | null,
    private readonly listener: AutosaveListener<Tag>,
    private readonly delay = AUTOSAVE_DELAY_MS,
    /** Whose project this is, for `onAutosaved` listeners. */
    private readonly ownerId: string | null = null,
  ) {
    this.draftId = draftId
  }

  /** The saved project's id, once the first save has returned. */
  get id(): string | null {
    return this.draftId
  }

  /** True while content is waiting for its pause or its request. */
  get busy(): boolean {
    return this.queued !== null || this.saving > 0
  }

  /** True when newer content is queued behind the request in flight. */
  get pending(): boolean {
    return this.queued !== null
  }

  /** Queue the latest content; it saves once edits pause for `delay` ms. */
  schedule(content: AutosaveContent, tag: Tag) {
    this.queued = { content, tag }
    active.add(this as ProjectAutosaver<unknown>)
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.delay)
  }

  /** Save whatever is queued now; resolves when it (and anything before it) has settled. */
  flush(): Promise<void> {
    this.clearTimer()
    this.chain = this.chain.then(() => this.drain())
    return this.chain
  }

  /** Stop reporting to the editor. Queued content still saves; the returned promise settles after it. */
  detach(): Promise<void> {
    this.listening = false
    return this.flush()
  }

  /** Drop queued content without saving it (the project was deleted). */
  cancel() {
    this.listening = false
    this.clearTimer()
    this.queued = null
    if (this.saving === 0) active.delete(this as ProjectAutosaver<unknown>)
  }

  private clearTimer() {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private async drain() {
    const queued = this.queued
    if (!queued) return
    this.queued = null
    this.saving += 1
    try {
      const input = { ...queued.content, id: this.draftId ?? undefined } as SaveDraftInput
      const saved = await this.save(input)
      this.draftId = saved.id
      if (this.listening) this.listener.onSaved(saved, queued.content, queued.tag)
      for (const listener of [...savedListeners]) listener(saved, this.ownerId)
    } catch (error) {
      // Keep the content for the retry, unless newer edits already replaced it.
      if (!this.queued && this.listening) this.queued = queued
      if (this.listening) this.listener.onError(error)
    } finally {
      this.saving -= 1
      if (!this.busy) active.delete(this as ProjectAutosaver<unknown>)
    }
  }
}
