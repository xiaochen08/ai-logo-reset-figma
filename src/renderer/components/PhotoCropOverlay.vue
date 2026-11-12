<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  NormalizedCropRect,
  PhotoGeometryGuideLine
} from '../../shared/photoGeometry'
import {
  resizeNormalizedCropRect,
  type CropHandle
} from './photoCropInteraction'

const props = defineProps<{
  cropRect: NormalizedCropRect
  imageRect: { left: number; top: number; width: number; height: number }
  ratio?: number | null
  aspectLocked?: boolean
  interactionMode?: 'crop' | 'straighten' | 'guided'
  guidedLines?: PhotoGeometryGuideLine[]
}>()

const emit = defineEmits<{
  'update:cropRect': [value: NormalizedCropRect]
  straighten: [angleDegrees: number]
  'add-guide': [line: PhotoGeometryGuideLine]
  confirm: []
}>()

interface DragSession {
  pointerId: number
  handle: CropHandle | 'line'
  startX: number
  startY: number
  currentX: number
  currentY: number
  startRect: NormalizedCropRect
  target: HTMLElement
}

const drag = ref<DragSession | null>(null)
const overlayRef = ref<HTMLElement | null>(null)
const cropStyle = computed(() => ({
  left: `${props.imageRect.left + props.cropRect.x * props.imageRect.width}px`,
  top: `${props.imageRect.top + props.cropRect.y * props.imageRect.height}px`,
  width: `${props.cropRect.width * props.imageRect.width}px`,
  height: `${props.cropRect.height * props.imageRect.height}px`
}))

const maskRects = computed(() => {
  const left = props.imageRect.left + props.cropRect.x * props.imageRect.width
  const top = props.imageRect.top + props.cropRect.y * props.imageRect.height
  const right = left + props.cropRect.width * props.imageRect.width
  const bottom = top + props.cropRect.height * props.imageRect.height
  return [
    { left: props.imageRect.left, top: props.imageRect.top, width: props.imageRect.width, height: Math.max(0, top - props.imageRect.top) },
    { left: props.imageRect.left, top: bottom, width: props.imageRect.width, height: Math.max(0, props.imageRect.top + props.imageRect.height - bottom) },
    { left: props.imageRect.left, top, width: Math.max(0, left - props.imageRect.left), height: Math.max(0, bottom - top) },
    { left: right, top, width: Math.max(0, props.imageRect.left + props.imageRect.width - right), height: Math.max(0, bottom - top) }
  ].map((rect) => ({
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }))
})

const handles: Array<{ value: CropHandle; label: string }> = [
  { value: 'top-left', label: '左上裁切柄' },
  { value: 'top', label: '顶部裁切柄' },
  { value: 'top-right', label: '右上裁切柄' },
  { value: 'right', label: '右侧裁切柄' },
  { value: 'bottom-right', label: '右下裁切柄' },
  { value: 'bottom', label: '底部裁切柄' },
  { value: 'bottom-left', label: '左下裁切柄' },
  { value: 'left', label: '左侧裁切柄' }
]

const lineStyle = computed(() => {
  const session = drag.value
  if (!session || session.handle !== 'line') return undefined
  const dx = session.currentX - session.startX
  const dy = session.currentY - session.startY
  return {
    left: `${session.startX}px`,
    top: `${session.startY}px`,
    width: `${Math.hypot(dx, dy)}px`,
    transform: `rotate(${Math.atan2(dy, dx)}rad)`
  }
})

const normalizedLineStyle = (line: PhotoGeometryGuideLine) => {
  const x1 = props.imageRect.left + line.x1 * props.imageRect.width
  const y1 = props.imageRect.top + line.y1 * props.imageRect.height
  const x2 = props.imageRect.left + line.x2 * props.imageRect.width
  const y2 = props.imageRect.top + line.y2 * props.imageRect.height
  return {
    left: `${x1}px`,
    top: `${y1}px`,
    width: `${Math.hypot(x2 - x1, y2 - y1)}px`,
    transform: `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`
  }
}

const startDrag = (event: PointerEvent, handle: CropHandle | 'line') => {
  if (props.interactionMode !== 'crop') handle = 'line'
  const target = event.currentTarget as HTMLElement
  const overlayRect = overlayRef.value?.getBoundingClientRect()
  const localX = event.clientX - (overlayRect?.left ?? 0)
  const localY = event.clientY - (overlayRect?.top ?? 0)
  target.setPointerCapture?.(event.pointerId)
  drag.value = {
    pointerId: event.pointerId,
    handle,
    startX: localX,
    startY: localY,
    currentX: localX,
    currentY: localY,
    startRect: { ...props.cropRect },
    target
  }
}

const handlePointerMove = (event: PointerEvent) => {
  const session = drag.value
  if (!session || session.pointerId !== event.pointerId) return
  const overlayRect = overlayRef.value?.getBoundingClientRect()
  session.currentX = event.clientX - (overlayRect?.left ?? 0)
  session.currentY = event.clientY - (overlayRect?.top ?? 0)
  if (session.handle === 'line') return
  emit('update:cropRect', resizeNormalizedCropRect({
    start: session.startRect,
    handle: session.handle,
    deltaX: (session.currentX - session.startX) / Math.max(1, props.imageRect.width),
    deltaY: (session.currentY - session.startY) / Math.max(1, props.imageRect.height),
    ratio: props.aspectLocked ? props.ratio : null,
    imageAspect: props.imageRect.width / Math.max(1, props.imageRect.height)
  }))
}

