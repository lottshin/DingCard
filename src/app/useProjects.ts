import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '../auth'
import type { Draft } from '../drafts'
import { store } from '../storage'

export interface ProjectsState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  projects: Draft[]
  error: string | null
  reload: () => void
}

/** The signed-in user's saved projects, newest first. Guests have none. */
export function useProjects(user: User | null): ProjectsState {
  const [projects, setProjects] = useState<Draft[]>([])
  const [status, setStatus] = useState<ProjectsState['status']>(user ? 'loading' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const userId = user?.id ?? null

  const reload = useCallback(() => {
    const generation = ++generationRef.current
    if (!userId) {
      setProjects([])
      setStatus('idle')
      setError(null)
      return
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'))
    store.drafts.list(userId).then(
      (list) => {
        if (generation !== generationRef.current) return
        setProjects([...list].sort((a, b) => b.updatedAt - a.updatedAt))
        setStatus('ready')
        setError(null)
      },
      (reason: unknown) => {
        if (generation !== generationRef.current) return
        setStatus('error')
        setError(reason instanceof Error && reason.message ? reason.message : '暂时无法读取项目，请稍后重试')
      },
    )
  }, [userId])

  useEffect(() => {
    reload()
    return () => {
      generationRef.current += 1
    }
  }, [reload])

  return { status, projects, error, reload }
}
