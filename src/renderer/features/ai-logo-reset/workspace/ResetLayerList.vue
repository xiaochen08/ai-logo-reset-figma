<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, GripVertical, Lock, LockOpen, Replace, Trash2, Ungroup } from '@lucide/vue'
import { resolveUiMotionTransitionName } from '../../../animation/motionPresets'
import { AI_LOGO_RESET_GROUP_OPACITIES } from '../../../../shared/aiLogoReset.ts'
import { ANCHOR_LABELS } from '../state/placement'
import { useWorkspace } from '../state/context'
import type { ResetLayer, ResetLayerGroup } from '../state/types'

const { state, actions, scene, logoById } = useWorkspace()

const listMotion = resolveUiMotionTransitionName('list')
// Folded groups are a view choice of this list, not part of the photo.
const folded = ref(new Set<string>())
const toggleFold = (groupId: string) => {
  const next = new Set(folded.value)
  if (next.has(groupId)) next.delete(groupId); else next.add(groupId)
  folded.value = next
}

type Row =
  | { kind: 'group', key: string, group: ResetLayerGroup, members: ResetLayer[] }
  | { kind: 'layer', key: string, layer: ResetLayer, grouped: boolean, first: boolean, last: boolean }

// Top of the list is the top of the stack; a group's header sits above its members.
const rows = computed<Row[]>(() => {
  const layers = [...(scene.value?.layers ?? [])].reverse()
  const groups = new Map((scene.value?.groups ?? []).map(group => [group.id, group]))
  const shown = new Set<string>()
  const result: Row[] = []
  layers.forEach((layer, index) => {
    const group = layer.groupId ? groups.get(layer.groupId) : undefined
    if (group && !shown.has(group.id)) {
      shown.add(group.id)
      result.push({ kind: 'group', key: `group-${group.id}`, group, members: layers.filter(item => item.groupId === group.id) })
    }
    if (group && folded.value.has(group.id)) return
    result.push({ kind: 'layer', key: layer.id, layer, grouped: !!group, first: index === 0, last: index === layers.length - 1 })
  })
  return result
})

const picked = computed(() => new Set([...state.layerSelection, ...(state.selectedLayerId ? [state.selectedLayerId] : [])]))
const placeLabel = (item: ResetLayer) => `${item.anchor ? ANCHOR_LABELS[item.anchor] : '自由位置'} · ${item.size.toFixed(item.size % 1 ? 1 : 0)}%`
const pick = (event: MouseEvent, layerId: string) => {
  actions.selectLayer(layerId, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace')
}
const allOf = (members: ResetLayer[], flag: 'visible' | 'locked') => members.every(layer => layer[flag])
const groupPicked = (members: ResetLayer[]) => members.every(layer => picked.value.has(layer.id))

// Group names are edited in place; Enter or leaving the field keeps the name, Esc drops it.
const renaming = ref<string | null>(null)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement[] | null>(null)
const startRename = async (group: ResetLayerGroup) => {
  renaming.value = group.id
  nameDraft.value = group.name
  await nextTick()
  nameInput.value?.[0]?.select()
}
const commitRename = () => {
  if (renaming.value) actions.renameGroup(renaming.value, nameDraft.value)
  renaming.value = null
}

// Drag to reorder. A logo dropped on a row goes above or below it and joins that row's group (or
// leaves its own); dropped on a group's header it joins that group on top. A dragged group goes
// above or below the logo, or the whole group, it is dropped on.
type Dragging = { kind: 'layer' | 'group', id: string }
const dragging = ref<Dragging | null>(null)
const dropAt = ref<{ key: string, side: 'above' | 'below' | 'into' } | null>(null)
const dragStart = (event: DragEvent, item: Dragging) => {
  dragging.value = item
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Marks the drag as ours, so the workspace's file drop ignores it.
    event.dataTransfer.setData('application/x-alr-layer', item.id)
  }
}
const dragEnd = () => { dragging.value = null; dropAt.value = null }
const sideOf = (event: DragEvent) => {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'above' as const : 'below' as const
}
const overRow = (event: DragEvent, row: Row) => {
  const drag = dragging.value
  if (!drag) return
  if (row.kind === 'layer' && drag.kind === 'layer' && drag.id === row.layer.id) return
  if (row.kind === 'group' && drag.kind === 'group' && drag.id === row.group.id) return
  if (drag.kind === 'group' && row.kind === 'layer' && row.layer.groupId === drag.id) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropAt.value = { key: row.key, side: row.kind === 'group' && drag.kind === 'layer' ? 'into' : sideOf(event) }
}
const dropRow = (event: DragEvent, row: Row) => {
  const drag = dragging.value
  const at = dropAt.value
  dragEnd()
  if (!drag || !at || at.key !== row.key) return
  event.preventDefault()
  event.stopPropagation()
  if (drag.kind === 'layer') {
    if (row.kind === 'group') actions.moveLayerIntoGroup(drag.id, row.group.id)
    else actions.moveLayerTo(drag.id, row.layer.id, at.side === 'below' ? 'below' : 'above', row.layer.groupId)
  } else {
    // A group lands above its target's top member or below its bottom one.
    const members = row.kind === 'group' ? row.members : [row.layer]
    const target = at.side === 'above' ? members[0] : members[members.length - 1]
    actions.moveGroupTo(drag.id, target.id, at.side === 'below' ? 'below' : 'above')
  }
}
const dropClass = (row: Row) => dropAt.value?.key === row.key ? `drop-${dropAt.value.side}` : ''
</script>

