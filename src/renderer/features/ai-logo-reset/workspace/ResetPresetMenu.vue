<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Bookmark, GripVertical, PanelBottom, Pin, Plus, RefreshCw, Trash2 } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import { resolveUiMotionTransitionName } from '../../../animation/motionPresets'
import ResetConfirmDialog from '../ui/ResetConfirmDialog.vue'
import ResetPresetSaveDialog from './ResetPresetSaveDialog.vue'
import { useWorkspace } from '../state/context'
import { presetActions, presetStore, shownPresets } from '../state/presets'
import { pushToast } from '../state/toasts'
import type { ResetPreset } from '../state/types'

const { state, actions, scene, current } = useWorkspace()
const listMotion = resolveUiMotionTransitionName('list')
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const closeOutside = (event: PointerEvent) => { if (!root.value?.contains(event.target as Node)) open.value = false }
watch(open, value => {
  if (value) {
    window.addEventListener('pointerdown', closeOutside, true)
    void presetActions.load()
  } else {
    window.removeEventListener('pointerdown', closeOutside, true)
    renaming.value = null
    armedDelete.value = null
  }
})
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeOutside, true))

const presets = computed(() => shownPresets())
const layerCount = computed(() => scene.value?.layers.length ?? 0)
// The current photo, or every selected photo when several are selected.
const targets = computed(() => {
  const ids = state.selectedIds.length > 1 ? state.selectedIds : current.value ? [current.value.id] : []
  return ids.filter(id => state.photos.some(photo => photo.id === id))
})
const targetText = computed(() => targets.value.length > 1 ? `点选即应用到已选的 ${targets.value.length} 张照片` : '点选即应用到当前照片')
const metaOf = (preset: ResetPreset) => {
  const parts = [`${preset.scene.layers.length} 个 LOGO`]
  if (preset.scene.groups.length) parts.push(`${preset.scene.groups.length} 组`)
  if (preset.scene.mode === 'subject-front') parts.push('主体在前')
  return parts.join(' · ')
}
// The stack shows the top three logos, front first.
const thumbsOf = (preset: ResetPreset) => {
  const byId = new Map(preset.logos.map(logo => [logo.id, logo]))
  return [...preset.scene.layers].reverse().map(layer => byId.get(layer.logoId)).filter(logo => !!logo).slice(0, 3)
}

// Saving
const saving = ref(false)
const busy = ref(false)
const startSave = () => { open.value = false; saving.value = true }
const save = async (name: string, includeBanner: boolean) => {
  if (!scene.value) return
  busy.value = true
  try {
    const preset = await presetActions.save(state.projectId, scene.value, name, includeBanner)
    saving.value = false
    pushToast({ tone: 'ok', title: `已存为预设「${preset.name}」` })
  } catch (error) {
    pushToast({ tone: 'error', title: '保存预设失败', detail: errorText(error) })
  } finally {
    busy.value = false
  }
}

// Applying
const applying = ref<ResetPreset | null>(null)
const applied = ref<string | null>(null)
const pick = (preset: ResetPreset) => {
  if (!targets.value.length || renaming.value === preset.id) return
  if (targets.value.length > 1) { open.value = false; applying.value = preset; return }
  void apply(preset, targets.value)
}
const apply = async (preset: ResetPreset, photoIds: string[]) => {
  applying.value = null
  try {
    const use = await presetActions.use(state.projectId, preset.id)
    if (!use.scene.layers.length) {
      pushToast({ tone: 'error', title: `「${preset.name}」无法应用`, detail: '预设里的 LOGO 图片都已丢失。' }, 6000)
      return
    }
    const count = actions.applyPreset(use.scene, use.added, photoIds)
    applied.value = preset.id
    setTimeout(() => { if (applied.value === preset.id) applied.value = null }, 900)
    pushToast({
      tone: use.missing ? 'error' : 'ok',
      title: count > 1 ? `已把「${preset.name}」应用到 ${count} 张照片` : `已应用「${preset.name}」`,
      detail: use.missing ? `${use.missing} 个 LOGO 的图片已丢失，已跳过。` : undefined
    }, use.missing ? 6000 : 3200)
  } catch (error) {
    pushToast({ tone: 'error', title: '应用预设失败', detail: errorText(error) })
  }
}

