import { reactive } from 'vue'
import type { AiLogoResetRecognitionKind } from '../../../../shared/aiLogoReset.ts'
import type { AiLogoResetRect } from '../../../../shared/aiLogoResetGeometry.ts'
import { resetApi, unwrap } from './projects'

export interface ResetRecognition {
  status: 'pending' | 'ready' | 'failed'
  faces: AiLogoResetRect[]
  maskUrl: string | null
  error?: string
}

/** Results per project, photo and kind. Main's vision cache makes the export see the same ones. */
export const recognitions = reactive<Record<string, ResetRecognition>>({})

const keyOf = (projectId: string, photoId: string, kind: AiLogoResetRecognitionKind) => `${projectId}:${photoId}:${kind}`
export const recognitionOf = (projectId: string, photoId: string, kind: AiLogoResetRecognitionKind): ResetRecognition | undefined =>
  recognitions[keyOf(projectId, photoId, kind)]

interface Job { key: string, projectId: string, photoId: string, kind: AiLogoResetRecognitionKind, urgent: boolean, waiters: Array<() => void> }
const CONCURRENCY = 2
const queue: Job[] = []
const active = new Map<string, Job>()

const pump = () => {
  while (active.size < CONCURRENCY && queue.length) {
    const index = queue.findIndex(job => job.urgent)
    const job = queue.splice(index >= 0 ? index : 0, 1)[0]
    active.set(job.key, job)
    // A photo released meanwhile has no entry left to fill.
    const settle = (entry: ResetRecognition) => { if (recognitions[job.key]?.status === 'pending') recognitions[job.key] = entry }
    void unwrap(resetApi().recognize({ projectId: job.projectId, photoId: job.photoId, kind: job.kind }))
      .then(result => settle({ status: 'ready', faces: result.faces, maskUrl: result.maskUrl }))
      .catch(error => settle({ status: 'failed', faces: [], maskUrl: null, error: error instanceof Error ? error.message : String(error) }))
      .finally(() => {
        active.delete(job.key)
        job.waiters.forEach(done => done())
        pump()
      })
  }
}

/**
 * Starts recognition once per photo and kind; `urgent` (the photo on stage) jumps the queue.
 * A failed result is kept until `retry` asks again.
 */
export const ensureRecognition = (
  projectId: string,
  photoId: string,
  kind: AiLogoResetRecognitionKind,
  options: { urgent?: boolean, retry?: boolean } = {}
): Promise<void> => {
  const key = keyOf(projectId, photoId, kind)
  const existing = recognitions[key]
  if (existing && (existing.status === 'ready' || (existing.status === 'failed' && !options.retry))) return Promise.resolve()
  const queued = queue.find(job => job.key === key) ?? active.get(key)
  if (queued) {
    queued.urgent ||= !!options.urgent
    return new Promise(resolve => queued.waiters.push(resolve))
  }
  recognitions[key] = { status: 'pending', faces: [], maskUrl: null }
  return new Promise(resolve => {
    queue.push({ key, projectId, photoId, kind, urgent: !!options.urgent, waiters: [resolve] })
    pump()
  })
}

/** Forgets results of removed photos and drops their queued requests. */
export const releaseRecognitions = (projectId: string, photoIds: Iterable<string>) => {
  for (const photoId of photoIds) {
    for (const kind of ['face', 'subject'] as const) {
      const key = keyOf(projectId, photoId, kind)
      const index = queue.findIndex(job => job.key === key)
      if (index >= 0) queue.splice(index, 1)[0].waiters.forEach(done => done())
      delete recognitions[key]
    }
  }
}
