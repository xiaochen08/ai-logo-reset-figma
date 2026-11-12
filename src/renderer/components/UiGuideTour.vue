<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'
import UiMotionTransition from './UiMotionTransition.vue'
import UiGuideTourStep from './UiGuideTourStep.vue'
import { guideChapters, guideNotch, placeGuideCard, type UiGuideRect, type UiGuideStep } from './uiGuideTour'

const props = withDefaults(defineProps<{
  open: boolean
  steps: UiGuideStep[]
  /** One line per chapter for the opening route. */
  chapterSummaries?: Record<string, string>
  /** Hides the tour without losing its place, e.g. while a dialog the user opened from a step is up. */
  paused?: boolean
  /** Classes for the teleported layer, so a feature's palette and type reach it. */
  surfaceClass?: string
}>(), { chapterSummaries: () => ({}), paused: false, surfaceClass: '' })
const emit = defineEmits<{ close: [finished: boolean] }>()

const PAD = 6
const RADIUS = 10
const BRACKET = 18
const BRACKET_OUT = 3
const NOTCH = 12
// While a step's target is briefly gone (its page is switching), the opening waits where it is
// instead of closing, then glides straight to the new target.
const HOLD_MS = 1000

const index = ref(0)
const direction = ref<'view-forward' | 'view-back'>('view-forward')
const step = computed(() => props.steps[index.value])
const intro = computed(() => step.value?.layout === 'intro')
const last = computed(() => index.value === props.steps.length - 1)
const chapters = computed(() => guideChapters(props.steps, index.value))
const route = computed(() => chapters.value.map(chapter => ({ label: chapter.label, summary: props.chapterSummaries[chapter.label] ?? '' })))
const titleId = useId()

const viewport = reactive({ width: window.innerWidth, height: window.innerHeight })
const target = ref<UiGuideRect | null>(null)
// The first frame places everything without motion; after that the opening and the card glide.
const settled = ref(false)
const card = ref<HTMLElement | null>(null)
const cardSize = reactive({ width: 0, height: 0 })
const measure = ref<HTMLElement | null>(null)
const heights = ref<number[]>([])
// Each step's height is known before it shows, so the card takes it as the opening starts to move;
// the shown step's own height wins if it differs (e.g. its hint changed to “done”).
const liveHeight = ref<{ index: number, height: number } | null>(null)
let live: Element | null = null
const bodyHeight = computed(() => (
  liveHeight.value?.index === index.value ? Math.max(liveHeight.value.height, heights.value[index.value] ?? 0) : heights.value[index.value] ?? 0
))
const primary = ref<HTMLButtonElement | null>(null)

const hole = computed<UiGuideRect | null>(() => {
  const rect = target.value
  if (!rect) return null
  const x = Math.max(4, rect.x - PAD)
  const y = Math.max(4, rect.y - PAD)
  const right = Math.min(viewport.width - 4, rect.x + rect.width + PAD)
  const bottom = Math.min(viewport.height - 4, rect.y + rect.height + PAD)
  return { x, y, width: Math.max(RADIUS * 2, right - x), height: Math.max(RADIUS * 2, bottom - y) }
})
// With nothing to light, the opening closes to a point in the middle and the next one opens out of it.
const opening = computed(() => hole.value ?? { x: viewport.width / 2, y: viewport.height / 2, width: 0, height: 0 })

