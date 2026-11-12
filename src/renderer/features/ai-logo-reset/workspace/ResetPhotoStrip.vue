<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ImageOff, ImagePlus, Trash2 } from '@lucide/vue'
import UiCollapse from '../../../components/UiCollapse.vue'
import { PHOTO_ACCEPT, pickFiles, useWorkspace } from '../state/context'
import { requestScaled, thumbFailures, thumbUrls } from '../render/imagePipeline'
import type { ResetPhotoFilter } from '../state/workspace'

const { state, actions, visiblePhotos, missingCount, photoUrl } = useWorkspace()

const COLUMNS = 2, GAP = 6, PAD = 10, OVERSCAN_ROWS = 3
const scroller = ref<HTMLElement | null>(null)
const width = ref(0)
const height = ref(0)
const scrollTop = ref(0)

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { width.value = entry.contentRect.width; height.value = entry.contentRect.height })
  if (scroller.value) observer.observe(scroller.value)
})
onBeforeUnmount(() => observer?.disconnect())

const tile = computed(() => Math.max(40, (width.value - PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS))
const rowHeight = computed(() => tile.value + GAP)
const rows = computed(() => Math.ceil(visiblePhotos.value.length / COLUMNS))
const totalHeight = computed(() => rows.value ? rows.value * rowHeight.value - GAP + PAD * 2 : 0)
const range = computed(() => {
  const first = Math.max(0, Math.floor((scrollTop.value - PAD) / rowHeight.value) - OVERSCAN_ROWS)
  const last = Math.min(rows.value, Math.ceil((scrollTop.value + height.value) / rowHeight.value) + OVERSCAN_ROWS)
  return { first, last }
})
const items = computed(() => {
  const list = visiblePhotos.value
  const out: Array<{ photo: typeof list[number], index: number, x: number, y: number }> = []
  for (let row = range.value.first; row < range.value.last; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const index = row * COLUMNS + column
      const photo = list[index]
      if (!photo) break
      out.push({ photo, index, x: PAD + column * (tile.value + GAP), y: PAD + row * rowHeight.value })
    }
  }
  return out
})

// Tiles in view request their thumbnails (shared, de-duplicated decodes) ahead of background work.
// A thumbnail that failed stays marked; scrolling past it does not retry it (and would set the progress back).
watch(items, list => { for (const item of list) if (!thumbUrls[item.photo.id] && !thumbFailures[item.photo.id]) void requestScaled(item.photo.id, 'thumb', photoUrl(item.photo), 5).catch(() => {}) })

// Thumbnails load in the background; until all are in, the strip says how far along they are.
const progress = computed(() => {
  let loaded = 0, failed = 0
  for (const photo of state.photos) {
    if (thumbUrls[photo.id]) loaded += 1
    else if (thumbFailures[photo.id]) failed += 1
  }
  const total = state.photos.length
  return { loaded, failed, total, done: loaded + failed >= total, ratio: total ? (loaded + failed) / total : 0 }
})

let scrollFrame = 0
const onScroll = () => {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => { scrollTop.value = scroller.value?.scrollTop ?? 0 })
}

const selected = computed(() => new Set(state.selectedIds))
const multiSelectActive = computed(() => selected.value.size > 1)
const marked = computed(() => {
  const set = new Set<string>()
  for (const [id, scene] of Object.entries(state.scenes)) if (scene.layers.some(layer => layer.visible)) set.add(id)
  return set
})
const front = computed(() => {
  const set = new Set<string>()
  for (const [id, scene] of Object.entries(state.scenes)) if (scene.mode === 'subject-front') set.add(id)
  return set
})

const filters = computed<Array<{ value: ResetPhotoFilter, label: string, count: number }>>(() => {
  let portrait = 0
  for (const photo of state.photos) if (photo.orientation === 'portrait') portrait += 1
  return [
    { value: 'all', label: '全部', count: state.photos.length },
    { value: 'landscape', label: '横图', count: state.photos.length - portrait },
    { value: 'portrait', label: '竖图', count: portrait },
    { value: 'missing', label: '未加', count: missingCount.value }
  ]
})

