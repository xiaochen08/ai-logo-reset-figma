<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowLeft, CircleHelp, Copy, FolderPlus, ImagePlus, Redo2, Route, ScanFace, SplitSquareHorizontal, Stamp, Undo2, Upload } from '@lucide/vue'
const appIcon = '/demo/logos/studio-icon.svg'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import ResetConfirmDialog from '../ui/ResetConfirmDialog.vue'
import ResetPresetMenu from './ResetPresetMenu.vue'
import { PHOTO_ACCEPT, pickFiles, useWorkspace } from '../state/context'
import { projectActions } from '../state/projects'
import { ensureRecognition, recognitionOf } from '../state/recognition'
import { pushToast } from '../state/toasts'
import { aiLogoResetRecognitionKindFor } from '../../../../shared/aiLogoReset.ts'
import type { ResetProjectSummary } from '../state/types'

const props = defineProps<{ project: ResetProjectSummary }>()
const emit = defineEmits<{ back: [], guide: [which: 'basic' | 'layer'] }>()
const { state, actions, scene, canUndo, canRedo } = useWorkspace()

const hasPhotos = computed(() => state.photos.length > 0)
const hasLayers = computed(() => (scene.value?.layers.length ?? 0) > 0)
const syncing = ref(false)
const editingName = ref(false)
const nameDraft = ref('')

const addPhotos = async () => actions.importPhotos(await pickFiles({ accept: PHOTO_ACCEPT }))
const addFolder = async () => actions.importPhotos(await pickFiles({ accept: PHOTO_ACCEPT, directory: true }))
// Recognises every photo ahead of time: the kind its scene uses (subject in front needs the
// subject mask), otherwise faces. Failed photos are retried.
const recognizing = ref<{ done: number, total: number } | null>(null)
const recognize = async () => {
  if (recognizing.value) return
  const jobs = state.photos.map(photo => {
    const scene = state.scenes[photo.id]
    return { photo, kind: (scene && aiLogoResetRecognitionKindFor(scene)) ?? 'face' as const }
  })
  const progress = { done: 0, total: jobs.length }
  recognizing.value = progress
  await Promise.all(jobs.map(job => ensureRecognition(state.projectId, job.photo.id, job.kind, { retry: true }).then(() => { progress.done += 1; recognizing.value = { ...progress } })))
  recognizing.value = null
  const failed = jobs.filter(job => recognitionOf(state.projectId, job.photo.id, job.kind)?.status === 'failed')
  if (!failed.length) pushToast({ tone: 'ok', title: `已识别 ${jobs.length} 张照片` })
  else pushToast({ tone: 'error', title: `${failed.length} 张照片识别失败`, detail: recognitionOf(state.projectId, failed[0].photo.id, failed[0].kind)?.error }, 6000)
}
const confirmSync = () => {
  const count = actions.syncToAll()
  syncing.value = false
  pushToast({ tone: 'ok', title: `已应用到 ${count} 张照片` })
}
const startName = () => { nameDraft.value = props.project.name; editingName.value = true }
const commitName = () => {
  if (editingName.value) void projectActions.rename(props.project.id, nameDraft.value).catch(error => pushToast({ tone: 'error', title: '重命名失败', detail: error instanceof Error ? error.message : String(error) }))
  editingName.value = false
}
// The help button lists both tours; the logo one needs a logo on the photo to point at.
const helpOpen = ref(false)
const help = ref<HTMLElement | null>(null)
const closeHelpOutside = (event: PointerEvent) => { if (!help.value?.contains(event.target as Node)) helpOpen.value = false }
watch(helpOpen, open => {
  if (open) window.addEventListener('pointerdown', closeHelpOutside, true)
  else window.removeEventListener('pointerdown', closeHelpOutside, true)
})
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeHelpOutside, true))
const startGuide = (which: 'basic' | 'layer') => { helpOpen.value = false; emit('guide', which) }
const holdCompare = (event: PointerEvent) => { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); state.comparing = true }
const releaseCompare = () => { state.comparing = false }
</script>