<template>
  <TransitionGroup v-if="rows.length" tag="div" :name="listMotion" class="layers" role="listbox" aria-label="当前照片的 LOGO" aria-multiselectable="true">
    <div v-for="row in rows" :key="row.key" class="row">
      <div
        v-if="row.kind === 'group'" class="group-row" :class="[dropClass(row), { on: groupPicked(row.members), dragged: dragging?.id === row.group.id }]"
        draggable="true" @dragstart="dragStart($event, { kind: 'group', id: row.group.id })" @dragend="dragEnd"
        @dragover="overRow($event, row)" @dragleave="dropAt = null" @drop="dropRow($event, row)" @click="actions.selectGroup(row.group.id)"
      >
        <button class="fold" :aria-label="folded.has(row.group.id) ? '展开组' : '折叠组'" :aria-expanded="!folded.has(row.group.id)" @click.stop="toggleFold(row.group.id)">
          <component :is="folded.has(row.group.id) ? ChevronRight : ChevronDown" :size="13" />
        </button>
        <input
          v-if="renaming === row.group.id" ref="nameInput" v-model="nameDraft" class="group-name-input" aria-label="组名" maxlength="60"
          @click.stop @keydown.enter.prevent="commitRename" @keydown.esc.stop.prevent="renaming = null" @blur="commitRename"
        />
        <span v-else class="group-name" title="双击重命名" @dblclick.stop="startRename(row.group)">{{ row.group.name }}</span>
        <span class="group-count alr-num">{{ row.members.length }}</span>
        <span class="layer-tools" @click.stop>
          <select
            class="group-opacity alr-num" :value="row.group.opacity" aria-label="组不透明度" title="组不透明度"
            @change="actions.setGroupOpacity(row.group.id, Number(($event.target as HTMLSelectElement).value))"
          >
            <option v-for="value in AI_LOGO_RESET_GROUP_OPACITIES" :key="value" :value="value">{{ value }}%</option>
          </select>
          <button class="alr-icon-btn tool" :aria-label="allOf(row.members, 'locked') ? '解锁组' : '锁定组'" @click="actions.setGroupFlag(row.group.id, 'locked', !allOf(row.members, 'locked'))">
            <component :is="allOf(row.members, 'locked') ? Lock : LockOpen" :size="13" />
          </button>
          <button class="alr-icon-btn tool eye" :class="{ hidden: !allOf(row.members, 'visible') }" :aria-label="allOf(row.members, 'visible') ? '隐藏组' : '显示组'" @click="actions.setGroupFlag(row.group.id, 'visible', !allOf(row.members, 'visible'))">
            <component :is="allOf(row.members, 'visible') ? Eye : EyeOff" :size="14" />
          </button>
          <button class="alr-icon-btn tool" aria-label="取消编组" title="取消编组（Ctrl+Shift+G）" @click="actions.ungroup(row.group.id)"><Ungroup :size="13" /></button>
        </span>
      </div>
      <div
        v-else class="layer-row" role="option" :aria-selected="picked.has(row.layer.id)" draggable="true"
        :class="[dropClass(row), { on: row.layer.id === state.selectedLayerId, picked: picked.has(row.layer.id), off: !row.layer.visible, grouped: row.grouped, dragged: dragging?.id === row.layer.id }]"
        @dragstart="dragStart($event, { kind: 'layer', id: row.layer.id })" @dragend="dragEnd"
        @dragover="overRow($event, row)" @dragleave="dropAt = null" @drop="dropRow($event, row)" @click="pick($event, row.layer.id)"
      >
        <span class="grip" aria-hidden="true"><GripVertical :size="12" /></span>
        <span class="layer-thumb alr-checker"><img v-if="logoById(row.layer.logoId)" :src="logoById(row.layer.logoId)!.url" alt="" :draggable="false" /></span>
        <span class="layer-text">
          <span class="layer-name">{{ logoById(row.layer.logoId)?.name ?? '缺少素材' }}</span>
          <span class="layer-meta alr-num">{{ row.layer.visible ? placeLabel(row.layer) : '已隐藏' }}</span>
        </span>
        <span class="layer-tools" @click.stop>
          <span v-if="(scene?.layers.length ?? 0) > 1" class="order">
            <button aria-label="上移一层" :disabled="row.first" @click="actions.moveLayerOrder(row.layer.id, 1)"><ChevronUp :size="12" /></button>
            <button aria-label="下移一层" :disabled="row.last" @click="actions.moveLayerOrder(row.layer.id, -1)"><ChevronDown :size="12" /></button>
          </span>
          <button
            v-if="!row.layer.locked" class="alr-icon-btn tool swap" :class="{ set: state.replacing && row.layer.id === state.selectedLayerId }"
            aria-label="更换素材" :title="state.replacing && row.layer.id === state.selectedLayerId ? '在上方素材中点选新的 LOGO' : '更换素材'"
            @click="state.replacing && row.layer.id === state.selectedLayerId ? (state.replacing = false) : actions.startReplacing(row.layer.id)"
          ><Replace :size="13" /></button>
          <button class="alr-icon-btn tool lock" :class="{ set: row.layer.locked }" :aria-label="row.layer.locked ? '解锁' : '锁定'" :title="row.layer.locked ? '解锁' : '锁定'" @click="actions.toggleLayerLocked(row.layer.id)">
            <component :is="row.layer.locked ? Lock : LockOpen" :size="13" />
          </button>
          <button class="alr-icon-btn tool eye" :class="{ hidden: !row.layer.visible }" :aria-label="row.layer.visible ? '隐藏' : '显示'" @click="actions.toggleLayerVisible(row.layer.id)">
            <component :is="row.layer.visible ? Eye : EyeOff" :size="14" />
          </button>
          <button class="alr-icon-btn tool delete" :disabled="row.layer.locked" aria-label="删除这个 LOGO" title="删除这个 LOGO" @click="actions.removeLayer(row.layer.id)"><Trash2 :size="13" /></button>
        </span>
      </div>
    </div>
  </TransitionGroup>
