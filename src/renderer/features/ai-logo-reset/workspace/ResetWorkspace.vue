<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ImagePlus } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import { provideWorkspace } from '../state/context'
import { workspaceFor } from '../state/workspace'
import { pushToast } from '../state/toasts'
import { onExportFinished, watchExports } from '../state/exporting'
import type { ResetProjectSummary } from '../state/types'
import ResetTopBar from './ResetTopBar.vue'
import ResetPhotoStrip from './ResetPhotoStrip.vue'
import ResetStage from './ResetStage.vue'
import ResetInspector from './ResetInspector.vue'
import ResetStatusBar from './ResetStatusBar.vue'
import ResetExportDialog from './ResetExportDialog.vue'
import UiGuideTour from '../../../components/UiGuideTour.vue'
import {
  RESET_GUIDE_CHAPTERS, RESET_GUIDE_SEEN_KEY, RESET_LAYER_GUIDE_CHAPTERS, RESET_LAYER_GUIDE_SEEN_KEY, resetGuideSteps, resetLayerGuideSteps
} from '../guide/steps'

const props = defineProps<{ project: ResetProjectSummary }>()
const emit = defineEmits<{ back: [] }>()

const workspace = workspaceFor(props.project.id)
provideWorkspace(workspace)
const { state, actions, scene, selectedLayer } = workspace

// Pending edits are written before leaving; a project that cannot be opened returns to the lobby.
const back = async () => { await actions.flush().catch(() => {}); emit('back') }
watch(() => state.loadError, error => {
  if (!error) return
  pushToast({ tone: 'error', title: '项目无法打开', detail: error })
  emit('back')
}, { immediate: true })

// Exports keep running with the dialog closed; their result is announced here.
watchExports()
const stopFinished = onExportFinished(status => {
  if (status.projectId !== state.projectId || state.dialog === 'export') return
  if (status.phase === 'completed' && !status.failed) pushToast({ tone: 'ok', title: '导出完成', detail: `${status.success} 张已保存` })
  else if (status.phase === 'cancelled') pushToast({ tone: 'info', title: '导出已取消', detail: status.success ? `已保存 ${status.success} 张` : undefined })
  else pushToast({ tone: 'error', title: status.success ? '部分照片导出失败' : '导出失败', detail: status.message ?? `失败 ${status.failed} 张，打开导出查看详情` }, 6000)
})

// Two tours: the basic one starts by itself the first time a project is opened, once the panels
// have settled in; the logo one the first time a logo lands on a photo, once nothing else is up.
const seen = (key: string) => { try { return localStorage.getItem(key) === '1' } catch { return true } }
const remember = (key: string) => {
  try { localStorage.setItem(key, '1') } catch { /* private storage: the tour simply shows again next time */ }
}
const settleDelay = () => (Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-duration-page')) || 0) * 2

const guideOpen = ref(false)
const guideSteps = resetGuideSteps({
  photoCount: () => state.photos.length
})
const layerGuideOpen = ref(false)
const layerGuideSteps = resetLayerGuideSteps({
  hasSelection: () => !!selectedLayer.value,
  openTab: tab => { state.inspectorTab = tab }
})
const openGuide = (which: 'basic' | 'layer' = 'basic') => {
  guideOpen.value = which === 'basic'
  layerGuideOpen.value = which === 'layer'
}
const closeGuide = () => { guideOpen.value = false; remember(RESET_GUIDE_SEEN_KEY) }
const closeLayerGuide = () => { layerGuideOpen.value = false; remember(RESET_LAYER_GUIDE_SEEN_KEY) }

let guideTimer = 0
watch(() => state.loading, loading => {
  if (loading || seen(RESET_GUIDE_SEEN_KEY) || guideOpen.value) return
  guideTimer = window.setTimeout(() => { if (!state.dialog && !state.loadError && !layerGuideOpen.value) openGuide() }, settleDelay())
}, { immediate: true })

// A logo added to the photo on screen (not a switch to a photo that already has some) asks for the
// logo tour; it waits until the basic tour and any dialog are out of the way.
const layerGuideWanted = ref(false)
watch(() => [state.currentId, scene.value?.layers.length ?? 0] as const, ([id, count], [before, previous]) => {
  if (id === before && count > previous && !seen(RESET_LAYER_GUIDE_SEEN_KEY)) layerGuideWanted.value = true
})
let layerGuideTimer = 0
watch(() => layerGuideWanted.value && !guideOpen.value && !layerGuideOpen.value && !state.dialog, ready => {
  if (!ready) return
  layerGuideWanted.value = false
  layerGuideTimer = window.setTimeout(() => {
    if (!guideOpen.value && !state.dialog && scene.value?.layers.length) openGuide('layer')
  }, settleDelay())
})

const dropping = ref(false)
let dragDepth = 0

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return !!element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
}