<template>
  <header class="bar">
    <button class="alr-icon-btn" aria-label="返回项目大厅" title="返回项目大厅" @click="emit('back')"><ArrowLeft :size="16" /></button>
    <div class="crumb">
      <img :src="appIcon" alt="光影盒子" :draggable="false" class="crumb-icon" />
      <button class="crumb-link" title="返回项目大厅" @click="emit('back')">项目</button>
      <span class="crumb-sep">/</span>
      <input
        v-if="editingName" v-model="nameDraft" class="crumb-input" aria-label="项目名称" maxlength="60" autofocus
        @keydown.enter.prevent="commitName" @keydown.esc.prevent="editingName = false" @keydown.stop @blur="commitName"
      />
      <button v-else class="crumb-name" title="点击重命名" @click="startName">{{ project.name }}</button>
    </div>

    <div class="group" data-guide="import">
      <button class="alr-tool-btn" @click="addPhotos"><ImagePlus :size="15" /><span class="alr-label">添加照片</span></button>
      <button class="alr-tool-btn" @click="addFolder"><FolderPlus :size="15" /><span class="alr-label">添加文件夹</span></button>
    </div>
    <UiMotionTransition preset="status">
      <span v-if="state.importing" class="importing alr-num"><span class="spinner" />正在导入 {{ state.importing }}</span>
    </UiMotionTransition>
    <div class="group">
      <button class="alr-icon-btn" aria-label="撤销" title="撤销 Ctrl/⌘ Z" :disabled="!canUndo" @click="actions.undo()"><Undo2 :size="15" /></button>
      <button class="alr-icon-btn" aria-label="重做" title="重做 Ctrl/⌘ Shift Z" :disabled="!canRedo" @click="actions.redo()"><Redo2 :size="15" /></button>
      <span class="group-sep" aria-hidden="true" />
      <button
        class="alr-tool-btn compare" :aria-pressed="state.comparing" :disabled="!hasPhotos" title="按住查看原图（或按住 \ 键）"
        @pointerdown="holdCompare" @pointerup="releaseCompare" @pointercancel="releaseCompare"
      ><SplitSquareHorizontal :size="15" /><span class="alr-label">{{ state.comparing ? '原图' : '按住对比' }}</span></button>
    </div>
    <div class="group" data-guide="recognize">
      <button class="alr-tool-btn" :class="{ working: !!recognizing }" :disabled="!hasPhotos || !!recognizing" @click="recognize"><ScanFace :size="15" /><span class="alr-label alr-num">{{ recognizing ? `识别中 ${recognizing.done}/${recognizing.total}` : '识别人脸' }}</span></button>
    </div>

    <span class="spacer" />

    <div ref="help" class="help" @keydown.esc.stop="helpOpen = false">
      <button
        class="alr-icon-btn guide" data-guide="guide" aria-label="新手引导" title="新手引导" aria-haspopup="menu" :aria-expanded="helpOpen"
        @click="helpOpen = !helpOpen"
      ><CircleHelp :size="16" /></button>
      <UiMotionTransition preset="popover">
        <div v-if="helpOpen" class="help-menu alr-glass" role="menu">
          <button role="menuitem" @click="startGuide('basic')">
            <Route :size="14" /><span class="help-text"><b>基础引导</b><span>从添加照片到导出</span></span>
          </button>
          <button role="menuitem" :disabled="!hasLayers" @click="startGuide('layer')">
            <Stamp :size="14" /><span class="help-text"><b>LOGO 调整</b><span>{{ hasLayers ? '缩放、旋转、阴影、透视' : '先给这张照片加一个 LOGO' }}</span></span>
          </button>
        </div>
      </UiMotionTransition>
    </div>
    <ResetPresetMenu />
    <button class="alr-tool-btn" data-guide="sync" :disabled="state.photos.length < 2 || !hasLayers" title="把当前照片的 LOGO 设置应用到其余照片" @click="syncing = true">
      <Copy :size="15" /><span class="alr-label">应用到全部</span>
    </button>
    <button class="alr-btn alr-btn--primary export" data-guide="export" :disabled="!hasPhotos" @click="actions.open('export')"><Upload :size="14" />导出</button>

    <ResetConfirmDialog
      :open="syncing" title="应用到全部照片"
      :message="`把当前照片的 ${scene?.layers.length ?? 0} 个 LOGO、位置和效果应用到其余 ${Math.max(0, state.photos.length - 1)} 张照片？已有设置会被替换。`"
      confirm-label="应用" @cancel="syncing = false" @confirm="confirmSync"
    />
  </header>
