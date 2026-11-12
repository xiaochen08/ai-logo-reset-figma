<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { drawLogoRaster, shadowPadding } from '../render/logoRaster'
import { isConvexQuad, quadToMatrix3d, warpedQuad } from '../render/perspective'
import { layerBox } from '../state/placement'
import { useWorkspace } from '../state/context'
import { aiLogoResetLayerOpacity } from '../../../../shared/aiLogoResetRenderPlan.ts'
import type { ResetLayer, ResetLogoAsset, ResetSize } from '../state/types'

const props = withDefaults(defineProps<{
  layer: ResetLayer
  logo: ResetLogoAsset
  /** The canvas the logo sits on (the cropped photo with its bands), in photo pixels. */
  photo: ResetSize
  /** Display pixels per photo pixel. */
  scale: number
  /** Additional viewport zoom applied by the canvas transform layer. */
  viewportZoom?: number
  frame: HTMLElement | null
  selected: boolean
  /** Where the logo is drawn (canvas fractions); differs from layer.x/y when face avoidance moves it. */
  centre: { x: number, y: number }
  /** With a subject in front, the raster sits under the subject and the controls above it. */
  part?: 'all' | 'raster' | 'controls'
}>(), { part: 'all' })
const showRaster = computed(() => props.part !== 'controls')
const showControls = computed(() => props.part !== 'raster')

const { state, actions, scene } = useWorkspace()
// A group's opacity applies on top of the logo's own, as in the export.
const opacity = computed(() => aiLogoResetLayerOpacity(props.layer, scene.value?.groups ?? []))
// A locked logo lets clicks through to the photo and shows no handles.
const editable = computed(() => !props.layer.locked)
const hovered = ref(false)
const controlsVisible = computed(() => props.selected || (hovered.value && editable.value))
const canvas = ref<HTMLCanvasElement | null>(null)
const pad = ref(0)

const box = computed(() => {
  const size = layerBox(props.layer, props.logo, props.photo)
  return { width: size.width * props.scale, height: size.height * props.scale }
})
const quad = computed(() => warpedQuad(box.value.width, box.value.height, props.layer.warp.enabled ? props.layer.warp.corners : []))
const matrix = computed(() => props.layer.warp.enabled ? quadToMatrix3d(box.value.width, box.value.height, quad.value) : null)
const warpEditing = computed(() => props.selected && state.warpEditing && props.layer.warp.enabled)
const outline = computed(() => quad.value.map(point => `${point.x},${point.y}`).join(' '))

// Logo images are decoded once per URL and shared across layers.
const images = new Map<string, Promise<HTMLImageElement>>()
const loadImage = (url: string) => {
  let pending = images.get(url)
  if (!pending) {
    const image = new Image()
    image.src = url
    pending = image.decode().then(() => image)
    images.set(url, pending)
  }
  return pending
}

let frameRequest = 0
let drawToken = 0
const redraw = () => {
  cancelAnimationFrame(frameRequest)
  const token = ++drawToken
  frameRequest = requestAnimationFrame(async () => {
    const target = canvas.value
    if (!target || !showRaster.value) return
    const image = await loadImage(props.logo.url).catch(() => null)
    // A newer size or shadow request supersedes this one.
    if (!image || token !== drawToken) return
    pad.value = drawLogoRaster(target, {
      image, width: box.value.width, height: box.value.height,
      shadow: props.layer.shadow, devicePixelRatio: window.devicePixelRatio || 1, content: props.logo.content
    })
  })
}
watch(() => [props.logo.url, JSON.stringify(props.logo.content ?? null), box.value.width, box.value.height, JSON.stringify(props.layer.shadow), showRaster.value], redraw, { immediate: true, flush: 'post' })
watch(() => [box.value.width, box.value.height, props.layer.shadow.enabled, props.layer.shadow.blur, props.layer.shadow.distance], () => {
  pad.value = shadowPadding(box.value.width, box.value.height, props.layer.shadow)
}, { immediate: true })

let gestureSeq = 0
type Drag =
  | { kind: 'move', startX: number, startY: number, originX: number, originY: number, gesture: string }
  | { kind: 'resize', startDistance: number, originSize: number, gesture: string }
  | { kind: 'rotate', gesture: string }
  | { kind: 'warp', index: number, startX: number, startY: number, origin: { x: number, y: number }, gesture: string }
let drag: Drag | null = null
let capturedPointer: { element: HTMLElement, pointerId: number } | null = null
let dragFrameRequest = 0
let pendingPointer: { clientX: number, clientY: number, shiftKey: boolean } | null = null

