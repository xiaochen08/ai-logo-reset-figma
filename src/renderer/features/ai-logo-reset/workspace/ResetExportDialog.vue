<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CircleAlert, CircleCheck, FolderOpen } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import ResetModal from '../ui/ResetModal.vue'
import ResetExportProgress from './ResetExportProgress.vue'
import ResetSegmented from '../ui/ResetSegmented.vue'
import ResetSlider from '../ui/ResetSlider.vue'
import ResetSwitch from '../ui/ResetSwitch.vue'
import { useWorkspace } from '../state/context'
import { exportActions, exporting, isExportActive } from '../state/exporting'
import { createDefaultPhotoSharpenExportOptions } from '../../../../shared/photoSharpen.ts'
import type { PhotoSharpenExportClarity, PhotoSharpenExportDetailSize } from '../../../../shared/photoSharpenExportTypes.ts'
import { pushToast } from '../state/toasts'

type Range = 'all' | 'selected' | 'current'
type Format = 'source' | 'jpg' | 'png' | 'webp'
type Size = 'source' | 'long-edge'

const { state, actions } = useWorkspace()

const range = ref<Range>('all')
const format = ref<Format>('source')
const quality = ref(92)
const size = ref<Size>('source')
const longEdge = ref(3000)
const skipMissing = ref(false)
// Export-time sharpening, as in the original tool: off by default, the canvas is never sharpened.
const sharpen = reactive(createDefaultPhotoSharpenExportOptions())
const clarityOptions: ReadonlyArray<{ value: PhotoSharpenExportClarity, label: string }> = [
  { value: 'light', label: '轻微' },
  { value: 'clear', label: '更清晰' },
  { value: 'extreme', label: '极其清晰' }
]
const detailOptions: ReadonlyArray<{ value: PhotoSharpenExportDetailSize, label: string }> = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' }
]

const open = computed(() => state.dialog === 'export')
// A finished export stays on screen until the dialog is closed once.
const dismissed = ref<string | null>(null)
const status = computed(() => {
  const value = exporting.status
  return value && value.projectId === state.projectId && value.exportId !== dismissed.value ? value : null
})
const active = computed(() => isExportActive(status.value))
watch(open, value => { if (value && !status.value) range.value = state.selectedIds.length > 1 ? 'selected' : 'all' })

const rangeOptions = computed(() => [
  { value: 'all' as const, label: `全部 ${state.photos.length}` },
  { value: 'selected' as const, label: `已选 ${state.selectedIds.length}` },
  { value: 'current' as const, label: '当前' }
])
const formatOptions = [
  { value: 'source' as const, label: '原格式' },
  { value: 'jpg' as const, label: 'JPG' },
  { value: 'png' as const, label: 'PNG' },
  { value: 'webp' as const, label: 'WEBP' }
]
const sizeOptions = [
  { value: 'source' as const, label: '原尺寸' },
  { value: 'long-edge' as const, label: '限制长边' }
]

const targets = computed(() => {
  const ids = range.value === 'all' ? state.photos.map(photo => photo.id)
    : range.value === 'selected' ? state.selectedIds
      : state.currentId ? [state.currentId] : []
  return state.photos.filter(photo => ids.includes(photo.id))
})
const missing = computed(() => targets.value.filter(photo => !(state.scenes[photo.id]?.layers.some(layer => layer.visible))).length)
const exportCount = computed(() => skipMissing.value ? targets.value.length - missing.value : targets.value.length)
const lossy = computed(() => format.value === 'jpg' || format.value === 'webp' || format.value === 'source')
const busy = computed(() => exporting.starting || isExportActive(exporting.status))
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

