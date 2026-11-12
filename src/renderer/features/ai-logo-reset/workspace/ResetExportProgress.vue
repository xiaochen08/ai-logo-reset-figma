<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Ban, Check, CircleAlert, CircleCheck, Images, X } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import { useWorkspace } from '../state/context'
import { exporting, isExportActive } from '../state/exporting'
import { previewUrls, requestScaled, thumbUrls } from '../render/imagePipeline'
import type { AiLogoResetExportStatus } from '../../../../shared/aiLogoReset.ts'

const props = defineProps<{ status: AiLogoResetExportStatus }>()
const { state, photoUrl } = useWorkspace()

const active = computed(() => isExportActive(props.status))
const rendered = computed(() => props.status.success + props.status.failed)
// Preparing (recognition) fills the first tenth; rendering the rest.
const ratio = computed(() => {
  const value = props.status
  if (!value.total) return 0
  if (value.phase === 'preparing') return value.prepared / value.total * 0.1
  return value.phase === 'completed' ? 1 : 0.1 + rendered.value / value.total * 0.9
})
const percent = computed(() => Math.round(ratio.value * 100))

// The photo being worked on: Main recognises, then renders, in the order this window sent.
const ids = computed(() => exporting.order?.exportId === props.status.exportId ? exporting.order.ids : [])
const index = computed(() => {
  const value = props.status
  const reached = value.phase === 'preparing' ? value.prepared : rendered.value
  return Math.max(0, Math.min(value.total - 1, reached))
})
const photoById = computed(() => new Map(state.photos.map(photo => [photo.id, photo])))
const currentId = computed(() => ids.value[index.value] ?? '')
const current = computed(() => photoById.value.get(currentId.value) ?? null)
const imageOf = (id: string) => previewUrls[id] ?? thumbUrls[id] ?? ''
const failedIds = computed(() => new Set(props.status.failures.map(item => item.photoId)))

// A filmstrip window around the current photo; the track glides one step per photo.
const STEP = 46
const SPAN = 4
const strip = computed(() => {
  const list = ids.value
  const from = Math.max(0, index.value - SPAN)
  const to = Math.min(list.length - 1, index.value + SPAN)
  const items = []
  for (let i = from; i <= to; i += 1) {
    const id = list[i]
    const stateOf = i === index.value && active.value ? 'current'
      : failedIds.value.has(id) ? 'failed'
        : (props.status.phase === 'preparing' ? false : i < rendered.value) || props.status.phase === 'completed' ? 'done' : 'pending'
    items.push({ id, i, state: stateOf })
  }
  return items
})
watch(() => strip.value.map(item => item.id), list => {
  for (const id of list) if (!thumbUrls[id]) void requestScaled(id, 'thumb', photoUrl({ id }), 3).catch(() => {})
}, { immediate: true })

// Elapsed time ticks once a second while the export runs; speed and ETA count rendering only.
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
watch(active, value => {
  if (clock) clearInterval(clock)
  clock = value ? setInterval(() => { now.value = Date.now() }, 1000) : null
  now.value = Date.now()
}, { immediate: true })
onBeforeUnmount(() => { if (clock) clearInterval(clock) })
const timing = computed(() => exporting.timing?.exportId === props.status.exportId ? exporting.timing : null)
const elapsed = computed(() => timing.value ? Math.max(0, ((timing.value.finishedAt ?? now.value) - timing.value.startedAt) / 1000) : 0)
const rate = computed(() => {
  const start = timing.value?.runningAt
  if (!start || !rendered.value) return 0
  return rendered.value / Math.max(0.5, ((timing.value!.finishedAt ?? now.value) - start) / 1000)
})
const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const rateText = computed(() => rate.value ? rate.value.toFixed(rate.value < 10 ? 1 : 0) : '—')
const etaText = computed(() => {
  if (!active.value) return '0:00'
  if (!rate.value) return '—'
  return clockText(Math.max(0, (props.status.total - rendered.value) / rate.value))
})