onBeforeUnmount(() => {
  cancelAnimationFrame(frameRequest)
  if (dragFrameRequest) cancelAnimationFrame(dragFrameRequest)
  dragFrameRequest = 0
  pendingPointer = null
  drag = null
  if (capturedPointer?.element.hasPointerCapture(capturedPointer.pointerId)) {
    capturedPointer.element.releasePointerCapture(capturedPointer.pointerId)
  }
  capturedPointer = null
})

const frameRect = () => props.frame?.getBoundingClientRect() ?? null
const centreClient = () => {
  const rect = frameRect()
  return rect ? { x: rect.left + props.centre.x * rect.width, y: rect.top + props.centre.y * rect.height } : { x: 0, y: 0 }
}

const begin = (event: PointerEvent, next: Drag) => {
  if (event.button !== 0 || props.layer.locked) return
  event.stopPropagation()
  event.preventDefault()
  // Starting a corner drag on the already selected layer must not reset
  // warpEditing: that would unmount the handle before it receives movement.
  if (state.selectedLayerId !== props.layer.id) actions.selectLayer(props.layer.id)
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  capturedPointer = { element: target, pointerId: event.pointerId }
  drag = next
}

const startMove = (event: PointerEvent) => begin(event, { kind: 'move', startX: event.clientX, startY: event.clientY, originX: props.layer.x, originY: props.layer.y, gesture: `g${++gestureSeq}` })
const startResize = (event: PointerEvent) => {
  const centre = centreClient()
  begin(event, { kind: 'resize', startDistance: Math.hypot(event.clientX - centre.x, event.clientY - centre.y), originSize: props.layer.size, gesture: `g${++gestureSeq}` })
}
const startRotate = (event: PointerEvent) => begin(event, { kind: 'rotate', gesture: `g${++gestureSeq}` })
const startWarp = (event: PointerEvent, index: number) => begin(event, {
  kind: 'warp', index, startX: event.clientX, startY: event.clientY, origin: { ...props.layer.warp.corners[index] }, gesture: `g${++gestureSeq}`
})

const applyPointerMove = (event: { clientX: number, clientY: number, shiftKey: boolean }) => {
  if (!drag) return
  const rect = frameRect()
  if (!rect) return
  if (drag.kind === 'move') {
    actions.moveLayer(props.layer.id, drag.originX + (event.clientX - drag.startX) / rect.width, drag.originY + (event.clientY - drag.startY) / rect.height, drag.gesture)
  } else if (drag.kind === 'resize') {
    const centre = centreClient()
    const distance = Math.hypot(event.clientX - centre.x, event.clientY - centre.y)
    actions.setSize(drag.originSize * distance / Math.max(1, drag.startDistance), drag.gesture)
  } else if (drag.kind === 'rotate') {
    const centre = centreClient()
    let angle = Math.atan2(event.clientY - centre.y, event.clientX - centre.x) * 180 / Math.PI + 90
    if (event.shiftKey) angle = Math.round(angle / 15) * 15
    actions.setRotation(Math.round(angle * 10) / 10, drag.gesture)
  } else {
    // Pointer delta in the layer's unrotated local space.
    const radians = -props.layer.rotation * Math.PI / 180
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
    const zoom = props.viewportZoom ?? 1
    const next = { x: drag.origin.x + localX / Math.max(1, box.value.width * zoom), y: drag.origin.y + localY / Math.max(1, box.value.height * zoom) }
    const corners = props.layer.warp.corners.map((corner, index) => index === (drag as { index: number }).index ? next : corner)
    if (isConvexQuad(warpedQuad(box.value.width, box.value.height, corners))) actions.setWarpCorner(drag.index, next.x, next.y, drag.gesture)
  }
}
const pointermove = (event: PointerEvent) => {
  if (!drag) return
  pendingPointer = { clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey }
  if (dragFrameRequest) return
  dragFrameRequest = requestAnimationFrame(() => {
    dragFrameRequest = 0
    const next = pendingPointer
    pendingPointer = null
    if (next) applyPointerMove(next)
  })
}
const endPointer = (event: PointerEvent, commit: boolean) => {
  if (dragFrameRequest) cancelAnimationFrame(dragFrameRequest)
  dragFrameRequest = 0
  const next = pendingPointer
  pendingPointer = null
  if (commit && next) applyPointerMove(next)
  drag = null
  if (capturedPointer?.pointerId === event.pointerId) {
    if (capturedPointer.element.hasPointerCapture(event.pointerId)) capturedPointer.element.releasePointerCapture(event.pointerId)
    capturedPointer = null
  }
}
const pointerup = (event: PointerEvent) => endPointer(event, true)
const pointercancel = (event: PointerEvent) => endPointer(event, false)
</script>

