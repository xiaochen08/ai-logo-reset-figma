import { reactive } from 'vue'
import type { AiLogoResetApi, AiLogoResetResponse } from '../../../../shared/aiLogoReset.ts'
import type { ResetProjectSummary } from './types'

export const projects = reactive<ResetProjectSummary[]>([])
export const lobby = reactive({ loaded: false, loading: false, error: '' })

const listeners = new Set<(id: string) => void>()
export const onProjectRemoved = (listener: (id: string) => void) => { listeners.add(listener); return () => listeners.delete(listener) }

export class ResetRequestError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) { super(message); this.name = 'ResetRequestError'; this.code = code }
}

export const resetApi = (): AiLogoResetApi => {
  const api = window.photoToolboxAiLogoReset
  if (!api) throw new ResetRequestError('当前环境无法访问本地项目，请在桌面软件中使用。')
  return api
}

export const unwrap = async <T>(request: Promise<AiLogoResetResponse<T>>): Promise<T> => {
  const response = await request
  if (!response.success) throw new ResetRequestError(response.error, response.code)
  return response.data
}

// Every write to a project goes through one queue that owns its revision, so lobby
// edits (rename, pin) and workspace saves never race each other.
const revisions = new Map<string, number>()
const queues = new Map<string, Promise<unknown>>()

export const setProjectRevision = (projectId: string, revision: number) => {
  revisions.set(projectId, Math.max(revision, revisions.get(projectId) ?? 0))
  const summary = projects.find(project => project.id === projectId)
  if (summary) summary.revision = revisions.get(projectId)!
}

/** Runs a write at the current revision; one conflict retry adopts the store's revision (page state is authoritative for its own edits). */
export const mutateProject = <T extends { revision: number, updatedAt?: number }>(
  projectId: string,
  write: (expectedRevision: number) => Promise<AiLogoResetResponse<T>>
): Promise<T> => {
  const run = async () => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await write(revisions.get(projectId) ?? 1)
      if (response.success) {
        setProjectRevision(projectId, response.data.revision)
        const summary = projects.find(project => project.id === projectId)
        if (summary && response.data.updatedAt) summary.updatedAt = response.data.updatedAt
        return response.data
      }
      if (response.code === 'AI_LOGO_RESET_REVISION_CONFLICT' && response.currentRevision && attempt === 0) {
        revisions.set(projectId, response.currentRevision)
        continue
      }
      throw new ResetRequestError(response.error, response.code)
    }
  }
  const previous = queues.get(projectId) ?? Promise.resolve()
  const next = previous.then(run, run)
  queues.set(projectId, next.catch(() => undefined))
  return next
}

/** Resolves once every queued write of the project has settled. */
export const projectSettled = (projectId: string) => queues.get(projectId) ?? Promise.resolve()
export const projectRevision = (projectId: string) => revisions.get(projectId) ?? 1

const nextName = () => {
  const used = new Set(projects.map(project => project.name))
  let index = projects.length + 1
  while (used.has(`LOGO 项目 ${index}`)) index += 1
  return `LOGO 项目 ${index}`
}

const replaceAll = (items: ResetProjectSummary[]) => {
  for (const item of items) setProjectRevision(item.id, item.revision)
  projects.splice(0, projects.length, ...items.map(item => ({ ...item, revision: revisions.get(item.id) ?? item.revision })))
}

export const projectActions = {
  async refresh() {
    lobby.loading = true
    try {
      replaceAll(await unwrap(resetApi().listProjects()))
      lobby.error = ''
    } catch (error) {
      lobby.error = error instanceof Error ? error.message : String(error)
    } finally {
      lobby.loading = false
      lobby.loaded = true
    }
  },
  async create(): Promise<ResetProjectSummary> {
    const project = await unwrap(resetApi().createProject({ name: nextName() }))
    setProjectRevision(project.id, project.revision)
    projects.unshift(project)
    return project
  },
  find(id: string) { return projects.find(project => project.id === id) },
  async rename(id: string, name: string) {
    const project = projects.find(item => item.id === id)
    const trimmed = name.trim().slice(0, 60)
    if (!project || !trimmed || trimmed === project.name) return false
    const previous = project.name
    project.name = trimmed
    try {
      await mutateProject(id, expectedRevision => resetApi().renameProject({ projectId: id, expectedRevision, name: trimmed }))
      return true
    } catch (error) {
      project.name = previous
      throw error
    }
  },
  async togglePin(id: string) {
    const project = projects.find(item => item.id === id)
    if (!project) return
    const pinned = !project.pinned
    project.pinned = pinned
    try {
      await mutateProject(id, expectedRevision => resetApi().setPinned({ projectId: id, expectedRevision, pinned }))
    } catch (error) {
      project.pinned = !pinned
      throw error
    }
  },
  async remove(id: string) {
    await projectSettled(id)
    await mutateProject(id, async expectedRevision => {
      const response = await resetApi().deleteProject({ projectId: id, expectedRevision })
      return response.success ? { success: true as const, data: { revision: expectedRevision } } : response
    })
    const index = projects.findIndex(project => project.id === id)
    if (index >= 0) projects.splice(index, 1)
    revisions.delete(id)
    listeners.forEach(listener => listener(id))
  },
  /** Local summary bookkeeping from an open workspace. */
  touch(id: string, patch: Partial<Pick<ResetProjectSummary, 'photoCount' | 'coverUrls' | 'name'>>) {
    const project = projects.find(item => item.id === id)
    if (project) Object.assign(project, patch)
  }
}