const filterIndex = computed(() => Math.max(0, filters.value.findIndex(item => item.value === state.filter)))

const click = (event: MouseEvent, id: string) => actions.select(id, event.shiftKey ? 'range' : (event.ctrlKey || event.metaKey) ? 'toggle' : 'replace')
const add = async () => actions.importPhotos(await pickFiles({ accept: PHOTO_ACCEPT }))
const removeSelected = () => actions.removePhotos([...state.selectedIds])

// Keep the current photo in view when it changes from the keyboard or the stage.
watch(() => state.currentId, async id => {
  await nextTick()
  const element = scroller.value
  const index = id ? visiblePhotos.value.findIndex(photo => photo.id === id) : -1
  if (!element || index < 0) return
  const top = PAD + Math.floor(index / COLUMNS) * rowHeight.value
  if (top < element.scrollTop) element.scrollTop = top - PAD
  else if (top + tile.value > element.scrollTop + element.clientHeight) element.scrollTop = top + tile.value - element.clientHeight + PAD
})
</script>

<template>
  <aside class="strip" :data-alr-count="state.photos.length">
    <div class="head">
      <span class="title">照片</span>
      <span class="count alr-num">{{ state.photos.length }}</span>
      <button class="alr-icon-btn add" aria-label="添加照片" title="添加照片" @click="add"><ImagePlus :size="15" /></button>
    </div>
    <div class="filters" role="radiogroup" aria-label="照片筛选">
      <span class="alr-slide filter-thumb" :style="{ transform: `translateX(${filterIndex * 100}%)` }" aria-hidden="true" />
      <button
        v-for="item in filters" :key="item.value" role="radio" :aria-checked="state.filter === item.value"
        :class="{ on: state.filter === item.value }" @click="state.filter = item.value"
      >{{ item.label }}<span class="alr-num filter-count">{{ item.count }}</span></button>
    </div>

    <!-- Opens in place and folds away once every thumbnail is in, so the list below moves smoothly. -->
    <UiCollapse class="loading-wrap" :open="state.loading || (!!state.photos.length && !progress.done)">
      <div class="loading" role="status" aria-live="polite">
        <div class="loading-text">
          <span>{{ state.loading ? '正在打开项目…' : '正在加载缩略图' }}</span>
          <span v-if="!state.loading" class="alr-num loading-count">{{ progress.loaded + progress.failed }} / {{ progress.total }}</span>
        </div>
        <div class="loading-track ui-activity-sweep" :aria-valuenow="Math.round(progress.ratio * 100)" aria-valuemin="0" aria-valuemax="100" role="progressbar" aria-label="缩略图加载进度">
          <span class="loading-fill" :style="{ transform: `scaleX(${state.loading ? 0 : progress.ratio})` }" />
        </div>
      </div>
    </UiCollapse>

    <div ref="scroller" class="list alr-scroll" @scroll.passive="onScroll">
      <div v-if="state.loading" class="empty">
        <div class="empty-art waiting" aria-hidden="true"><span class="ui-activity-sweep" /><span class="ui-activity-sweep" /><span class="ui-activity-sweep" /><span class="ui-activity-sweep" /></div>
        <span>正在读取照片列表…</span>
      </div>
      <div v-else-if="!state.photos.length" class="empty">
        <div class="empty-art" aria-hidden="true"><span /><span /><span /><span /></div>
        <span>拖入照片，或</span>
        <button class="empty-link" @click="add">点击添加</button>
      </div>
      <div v-else-if="!visiblePhotos.length" class="empty">没有符合筛选的照片</div>
      <div v-else class="canvas" :style="{ height: `${totalHeight}px` }">
        <button
          v-for="item in items" :key="item.photo.id" :data-alr-photo="item.photo.id" class="tile"
          :class="{ current: item.photo.id === state.currentId, selected: selected.has(item.photo.id), 'is-dimmed': multiSelectActive && !selected.has(item.photo.id) }"
          :style="{ width: `${tile}px`, height: `${tile}px`, transform: `translate(${item.x}px, ${item.y}px)` }"
          :aria-label="`${item.index + 1}. ${item.photo.name}`" :aria-current="item.photo.id === state.currentId" @click="click($event, item.photo.id)"
        >
          <img v-if="thumbUrls[item.photo.id]" :src="thumbUrls[item.photo.id]" alt="" :draggable="false" decoding="async" />
          <span v-else-if="thumbFailures[item.photo.id]" class="failed" title="缩略图加载失败，原图可能已移动或损坏"><ImageOff :size="16" /><span>无法加载</span></span>
          <span v-else class="pending ui-activity-sweep" aria-hidden="true" />
          <span class="shade" aria-hidden="true" />
          <span class="ring" aria-hidden="true" />
          <span class="index alr-num">{{ item.index + 1 }}</span>
          <span v-if="marked.has(item.photo.id)" class="mark" title="已添加 LOGO" />
          <span v-if="front.has(item.photo.id)" class="front">前置</span>
        </button>
      </div>
    </div>

    <div class="foot">
      <span class="foot-text alr-num">
        {{ state.selectedIds.length > 1 ? `已选 ${state.selectedIds.length} 张` : state.photos.length ? `${visiblePhotos.length} 张` : '' }}
        <span v-if="progress.failed" class="foot-failed" title="这些照片的原图可能已移动或损坏">· {{ progress.failed }} 张无法加载</span>
      </span>
      <button class="alr-icon-btn" :disabled="!state.selectedIds.length" aria-label="移除所选照片" title="从项目移除所选照片（原图不受影响）" @click="removeSelected"><Trash2 :size="14" /></button>
    </div>
  </aside>