const finishDrag = (event: PointerEvent) => {
  const session = drag.value
  if (!session || session.pointerId !== event.pointerId) return
  session.target.releasePointerCapture?.(event.pointerId)
  if (session.handle === 'line') {
    const dx = session.currentX - session.startX
    const dy = session.currentY - session.startY
    if (Math.hypot(dx, dy) >= 8) {
      if (props.interactionMode === 'straighten') {
        emit('straighten', Math.max(-45, Math.min(45, Math.atan2(dy, dx) * 180 / Math.PI)))
      } else {
        const normalizeX = (value: number) => Math.max(0, Math.min(1, (value - props.imageRect.left) / props.imageRect.width))
        const normalizeY = (value: number) => Math.max(0, Math.min(1, (value - props.imageRect.top) / props.imageRect.height))
        emit('add-guide', {
          x1: normalizeX(session.startX),
          y1: normalizeY(session.startY),
          x2: normalizeX(session.currentX),
          y2: normalizeY(session.currentY),
          orientation: Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical'
        })
      }
    }
  }
  drag.value = null
}
</script>

<template>
  <div
    ref="overlayRef"
    class="crop-overlay"
    :class="`is-${interactionMode ?? 'crop'}`"
    @pointermove="handlePointerMove"
    @pointerup="finishDrag"
    @pointercancel="finishDrag"
    @dblclick.stop.prevent="emit('confirm')"
  >
    <div v-for="(_, index) in maskRects" :key="index" class="crop-mask" :style="maskRects[index]" />
    <button
      class="crop-box"
      type="button"
      :style="cropStyle"
      aria-label="移动裁切框"
      @pointerdown.stop.prevent="startDrag($event, interactionMode === 'crop' ? 'move' : 'line')"
    >
      <i class="grid-line vertical first" />
      <i class="grid-line vertical second" />
      <i class="grid-line horizontal first" />
      <i class="grid-line horizontal second" />
      <span
        v-for="handle in handles"
        :key="handle.value"
        class="crop-handle"
        :class="`is-${handle.value}`"
        role="button"
        :aria-label="handle.label"
        @pointerdown.stop.prevent="startDrag($event, handle.value)"
      />
    </button>
    <i
      v-for="(line, index) in guidedLines ?? []"
      :key="index"
      class="guide-line saved"
      :class="line.orientation"
      :style="normalizedLineStyle(line)"
    />
    <i v-if="lineStyle" class="guide-line active" :style="lineStyle" />
  </div>
</template>

<style scoped>
.crop-overlay {
  position: absolute;
  inset: 0;
  z-index: 28;
  touch-action: none;
}

.crop-overlay.is-straighten,
.crop-overlay.is-guided {
  cursor: crosshair;
}

.crop-mask {
  position: absolute;
  background: rgb(0 0 0 / 58%);
  pointer-events: none;
}

.crop-box {
  position: absolute;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 92%);
  border-radius: 0;
  background: transparent;
  cursor: move;
  touch-action: none;
}

.grid-line {
  position: absolute;
  display: block;
  background: rgb(255 255 255 / 54%);
  pointer-events: none;
}

.grid-line.vertical {
  top: 0;
  bottom: 0;
  width: 1px;
}

.grid-line.horizontal {
  right: 0;
  left: 0;
  height: 1px;
}

/* Vertical lines take only a left, horizontal ones only a top, so each spans the whole box. */
.grid-line.vertical.first { left: 33.333%; }
.grid-line.vertical.second { left: 66.666%; }
.grid-line.horizontal.first { top: 33.333%; }
.grid-line.horizontal.second { top: 66.666%; }

.crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  background: #202020;
}

.crop-handle.is-top-left { left: 0; top: 0; transform: translate(-50%, -50%); cursor: nwse-resize; }
.crop-handle.is-top { left: 50%; top: 0; transform: translate(-50%, -50%); cursor: ns-resize; }
.crop-handle.is-top-right { right: 0; top: 0; transform: translate(50%, -50%); cursor: nesw-resize; }
.crop-handle.is-right { right: 0; top: 50%; transform: translate(50%, -50%); cursor: ew-resize; }
.crop-handle.is-bottom-right { right: 0; bottom: 0; transform: translate(50%, 50%); cursor: nwse-resize; }
.crop-handle.is-bottom { left: 50%; bottom: 0; transform: translate(-50%, 50%); cursor: ns-resize; }
.crop-handle.is-bottom-left { left: 0; bottom: 0; transform: translate(-50%, 50%); cursor: nesw-resize; }
.crop-handle.is-left { left: 0; top: 50%; transform: translate(-50%, -50%); cursor: ew-resize; }

.guide-line {
  position: absolute;
  z-index: 2;
  display: block;
  height: 2px;
  transform-origin: 0 50%;
  background: #67b5ff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 45%);
  pointer-events: none;
}

.guide-line.saved.vertical {
  background: #ffd166;
}
</style>