const start = async () => {
  const ids = (skipMissing.value
    ? targets.value.filter(photo => state.scenes[photo.id]?.layers.some(layer => layer.visible))
    : targets.value).map(photo => photo.id)
  if (!ids.length || busy.value) return
  try {
    await actions.flush()
    await exportActions.start(state.projectId, ids, {
      format: format.value === 'jpg' ? 'jpeg' : format.value,
      quality: quality.value,
      longEdge: size.value === 'long-edge' ? Math.round(Math.min(20000, Math.max(256, Number(longEdge.value) || 3000))) : null,
      photoSharpen: { ...sharpen }
    })
    dismissed.value = null
  } catch (error) {
    pushToast({ tone: 'error', title: '无法开始导出', detail: message(error) })
  }
}

const close = () => {
  if (status.value && !active.value) dismissed.value = status.value.exportId
  actions.close()
}
const cancel = () => exportActions.cancel().catch(error => pushToast({ tone: 'error', title: '取消失败', detail: message(error) }))
const openFolder = () => exportActions.openFolder().catch(error => pushToast({ tone: 'error', title: '无法打开文件夹', detail: message(error) }))

</script>

<template>
  <!-- One fixed frame for settings and progress: nothing opens, folds or scrolls, so the window never changes size. -->
  <ResetModal :open="open" title="导出" :width="760" :body-height="352" @close="close">
    <UiMotionTransition preset="panel" mode="out-in">
      <ResetExportProgress v-if="status" key="progress" :status="status" />
      <div v-else key="form" class="form">
        <section class="col">
          <div class="field">
            <span class="field-label">范围</span>
            <ResetSegmented v-model="range" label="导出范围" :options="rangeOptions" />
          </div>
          <!-- Always the same slot: a missing-logo warning, or a quiet all-clear. -->
          <div class="notice" :class="{ warn: missing > 0 }">
            <template v-if="missing > 0">
              <CircleAlert :size="15" class="notice-icon" />
              <span class="notice-text">{{ missing }} 张照片还没有 LOGO</span>
              <label class="notice-switch">
                <span>只导出已添加的</span>
                <ResetSwitch v-model="skipMissing" label="只导出已添加 LOGO 的照片" />
              </label>
            </template>
            <template v-else>
              <CircleCheck :size="15" class="notice-icon" />
              <span class="notice-text">所选照片都已添加 LOGO</span>
            </template>
          </div>
          <div class="field">
            <span class="field-label">格式</span>
            <ResetSegmented v-model="format" label="导出格式" :options="formatOptions" />
          </div>
          <ResetSlider v-model="quality" label="质量" :min="60" :max="100" :reset="92" :disabled="!lossy" />
          <div class="field">
            <span class="field-label">尺寸</span>
            <div class="size-row">
              <ResetSegmented v-model="size" class="size-seg" label="导出尺寸" :options="sizeOptions" />
              <label class="edge" :class="{ off: size !== 'long-edge' }">
                <span>长边</span>
                <input
                  v-model.number="longEdge" type="number" min="256" max="20000" step="100" aria-label="长边像素" class="alr-num"
                  :disabled="size !== 'long-edge'" @keydown.stop
                />
                <span>px</span>
              </label>
            </div>
          </div>
        </section>

        <section class="col sharpen" :class="{ on: sharpen.enabled }">
          <label class="sharpen-head">
            <span class="sharpen-copy">
              <span class="sharpen-title">导出时锐化照片</span>
              <span class="sharpen-note">只处理照片，不锐化 LOGO，画布预览不变</span>
            </span>
            <ResetSwitch v-model="sharpen.enabled" label="导出时锐化照片" />
          </label>
          <div class="sharpen-fields" :inert="!sharpen.enabled || undefined">
            <div class="field">
              <span class="field-label">清晰程度</span>
              <ResetSegmented v-model="sharpen.clarity" label="清晰程度" :options="clarityOptions" />
            </div>
            <ResetSlider v-model="sharpen.amount" label="锐化强度" :min="0" :max="100" :reset="60" />
            <div class="field">
              <span class="field-label">细节范围</span>
              <ResetSegmented v-model="sharpen.detailSize" label="细节范围" :options="detailOptions" />
            </div>
            <ResetSlider v-model="sharpen.grainProtection" label="减少颗粒" :min="0" :max="20" :reset="4" />
          </div>
        </section>
      </div>
    </UiMotionTransition>
    <template #aside>
      <template v-if="!status">
        <FolderOpen :size="14" class="aside-icon" />
        <span class="aside-text">导出到首张照片所在目录 / <span class="alr-mono">LOGO导出-N</span></span>
      </template>
      <template v-else-if="status.outputDir">
        <FolderOpen :size="14" class="aside-icon" />
        <span class="aside-text alr-mono" :title="status.outputDir">{{ status.outputDir }}</span>
      </template>
    </template>
    <template #actions>
      <template v-if="status && active">
        <button @click="close">后台继续</button>
        <button :disabled="status.phase === 'cancelling'" @click="cancel">取消导出</button>
      </template>
      <template v-else-if="status">
        <button v-if="status.outputDir && status.success" @click="openFolder">打开文件夹</button>
        <button class="is-primary" @click="close">完成</button>
      </template>
      <template v-else>
        <button @click="close">取消</button>
        <button class="is-primary" :disabled="!exportCount || busy" @click="start">{{ busy && !exporting.starting ? '已有导出进行中' : `导出 ${exportCount} 张` }}</button>
      </template>
    </template>
  </ResetModal>
