import { reactive } from 'vue'

/** foreground: the photo cut out by its subject mask, for subject-in-front previews. */
export type ScaleKind = 'thumb' | 'preview' | 'foreground'
export interface ScaleResult { url: string, width: number, height: number }

interface Task {
  key: string
  photoId: string
  kind: ScaleKind
  source: Blob | string
  mask?: string
  priority: number
  seq: number
  waiters: Array<{ resolve: (result: ScaleResult) => void, reject: (error: Error) => void }>
}

export const THUMB_EDGE = 320
const PREVIEW_CACHE = 8
const WORKERS = Math.max(1, Math.min(3, Math.floor((navigator.hardwareConcurrency || 4) / 3)))

/** Long edge for stage previews: the largest fitted stage size in device pixels (the stage is ~72% of the window width). */
export const previewEdge = () => Math.max(1600, Math.min(4096, Math.ceil(Math.max(window.innerWidth * 0.72, window.innerHeight) * (window.devicePixelRatio || 1))))

/** Reactive lookups the UI renders from. */
export const thumbUrls = reactive<Record<string, string>>({})
export const previewUrls = reactive<Record<string, string>>({})
export const foregroundUrls = reactive<Record<string, string>>({})
/** Photos whose thumbnail could not be decoded; a new request clears the mark. */
export const thumbFailures = reactive<Record<string, true>>({})

const storeOf = (kind: ScaleKind) => kind === 'thumb' ? thumbUrls : kind === 'preview' ? previewUrls : foregroundUrls
const previewOrder: string[] = []
const foregroundOrder: string[] = []
const queue: Task[] = []
const running = new Map<number, Task>()
const idle: Worker[] = []
const workers: Worker[] = []
let seq = 0
let jobId = 0

// Previews and foregrounds are screen-sized, so only a few are kept.
const touch = (kind: ScaleKind, photoId: string) => {
  if (kind === 'thumb') return
  const order = kind === 'preview' ? previewOrder : foregroundOrder
  const store = storeOf(kind)
  const index = order.indexOf(photoId)
  if (index >= 0) order.splice(index, 1)
  order.push(photoId)
  while (order.length > PREVIEW_CACHE) {
    const evicted = order.shift()!
    const url = store[evicted]
    if (url) URL.revokeObjectURL(url)
    delete store[evicted]
  }
}

const spawn = () => {
  const worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<{ id: number, ok: boolean, blob?: Blob, width?: number, height?: number, error?: string }>) => {
    const task = running.get(event.data.id)
    running.delete(event.data.id)
    idle.push(worker)
    if (task) {
      if (event.data.ok && event.data.blob) {
        const url = URL.createObjectURL(event.data.blob)
        const result = { url, width: event.data.width ?? 0, height: event.data.height ?? 0 }
        const store = storeOf(task.kind)
        if (task.kind === 'thumb') delete thumbFailures[task.photoId]
        if (cancelled.has(task.photoId)) URL.revokeObjectURL(url)
        else {
          if (store[task.photoId]) URL.revokeObjectURL(store[task.photoId])
          store[task.photoId] = url
          touch(task.kind, task.photoId)
        }
        task.waiters.forEach(waiter => waiter.resolve(result))
      } else {
        const error = new Error(event.data.error || 'IMAGE_DECODE_FAILED')
        if (task.kind === 'thumb' && !cancelled.has(task.photoId)) thumbFailures[task.photoId] = true
        task.waiters.forEach(waiter => waiter.reject(error))
      }
    }
    pump()
  }
  worker.onerror = () => { /* surfaced through task rejection on the next message; keep the pool alive */ }
  workers.push(worker)
  return worker
}

const cancelled = new Set<string>()

const pump = () => {
  while (queue.length) {
    const worker = idle.pop() ?? (workers.length < WORKERS ? spawn() : null)
    if (!worker) return
    queue.sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq))
    const task = queue.shift()!
    const id = ++jobId
    running.set(id, task)
    worker.postMessage({ id, source: task.source, mask: task.mask, longEdge: task.kind === 'thumb' ? THUMB_EDGE : previewEdge(), quality: task.kind === 'thumb' ? 0.8 : 0.9 })
  }
}

const findTask = (key: string) => queue.find(task => task.key === key) ?? [...running.values()].find(task => task.key === key)

/** Requests a scaled copy of a Blob or a granted photo URL; duplicate requests share one decode and only raise priority. */
export const requestScaled = (photoId: string, kind: ScaleKind, source: Blob | string, priority = 0, mask?: string): Promise<ScaleResult> => {
  cancelled.delete(photoId)
  if (kind === 'thumb') delete thumbFailures[photoId]
  // Demo SVG artwork loads directly so browser worker image decoders need no SVG support.
  if (typeof source === 'string' && source.startsWith('/demo/photos/') && source.endsWith('.svg') && kind !== 'foreground') {
    storeOf(kind)[photoId] = source
    return Promise.resolve({url:source,width:0,height:0})
  }
  const cached = storeOf(kind)[photoId]
  if (cached) {
    touch(kind, photoId)
    return Promise.resolve({ url: cached, width: 0, height: 0 })
  }
  const key = `${kind}:${photoId}`
  return new Promise((resolve, reject) => {
    const existing = findTask(key)
    if (existing) {
      existing.priority = Math.max(existing.priority, priority)
      existing.waiters.push({ resolve, reject })
      return
    }
    queue.push({ key, photoId, kind, source, ...(mask ? { mask } : {}), priority, seq: ++seq, waiters: [{ resolve, reject }] })
    pump()
  })
}

/** Raises the priority of queued work, e.g. for tiles that scrolled into view. */
export const bumpScaled = (photoId: string, kind: ScaleKind, priority: number) => {
  const task = queue.find(item => item.key === `${kind}:${photoId}`)
  if (task && task.priority < priority) task.priority = priority
}

/** Drops queued work and cached copies for removed photos. Running decodes finish and are discarded. */
export const releasePhotos = (photoIds: Iterable<string>) => {
  const ids = new Set(photoIds)
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (!ids.has(queue[i].photoId)) continue
    queue[i].waiters.forEach(waiter => waiter.reject(new Error('CANCELLED')))
    queue.splice(i, 1)
  }
  for (const id of ids) {
    cancelled.add(id)
    delete thumbFailures[id]
    for (const store of [thumbUrls, previewUrls, foregroundUrls]) {
      if (store[id]) URL.revokeObjectURL(store[id])
      delete store[id]
    }
    for (const order of [previewOrder, foregroundOrder]) {
      const index = order.indexOf(id)
      if (index >= 0) order.splice(index, 1)
    }
  }
}