</template>

<style scoped>
.bar {
  position: relative; display: flex; align-items: center; gap: 8px; flex: none; height: 48px; padding: 0 10px;
  background: linear-gradient(180deg, rgb(255 255 255 / .03), rgb(255 255 255 / 0)), var(--alr-panel);
  box-shadow: var(--alr-edge), 0 1px 0 rgb(0 0 0 / .5), 0 1px 0 1px rgb(255 255 255 / .02);
}
.crumb { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0 6px 0 2px; }
.crumb-icon { width: 20px; height: 20px; }
.crumb-link { font-size: 13px; color: var(--alr-mute); transition: var(--alr-hover); }
.crumb-link:hover { color: var(--alr-ink); }
.crumb-sep { font-size: 13px; color: rgb(255 255 255 / .2); }
.crumb-name {
  max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 6px; margin-left: -6px; border-radius: 5px;
  font-size: 13px; font-weight: 500; color: var(--alr-ink); transition: var(--alr-hover);
}
.crumb-name:hover { background: rgb(255 255 255 / .05); }
.crumb-input { width: 200px; height: 26px; padding: 0 8px; border-radius: 6px; border: 0; background: var(--alr-sunken); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6), 0 0 0 3px rgb(var(--alr-accent-rgb) / .12); outline: none; font-size: 13px; }
/* Related tools sit in one recessed rail, like a hardware control strip. */
.group { display: flex; align-items: center; gap: 1px; height: 34px; padding: 2px; border-radius: 9px; background: rgb(0 0 0 / .22); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .05), inset 0 1px 2px rgb(0 0 0 / .35); }
.group-sep { width: 1px; height: 16px; margin: 0 3px; background: rgb(255 255 255 / .08); }
.importing { display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; font-size: 12px; color: var(--alr-mute); }
.spinner { width: 12px; height: 12px; border-radius: 999px; border: 1.5px solid currentColor; border-right-color: transparent; animation: alr-spin calc(var(--duration-page) * 3) linear infinite; }
.compare[aria-pressed="true"] { background: var(--alr-accent-fill); color: var(--alr-accent-ink); box-shadow: inset 0 1px 0 rgb(255 255 255 / .3); }
.working { color: var(--alr-accent); }
.spacer { flex: 1; }
.help { position: relative; }
.help-menu { position: absolute; right: 0; top: 40px; z-index: 20; display: flex; flex-direction: column; width: 212px; padding: 5px; transform-origin: top right; }
.help-menu button { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 7px; text-align: left; color: var(--alr-ink-2); transition: var(--alr-hover); }
.help-menu button :deep(svg) { flex: none; margin-top: 2px; color: var(--alr-accent); }
.help-menu button:hover:not(:disabled) { background: rgb(255 255 255 / .06); color: var(--alr-ink); }
.help-menu button:disabled { cursor: default; opacity: .5; }
.help-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.help-text b { font-size: 12.5px; font-weight: 500; color: var(--alr-ink); }
.help-text span { font-size: 11.5px; color: var(--alr-mute); }
.export { min-width: 92px; height: 34px; margin-left: 2px; border-radius: 9px; }
@keyframes alr-spin { to { transform: rotate(360deg); } }
</style>