// Renaming
const renaming = ref<string | null>(null)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement[] | null>(null)
const startRename = async (preset: ResetPreset) => {
  renaming.value = preset.id
  nameDraft.value = preset.name
  await nextTick()
  nameInput.value?.[0]?.select()
}
const commitRename = () => {
  const id = renaming.value
  renaming.value = null
  const preset = presetStore.items.find(item => item.id === id)
  const name = nameDraft.value.trim()
  if (!preset || !name || name === preset.name) return
  presetActions.rename(preset.id, name).catch(error => pushToast({ tone: 'error', title: '重命名失败', detail: errorText(error) }))
}

const togglePin = (preset: ResetPreset) => {
  presetActions.setPinned(preset.id, !preset.pinned).catch(error => pushToast({ tone: 'error', title: '置顶失败', detail: errorText(error) }))
}

// Updating from the current photo
const overwriting = ref<ResetPreset | null>(null)
const startOverwrite = (preset: ResetPreset) => { open.value = false; overwriting.value = preset }
const overwrite = async () => {
  const preset = overwriting.value
  overwriting.value = null
  if (!preset || !scene.value) return
  try {
    await presetActions.overwrite(preset.id, state.projectId, scene.value, preset.scene.banner !== null)
    pushToast({ tone: 'ok', title: `已用当前照片更新「${preset.name}」` })
  } catch (error) {
    pushToast({ tone: 'error', title: '更新预设失败', detail: errorText(error) })
  }
}

// Deleting asks twice: the first click arms the button for a moment.
const armedDelete = ref<string | null>(null)
let disarm: ReturnType<typeof setTimeout> | null = null
const remove = (preset: ResetPreset) => {
  if (armedDelete.value !== preset.id) {
    armedDelete.value = preset.id
    if (disarm) clearTimeout(disarm)
    disarm = setTimeout(() => { armedDelete.value = null }, 3000)
    return
  }
  armedDelete.value = null
  presetActions.remove(preset.id)
    .then(() => pushToast({ tone: 'ok', title: `已删除预设「${preset.name}」` }))
    .catch(error => pushToast({ tone: 'error', title: '删除预设失败', detail: errorText(error) }))
}
onBeforeUnmount(() => { if (disarm) clearTimeout(disarm) })

// Drag to reorder, within the pinned or the unpinned ones.
const dragging = ref<string | null>(null)
const dropAt = ref<{ id: string, side: 'above' | 'below' } | null>(null)
const dragStart = (event: DragEvent, preset: ResetPreset) => {
  dragging.value = preset.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-alr-preset', preset.id)
  }
}
const dragEnd = () => { dragging.value = null; dropAt.value = null }
const over = (event: DragEvent, preset: ResetPreset) => {
  const moving = presetStore.items.find(item => item.id === dragging.value)
  if (!moving || moving.id === preset.id || moving.pinned !== preset.pinned) { dropAt.value = null; return }
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropAt.value = { id: preset.id, side: event.clientY < rect.top + rect.height / 2 ? 'above' : 'below' }
}
const drop = (event: DragEvent, preset: ResetPreset) => {
  const at = dropAt.value
  const id = dragging.value
  dragEnd()
  if (!at || !id || at.id !== preset.id) return
  event.preventDefault()
  presetActions.move(id, preset.id, at.side).catch(error => pushToast({ tone: 'error', title: '调整顺序失败', detail: errorText(error) }))
}
</script>

