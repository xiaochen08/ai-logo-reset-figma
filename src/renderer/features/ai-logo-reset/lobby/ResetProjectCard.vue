<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Ellipsis, ImageOff, Pencil, Pin, PinOff, Trash2 } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import { projectActions } from '../state/projects'
import { pushToast } from '../state/toasts'
import { requestScaled, thumbUrls } from '../render/imagePipeline'
import type { ResetProjectSummary } from '../state/types'

const props = defineProps<{ project: ResetProjectSummary }>()
const emit = defineEmits<{ open: [], delete: [] }>()

const menuOpen = ref(false)
const renaming = ref(false)
const draft = ref('')
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

const pad = (value: number) => String(value).padStart(2, '0')
const created = computed(() => {
  const date = new Date(props.project.createdAt)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
})
const updated = computed(() => {
  const date = new Date(props.project.updatedAt)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return `${sameYear ? '' : `${date.getFullYear()}-`}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

const closeOnOutside = (event: PointerEvent) => { if (!root.value?.contains(event.target as Node)) menuOpen.value = false }
watch(menuOpen, open => {
  if (open) window.addEventListener('pointerdown', closeOnOutside, true)
  else window.removeEventListener('pointerdown', closeOnOutside, true)
})
onBeforeUnmount(() => window.removeEventListener('pointerdown', closeOnOutside, true))

const startRename = async () => {
  menuOpen.value = false
  draft.value = props.project.name
  renaming.value = true
  await nextTick()
  input.value?.select()
}
const fail = (title: string) => (error: unknown) => pushToast({ tone: 'error', title, detail: error instanceof Error ? error.message : String(error) })
const commitRename = () => {
  if (renaming.value) void projectActions.rename(props.project.id, draft.value).catch(fail('重命名失败'))
  renaming.value = false
}
const togglePin = () => { menuOpen.value = false; void projectActions.togglePin(props.project.id).catch(fail('置顶失败')) }

// Four or more photos make a 2×2 mosaic; fewer show the first one alone. Each is decoded
// off the main thread into the shared thumbnail cache.
const shownUrls = computed(() => {
  const urls = props.project.coverUrls
  return urls.length >= 4 ? urls.slice(0, 4) : urls.slice(0, 1)
})
const idOf = (url: string) => url.split('/').pop() ?? ''
const tiles = computed(() => shownUrls.value.map(url => ({ id: idOf(url), src: thumbUrls[idOf(url)] ?? '' })))
watch(shownUrls, urls => {
  for (const url of urls) if (idOf(url)) void requestScaled(idOf(url), 'thumb', url, 3).catch(() => {})
}, { immediate: true })
</script>

<template>
  <div ref="root" class="project" :class="{ open: menuOpen }">
    <button class="cover" :class="tiles.length === 4 ? 'mosaic' : 'single'" :aria-label="`打开 ${project.name}`" @click="emit('open')">
      <span v-for="tile in tiles" :key="tile.id" class="tile">
        <img v-if="tile.src" :src="tile.src" alt="" :draggable="false" />
      </span>
      <span v-if="!tiles.length" class="tile blank"><ImageOff :size="22" /><span>还没有照片</span></span>
      <span class="cover-shade" aria-hidden="true" />
    </button>
    <div class="badges" aria-hidden="true">
      <span v-if="project.pinned" class="badge pin-mark"><Pin :size="12" /></span>
      <span v-if="project.photoCount" class="badge alr-num">共{{ project.photoCount }}张</span>
    </div>
    <button class="more" :aria-expanded="menuOpen" aria-label="项目操作" @click="menuOpen = !menuOpen"><Ellipsis :size="16" /></button>
    <UiMotionTransition preset="popover">
      <div v-if="menuOpen" class="menu alr-glass" role="menu">
        <button role="menuitem" @click="startRename"><Pencil :size="13" />重命名</button>
        <button role="menuitem" @click="togglePin">
          <component :is="project.pinned ? PinOff : Pin" :size="13" />{{ project.pinned ? '取消置顶' : '置顶' }}
        </button>
        <button role="menuitem" class="danger" @click="menuOpen = false; emit('delete')"><Trash2 :size="13" />删除</button>
      </div>
    </UiMotionTransition>

    <div class="info">
      <span class="date alr-num">{{ created }}</span>
      <input
        v-if="renaming" ref="input" v-model="draft" class="rename" aria-label="项目名称" maxlength="60"
        @keydown.enter.prevent="commitRename" @keydown.esc.prevent="renaming = false" @keydown.stop @blur="commitRename"
      />
      <button v-else class="name" :title="`${project.name}（双击重命名）`" @click="emit('open')" @dblclick.stop="startRename">{{ project.name }}</button>
      <span class="sub alr-num">{{ project.photoCount }} 张照片</span>
      <span class="sub alr-num">更新于 {{ updated }}</span>
    </div>
  </div>
</template>

<style scoped>
/* A print in a sleeve: the photos on top, the project's label below, one lit hairline around both. */
.project {
  position: relative; display: flex; flex-direction: column; overflow: visible; border-radius: 14px; text-align: left;
  background: linear-gradient(180deg, rgb(255 255 255 / .035), rgb(255 255 255 / .015)), var(--alr-panel);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .06), var(--alr-lift-1);
  transition: transform var(--duration-page) var(--easing-emphasized), box-shadow var(--duration-base) var(--easing-standard);
}
.project:hover, .project.open { transform: translateY(-3px); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .5), var(--alr-lift-2); }

.cover {
  position: relative; display: grid; gap: 3px; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 14px 14px 0 0;
  background: rgb(0 0 0 / .45);
}
.cover:active { transform: scale(.995); }
.cover.mosaic { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.tile { position: relative; display: block; min-width: 0; min-height: 0; overflow: hidden; background: rgb(255 255 255 / .03); }
.tile img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform var(--duration-page) var(--easing-emphasized); }
.project:hover .tile img { transform: scale(1.04); }
.tile.blank { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 12px; color: var(--alr-mute); }
.cover-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgb(0 0 0 / .32), rgb(0 0 0 / 0) 34%, rgb(0 0 0 / 0) 72%, rgb(0 0 0 / .25)); }

.badges { position: absolute; left: 12px; top: 12px; display: flex; gap: 6px; pointer-events: none; }
.badge {
  display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 8px; font-size: 12px; font-weight: 500; color: rgb(255 255 255 / .95);
  background: rgb(0 0 0 / .62); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .08); backdrop-filter: blur(6px);
}
.pin-mark { justify-content: center; width: 26px; padding: 0; color: var(--alr-accent); }
.more {
  position: absolute; right: 12px; top: 12px; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; color: rgb(255 255 255 / .92);
  background: rgb(0 0 0 / .55); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .1); backdrop-filter: blur(6px);
  opacity: .85; transition: var(--alr-hover), var(--alr-press);
}
.project:hover .more, .more[aria-expanded="true"] { opacity: 1; }
.more:hover { background: rgb(0 0 0 / .72); }
.more:active { transform: scale(.92); }
.menu { position: absolute; right: 12px; top: 50px; z-index: 20; display: flex; flex-direction: column; min-width: 148px; padding: 5px; transform-origin: top right; }
.menu button { display: flex; align-items: center; gap: 9px; height: 32px; padding: 0 10px; border-radius: 7px; font-size: 12.5px; color: var(--alr-ink-2); text-align: left; transition: var(--alr-hover); }
.menu button:hover { background: rgb(255 255 255 / .06); color: var(--alr-ink); }
.menu button.danger { color: var(--alr-danger); }
.menu button.danger:hover { background: rgb(var(--rgb-danger) / .1); }

.info { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px 16px 16px; }
.date { font-size: 11.5px; color: var(--alr-accent); }
.name {
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 2px 0 2px; text-align: left;
  font-size: 15px; font-weight: 500; color: var(--alr-ink); transition: var(--alr-hover);
}
.rename {
  width: 100%; height: 28px; margin: 1px 0; padding: 0 8px; border-radius: 6px; border: 0; font-size: 14px;
  background: var(--alr-sunken); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6), 0 0 0 3px rgb(var(--alr-accent-rgb) / .12); outline: none;
}
.sub { font-size: 11.5px; color: var(--alr-mute); }
@media (prefers-reduced-motion: reduce) { .project:hover, .project.open, .cover:active { transform: none; } }
</style>