</template>

<style scoped>
.form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 22px; height: 100%; }
.col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; color: var(--alr-mute); }

.notice {
  display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px 0 12px; border-radius: 9px; font-size: 12px;
  color: var(--alr-ink-2); background: rgb(255 255 255 / .025); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .05);
  transition: background-color var(--duration-base) var(--easing-standard), box-shadow var(--duration-base) var(--easing-standard);
}
.notice.warn { color: var(--alr-ink); background: rgb(var(--rgb-danger) / .08); box-shadow: inset 0 0 0 1px rgb(var(--rgb-danger) / .28); }
.notice-icon { flex: none; color: var(--alr-ok); }
.notice.warn .notice-icon { color: var(--alr-danger); }
.notice-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.notice-switch { display: flex; align-items: center; gap: 8px; flex: none; color: var(--alr-ink-2); cursor: pointer; }

.size-row { display: flex; align-items: center; gap: 10px; }
.size-seg { flex: 1; min-width: 0; }
.edge { display: flex; align-items: center; gap: 6px; flex: none; font-size: 11.5px; color: var(--alr-mute); transition: opacity var(--duration-base) var(--easing-standard); }
.edge.off { opacity: .4; }
.edge input {
  width: 74px; height: 30px; padding: 0 8px; border-radius: 8px; text-align: right; font-size: 12px; color: var(--alr-ink);
  background: var(--alr-sunken); border: 0; box-shadow: var(--alr-well); outline: none; transition: var(--alr-hover);
}
.edge input:focus { box-shadow: var(--alr-well), 0 0 0 1px rgb(var(--alr-accent-rgb) / .6), 0 0 0 4px rgb(var(--alr-accent-rgb) / .12); }

/* Sharpening is one recessed panel; its controls stay in place and simply wake up when the switch is on. */
.sharpen { gap: 0; padding: 14px 16px 16px; border-radius: 12px; background: rgb(0 0 0 / .16); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .045); }
.sharpen-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 14px; margin-bottom: 14px; box-shadow: inset 0 -1px 0 rgb(255 255 255 / .05); cursor: pointer; }
.sharpen-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sharpen-title { font-size: 13px; font-weight: 500; color: var(--alr-ink); }
.sharpen-note { font-size: 11.5px; color: var(--alr-mute); }
.sharpen-fields { display: flex; flex-direction: column; gap: 14px; opacity: .38; transition: opacity var(--duration-base) var(--easing-standard); }
.sharpen.on .sharpen-fields { opacity: 1; }

.aside-icon { flex: none; color: var(--alr-accent); }
.aside-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
