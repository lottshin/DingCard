import { useCallback, useEffect, useRef, useState } from 'react'
import type { Draft } from '../drafts'
import { isGuestOwner, storeFor } from '../storage'
import { migrateLegacyUserTemplates } from '../templates/legacyUserTemplates'
import { onAutosaved } from '../workspaces/autosave'
import { t } from '../i18n'

export interface ProjectsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  projects: Draft[]
  error: string | null
  /** Templates the user once saved for themselves, turned into projects on this visit. */
  movedTemplates: number
  reload: () => void
  /** A project was deleted: stop showing it, even if an editor saved it a moment ago. */
  forget: (id: string) => void
}

function newestFirst(list: Draft[]): Draft[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

/** The listed projects, with anything an editor saved since the list was read. */
function withRecentSaves(list: Draft[], recent: ReadonlyMap<string, Draft>): Draft[] {
  const byId = new Map(list.map((draft) => [draft.id, draft]))
  for (const draft of recent.values()) {
    const listed = byId.get(draft.id)
    if (!listed || listed.updatedAt < draft.updatedAt) byId.set(draft.id, draft)
  }
  return newestFirst([...byId.values()])
}

// One move per account per page; its count is announced once, to whichever list reads it first.
const templateMoves = new Map<string, Promise<void>>()
const unannouncedMoves = new Map<string, number>()

function moveLegacyTemplates(userId: string): Promise<void> {
  // Only accounts ever saved templates.
  if (isGuestOwner(userId)) return Promise.resolve()
  let move = templateMoves.get(userId)
  if (!move) {
    move = migrateLegacyUserTemplates(userId, (input) => storeFor(userId).drafts.save(userId, input)).then(
      (moved) => {
        if (moved > 0) unannouncedMoves.set(userId, moved)
      },
      () => {
        // Offline or full: try again on the next load; the projects still list.
        templateMoves.delete(userId)
      },
    )
    templateMoves.set(userId, move)
  }
  return move
}

/** An owner's projects (an account's, or this device's guest's), newest first. */
export function useProjects(ownerId: string | null): ProjectsState {
  const [projects, setProjects] = useState<Draft[]>([])
  const [status, setStatus] = useState<ProjectsState['status']>(ownerId ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [movedTemplates, setMovedTemplates] = useState(0)
  const generationRef = useRef(0)
  // Autosaves that may be newer than the last list read (a save racing the fetch).
  const recentSavesRef = useRef(new Map<string, Draft>())
  const userId = ownerId

  useEffect(() => {
    recentSavesRef.current = new Map()
    if (!userId) return
    return onAutosaved((draft, owner) => {
      if (owner !== userId) return
      recentSavesRef.current.set(draft.id, draft)
      setProjects((current) => withRecentSaves(current, new Map([[draft.id, draft]])))
    })
  }, [userId])

  const forget = useCallback((id: string) => {
    recentSavesRef.current.delete(id)
    setProjects((current) => current.filter((draft) => draft.id !== id))
  }, [])

  const reload = useCallback(() => {
    const generation = ++generationRef.current
    if (!userId) {
      setProjects([])
      setStatus('idle')
      setError(null)
      return
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    moveLegacyTemplates(userId)
      .then(() => {
        const moved = unannouncedMoves.get(userId)
        if (moved && generation === generationRef.current) {
          unannouncedMoves.delete(userId)
          setMovedTemplates(moved)
        }
        return storeFor(userId).drafts.list(userId)
      })
      .then(
        (list) => {
          if (generation !== generationRef.current) return
          setProjects(withRecentSaves(list, recentSavesRef.current))
          setStatus('ready')
          setError(null)
        },
        (reason: unknown) => {
          if (generation !== generationRef.current) return
          setStatus('error')
          setError(reason instanceof Error && reason.message ? t(reason.message) : t('暂时无法读取项目，请稍后重试'))
        },
      )
  }, [userId])

  useEffect(() => {
    reload()
    return () => {
      generationRef.current += 1
    }
  }, [reload])

  return { status, projects, error, movedTemplates, reload, forget }
}