<template>
  <div ref="root" class="presets" @keydown.esc.stop="open = false">
    <button
      class="alr-tool-btn" data-guide="presets" :aria-pressed="open" aria-haspopup="dialog" :aria-expanded="open" title="保存或套用 LOGO 预设"
      @click="open = !open"
    ><Bookmark :size="15" /><span class="alr-label">预设</span></button>

    <UiMotionTransition preset="popover">
      <div v-if="open" class="panel alr-glass" role="dialog" aria-label="预设">
        <header class="panel-head">
          <span class="panel-title">预设</span>
          <span v-if="presetStore.items.length" class="panel-count alr-num">{{ presetStore.items.length }}</span>
          <span class="spacer" />
          <button class="alr-btn save" :disabled="!layerCount" :title="layerCount ? '把当前照片的 LOGO 布局存为预设' : '先给当前照片加一个 LOGO'" @click="startSave">
            <Plus :size="13" />存为预设
          </button>
        </header>

        <div class="panel-body alr-scroll">
          <div v-if="presetStore.status === 'loading' && !presetStore.items.length" class="state">正在读取预设…</div>
          <div v-else-if="presetStore.status === 'error'" class="state">
            <span>预设读取失败：{{ presetStore.error }}</span>
            <button class="alr-btn" @click="presetActions.load(true)">重试</button>
          </div>
          <div v-else-if="!presetStore.items.length" class="empty">
            <span class="empty-ring"><Bookmark :size="18" /></span>
            <span class="empty-title">还没有预设</span>
            <span class="empty-text">把调好的 LOGO 布局存为预设，之后可以一键套用到其他照片，换个项目也能用。</span>
          </div>
          <TransitionGroup v-else tag="div" :name="listMotion" class="list" role="list">
            <div
              v-for="preset in presets" :key="preset.id" class="item" role="listitem" draggable="true"
              :class="[dropAt?.id === preset.id ? `drop-${dropAt.side}` : '', { dragged: dragging === preset.id, applied: applied === preset.id, inert: !targets.length }]"
              :title="targets.length ? `应用「${preset.name}」` : '先选择一张照片'"
              @click="pick(preset)" @dragstart="dragStart($event, preset)" @dragend="dragEnd"
              @dragover="over($event, preset)" @dragleave="dropAt = null" @drop="drop($event, preset)"
            >
              <span class="grip" aria-hidden="true"><GripVertical :size="12" /></span>
              <span class="stack">
                <span v-for="(logo, index) in thumbsOf(preset)" :key="index" class="thumb alr-checker"><img :src="logo!.url" alt="" :draggable="false" /></span>
              </span>
              <span class="text">
                <input
                  v-if="renaming === preset.id" ref="nameInput" v-model="nameDraft" class="name-input" aria-label="预设名称" maxlength="60"
                  @click.stop @keydown.enter.prevent="commitRename" @keydown.esc.stop.prevent="renaming = null" @keydown.stop @blur="commitRename"
                />
                <span v-else class="name" title="双击重命名" @dblclick.stop="startRename(preset)">{{ preset.name }}</span>
                <span class="meta alr-num">
                  {{ metaOf(preset) }}
                  <PanelBottom v-if="preset.scene.banner" :size="11" class="meta-icon" aria-label="含横幅" />
                </span>
              </span>
              <span class="tools" @click.stop>
                <button class="alr-icon-btn tool overwrite" :disabled="!layerCount" aria-label="用当前照片更新" title="用当前照片的 LOGO 更新这个预设" @click="startOverwrite(preset)">
                  <RefreshCw :size="13" />
                </button>
                <button
                  class="alr-icon-btn tool delete" :class="{ armed: armedDelete === preset.id }" :aria-label="armedDelete === preset.id ? '再次点击删除' : '删除预设'"
                  :title="armedDelete === preset.id ? '再次点击删除' : '删除'" @click="remove(preset)"
                ><Trash2 :size="13" /></button>
                <button class="alr-icon-btn tool pin" :class="{ set: preset.pinned }" :aria-pressed="preset.pinned" :aria-label="preset.pinned ? '取消置顶' : '置顶'" :title="preset.pinned ? '取消置顶' : '置顶'" @click="togglePin(preset)">
                  <Pin :size="13" />
                </button>
              </span>
            </div>
          </TransitionGroup>
        </div>

        <footer v-if="presetStore.items.length" class="panel-foot">{{ targets.length ? targetText : '先在下方选择一张照片' }} · 现有 LOGO 会被替换，可撤销</footer>
      </div>
    </UiMotionTransition>

    <ResetPresetSaveDialog :open="saving" :busy="busy" @cancel="saving = false" @save="save" />
    <ResetConfirmDialog
      :open="!!applying" title="应用预设"
      :message="`把「${applying?.name ?? ''}」应用到已选的 ${targets.length} 张照片？这些照片现有的 LOGO 会被替换，可以逐张撤销。`"
      confirm-label="应用到已选照片" @cancel="applying = null" @confirm="applying && apply(applying, targets)"
    />
    <ResetConfirmDialog
      :open="!!overwriting" title="更新预设"
      :message="`用当前照片的 ${layerCount} 个 LOGO 更新「${overwriting?.name ?? ''}」？预设里原来的 LOGO 和设置会被替换。`"
      confirm-label="更新" @cancel="overwriting = null" @confirm="overwrite"
    />
  </div>
</template>