<template>
  <div
    class="layer" :class="{ selected, hidden: !layer.visible }"
    :style="{
      left: `${centre.x * 100}%`, top: `${centre.y * 100}%`, width: `${box.width}px`, height: `${box.height}px`,
      transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`
    }"
    @pointermove="pointermove" @pointerup="pointerup" @pointercancel="pointercancel"
  >
    <div v-if="showRaster" class="warp" :style="{ width: `${box.width}px`, height: `${box.height}px`, transform: matrix ?? undefined, opacity }">
      <canvas
        ref="canvas" class="raster" aria-hidden="true"
        :style="{ left: `${-pad}px`, top: `${-pad}px`, width: `${box.width + pad * 2}px`, height: `${box.height + pad * 2}px` }"
      />
    </div>
    <svg v-if="showControls" class="hit" :width="box.width" :height="box.height" :viewBox="`0 0 ${box.width} ${box.height}`" aria-hidden="true" @pointerenter="hovered = true" @pointerleave="hovered = false">
      <polygon v-if="editable" :points="outline" class="hit-area" @pointerdown="startMove" />
      <polygon v-if="controlsVisible" :points="outline" class="outline" :class="{ warp: warpEditing, locked: !editable }" />
    </svg>
    <template v-if="showControls && controlsVisible && layer.visible && editable">
      <!-- What the tour lights: the box with its handles and the rotate dot above it. -->
      <span class="guide-box" data-guide="layer" aria-hidden="true" />
      <template v-if="warpEditing">
        <button
          v-for="(point, index) in quad" :key="index" class="handle warp-handle" :style="{ left: `${point.x}px`, top: `${point.y}px` }"
          :aria-label="`透视角点 ${index + 1}`" @pointerdown="startWarp($event, index)"
        />
      </template>
      <template v-else>
        <button
          v-for="corner in ['tl', 'tr', 'br', 'bl']" :key="corner" class="handle" :class="corner"
          aria-label="调整大小" @pointerdown="startResize"
        />
        <span class="rotate-stem" aria-hidden="true" />
        <button class="handle rotate" aria-label="旋转" title="拖动旋转，按住 Shift 以 15° 吸附" @pointerdown="startRotate" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.layer { position: absolute; pointer-events: none; }
.layer.hidden { visibility: hidden; }
.warp { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.raster { position: absolute; display: block; }
.hit { position: absolute; left: 0; top: 0; overflow: visible; }
.hit-area { fill: transparent; pointer-events: all; cursor: move; }

.outline { fill: none; stroke: var(--alr-accent); stroke-width: 1.25; vector-effect: non-scaling-stroke; pointer-events: none; }
.outline.warp { stroke-dasharray: 5 3; }
.outline.locked { stroke: rgb(255 255 255 / .55); stroke-dasharray: 2 3; }
.handle {
  position: absolute; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; pointer-events: all; border-radius: 3px;
  background: linear-gradient(180deg, rgb(255 255 255), rgb(226 226 226)); box-shadow: 0 0 0 1.5px var(--alr-accent), 0 1px 4px rgb(0 0 0 / .6);
  transition: transform var(--duration-base) var(--easing-emphasized);
}
.handle:hover { transform: scale(1.25); }
.handle:active { transform: scale(1.1); }
.handle.tl { left: 0; top: 0; cursor: nwse-resize; }
.handle.tr { left: 100%; top: 0; cursor: nesw-resize; }
.handle.br { left: 100%; top: 100%; cursor: nwse-resize; }
.handle.bl { left: 0; top: 100%; cursor: nesw-resize; }
.handle.rotate { left: 50%; top: -26px; border-radius: 999px; cursor: grab; }
.rotate-stem { position: absolute; left: 50%; top: -20px; width: 1px; height: 20px; background: rgb(var(--alr-accent-rgb) / .7); box-shadow: 0 0 0 .5px rgb(0 0 0 / .35); }
.guide-box { position: absolute; inset: -34px -10px -10px; pointer-events: none; }
.warp-handle { border-radius: 999px; background: var(--alr-accent-fill); box-shadow: 0 0 0 2px rgb(0 0 0 / .45), 0 0 10px rgb(var(--alr-accent-rgb) / .6); cursor: crosshair; }
</style>
