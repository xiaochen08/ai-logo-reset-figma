<script setup lang="ts">
import { computed } from 'vue'
import type { ResetFrame } from '../state/types'

/**
 * The photo as its frame shows it: turned, flipped and straightened, then cut to the crop and set
 * where it sits on the canvas. Only transforms and clipping, so it matches the export's geometry
 * (aiLogoResetFrame) without re-decoding the image. The slot holds the full, untouched photo.
 */
const props = withDefaults(defineProps<{
  frame: ResetFrame
  /** Display pixels per photo pixel. */
  scale: number
  /** whole: the turned photo uncropped (crop mode). window: what shows on the canvas. subject: the part a subject in front may cover. */
  show?: 'whole' | 'window' | 'subject'
}>(), { show: 'window' })

const px = (value: number) => `${value * props.scale}px`
const view = computed(() => {
  const { frame } = props
  if (props.show === 'whole') return { clip: { x: 0, y: 0, ...frame.turned }, origin: { x: 0, y: 0 } }
  // The turned photo's crop corner lands on the photo's place on the canvas.
  return { clip: props.show === 'subject' ? frame.subject : frame.window, origin: { x: frame.photo.x - frame.crop.x, y: frame.photo.y - frame.crop.y } }
})
const clipStyle = computed(() => {
  const { clip } = view.value
  return { left: px(clip.x), top: px(clip.y), width: px(clip.width), height: px(clip.height) }
})
const turnedStyle = computed(() => {
  const { frame } = props
  const { clip, origin } = view.value
  return {
    left: px(origin.x - clip.x), top: px(origin.y - clip.y), width: px(frame.turned.width), height: px(frame.turned.height),
    transform: frame.angle || frame.zoom !== 1 ? `rotate(${frame.angle}deg) scale(${frame.zoom})` : undefined
  }
})
const sourceStyle = computed(() => {
  const { frame } = props
  // Centred in the turned box; rotated first, then flipped in the turned photo's axes.
  const flips = frame.flipH || frame.flipV ? `scale(${frame.flipH ? -1 : 1}, ${frame.flipV ? -1 : 1}) ` : ''
  return {
    left: px((frame.turned.width - frame.source.width) / 2), top: px((frame.turned.height - frame.source.height) / 2),
    width: px(frame.source.width), height: px(frame.source.height),
    transform: flips || frame.quarterTurns ? `${flips}rotate(${frame.quarterTurns * 90}deg)` : undefined
  }
})
</script>

<template>
  <div class="clip" :style="clipStyle" aria-hidden="true">
    <div class="turned" :style="turnedStyle">
      <div class="source" :style="sourceStyle"><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.clip { position: absolute; overflow: hidden; pointer-events: none; }
.turned, .source { position: absolute; }
</style>
