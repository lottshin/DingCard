import { useCallback, useEffect, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { t } from '../i18n'
import { storeFor } from '../storage'
import { ProjectAutosaver, type AutosaveContent } from './autosave'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface ProjectAutosave<Tag> {
  status: AutosaveStatus
  /** Why the last save failed. */
  error: string | null
  /** Queue the open project's latest content for its owner (an account or this device's guest). */
  schedule: (ownerId: string, draftId: string | null, content: AutosaveContent, tag: Tag) => void
  /** Save what is queued now (the retry button). */
  flush: () => Promise<void>
  /** Moving to another project: queued edits still save to this one, quietly. */
  release: () => void
  /** The open project was deleted: drop queued edits. */
  discard: () => void
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message.trim() ? t(error.message) : t('暂时无法保存，请稍后重试')
}

/** One editor's autosave: a saver per open project, and what the top bar shows about it. */
export function useProjectAutosave<Tag>(
  onSaved: (draft: Draft, content: AutosaveContent, tag: Tag) => void,
): ProjectAutosave<Tag> {
  const saverRef = useRef<{ saver: ProjectAutosaver<Tag>; ownerId: string } | null>(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const schedule = useCallback((ownerId: string, draftId: string | null, content: AutosaveContent, tag: Tag) => {
    let current = saverRef.current
    if (!current || current.ownerId !== ownerId) {
      void current?.saver.detach()
      const saver: ProjectAutosaver<Tag> = new ProjectAutosaver<Tag>(
        (input) => storeFor(ownerId).drafts.save(ownerId, input),
        draftId,
        {
          onSaved: (draft, saved, savedTag) => {
            if (saverRef.current?.saver !== saver) return
            onSavedRef.current(draft, saved, savedTag)
            setError(null)
            setStatus(saver.pending ? 'saving' : 'saved')
          },
          onError: (reason) => {
            if (saverRef.current?.saver !== saver) return
            setError(errorText(reason))
            setStatus('error')
          },
        },
        undefined,
        ownerId,
      )
      current = { saver, ownerId }
      saverRef.current = current
    }
    current.saver.schedule(content, tag)
    setStatus('saving')
  }, [])

  const flush = useCallback(() => {
    const current = saverRef.current
    if (!current?.saver.busy) return Promise.resolve()
    setStatus('saving')
    return current.saver.flush()
  }, [])

  const release = useCallback(() => {
    void saverRef.current?.saver.detach()
    saverRef.current = null
    setStatus('idle')
    setError(null)
  }, [])

  const discard = useCallback(() => {
    saverRef.current?.saver.cancel()
    saverRef.current = null
    setStatus('idle')
    setError(null)
  }, [])

  useEffect(() => () => {
    void saverRef.current?.saver.detach()
    saverRef.current = null
  }, [])

  return { status, error, schedule, flush, release, discard }
}