<style scoped>
.presets { position: relative; }
.panel { position: absolute; right: 0; top: 40px; z-index: 20; display: flex; flex-direction: column; width: 320px; max-height: min(560px, calc(100vh - 120px)); transform-origin: top right; }
.panel-head { display: flex; align-items: center; gap: 8px; flex: none; height: 46px; padding: 0 8px 0 14px; }
.panel-title { font-size: 13px; font-weight: 500; color: var(--alr-ink); }
.panel-count { padding: 0 6px; border-radius: 4px; font-size: 11px; line-height: 17px; color: var(--alr-mute); background: rgb(255 255 255 / .05); }
.spacer { flex: 1; }
.save { height: 28px; padding: 0 10px; font-size: 12px; }
.panel-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 6px; }
.panel-foot { flex: none; padding: 9px 14px; font-size: 11px; color: var(--alr-mute); box-shadow: inset 0 1px 0 rgb(255 255 255 / .05); background: rgb(0 0 0 / .12); border-radius: 0 0 var(--alr-r-l) var(--alr-r-l); }

.state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 16px; font-size: 12px; color: var(--alr-mute); text-align: center; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 22px 30px; text-align: center; }
.empty-ring {
  display: grid; place-items: center; width: 44px; height: 44px; border-radius: 999px; color: var(--alr-accent);
  background: radial-gradient(circle at 50% 30%, rgb(var(--alr-accent-rgb) / .18), rgb(var(--alr-accent-rgb) / .04)); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .3);
}
.empty-title { font-size: 13px; font-weight: 500; color: var(--alr-ink); }
.empty-text { font-size: 11.5px; line-height: 1.6; color: var(--alr-mute); }

.list { display: flex; flex-direction: column; gap: 2px; }
.item { position: relative; display: flex; align-items: center; gap: 9px; height: 54px; padding: 0 4px 0 2px; border-radius: 9px; cursor: pointer; transition: var(--alr-hover); }
.item:hover { background: rgb(255 255 255 / .045); }
.item.inert { cursor: default; }
.item.dragged { opacity: .45; }
/* Just applied: a short lit ring confirms which preset went on the photo. */
.item.applied { background: rgb(var(--alr-accent-rgb) / .08); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .45); }
.drop-above::after, .drop-below::after {
  content: ''; position: absolute; left: 6px; right: 6px; height: 2px; border-radius: 2px; pointer-events: none;
  background: var(--alr-accent); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .7);
}
.drop-above::after { top: -2px; }
.drop-below::after { bottom: -2px; }
.grip { display: grid; place-items: center; width: 12px; color: var(--alr-mute); opacity: 0; cursor: grab; transition: opacity var(--duration-fast) var(--easing-standard); }
.item:hover .grip { opacity: .8; }

/* Up to three logos overlapped left to right, the front one first and on top. */
.stack { position: relative; flex: none; width: 68px; height: 36px; }
.thumb {
  position: absolute; top: 0; display: grid; place-items: center; width: 36px; height: 36px; overflow: hidden; border-radius: 7px;
  box-shadow: var(--alr-bevel), 0 1px 3px rgb(0 0 0 / .55), 3px 0 6px rgb(0 0 0 / .35);
}
.thumb img { max-width: 82%; max-height: 82%; object-fit: contain; }
.thumb:nth-child(1) { left: 0; z-index: 3; }
.thumb:nth-child(2) { left: 16px; z-index: 2; }
.thumb:nth-child(3) { left: 32px; z-index: 1; }

.text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--alr-ink); }
.name-input {
  height: 24px; padding: 0 6px; border-radius: 5px; font: inherit; font-size: 12.5px; color: var(--alr-ink); border: 0;
  background: var(--alr-sunken); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6); outline: none;
}
.meta { display: flex; align-items: center; gap: 5px; overflow: hidden; white-space: nowrap; font-size: 11px; color: var(--alr-mute); }
.meta-icon { flex: none; color: var(--alr-accent); }

.tools { display: flex; align-items: center; gap: 1px; }
.tool { width: 26px; min-width: 26px; height: 26px; padding: 0; color: var(--alr-ink-2); }
/* Tools surface on hover; a pinned preset always shows its pin, an armed delete always shows. */
.overwrite, .delete, .pin { opacity: 0; transition: opacity var(--duration-fast) var(--easing-standard); }
.item:hover .tool, .tool:focus-visible, .pin.set, .delete.armed { opacity: 1; }
.item:hover .tool:disabled { opacity: .3; }
.pin.set { color: var(--alr-accent); }
.alr-icon-btn.delete.armed { color: var(--alr-danger); background: rgb(var(--rgb-danger) / .12); }
</style>