const outcome = computed(() => {
  const value = props.status
  if (value.phase === 'cancelled') return 'cancelled'
  if (value.phase === 'failed' || value.failed) return 'bad'
  return 'ok'
})
const headline = computed(() => {
  const value = props.status
  switch (value.phase) {
    case 'preparing': return '正在准备'
    case 'running': return '正在导出'
    case 'cancelling': return '正在取消'
    case 'cancelled': return '导出已取消'
    case 'completed': return value.failed ? '导出完成，部分失败' : '导出完成'
    default: return value.success ? '部分照片导出失败' : '导出失败'
  }
})
// The frame holds two failure rows; the rest are counted, never scrolled.
const failureRows = computed(() => props.status.failures.slice(0, 2))
const moreFailures = computed(() => Math.max(0, props.status.failed - failureRows.value.length))
const phaseNote = computed(() => {
  const value = props.status
  if (value.phase === 'preparing') return `识别 ${value.prepared} / ${value.total}`
  if (active.value) return value.failed ? `成功 ${value.success} · 失败 ${value.failed}` : `成功 ${value.success}`
  return `成功 ${value.success} 张${value.failed ? ` · 失败 ${value.failed} 张` : ''} · 用时 ${clockText(elapsed.value)}`
})
</script>

<template>
  <div class="progress">
    <!-- Left: the photo being worked on while active, the outcome once finished. -->
    <div class="stage">
      <UiMotionTransition preset="media" mode="out-in">
        <div v-if="active" key="working" class="stage-working">
          <UiMotionTransition preset="media" mode="out-in">
            <div :key="currentId || 'none'" class="frame ui-activity-sweep ui-activity-sweep--scan">
              <img v-if="currentId && imageOf(currentId)" :src="imageOf(currentId)" alt="" :draggable="false" />
              <span v-else class="frame-empty"><Images :size="22" /></span>
            </div>
          </UiMotionTransition>
          <div class="caption">
            <span class="caption-name">{{ current?.name ?? headline }}</span>
            <span v-if="current" class="caption-size alr-num">{{ current.width }}×{{ current.height }}</span>
          </div>
        </div>
        <div v-else key="done" class="stage-done" :class="`is-${outcome}`">
          <span class="done-ring">
            <CircleCheck v-if="outcome === 'ok'" :size="28" />
            <Ban v-else-if="outcome === 'cancelled'" :size="26" />
            <CircleAlert v-else :size="28" />
          </span>
          <span class="done-title">{{ headline }}</span>
          <span class="done-note alr-num">{{ phaseNote }}</span>
        </div>
      </UiMotionTransition>
    </div>

    <!-- Right: phase, figures, the bar and the filmstrip, each in a fixed slot. -->
    <div class="readout">
      <div class="head">
        <span class="headline">{{ headline }}</span>
        <div class="steps">
          <span class="step" :class="{ on: status.phase === 'preparing', done: status.phase !== 'preparing' }"><i />准备</span>
          <span class="step-line" />
          <span class="step" :class="{ on: active && status.phase !== 'preparing', done: !active }"><i />导出</span>
        </div>
      </div>

      <div class="numbers">
        <div class="percent alr-num">{{ percent }}<span>%</span></div>
        <div class="count alr-num">{{ rendered }} / {{ status.total }} 张</div>
      </div>

      <div class="metrics alr-num">
        <div><b>{{ rateText }}</b>张/秒</div>
        <div><b>{{ clockText(elapsed) }}</b>已用</div>
        <div><b>{{ etaText }}</b>剩余</div>
        <div><b :class="{ bad: status.failed }">{{ status.failed }}</b>失败</div>
      </div>

      <div
        class="bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" :aria-label="headline"
        :class="{ 'is-bad': status.phase === 'failed' }"
      >
        <div class="bar-fill" :class="{ 'ui-activity-sweep': active }" :style="{ transform: `translateX(${(ratio - 1) * 100}%)` }" />
        <div class="bar-head" :class="{ live: active }" :style="{ transform: `translateX(${ratio * 100}%)` }"><span /></div>
      </div>

      <div v-if="ids.length" class="strip" aria-hidden="true">
        <div class="strip-track" :style="{ transform: `translateX(${-(index * STEP + 20)}px)` }">
          <span v-for="item in strip" :key="item.id" class="tile" :class="`is-${item.state}`" :style="{ left: `${item.i * STEP}px` }">
            <img v-if="thumbUrls[item.id]" :src="thumbUrls[item.id]" alt="" :draggable="false" decoding="async" />
            <span v-if="item.state === 'done'" class="tile-badge"><Check :size="9" :stroke-width="3" /></span>
            <span v-else-if="item.state === 'failed'" class="tile-badge is-bad"><X :size="9" :stroke-width="3" /></span>
          </span>
        </div>
        <span class="strip-fade is-left" />
        <span class="strip-fade is-right" />
      </div>

      <div class="notes">
        <p v-if="status.message" class="note is-bad">{{ status.message }}</p>
        <p v-if="status.degraded" class="note">{{ status.degraded }} 张识别未完成，已按摆放位置导出</p>
        <ul v-if="failureRows.length" class="failures">
          <li v-for="item in failureRows" :key="item.photoId"><span class="failure-name">{{ item.name }}</span><span class="failure-reason">{{ item.reason }}</span></li>
          <li v-if="moreFailures" class="failure-more">另有 {{ moreFailures }} 张失败</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 22px; height: 100%; }

