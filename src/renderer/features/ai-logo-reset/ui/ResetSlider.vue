<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  modelValue: number
  min: number
  max: number
  step?: number
  unit?: string
  disabled?: boolean
  /** Value restored by double-click. */
  reset?: number
}>(), { step: 1, unit: '', disabled: false, reset: undefined })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const track = ref<HTMLElement | null>(null)
const dragging = ref(false)
const decimals = computed(() => (String(props.step).split('.')[1]?.length ?? 0))
const ratio = computed(() => Math.min(1, Math.max(0, (props.modelValue - props.min) / Math.max(1e-9, props.max - props.min))))
const shown = computed(() => props.modelValue.toFixed(decimals.value))
const resetRatio = computed(() => props.reset === undefined ? null : Math.min(1, Math.max(0, (props.reset - props.min) / Math.max(1e-9, props.max - props.min))))

const commit = (raw: number) => {
  const stepped = Math.round((raw - props.min) / props.step) * props.step + props.min
  const value = Number(Math.min(props.max, Math.max(props.min, stepped)).toFixed(decimals.value))
  if (value !== props.modelValue) emit('update:modelValue', value)
}

const fromPointer = (event: PointerEvent) => {
  const rect = track.value?.getBoundingClientRect()
  if (!rect || rect.width <= 0) return
  commit(props.min + (event.clientX - rect.left) / rect.width * (props.max - props.min))
}
const down = (event: PointerEvent) => {
  if (props.disabled || event.button !== 0) return
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragging.value = true
  fromPointer(event)
}
const move = (event: PointerEvent) => { if (dragging.value) fromPointer(event) }
const up = () => { dragging.value = false }

const keydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  const big = event.shiftKey ? 10 : 1
  const map: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }
  if (event.key === 'Home') commit(props.min)
  else if (event.key === 'End') commit(props.max)
  else if (map[event.key]) commit(props.modelValue + map[event.key] * props.step * big)
  else return
  event.preventDefault()
  event.stopPropagation()
}

const typed = (event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) commit(value)
  ;(event.target as HTMLInputElement).value = shown.value
}
</script>

<template>
  <div class="slider" :class="{ disabled, dragging }">
    <div class="row">
      <span class="label">{{ label }}</span>
      <label class="value">
        <input :value="shown" :disabled="disabled" :aria-label="`${label}数值`" inputmode="decimal" class="alr-num" @change="typed" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.stop />
        <span v-if="unit" class="unit">{{ unit }}</span>
      </label>
    </div>
    <div
      ref="track" class="track" role="slider" :tabindex="disabled ? -1 : 0" :aria-label="label"
      :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="modelValue" :aria-valuetext="`${shown}${unit}`" :aria-disabled="disabled"
      @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @keydown="keydown"
      @dblclick="reset !== undefined && commit(reset)"
    >
      <div class="rail">
        <!-- Fill and thumb move with transforms only, so dragging never relayouts the panel. -->
        <div class="fill" :style="{ transform: `scaleX(${ratio})` }" />
      </div>
      <span v-if="resetRatio !== null" class="tick" :style="{ left: `${resetRatio * 100}%` }" aria-hidden="true" />
      <div class="thumb-lane" :style="{ transform: `translateX(${ratio * 100}%)` }">
        <div class="thumb" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider { display: flex; flex-direction: column; gap: 2px; }
.slider.disabled { opacity: .4; pointer-events: none; }
.row { display: flex; align-items: center; justify-content: space-between; height: 22px; }
.label { font-size: 12px; color: var(--alr-ink-2); transition: color var(--duration-fast) var(--easing-standard); }
.slider:hover .label, .slider.dragging .label { color: var(--alr-ink); }
.value { display: flex; align-items: center; gap: 1px; height: 20px; padding-right: 6px; border-radius: 5px; color: var(--alr-mute); transition: var(--alr-hover); }
.value:hover { background: rgb(255 255 255 / .04); }
.value:focus-within { background: var(--alr-sunken); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .55); }
.value input {
  width: 42px; height: 20px; padding: 0 2px 0 6px; text-align: right; font-size: 11.5px; color: var(--alr-ink);
  background: transparent; border: 0; outline: none;
}
.unit { font-size: 10.5px; }
.track { position: relative; height: 18px; margin: 0 7px; cursor: pointer; touch-action: none; outline: none; }
.rail { position: absolute; left: -7px; right: -7px; top: 50%; height: 4px; margin-top: -2px; overflow: hidden; border-radius: 999px; background: rgb(0 0 0 / .45); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .04); }
/* The fill spans the thumb's travel; the rail's left cap sits under the thumb at zero. */
.rail::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 7px; background: rgb(var(--alr-accent-rgb) / .45); }
.fill { position: absolute; inset: 0 7px; transform-origin: left center; background: linear-gradient(90deg, rgb(var(--alr-accent-rgb) / .45), var(--alr-accent)); }
.tick { position: absolute; top: 50%; width: 1px; height: 8px; margin: -4px 0 0 -.5px; background: rgb(255 255 255 / .22); pointer-events: none; }
.thumb-lane { position: absolute; inset: 0; pointer-events: none; }
.thumb {
  position: absolute; left: 0; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 999px;
  background: linear-gradient(180deg, rgb(252 252 252), rgb(216 216 216)); box-shadow: 0 1px 3px rgb(0 0 0 / .55), 0 0 0 .5px rgb(0 0 0 / .3);
  transition: transform var(--duration-base) var(--easing-emphasized);
}
/* A soft accent halo grows while the control is under the pointer or being dragged. */
.thumb::before {
  content: ''; position: absolute; inset: -5px; border-radius: inherit; background: rgb(var(--alr-accent-rgb) / .18);
  opacity: 0; transform: scale(.6); transition: opacity var(--duration-base) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized);
}
.track:hover .thumb::before { opacity: 1; transform: scale(1); }
.slider.dragging .thumb { transform: scale(1.12); }
.slider.dragging .thumb::before { opacity: 1; transform: scale(1.15); }
.track:focus-visible .thumb { box-shadow: 0 1px 3px rgb(0 0 0 / .55), 0 0 0 3px rgb(var(--alr-accent-rgb) / .45); }
</style>