</template>

<style scoped>
.strip { display: flex; flex-direction: column; height: 100%; min-width: 0; overflow: hidden; background: var(--alr-panel-sheen), var(--alr-panel); box-shadow: var(--alr-edge); }
.head { display: flex; align-items: center; gap: 8px; flex: none; height: 48px; padding: 0 8px 0 14px; }
.title { font-size: 13px; font-weight: 500; }
.count { padding: 0 6px; border-radius: 999px; font-size: 10.5px; line-height: 17px; color: var(--alr-mute); background: rgb(255 255 255 / .05); }
.add { margin-left: auto; }
.filters {
  position: relative; display: grid; grid-template-columns: repeat(4, 1fr); flex: none; margin: 0 10px 10px; padding: 2px;
  border-radius: var(--alr-r-m); background: var(--alr-sunken); box-shadow: var(--alr-well);
}
.filter-thumb {
  top: 2px; left: 2px; height: calc(100% - 4px); width: calc((100% - 4px) / 4); border-radius: 6px;
  background: linear-gradient(180deg, rgb(255 255 255 / .1), rgb(255 255 255 / .06)), var(--alr-raise); box-shadow: var(--alr-edge), var(--alr-bevel), 0 1px 3px rgb(0 0 0 / .4);
}
.filters button { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 3px; height: 24px; border-radius: 6px; font-size: 11.5px; color: var(--alr-mute); white-space: nowrap; transition: color var(--duration-fast) var(--easing-standard); }
.filters button:hover { color: var(--alr-ink-2); }
.filters button.on { color: var(--alr-ink); }
.filter-count { font-size: 10px; opacity: .55; }
.list { position: relative; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; border-top: 1px solid rgb(255 255 255 / .04); background: rgb(0 0 0 / .12); }
.canvas { position: relative; }
.tile { position: absolute; left: 0; top: 0; display: block; overflow: hidden; border-radius: 6px; background: var(--alr-sunken); contain: strict; }
.tile img { width: 100%; height: 100%; object-fit: cover; opacity: .82; transition: opacity var(--duration-fast) var(--easing-standard), transform var(--duration-page) var(--easing-emphasized); }
.tile:hover img { opacity: 1; transform: scale(1.04); }
.tile.current img, .tile.selected img { opacity: 1; }
.tile.is-dimmed img { opacity: .32; }
.tile.is-dimmed:hover img { opacity: .48; }
/* Bottom shade keeps the index legible on bright photos. */
.shade { position: absolute; inset: auto 0 0; height: 40%; background: linear-gradient(180deg, transparent, rgb(0 0 0 / .45)); pointer-events: none; }
.tile::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgb(255 255 255 / .07); pointer-events: none; }
/* Selection and current rings fade in; only opacity animates. */
.ring { position: absolute; inset: 0; z-index: 1; border-radius: inherit; pointer-events: none; opacity: 0; box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6); transition: opacity var(--duration-base) var(--easing-standard); }
.tile.selected .ring {
  opacity: 1;
  box-shadow: inset 0 0 0 2px var(--alr-accent), 0 0 0 1px rgb(var(--alr-accent-rgb) / .78), 0 0 12px rgb(var(--alr-accent-rgb) / .24);
}
.tile.current .ring { opacity: 1; box-shadow: inset 0 0 0 2px var(--alr-accent), inset 0 0 14px rgb(var(--alr-accent-rgb) / .35); }
.index { position: absolute; left: 6px; bottom: 4px; z-index: 2; font-size: 10px; color: rgb(255 255 255 / .9); text-shadow: 0 1px 2px #000; }
.mark { position: absolute; right: 6px; top: 6px; z-index: 2; width: 7px; height: 7px; border-radius: 999px; background: var(--alr-accent); box-shadow: 0 0 0 2px rgb(0 0 0 / .5), 0 0 8px rgb(var(--alr-accent-rgb) / .7); }
.front { position: absolute; left: 5px; top: 5px; z-index: 2; padding: 0 5px; border-radius: 4px; font-size: 9.5px; line-height: 15px; color: var(--alr-accent-ink); background: var(--alr-accent-fill); box-shadow: 0 1px 3px rgb(0 0 0 / .5); }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 100%; padding: 0 24px; text-align: center; font-size: 12px; line-height: 1.7; color: var(--alr-mute); }
.empty-art { display: grid; grid-template-columns: repeat(2, 44px); gap: 6px; margin-bottom: 12px; }
.empty-art span { height: 32px; border-radius: 6px; background: rgb(255 255 255 / .025); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .07); }
.empty-art span:first-child { background: rgb(var(--alr-accent-rgb) / .08); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .3); }
.loading-wrap { flex: none; }
.loading { display: flex; flex-direction: column; gap: 6px; margin: 0 10px 10px; padding: 8px 10px 9px; border-radius: var(--alr-r-m); background: rgb(var(--alr-accent-rgb) / .06); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .22); }
.loading-text { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--alr-ink-2); }
.loading-count { font-size: 11px; color: var(--alr-accent); }
.loading-track { --ui-activity-color: rgb(255 255 255 / .35); height: 4px; border-radius: 999px; background: rgb(0 0 0 / .35); }
.loading-fill {
  position: absolute; inset: 0; border-radius: inherit; background: var(--alr-accent-fill); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .5);
  /* Linear and short: updates arrive many times a second, and an eased restart each time would leave the bar far behind. */
  transform-origin: left center; transition: transform var(--duration-fast) linear;
}
/* A tile still waiting for its thumbnail: the light passes over it until the image arrives. */
.pending { --ui-activity-color: rgb(255 255 255 / .07); position: absolute; inset: 0; background: rgb(255 255 255 / .025); }
.failed { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 10.5px; color: var(--alr-danger); background: rgb(var(--rgb-danger) / .06); }
.empty-art.waiting span { position: relative; overflow: hidden; --ui-activity-color: rgb(255 255 255 / .08); }
.empty-link { font-size: 12px; color: var(--alr-accent); transition: var(--alr-hover); }
.empty-link:hover { color: var(--alr-accent-hover); }
.foot { display: flex; align-items: center; gap: 4px; flex: none; height: 36px; padding: 0 8px 0 14px; border-top: 1px solid rgb(255 255 255 / .05); }
.foot-text { flex: 1; font-size: 11.5px; color: var(--alr-mute); }
.foot-failed { color: var(--alr-danger); }
</style>