/* Stage: a dark light-box; the current photo sits on it with a slow amber scan while it renders. */
.stage {
  position: relative; display: grid; min-height: 0; overflow: hidden; border-radius: 12px;
  background: radial-gradient(70% 80% at 50% 42%, rgb(var(--alr-accent-rgb) / .08), transparent 70%), rgb(0 0 0 / .42);
  box-shadow: var(--alr-well);
}
.stage > * { grid-area: 1 / 1; min-height: 0; }
.stage-working { position: relative; display: grid; place-items: center; padding: 18px 18px 46px; }
.frame {
  --ui-activity-color: rgb(var(--alr-accent-rgb) / .28);
  display: grid; place-items: center; max-width: 100%; max-height: 100%; border-radius: 6px;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .08), 0 16px 38px rgb(0 0 0 / .6);
}
.frame img { display: block; max-width: 100%; max-height: 268px; object-fit: contain; border-radius: inherit; }
.frame-empty { display: grid; place-items: center; width: 220px; height: 160px; color: var(--alr-mute); background: rgb(255 255 255 / .03); border-radius: inherit; }
.caption {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 8px; padding: 20px 14px 12px;
  background: linear-gradient(180deg, transparent, rgb(0 0 0 / .72)); font-size: 11.5px; color: var(--alr-ink-2);
}
.caption-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--alr-ink); }
.caption-size { flex: none; margin-left: auto; color: var(--alr-mute); }

.stage-done { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 0 20px; text-align: center; }
.done-ring {
  display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 6px; border-radius: 999px;
  color: var(--alr-ok); background: radial-gradient(circle at 50% 35%, rgb(var(--rgb-success) / .22), rgb(var(--rgb-success) / .06));
  box-shadow: inset 0 0 0 1px rgb(var(--rgb-success) / .35), 0 0 30px rgb(var(--rgb-success) / .18);
}
.stage-done.is-bad .done-ring {
  color: var(--alr-danger); background: radial-gradient(circle at 50% 35%, rgb(var(--rgb-danger) / .22), rgb(var(--rgb-danger) / .06));
  box-shadow: inset 0 0 0 1px rgb(var(--rgb-danger) / .35), 0 0 30px rgb(var(--rgb-danger) / .16);
}
.stage-done.is-cancelled .done-ring { color: var(--alr-ink-2); background: rgb(255 255 255 / .05); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .12); }
.done-title { font-size: 16px; font-weight: 500; color: var(--alr-ink); }
.done-note { font-size: 12px; color: var(--alr-mute); }

.readout { display: flex; flex-direction: column; gap: 14px; min-width: 0; min-height: 0; }
.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 24px; }
.headline { font-size: 15px; font-weight: 500; color: var(--alr-ink); white-space: nowrap; }
.steps { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--alr-mute); }
.step { display: inline-flex; align-items: center; gap: 6px; transition: color var(--duration-base) var(--easing-standard); }
.step i { width: 6px; height: 6px; border-radius: 999px; background: rgb(255 255 255 / .2); transition: background-color var(--duration-base) var(--easing-standard), box-shadow var(--duration-base) var(--easing-standard); }
.step.done { color: var(--alr-ink-2); }
.step.done i { background: var(--alr-ink-2); }
.step.on { color: var(--alr-ink); }
.step.on i { background: var(--alr-accent); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .8); }
.step-line { width: 18px; height: 1px; background: rgb(255 255 255 / .12); }

