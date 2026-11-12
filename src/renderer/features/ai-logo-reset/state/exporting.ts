import { reactive } from 'vue'
import type { AiLogoResetExportSettings, AiLogoResetExportStatus } from '../../../../shared/aiLogoReset.ts'
import { projectRevision, resetApi, unwrap } from './projects'

/** The window's one export (Main runs one at a time) and the latest status Main pushed for it. */
export const exporting = reactive<{
  status: AiLogoResetExportStatus | null
  starting: boolean
  /** Photo order of the export this window started (Main renders in this order); empty for one adopted later. */
  order: { exportId: string, ids: string[] } | null
  /** When this window first saw the export, its rendering start and its end; drives elapsed time, speed and ETA. */
  timing: { exportId: string, startedAt: number, runningAt: number | null, finishedAt: number | null } | null
}>({ status: null, starting: false, order: null, timing: null })

export const isExportActive = (status: AiLogoResetExportStatus | null) =>
  !!status && (status.phase === 'preparing' || status.phase === 'running' || status.phase === 'cancelling')

const finishedListeners = new Set<(status: AiLogoResetExportStatus) => void>()
export const onExportFinished = (listener: (status: AiLogoResetExportStatus) => void) => { finishedListeners.add(listener); return () => finishedListeners.delete(listener) }

let subscribed = false
const adopt = (status: AiLogoResetExportStatus) => {
  const current = exporting.status
  // Events from an older export never overwrite a newer one.
  if (current && current.exportId !== status.exportId && isExportActive(current)) return
  const wasActive = !!current && current.exportId === status.exportId && isExportActive(current)
  exporting.status = status
  const now = Date.now()
  if (exporting.timing?.exportId !== status.exportId) exporting.timing = { exportId: status.exportId, startedAt: now, runningAt: null, finishedAt: null }
  const timing = exporting.timing
  if (status.phase !== 'preparing' && timing.runningAt === null) timing.runningAt = now
  if (!isExportActive(status) && timing.finishedAt === null) timing.finishedAt = now
  if (wasActive && !isExportActive(status)) for (const listener of finishedListeners) listener(status)
}

export const watchExports = () => {
  if (subscribed || !window.photoToolboxAiLogoReset) return
  subscribed = true
  resetApi().onExportProgress(adopt)
  void unwrap(resetApi().getExportStatus()).then(status => { if (status && !exporting.status) exporting.status = status }).catch(() => undefined)
}

export const exportActions = {
  /** Call after the workspace has flushed its edits, so the revision covers what the stage shows. */
  async start(projectId: string, photoIds: string[], settings: AiLogoResetExportSettings) {
    watchExports()
    exporting.starting = true
    try {
      const status = await unwrap(resetApi().startExport({ projectId, expectedRevision: projectRevision(projectId), photoIds, settings }))
      exporting.order = { exportId: status.exportId, ids: [...photoIds] }
      adopt(status)
      return status
    } finally {
      exporting.starting = false
    }
  },
  async cancel() {
    const status = exporting.status
    if (!status || !isExportActive(status)) return
    await unwrap(resetApi().cancelExport(status.exportId))
  },
  async openFolder() {
    const status = exporting.status
    if (status?.outputDir) await unwrap(resetApi().openExportFolder(status.exportId))
  }
}
