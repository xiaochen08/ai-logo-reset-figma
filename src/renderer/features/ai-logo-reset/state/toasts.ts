import { reactive } from 'vue'

export type ResetToastTone = 'info' | 'ok' | 'error'

export interface ResetToast {
  id: number
  tone: ResetToastTone
  title: string
  detail?: string
}

let seq = 0
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const toasts = reactive<ResetToast[]>([])

export const dismissToast = (id: number) => {
  const index = toasts.findIndex(toast => toast.id === id)
  if (index >= 0) toasts.splice(index, 1)
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
}

export const pushToast = (toast: Omit<ResetToast, 'id'>, durationMs = 3200) => {
  const id = ++seq
  toasts.push({ ...toast, id })
  if (toasts.length > 4) dismissToast(toasts[0].id)
  timers.set(id, setTimeout(() => dismissToast(id), durationMs))
  return id
}