</template>

<style scoped>
/* Layers: each row names the logo and says where it sits, so the list reads without selecting. */
.layers { display: flex; flex-direction: column; gap: 3px; padding: 4px; border-radius: var(--alr-r-l); background: var(--alr-sunken); box-shadow: var(--alr-well); }
.layer-row, .group-row { position: relative; display: flex; align-items: center; border-radius: 9px; cursor: pointer; transition: var(--alr-hover); }
.layer-row { gap: 8px; height: 50px; padding: 0 6px 0 2px; }
/* Members sit under their group's header; padding, not margin, so the row keeps the list's width. */
.layer-row.grouped { padding-left: 16px; }
.layer-row:hover, .group-row:hover { background: rgb(255 255 255 / .035); }
.layer-row::before {
  content: ''; position: absolute; left: -1px; top: 13px; bottom: 13px; width: 3px; border-radius: 3px;
  background: var(--alr-accent); box-shadow: 0 0 10px rgb(var(--alr-accent-rgb) / .65);
  transform: scaleY(0); transition: transform var(--duration-base) var(--easing-emphasized);
}
.layer-row.picked { background: rgb(255 255 255 / .04); }
.layer-row.on { background: linear-gradient(180deg, rgb(255 255 255 / .075), rgb(255 255 255 / .04)); box-shadow: var(--alr-edge), var(--alr-bevel), 0 2px 6px rgb(0 0 0 / .3); }
.layer-row.on::before { transform: scaleY(1); }
.layer-row.dragged, .group-row.dragged { opacity: .45; }
/* Where a dragged row will land: a lit line above or below, or the whole group header lit. */
.drop-above::after, .drop-below::after {
  content: ''; position: absolute; left: 6px; right: 6px; height: 2px; border-radius: 2px; pointer-events: none;
  background: var(--alr-accent); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .7);
}
.drop-above::after { top: -2.5px; }
.drop-below::after { bottom: -2.5px; }
.group-row.drop-into { box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .7); background: rgb(var(--alr-accent-rgb) / .07); }
.grip { display: grid; place-items: center; width: 12px; color: var(--alr-mute); opacity: 0; cursor: grab; transition: opacity var(--duration-fast) var(--easing-standard); }
.layer-row:hover .grip { opacity: .8; }
.layer-thumb {
  display: grid; place-items: center; flex: none; width: 36px; height: 36px; overflow: hidden; border-radius: 7px;
  box-shadow: var(--alr-bevel), 0 1px 2px rgb(0 0 0 / .4); transition: box-shadow var(--duration-fast) var(--easing-standard), opacity var(--duration-fast) var(--easing-standard);
}
.layer-row.on .layer-thumb { box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .55), 0 1px 2px rgb(0 0 0 / .4); }
.layer-thumb img { max-width: 82%; max-height: 82%; object-fit: contain; }
.layer-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; transition: opacity var(--duration-fast) var(--easing-standard); }
.layer-row.off .layer-text, .layer-row.off .layer-thumb { opacity: .45; }
.layer-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--alr-ink-2); transition: color var(--duration-fast) var(--easing-standard); }
.layer-row.on .layer-name { color: var(--alr-ink); font-weight: 500; }
.layer-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--alr-mute); }
.layer-tools { display: flex; align-items: center; gap: 1px; }
/* Ordering is a quiet stacked pair that only surfaces on hover or for the selected row. */
.order { display: flex; flex-direction: column; opacity: 0; transition: opacity var(--duration-fast) var(--easing-standard); }
.layer-row:hover .order, .layer-row.on .order, .order:focus-within { opacity: 1; }
.order button { display: grid; place-items: center; width: 20px; height: 15px; border-radius: 4px; color: var(--alr-mute); transition: var(--alr-hover); }
.order button:hover:not(:disabled) { color: var(--alr-ink); background: rgb(255 255 255 / .07); }
.order button:disabled { opacity: .3; cursor: default; }
.tool { width: 26px; height: 26px; color: var(--alr-ink-2); }
.tool.delete { color: var(--alr-danger); }
.tool.delete:hover:not(:disabled) { background: rgb(var(--rgb-danger) / .12); color: var(--alr-danger); }
.tool.delete:disabled { opacity: .25; cursor: default; }
/* An open lock and the swap button stay out of the way until wanted; a closed lock always shows. */
.lock, .swap { opacity: 0; transition: opacity var(--duration-fast) var(--easing-standard); }
.layer-row:hover .lock, .layer-row.on .lock, .lock:focus-visible, .lock.set,
.layer-row:hover .swap, .layer-row.on .swap, .swap:focus-visible, .swap.set { opacity: 1; }
.lock.set, .swap.set { color: var(--alr-accent); }
.eye.hidden { color: var(--alr-mute); }

.group-row { gap: 6px; height: 34px; padding: 0 6px 0 2px; }
.group-row.on { background: rgb(var(--alr-accent-rgb) / .06); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .22); }
.fold { display: grid; place-items: center; width: 20px; height: 22px; border-radius: 5px; color: var(--alr-mute); transition: var(--alr-hover); }
.fold:hover { color: var(--alr-ink); background: rgb(255 255 255 / .06); }
.group-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 500; color: var(--alr-ink-2); }
.group-name-input {
  flex: 1; min-width: 0; height: 24px; padding: 0 6px; border-radius: 5px; font-size: 12px; color: var(--alr-ink);
  background: var(--alr-sunken); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6); outline: none;
}
.group-count { padding: 0 5px; border-radius: 4px; font-size: 10.5px; line-height: 16px; color: var(--alr-mute); background: rgb(255 255 255 / .05); }
.group-opacity {
  height: 22px; padding: 0 2px; border-radius: 5px; font-size: 11px; color: var(--alr-ink-2); background: rgb(255 255 255 / .04);
  box-shadow: var(--alr-bevel); border: 0; cursor: pointer;
}
.group-opacity:focus-visible { outline: none; box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6); }
</style>