const at = (x: number, y: number) => ({ transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)` })
const sheet = computed(() => ({ width: `${viewport.width}px`, height: `${viewport.height}px` }))
// Four sheets meet around the opening and four corner pieces round it; each only moves.
const pieces = computed(() => {
  const { x, y, width, height } = opening.value
  return {
    top: at(0, y - viewport.height),
    bottom: at(0, y + height),
    left: at(x - viewport.width, 0),
    right: at(x + width, 0),
    tl: at(x, y),
    tr: at(x + width - RADIUS, y),
    bl: at(x, y + height - RADIUS),
    br: at(x + width - RADIUS, y + height - RADIUS)
  }
})
const brackets = computed(() => {
  const { x, y, width, height } = opening.value
  const far = BRACKET_OUT - BRACKET
  return [
    { corner: 'tl', style: at(x - BRACKET_OUT, y - BRACKET_OUT) },
    { corner: 'tr', style: at(x + width + far, y - BRACKET_OUT) },
    { corner: 'bl', style: at(x - BRACKET_OUT, y + height + far) },
    { corner: 'br', style: at(x + width + far, y + height + far) }
  ]
})
const size = computed(() => cardSize.width ? cardSize : { width: 340, height: 280 })
const placement = computed(() => placeGuideCard(hole.value, size.value, viewport))
const cardAt = computed(() => at(placement.value.x, placement.value.y))
const notch = computed(() => {
  const point = guideNotch(placement.value, hole.value, size.value)
  return point && { transform: `translate3d(${Math.round(point.x - NOTCH / 2)}px, ${Math.round(point.y - NOTCH / 2)}px, 0) rotate(45deg)` }
})

/* ---------- following the target ---------- */
// Lights the union of the step's parts; every part has to be on screen.
const findTarget = (keys: UiGuideStep['target']) => {
  let element: HTMLElement | null = null
  let box: UiGuideRect | null = null
  for (const key of [keys ?? []].flat()) {
    const found = document.querySelector<HTMLElement>(`[data-guide="${key}"]`)
    const rect = found?.getBoundingClientRect()
    if (!found || !rect || rect.width <= 2 || rect.height <= 2) return null
    element ??= found
    const left = Math.min(rect.left, box?.x ?? Infinity), top = Math.min(rect.top, box?.y ?? Infinity)
    const right = Math.max(rect.right, box ? box.x + box.width : -Infinity), bottom = Math.max(rect.bottom, box ? box.y + box.height : -Infinity)
    box = { x: left, y: top, width: right - left, height: bottom - top }
  }
  return element && box ? { element, box } : null
}
const near = (a: UiGuideRect | null, b: UiGuideRect | null) => (
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < .5 && Math.abs(a.y - b.y) < .5 && Math.abs(a.width - b.width) < .5 && Math.abs(a.height - b.height) < .5)
)
let frame = 0
let scrolledFor = -1
let seenAt = 0
const follow = () => {
  if (viewport.width !== window.innerWidth) viewport.width = window.innerWidth
  if (viewport.height !== window.innerHeight) viewport.height = window.innerHeight
  // The step's own target wins; while it is briefly missing the opening waits before using the fallback.
  const now = performance.now()
  const own = step.value ? findTarget(step.value.target) : null
  if (own) seenAt = now
  else if (step.value?.target && target.value && now - seenAt < HOLD_MS) { frame = requestAnimationFrame(follow); return }
  const found = own ?? (step.value ? findTarget(step.value.fallback) : null)
  if (found && scrolledFor !== index.value) {
    scrolledFor = index.value
    if (found.box.y < 0 || found.box.y + found.box.height > viewport.height) found.element.scrollIntoView({ block: 'nearest' })
  }
  const next = found?.box ?? null
  if (!near(next, target.value)) target.value = next
  frame = requestAnimationFrame(follow)
}

/* ---------- sizes ---------- */
// Every step's content is measured ahead at its own card width.
const measureBodies = () => {
  const host = measure.value
  if (host) heights.value = Array.from(host.children, child => Math.ceil((child as HTMLElement).offsetHeight))
}
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    if (entry.target === card.value) {
      cardSize.width = (entry.target as HTMLElement).offsetWidth
      cardSize.height = (entry.target as HTMLElement).offsetHeight
    } else if (entry.target === live) {
      liveHeight.value = { index: index.value, height: Math.ceil((entry.target as HTMLElement).offsetHeight) }
    } else measureBodies()
  }
})

const shown = (element: Element) => {
  if (live) observer.unobserve(live)
  live = element
  observer.observe(element)
}

/* ---------- moving through the steps ---------- */
const go = (to: number) => {
  if (to < 0 || to >= props.steps.length || to === index.value) return
  direction.value = to > index.value ? 'view-forward' : 'view-back'
  index.value = to
}
const finish = (finished: boolean) => emit('close', finished)
const next = () => { if (blocked.value) return; if (last.value) finish(true); else go(index.value + 1) }
const prev = () => go(index.value - 1)

// A step that asks for a real action holds the tour until it is done, then moves on by itself.
const isDone = computed(() => !!step.value?.done?.())
const blocked = computed(() => !!step.value?.done && !isDone.value)
const pause = () => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--motion-duration-page').trim()
  const value = Number.parseFloat(raw) || 0
  return (raw.endsWith('ms') ? value : value * 1000) * 4
}
let advance = 0
watch([index, isDone] as const, ([i, now], [before, was]) => {
  if (i !== before || !now || was || !props.open) return
  window.clearTimeout(advance)
  advance = window.setTimeout(() => { if (index.value === i && props.open && !props.paused) next() }, pause())
})

const isField = (element: EventTarget | null) => {
  const node = element as HTMLElement | null
  return !!node && (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName))
}
// Runs before the page's own shortcuts so the arrows page the tour instead of nudging a logo.
const keydown = (event: KeyboardEvent) => {
  if (!props.open || props.paused || isField(event.target)) return
  const onButton = (event.target as HTMLElement | null)?.tagName === 'BUTTON'
  if (event.key === 'Escape') finish(false)
  else if (event.key === 'ArrowRight' || (event.key === 'Enter' && !onButton)) next()
  else if (event.key === 'ArrowLeft') prev()
  else return
  event.preventDefault()
  event.stopPropagation()
}

// Files dragged in from outside reach the page under the shade, so dropping photos works mid-tour.
const dragging = ref(false)
let dragDepth = 0
const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
const dragenter = (event: DragEvent) => { if (carriesFiles(event)) { dragDepth += 1; dragging.value = true } }
const dragleave = (event: DragEvent) => { if (carriesFiles(event)) { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragging.value = false } }
const dragdone = () => { dragDepth = 0; dragging.value = false }

const start = async () => {
  index.value = 0
  direction.value = 'view-forward'
  settled.value = false
  scrolledFor = -1
  target.value = null
  liveHeight.value = null
  window.addEventListener('keydown', keydown, true)
  window.addEventListener('dragenter', dragenter, true)
  window.addEventListener('dragleave', dragleave, true)
  window.addEventListener('drop', dragdone, true)
  window.addEventListener('dragend', dragdone, true)
  frame = requestAnimationFrame(follow)
  await nextTick()
  if (card.value) observer.observe(card.value)
  if (measure.value) { observer.observe(measure.value); measureBodies() }
  const first = card.value?.querySelector('.ui-guide-body > *')
  if (first) shown(first)
  requestAnimationFrame(() => requestAnimationFrame(() => { settled.value = true }))
  primary.value?.focus({ preventScroll: true })
}
const stop = () => {
  window.removeEventListener('keydown', keydown, true)
  window.removeEventListener('dragenter', dragenter, true)
  window.removeEventListener('dragleave', dragleave, true)
  window.removeEventListener('drop', dragdone, true)
  window.removeEventListener('dragend', dragdone, true)
  dragdone()
  cancelAnimationFrame(frame)
  window.clearTimeout(advance)
  observer.disconnect()
  live = null
}
watch(() => props.open, open => { if (open) void start(); else stop() }, { immediate: true })
watch([() => props.open, index] as const, ([open]) => { if (open) step.value?.enter?.() }, { immediate: true })
watch(() => props.paused, paused => { if (!paused && props.open) void nextTick(() => primary.value?.focus({ preventScroll: true })) })
onBeforeUnmount(stop)
</script>

<template>
  <Teleport to="body">
    <UiMotionTransition preset="dialog">
      <div
        v-if="open && step" class="ui-guide" :class="[surfaceClass, { 'is-settled': settled, 'has-target': !!hole, 'is-paused': paused, 'is-dragging': dragging }]"
        :inert="paused || undefined"
      >
        <!-- The dim layer: one opacity over solid pieces, so where they overlap the shade stays even. -->
        <div class="ui-guide-dim" aria-hidden="true">
          <span class="ui-guide-sheet" :style="[sheet, pieces.top]" />
          <span class="ui-guide-sheet" :style="[sheet, pieces.bottom]" />
          <span class="ui-guide-sheet" :style="[sheet, pieces.left]" />
          <span class="ui-guide-sheet" :style="[sheet, pieces.right]" />
          <span class="ui-guide-corner is-tl" :style="pieces.tl" />
          <span class="ui-guide-corner is-tr" :style="pieces.tr" />
          <span class="ui-guide-corner is-bl" :style="pieces.bl" />
          <span class="ui-guide-corner is-br" :style="pieces.br" />
        </div>
        <!-- Viewfinder corners glide with the opening, then close in once, like focusing. -->
        <span v-for="bracket in brackets" :key="bracket.corner" class="ui-guide-bracket" :class="`is-${bracket.corner}`" aria-hidden="true" :style="bracket.style">
          <i :key="index" class="ui-guide-bracket-mark" />
        </span>

        <div class="ui-guide-card-at" :style="cardAt">
          <section
            ref="card" class="ui-guide-card ui-motion-dialog-surface" :class="{ 'is-intro': intro }" role="dialog" aria-modal="false"
            :aria-labelledby="titleId"
          >
            <span v-if="notch" class="ui-guide-notch" aria-hidden="true" :style="notch" />
            <header v-if="!intro" class="ui-guide-head">
              <ol class="ui-guide-chapters" aria-label="引导进度">
                <li
                  v-for="chapter in chapters" :key="chapter.label" :class="{ 'is-current': chapter.current, 'is-passed': chapter.passed }"
                  :aria-current="chapter.current ? 'step' : undefined"
                >
                  <span class="ui-guide-chapter-label">{{ chapter.label }}</span>
                  <span class="ui-guide-chapter-track"><span class="ui-guide-chapter-fill" :style="{ transform: `scaleX(${chapter.fill})` }" /></span>
                </li>
              </ol>
              <button class="ui-guide-x" aria-label="退出引导" title="退出引导（Esc）" @click="finish(false)"><X :size="14" /></button>
            </header>

            <div class="ui-guide-body" :style="bodyHeight ? { height: `${bodyHeight}px` } : undefined" aria-live="polite">
              <UiMotionTransition :preset="direction" mode="out-in" @after-enter="shown">
                <UiGuideTourStep :key="step.id" :step="step" :done="isDone" :chapters="route" :title-id="titleId" />
              </UiMotionTransition>
            </div>

            <footer class="ui-guide-foot">
              <button v-if="!last" class="ui-guide-skip" @click="finish(false)">{{ intro ? '以后再说' : '跳过引导' }}</button>
              <span class="ui-guide-spacer" />
              <button v-if="index > 0" class="ui-guide-btn is-ghost" @click="prev"><ChevronLeft :size="14" />上一步</button>
              <button ref="primary" class="ui-guide-btn is-primary" :disabled="blocked" :title="blocked ? step.tryHint : undefined" @click="next">
                {{ blocked ? '完成后继续' : intro ? '开始引导' : last ? '完成' : '下一步' }}<ChevronRight v-if="!last && !blocked" :size="14" />
              </button>
            </footer>
          </section>
        </div>

        <div ref="measure" class="ui-guide-measure" aria-hidden="true">
          <div v-for="item in steps" :key="item.id" :class="{ 'is-intro': item.layout === 'intro' }">
            <UiGuideTourStep :step="item" :done="false" :chapters="route" />
          </div>
        </div>
      </div>
    </UiMotionTransition>
  </Teleport>
</template>

<style>
/* Palette hooks: a feature can set these on its surface class; the defaults follow the app theme. */
.ui-guide {
  --ui-guide-accent-rgb: var(--rgb-accent);
  --ui-guide-accent-ink: rgb(var(--rgb-text-inverse));
  --ui-guide-caution-rgb: var(--rgb-warning);
  --ui-guide-surface: var(--color-bg-card);
  --ui-guide-shade: .72;
  --ui-guide-radius: 10px;
  --ui-guide-width: 340px;
  --ui-guide-intro-width: 420px;
  --ui-guide-pad: 20px;
  position: fixed; inset: 0; z-index: 1400; pointer-events: none;
  color: var(--color-text-primary); font-size: 13px; line-height: 1.5;
}
.ui-guide.is-paused { opacity: 0; }
.ui-guide.is-dragging .ui-guide-sheet, .ui-guide.is-dragging .ui-guide-corner { pointer-events: none; }

/* ---------- spotlight ---------- */
.ui-guide-dim { position: absolute; inset: 0; opacity: var(--ui-guide-shade); }
.ui-guide-sheet, .ui-guide-corner, .ui-guide-bracket, .ui-guide-card-at { position: absolute; left: 0; top: 0; }
.ui-guide-sheet { background: rgb(2 2 2); pointer-events: auto; }
.ui-guide-corner { width: var(--ui-guide-radius); height: var(--ui-guide-radius); pointer-events: auto; }
.ui-guide-corner.is-tl { background: radial-gradient(circle at 100% 100%, transparent calc(var(--ui-guide-radius) - .5px), rgb(2 2 2) var(--ui-guide-radius)); }
.ui-guide-corner.is-tr { background: radial-gradient(circle at 0 100%, transparent calc(var(--ui-guide-radius) - .5px), rgb(2 2 2) var(--ui-guide-radius)); }
.ui-guide-corner.is-bl { background: radial-gradient(circle at 100% 0, transparent calc(var(--ui-guide-radius) - .5px), rgb(2 2 2) var(--ui-guide-radius)); }
.ui-guide-corner.is-br { background: radial-gradient(circle at 0 0, transparent calc(var(--ui-guide-radius) - .5px), rgb(2 2 2) var(--ui-guide-radius)); }

.ui-guide-bracket { width: 18px; height: 18px; opacity: 0; }
.ui-guide.has-target .ui-guide-bracket { opacity: 1; }
.ui-guide-bracket-mark { position: absolute; inset: 0; border: 0 solid rgb(var(--ui-guide-accent-rgb)); }
.ui-guide-bracket.is-tl { --ui-guide-fx: -1; --ui-guide-fy: -1; }
.ui-guide-bracket.is-tr { --ui-guide-fx: 1; --ui-guide-fy: -1; }
.ui-guide-bracket.is-bl { --ui-guide-fx: -1; --ui-guide-fy: 1; }
.ui-guide-bracket.is-br { --ui-guide-fx: 1; --ui-guide-fy: 1; }
.ui-guide-bracket.is-tl .ui-guide-bracket-mark { border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 12px; }
.ui-guide-bracket.is-tr .ui-guide-bracket-mark { border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 12px; }
.ui-guide-bracket.is-bl .ui-guide-bracket-mark { border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 12px; }
.ui-guide-bracket.is-br .ui-guide-bracket-mark { border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 12px; }

/* ---------- card ---------- */
.ui-guide-card {
  position: relative; isolation: isolate; width: var(--ui-guide-width); max-width: calc(100vw - 24px); padding: 16px var(--ui-guide-pad) 16px;
  pointer-events: auto; border-radius: 16px; outline: none; background: var(--ui-guide-surface);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .06), inset 0 0 0 1px rgb(255 255 255 / .09), 0 2px 6px rgb(0 0 0 / .35), 0 30px 80px rgb(0 0 0 / .55);
}
.ui-guide-card.is-intro { width: var(--ui-guide-intro-width); padding-top: 26px; }
.ui-guide-notch {
  position: absolute; left: 0; top: 0; z-index: -1; width: 12px; height: 12px; border-radius: 2px;
  background: var(--ui-guide-surface); box-shadow: 0 0 0 1px rgb(255 255 255 / .09);
}

.ui-guide-head { display: flex; align-items: flex-start; gap: 12px; margin: 0 -6px 16px 0; }
.ui-guide-chapters { display: grid; flex: 1; grid-auto-columns: minmax(0, 1fr); grid-auto-flow: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.ui-guide-chapters li { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ui-guide-chapter-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 14px; color: var(--color-text-disabled); transition: color var(--duration-base) var(--easing-standard); }
.ui-guide-chapters li.is-passed .ui-guide-chapter-label { color: var(--color-text-muted); }
.ui-guide-chapters li.is-current .ui-guide-chapter-label { color: rgb(var(--ui-guide-accent-rgb)); font-weight: 500; }
.ui-guide-chapter-track { display: block; height: 2px; overflow: hidden; border-radius: 999px; background: rgb(255 255 255 / .08); }
.ui-guide-chapter-fill { display: block; height: 100%; border-radius: inherit; background: rgb(var(--ui-guide-accent-rgb)); transform-origin: left center; }
.ui-guide .ui-guide-x {
  display: grid; flex: none; place-items: center; width: 24px; height: 24px; margin-top: -4px; border-radius: 7px; color: var(--color-text-muted);
  transition: color var(--duration-fast) var(--easing-standard), background-color var(--duration-fast) var(--easing-standard);
}
.ui-guide .ui-guide-x:hover { color: var(--color-text-primary); background: rgb(255 255 255 / .06); }

.ui-guide-body { position: relative; overflow: hidden; }
/* Same box as the measured copy, so inner margins count toward the height. */
.ui-guide-body > * { display: flow-root; }

/* ---------- step content ---------- */
.ui-guide-title { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.3; letter-spacing: .01em; color: var(--color-text-primary); }
.ui-guide-title.is-large { font-size: 20px; }
.ui-guide-text { margin: 6px 0 0; font-size: 13px; line-height: 1.65; color: var(--color-text-secondary); }

.ui-guide-group { margin-top: 14px; }
.ui-guide-group h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 11.5px; font-weight: 500; color: var(--color-text-muted); }
.ui-guide-group h4::after { content: ''; flex: 1; height: 1px; background: rgb(255 255 255 / .07); }
.ui-guide-group.is-caution h4 { color: rgb(var(--ui-guide-caution-rgb)); }
.ui-guide-group.is-caution h4::after { background: rgb(var(--ui-guide-caution-rgb) / .2); }
.ui-guide-group ul { display: flex; flex-direction: column; gap: 5px; margin: 0; padding: 0; list-style: none; }
.ui-guide-group li { display: flex; gap: 9px; font-size: 12.5px; line-height: 1.55; color: var(--color-text-secondary); }
.ui-guide-dot { flex: none; width: 5px; height: 5px; margin: 7px 3px 0 4px; border-radius: 999px; background: rgb(var(--ui-guide-accent-rgb)); }
.ui-guide-alert { flex: none; margin-top: 2px; color: rgb(var(--ui-guide-caution-rgb)); }

.ui-guide-keys { display: flex; flex-wrap: wrap; gap: 7px 14px; margin-top: 14px; font-size: 12px; color: var(--color-text-muted); }
.ui-guide-key { display: inline-flex; align-items: center; gap: 4px; }
.ui-guide-key kbd:last-of-type { margin-right: 3px; }
.ui-guide kbd {
  display: inline-block; min-width: 20px; padding: 0 5px; border-radius: 5px; text-align: center; font: 10.5px/19px "JetBrains Mono", ui-monospace, monospace;
  color: var(--color-text-secondary); background: rgb(255 255 255 / .05); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .1), 0 1px 0 rgb(0 0 0 / .6);
}

.ui-guide-try {
  display: flex; align-items: center; gap: 9px; margin: 14px 0 0; padding: 9px 12px; border-radius: 10px; font-size: 12.5px;
  color: rgb(var(--ui-guide-accent-rgb)); background: rgb(var(--ui-guide-accent-rgb) / .06); box-shadow: inset 0 0 0 1px rgb(var(--ui-guide-accent-rgb) / .28);
  transition: color var(--duration-base) var(--easing-standard), background-color var(--duration-base) var(--easing-standard), box-shadow var(--duration-base) var(--easing-standard);
}
.ui-guide-try.is-done { color: var(--color-success); background: rgb(var(--rgb-success) / .08); box-shadow: inset 0 0 0 1px rgb(var(--rgb-success) / .3); }
.ui-guide-try-mark { display: grid; flex: none; place-items: center; width: 16px; height: 16px; border-radius: 999px; box-shadow: inset 0 0 0 1.5px currentColor; }
.ui-guide-try.is-done .ui-guide-try-mark { color: rgb(18 18 18); background: var(--color-success); box-shadow: none; }

/* The opening route: four chapters strung on one line, in the order the work goes. */
.ui-guide-route { position: relative; display: flex; flex-direction: column; gap: 14px; margin: 20px 0 4px; padding: 0; list-style: none; }
.ui-guide-route::before { content: ''; position: absolute; left: 11px; top: 14px; bottom: 14px; width: 1px; background: linear-gradient(180deg, rgb(var(--ui-guide-accent-rgb) / .5), rgb(255 255 255 / .08)); }
.ui-guide-route li { position: relative; display: flex; align-items: flex-start; gap: 14px; }
.ui-guide-route-mark {
  display: grid; flex: none; place-items: center; width: 23px; height: 23px; border-radius: 999px; font: 600 11px/1 "JetBrains Mono", ui-monospace, monospace;
  color: rgb(var(--ui-guide-accent-rgb)); background: var(--ui-guide-surface); box-shadow: inset 0 0 0 1.5px rgb(var(--ui-guide-accent-rgb) / .7);
}
.ui-guide-route li:first-child .ui-guide-route-mark { color: var(--ui-guide-accent-ink); background: rgb(var(--ui-guide-accent-rgb)); box-shadow: none; }
.ui-guide-route-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; padding-top: 1px; }
.ui-guide-route-text b { font-size: 13.5px; font-weight: 500; color: var(--color-text-primary); }
.ui-guide-route-text span { font-size: 12.5px; line-height: 1.5; color: var(--color-text-muted); }

/* ---------- footer ---------- */
.ui-guide-foot { display: flex; align-items: center; gap: 6px; margin-top: 18px; }
.ui-guide-card.is-intro .ui-guide-foot { margin-top: 22px; }
.ui-guide-spacer { flex: 1; }
.ui-guide .ui-guide-skip { padding: 4px 0; font-size: 12px; color: var(--color-text-muted); transition: color var(--duration-fast) var(--easing-standard); }
.ui-guide .ui-guide-skip:hover { color: var(--color-text-primary); }
.ui-guide .ui-guide-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 32px; padding: 0 12px; border-radius: 9px; font-size: 12.5px;
  transition: color var(--duration-fast) var(--easing-standard), background-color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized);
}
.ui-guide .ui-guide-btn:active:not(:disabled) { transform: scale(.97); }
.ui-guide .ui-guide-btn.is-ghost { padding-left: 8px; color: var(--color-text-secondary); }
.ui-guide .ui-guide-btn.is-ghost:hover { color: var(--color-text-primary); background: rgb(255 255 255 / .06); }
.ui-guide .ui-guide-btn.is-primary {
  min-width: 88px; padding: 0 12px 0 16px; font-weight: 500; color: var(--ui-guide-accent-ink); background: rgb(var(--ui-guide-accent-rgb));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .35), 0 1px 2px rgb(0 0 0 / .4), 0 6px 18px rgb(var(--ui-guide-accent-rgb) / .18);
}
.ui-guide .ui-guide-btn.is-primary:disabled { cursor: default; color: var(--color-text-muted); background: rgb(255 255 255 / .06); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .08); transform: none; }
.ui-guide .ui-guide-btn.is-primary:hover:not(:disabled) { box-shadow: inset 0 1px 0 rgb(255 255 255 / .45), 0 1px 2px rgb(0 0 0 / .4), 0 8px 24px rgb(var(--ui-guide-accent-rgb) / .3); }

/* Off-screen copies of every step at its card's text width, used only for measuring. */
.ui-guide-measure { position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
.ui-guide-measure > div { display: flow-root; width: calc(var(--ui-guide-width) - var(--ui-guide-pad) * 2); }
.ui-guide-measure > div.is-intro { width: calc(var(--ui-guide-intro-width) - var(--ui-guide-pad) * 2); }
.ui-guide-measure .ui-guide-rise { animation: none !important; }
</style>