const keydown = (event: KeyboardEvent) => {
  if (state.dialog || isTyping(event.target)) return
  const mod = event.ctrlKey || event.metaKey
  const key = event.key
  if (mod && key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) actions.redo(); else actions.undo(); return }
  if (mod && key.toLowerCase() === 'y') { event.preventDefault(); actions.redo(); return }
  if (mod && key.toLowerCase() === 'd') { event.preventDefault(); actions.duplicateLayer(); return }
  if (mod && key.toLowerCase() === 'g') { event.preventDefault(); if (event.shiftKey) actions.ungroup(); else actions.groupSelection(); return }
  if (mod) return
  if (key === 'PageDown') { event.preventDefault(); actions.step(1); return }
  if (key === 'PageUp') { event.preventDefault(); actions.step(-1); return }
  // Crop edits apply as they are made (undo takes them back), so Enter and Esc both leave crop mode.
  if (state.page === 'crop') {
    if (key === 'Enter' || key === 'Escape') { event.preventDefault(); if (state.straightening) state.straightening = false; else actions.setPage('logo'); return }
    if (key === 'ArrowLeft' || key === 'ArrowRight') { event.preventDefault(); actions.step(key === 'ArrowRight' ? 1 : -1) }
    return
  }
  if (key === 'Escape') { if (state.warpEditing) state.warpEditing = false; else actions.selectLayer(null); return }
  if ((key === 'Delete' || key === 'Backspace') && selectedLayer.value) { event.preventDefault(); actions.removeLayer(); return }
  if (key === '\\') { state.comparing = true; return }
  const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const arrow = arrows[key]
  if (!arrow) return
  event.preventDefault()
  if (selectedLayer.value) {
    const amount = event.shiftKey ? 0.02 : 0.004
    actions.nudge(arrow[0] * amount, arrow[1] * amount)
  } else {
    actions.step(arrow[0] || arrow[1])
  }
}
const keyup = (event: KeyboardEvent) => { if (event.key === '\\') state.comparing = false }
const blur = () => { state.comparing = false }

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
const dragenter = (event: DragEvent) => { if (!hasFiles(event)) return; dragDepth += 1; dropping.value = true }
const dragleave = (event: DragEvent) => { if (!hasFiles(event)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropping.value = false }
const dragover = (event: DragEvent) => { if (hasFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy' } }
const drop = (event: DragEvent) => {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragDepth = 0
  dropping.value = false
  void actions.importPhotos(Array.from(event.dataTransfer?.files ?? []))
}

onMounted(() => {
  window.addEventListener('keydown', keydown)
  window.addEventListener('keyup', keyup)
  window.addEventListener('blur', blur)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown)
  window.removeEventListener('keyup', keyup)
  window.removeEventListener('blur', blur)
  stopFinished()
  window.clearTimeout(guideTimer)
  window.clearTimeout(layerGuideTimer)
  void actions.flush().catch(() => {})
})
</script>

<template>
  <div class="ws" @dragenter="dragenter" @dragleave="dragleave" @dragover="dragover" @drop="drop">
    <UiMotionTransition preset="panel" appear>
      <ResetTopBar class="ws-top" :project="project" @back="back" @guide="openGuide" />
    </UiMotionTransition>
    <main class="ws-main">
      <UiMotionTransition preset="panel" appear>
        <ResetPhotoStrip class="ws-region" data-guide="strip" style="transition-delay: calc(var(--duration-fast) * .4)" />
      </UiMotionTransition>
      <UiMotionTransition preset="panel" appear>
        <ResetStage class="ws-region" data-guide="stage" style="transition-delay: calc(var(--duration-fast) * .7)" />
      </UiMotionTransition>
      <UiMotionTransition preset="panel" appear>
        <ResetInspector class="ws-region" data-guide="inspector" style="transition-delay: calc(var(--duration-fast) * 1)" />
      </UiMotionTransition>
    </main>
    <ResetStatusBar />
    <UiMotionTransition preset="status">
      <div v-if="dropping" class="ws-drop alr-finder" aria-hidden="true">
        <div class="ws-drop-card alr-glass"><ImagePlus :size="18" />松开以添加照片</div>
      </div>
    </UiMotionTransition>
    <ResetExportDialog />
    <UiGuideTour :open="guideOpen" :steps="guideSteps" :chapter-summaries="RESET_GUIDE_CHAPTERS" :paused="!!state.dialog" surface-class="alr-portal" @close="closeGuide" />
    <UiGuideTour
      :open="layerGuideOpen" :steps="layerGuideSteps" :chapter-summaries="RESET_LAYER_GUIDE_CHAPTERS" :paused="!!state.dialog" surface-class="alr-portal"
      @close="closeLayerGuide"
    />
  </div>
</template>

<style scoped>
.ws { position: relative; display: flex; flex-direction: column; height: 100%; min-width: 820px; background: var(--alr-bg); }
.ws-top { position: relative; z-index: 30; }
/* Panels are separated by a dark seam with a lit edge on each side, not a flat grey rule. */
.ws-main {
  display: grid; flex: 1; min-height: 0; column-gap: 1px; background: rgb(0 0 0 / .6);
  grid-template-columns: 236px minmax(360px, 1fr) clamp(288px, 23vw, 352px);
}
.ws-region { min-width: 0; min-height: 0; }
.ws-drop {
  position: absolute; inset: 60px 12px 40px; z-index: 40; display: grid; place-items: center; pointer-events: none; border-radius: 16px;
  background: radial-gradient(circle at 50% 50%, rgb(var(--alr-accent-rgb) / .08), rgb(var(--rgb-bg-main) / .6) 70%);
  box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .35);
}
.ws-drop::before { --alr-finder-color: var(--alr-accent); --alr-finder-size: 36px; inset: 14px; }
.ws-drop-card { display: inline-flex; align-items: center; gap: 10px; padding: 14px 24px; font-size: 13.5px; color: var(--alr-ink); }
.ws-drop-card :deep(svg) { color: var(--alr-accent); }
</style>