.numbers { display: flex; align-items: flex-end; gap: 10px; height: 36px; }
.percent { font-size: 36px; font-weight: 600; line-height: .86; letter-spacing: -.02em; color: var(--alr-ink); }
.percent span { margin-left: 2px; font-size: 15px; font-weight: 400; color: var(--alr-mute); }
.count { padding-bottom: 1px; font-size: 12.5px; color: var(--alr-ink-2); }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; font-size: 10.5px; color: var(--alr-mute); }
.metrics > div { padding: 7px 9px; border-radius: 8px; background: rgb(255 255 255 / .03); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .045); }
.metrics b { display: block; margin-bottom: 1px; font-size: 13px; font-weight: 500; color: var(--alr-ink); }
.metrics b.bad { color: var(--alr-danger); }

.bar { position: relative; flex: none; height: 6px; overflow: hidden; border-radius: 999px; background: rgb(0 0 0 / .45); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .04); }
.bar-fill {
  --ui-activity-color: rgb(255 255 255 / .55);
  position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(90deg, rgb(var(--alr-accent-rgb) / .5), var(--alr-accent));
  transition: transform var(--duration-page) var(--easing-emphasized);
}
.bar.is-bad .bar-fill { background: var(--alr-danger); }
/* The leading edge glows while work runs, so the bar reads as live between photos. */
.bar-head { position: absolute; inset: 0; pointer-events: none; transition: transform var(--duration-page) var(--easing-emphasized); }
.bar-head span {
  position: absolute; left: -5px; top: -1px; width: 10px; height: 8px; border-radius: 999px; background: rgb(255 248 230);
  box-shadow: 0 0 10px 2px rgb(var(--alr-accent-rgb) / .8); opacity: 0; transition: opacity var(--duration-base) var(--easing-standard);
}
.bar-head.live span { opacity: 1; }

/* Filmstrip: done photos keep a check, the current one is lifted and ringed, the rest wait dimmed. */
.strip { position: relative; flex: none; height: 48px; overflow: hidden; }
/* The track starts at the strip's centre; shifting it by the current index keeps that photo in the middle. */
.strip-track { position: absolute; left: 50%; top: 4px; height: 40px; transition: transform var(--duration-page) var(--easing-emphasized); }
.tile {
  position: absolute; top: 0; width: 40px; height: 40px; overflow: hidden; border-radius: 7px; background: rgb(255 255 255 / .04);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / .06); opacity: .38;
  transition: opacity var(--duration-base) var(--easing-standard), transform var(--duration-page) var(--easing-emphasized), box-shadow var(--duration-base) var(--easing-standard);
}
.tile img { width: 100%; height: 100%; object-fit: cover; }
.tile.is-done, .tile.is-failed { opacity: .8; }
.tile.is-current { opacity: 1; transform: scale(1.08); box-shadow: 0 0 0 1.5px var(--alr-accent), 0 0 14px rgb(var(--alr-accent-rgb) / .45); }
.tile-badge {
  position: absolute; right: 3px; bottom: 3px; display: grid; place-items: center; width: 13px; height: 13px; border-radius: 999px;
  color: rgb(18 18 18); background: var(--alr-ok); box-shadow: 0 1px 3px rgb(0 0 0 / .5);
}
.tile-badge.is-bad { color: rgb(255 255 255); background: var(--alr-danger); }
.strip-fade { position: absolute; top: 0; bottom: 0; width: 48px; pointer-events: none; }
.strip-fade.is-left { left: 0; background: linear-gradient(90deg, var(--alr-panel-2), transparent); }
.strip-fade.is-right { right: 0; background: linear-gradient(270deg, var(--alr-panel-2), transparent); }

.notes { display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow: hidden; }
.note { margin: 0; font-size: 12px; line-height: 1.5; color: var(--alr-mute); }
.note.is-bad { color: var(--alr-danger); }
.failures { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.failures li { display: flex; gap: 10px; font-size: 12px; line-height: 1.5; }
.failure-name { flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--alr-ink-2); }
.failure-reason { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--alr-mute); }
.failure-more { color: var(--alr-mute); }
@media (prefers-reduced-motion: reduce) { .tile.is-current { transform: none; } }
</style>
