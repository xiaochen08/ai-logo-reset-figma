<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Eye, EyeOff, FolderPlus, ImagePlus, Minus, Plus, ScanFace } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import PhotoCropOverlay from '../../../components/PhotoCropOverlay.vue'
import ResetLogoLayer from './ResetLogoLayer.vue'
import ResetFramedPhoto from './ResetFramedPhoto.vue'
import { PHOTO_ACCEPT, pickFiles, useWorkspace } from '../state/context'
import { foregroundUrls, previewEdge, previewUrls, requestScaled, thumbFailures, thumbUrls } from '../render/imagePipeline'
import { ensureRecognition, recognitionOf } from '../state/recognition'
import { aiLogoResetDefaultBanner, aiLogoResetDefaultCrop, aiLogoResetRecognitionKindFor } from '../../../../shared/aiLogoReset.ts'
import { aiLogoResetEffectiveCentre } from '../../../../shared/aiLogoResetGeometry.ts'
import { aiLogoResetCanvasFaces, aiLogoResetCropRatio, aiLogoResetFrame } from '../../../../shared/aiLogoResetFrame.ts'
import {
  clampImagePreviewTransform,
  createImagePreviewFrameTransformPainter,
  createImagePreviewTransform,
  resolveImagePreviewWheelZoom,
  zoomImagePreviewAtPoint,
  type ImagePreviewViewportTransform
} from '../../../components/imagePreviewViewport'

const { state, actions, current, scene, frame: photoFrame, logoById, visiblePhotos, photoUrl } = useWorkspace()

// Crop mode shows the whole turned photo under the crop box; holding compare shows the photo untouched.
const cropping = computed(() => state.page === 'crop')
const shownFrame = computed(() => {
  const photo = current.value
  if (!photo || !photoFrame.value) return null
  return state.comparing ? aiLogoResetFrame(photo, aiLogoResetDefaultCrop(), aiLogoResetDefaultBanner()) : photoFrame.value
})
const displayed = computed(() => {
  const value = shownFrame.value
  if (!value) return null
  return cropping.value && !state.comparing ? value.turned : value.canvas
})

const viewport = ref<HTMLElement | null>(null)
const frame = ref<HTMLElement | null>(null)
const view = ref({ width: 0, height: 0 })
const sharpLoaded = ref('')
const PAD = 48
const canvasTransform = ref<ImagePreviewViewportTransform>(createImagePreviewTransform())
let liveCanvasTransform = createImagePreviewTransform()
const canvasTransformStyle = ref('translate3d(0px, 0px, 0) scale(1)')
let canvasTransformSettleTimer: ReturnType<typeof setTimeout> | null = null
const canvasTransformPainter = createImagePreviewFrameTransformPainter({
  requestFrame: callback => window.requestAnimationFrame(callback),
  cancelFrame: frameId => window.cancelAnimationFrame(frameId),
  paint: transform => { canvasTransformStyle.value = transform }
})

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { view.value = { width: entry.contentRect.width, height: entry.contentRect.height } })
  if (viewport.value) observer.observe(viewport.value)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  canvasTransformPainter.cancel()
  if (canvasTransformSettleTimer !== null) clearTimeout(canvasTransformSettleTimer)
})

const fitScale = computed(() => {
  const size = displayed.value
  if (!size || view.value.width <= 0) return 1
  return Math.min((view.value.width - PAD * 2) / size.width, (view.value.height - PAD * 2) / size.height, 1)
})
const scale = computed(() => Math.max(0.01, fitScale.value))
const frameSize = computed(() => displayed.value ? { width: displayed.value.width * scale.value, height: displayed.value.height * scale.value } : { width: 0, height: 0 })
const viewportSize = computed(() => ({ width: view.value.width, height: view.value.height }))
const viewportZoom = computed(() => canvasTransform.value.zoom)
// The stage asks for exactly the recognition the export will use for this photo.
const recognitionKind = computed(() => scene.value ? aiLogoResetRecognitionKindFor(scene.value) : null)
const recognition = computed(() => current.value && recognitionKind.value ? recognitionOf(state.projectId, current.value.id, recognitionKind.value) : undefined)
watch(() => [current.value?.id, recognitionKind.value] as const, ([id, kind]) => {
  if (id && kind) void ensureRecognition(state.projectId, id, kind, { urgent: true })
}, { immediate: true })
// Faces are found on the whole photo; placement uses them where they land on the canvas.
const faces = computed(() => recognition.value?.status === 'ready' && photoFrame.value ? aiLogoResetCanvasFaces(photoFrame.value, recognition.value.faces) : null)

const canvas = computed(() => photoFrame.value?.canvas ?? { width: 1, height: 1 })
const layers = computed(() => (scene.value?.layers ?? []).flatMap(layer => {
  const logo = logoById(layer.logoId)
  if (!logo || !current.value) return []
  return [{ layer, logo, centre: aiLogoResetEffectiveCentre(layer, logo, canvas.value, faces.value, scene.value?.faceAvoid ?? false, scene.value?.safeEdge ?? true) }]
}))
const bandStyle = (band: { x: number, y: number, width: number, height: number }) => ({
  left: `${band.x * scale.value}px`, top: `${band.y * scale.value}px`, width: `${band.width * scale.value}px`, height: `${band.height * scale.value}px`,
  background: photoFrame.value?.bandColor
})

// Crop box: fractions of the turned photo, which fills the frame in crop mode.
const cropRatio = computed(() => current.value && scene.value ? aiLogoResetCropRatio(scene.value.crop, current.value) : null)
const cropBox = computed(() => ({ left: 0, top: 0, width: frameSize.value.width, height: frameSize.value.height }))
// A line drawn along something that should be level turns the photo by that much.
const straighten = (lineAngle: number) => {
  actions.setCropAngle((scene.value?.crop.angle ?? 0) - lineAngle, 'line')
  state.straightening = false
}

// Subject in front: the photo cut out by its mask is drawn over the logos, under their controls.
const subjectFront = computed(() => recognitionKind.value === 'subject')
const foreground = computed(() => subjectFront.value && current.value ? foregroundUrls[current.value.id] ?? '' : '')
watch(() => [current.value?.id, subjectFront.value, recognition.value?.maskUrl, current.value ? previewUrls[current.value.id] : ''] as const, ([id, front, mask, preview]) => {
  const photo = current.value
  if (!photo || !id || !front || !mask || !preview) return
  void requestScaled(photo.id, 'foreground', preview, 95, mask).catch(() => {})
}, { immediate: true })

const badgeFor = (label: string, ready: string) => {
  const value = recognition.value
  if (!value || value.status === 'pending') return `${label} · 识别中`
  if (value.status === 'failed') return `${label} · 识别失败，导出时按摆放位置`
  return `${label} · ${ready}`
}
const subjectBadge = computed(() => subjectFront.value ? badgeFor('主体前置', '已识别主体') : '')
const faceBadge = computed(() => {
  if (!scene.value?.faceAvoid || !recognitionKind.value) return ''
  const count = recognition.value?.status === 'ready' ? recognition.value.faces.length : 0
  return badgeFor('人脸避让', count ? `${count} 张人脸` : '未发现人脸')
})
const zoomLabel = computed(() => `${Math.round(canvasTransform.value.zoom * 100)}%`)

// Photo switches from the keyboard stay instant; pointer selection fades the new image in.
let keyboardSwitch = false
const markKeyboard = (event: KeyboardEvent) => { keyboardSwitch = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key) }
const markPointer = () => { keyboardSwitch = false }
onMounted(() => { window.addEventListener('keydown', markKeyboard, true); window.addEventListener('pointerdown', markPointer, true) })
onBeforeUnmount(() => { window.removeEventListener('keydown', markKeyboard, true); window.removeEventListener('pointerdown', markPointer, true) })
const animatePhoto = ref(true)

// The thumbnail is shown at once; a screen-sized preview replaces it, and the original
// is used only when zoomed beyond the preview's resolution.
const thumb = computed(() => current.value ? thumbUrls[current.value.id] ?? '' : '')
// The photo is drawn at its own size times the scale (and the straightening zoom), whatever the crop.
const needsOriginal = computed(() => !!current.value && Math.max(current.value.width, current.value.height) * scale.value * canvasTransform.value.zoom * (shownFrame.value?.zoom ?? 1) * (window.devicePixelRatio || 1) > previewEdge() * 1.05)
// Nothing to show yet: neither the thumbnail nor the sharp image has arrived.
const photoPending = computed(() => !!current.value && !thumb.value && (!sharpUrl.value || sharpLoaded.value !== sharpUrl.value))
const photoFailed = computed(() => photoPending.value && !!current.value && !!thumbFailures[current.value.id])
const sharpUrl = computed(() => {
  const photo = current.value
  if (!photo) return ''
  return needsOriginal.value ? photoUrl(photo) : previewUrls[photo.id] ?? ''
})

watch(() => state.currentId, id => {
  animatePhoto.value = !keyboardSwitch
  if (!id) return
  const list = visiblePhotos.value
  const index = list.findIndex(photo => photo.id === id)
  const photo = list[index] ?? current.value
  if (photo) void requestScaled(photo.id, 'thumb', photoUrl(photo), 90).catch(() => {})
  if (photo) void requestScaled(photo.id, 'preview', photoUrl(photo), 100).catch(() => {})
  // Prefetch neighbours so stepping through the set stays instant.
  for (const [offset, priority] of [[1, 60], [-1, 50], [2, 40]] as const) {
    const neighbour = list[index + offset]
    if (neighbour) void requestScaled(neighbour.id, 'preview', photoUrl(neighbour), priority).catch(() => {})
  }
}, { immediate: true })

const clearCanvasTransformSettleTimer = () => {
  if (canvasTransformSettleTimer === null) return
  clearTimeout(canvasTransformSettleTimer)
  canvasTransformSettleTimer = null
}
const commitCanvasTransform = (next: ImagePreviewViewportTransform = liveCanvasTransform) => {
  clearCanvasTransformSettleTimer()
  canvasTransformPainter.cancel()
  liveCanvasTransform = { ...next }
  canvasTransform.value = { ...next }
  canvasTransformStyle.value = `translate3d(${next.panX}px, ${next.panY}px, 0) scale(${next.zoom})`
}
const queueCanvasTransform = (next: ImagePreviewViewportTransform) => {
  liveCanvasTransform = next
  // Unlike the original composition stage, this component keeps the committed
  // transform on the DOM layer instead of projecting it into reactive layout
  // rectangles. Paint an absolute transform during rAF; applying the shared
  // relative delta here would replace the committed transform and cause a jump
  // on the next wheel event.
  canvasTransformPainter.queue(createImagePreviewTransform(), next)
}
const scheduleCanvasTransformCommit = () => {
  clearCanvasTransformSettleTimer()
  canvasTransformSettleTimer = setTimeout(() => { canvasTransformSettleTimer = null; commitCanvasTransform() }, 120)
}
const resetCanvasTransform = () => commitCanvasTransform(createImagePreviewTransform())
watch(() => state.currentId, () => resetCanvasTransform())
const fittedMediaSize = () => ({ width: frameSize.value.width, height: frameSize.value.height })
const setCanvasZoom = (zoom: number) => {
  const next = zoomImagePreviewAtPoint(liveCanvasTransform, zoom, { x: view.value.width / 2, y: view.value.height / 2 }, viewportSize.value, fittedMediaSize())
  commitCanvasTransform(next)
}
const zoomBy = (factor: number) => setCanvasZoom(liveCanvasTransform.zoom * factor)
const wheel = (event: WheelEvent) => {
  if (!current.value || (event.target as HTMLElement | null)?.closest('.zoom')) return
  if (state.page === 'crop') return
  event.preventDefault()
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect || !frameSize.value.width || !frameSize.value.height) return
  const requestedZoom = resolveImagePreviewWheelZoom(liveCanvasTransform.zoom, event.deltaY)
  const next = zoomImagePreviewAtPoint(liveCanvasTransform, requestedZoom, {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }, viewportSize.value, fittedMediaSize())
  queueCanvasTransform(next)
  scheduleCanvasTransformCommit()
}
type CanvasPanSession = { pointerId: number, startX: number, startY: number, startTransform: ImagePreviewViewportTransform, captureTarget: HTMLElement }
const canvasPanSession = ref<CanvasPanSession | null>(null)
const backgroundDown = (event: PointerEvent) => { if (event.button === 0) actions.selectLayer(null) }
const handleViewportPointerDown = (event: PointerEvent) => {
  backgroundDown(event)
  if (event.button !== 0 || liveCanvasTransform.zoom <= 1 || state.page === 'crop' || state.comparing) return
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('button, input, select, textarea, a, [role="button"]')) return
  const captureTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (!captureTarget) return
  captureTarget.setPointerCapture(event.pointerId)
  canvasPanSession.value = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startTransform: { ...liveCanvasTransform }, captureTarget }
  event.preventDefault()
}
const handleViewportPointerMove = (event: PointerEvent) => {
  const session = canvasPanSession.value
  if (!session || session.pointerId !== event.pointerId) return
  queueCanvasTransform(clampImagePreviewTransform({
    ...session.startTransform,
    panX: session.startTransform.panX + event.clientX - session.startX,
    panY: session.startTransform.panY + event.clientY - session.startY
  }, viewportSize.value, fittedMediaSize()))
}
const finishViewportPan = (event?: PointerEvent) => {
  const session = canvasPanSession.value
  if (!session || (event && session.pointerId !== event.pointerId)) return
  if (session.captureTarget.hasPointerCapture(session.pointerId)) session.captureTarget.releasePointerCapture(session.pointerId)
  commitCanvasTransform()
  canvasPanSession.value = null
}

watch(() => [frameSize.value.width, frameSize.value.height, view.value.width, view.value.height] as const, () => {
  if (!frameSize.value.width || !frameSize.value.height) return
  commitCanvasTransform(clampImagePreviewTransform(liveCanvasTransform, viewportSize.value, fittedMediaSize()))
}, { flush: 'post' })

const addPhotos = async () => actions.importPhotos(await pickFiles({ accept: PHOTO_ACCEPT }))
const addFolder = async () => actions.importPhotos(await pickFiles({ accept: PHOTO_ACCEPT, directory: true }))
</script>

<template>
  <section ref="viewport" class="stage alr-checker" @wheel="wheel" @pointerdown="handleViewportPointerDown" @pointermove="handleViewportPointerMove" @pointerup="finishViewportPan" @pointercancel="finishViewportPan">
    <!-- Safelight pool and vignette: static gradients behind the photo, nothing that repaints. -->
    <div class="spot" aria-hidden="true" />
    <div v-if="!current && state.loading" class="empty">
      <div class="wait" role="status" aria-live="polite">
        <span>正在打开项目…</span>
        <span class="wait-track ui-activity-sweep" aria-hidden="true" />
      </div>
    </div>
    <div v-else-if="!current" class="empty">
      <div class="empty-card alr-finder">
        <span class="empty-ring"><ImagePlus :size="22" /></span>
        <div class="empty-title">拖入照片开始</div>
        <div class="empty-actions">
          <button class="alr-btn" @click="addPhotos"><ImagePlus :size="14" />添加照片</button>
          <button class="alr-btn" @click="addFolder"><FolderPlus :size="14" />添加文件夹</button>
        </div>
      </div>
    </div>

    <template v-else>
      <div class="scroller">
        <div class="canvas-transform-layer" :style="{ transform: canvasTransformStyle }">
        <div
          ref="frame" class="frame" :class="{ comparing: state.comparing, cropping }"
          :style="{ width: `${frameSize.width}px`, height: `${frameSize.height}px`, background: !cropping && shownFrame?.background || undefined }"
        >
          <ResetFramedPhoto v-if="shownFrame" :frame="shownFrame" :scale="scale" :show="cropping && !state.comparing ? 'whole' : 'window'">
            <img v-if="thumb" :src="thumb" class="photo" alt="" :draggable="false" decoding="async" />
            <UiMotionTransition preset="media" :enabled="animatePhoto">
              <img
                v-if="sharpUrl" v-show="sharpLoaded === sharpUrl" :key="sharpUrl" :src="sharpUrl" class="photo" alt="" :draggable="false"
                decoding="async" @load="sharpLoaded = sharpUrl"
              />
            </UiMotionTransition>
          </ResetFramedPhoto>
          <template v-if="!state.comparing && !cropping && photoFrame">
            <span v-for="(band, index) in photoFrame.bands" :key="index" class="band" :style="bandStyle(band)" aria-hidden="true" />
            <!-- Logos are clipped to the canvas as in the export; their box and handles stay usable beyond it. -->
            <div class="logo-clip">
              <ResetLogoLayer
                v-for="item in layers" :key="item.layer.id" :layer="item.layer" :logo="item.logo" :photo="canvas" :centre="item.centre"
                part="raster" :scale="scale" :viewport-zoom="viewportZoom" :frame="frame" :selected="item.layer.id === state.selectedLayerId"
              />
            </div>
            <ResetFramedPhoto v-if="foreground" :frame="photoFrame" :scale="scale" show="subject">
              <img :src="foreground" class="photo foreground" alt="" :draggable="false" decoding="async" />
            </ResetFramedPhoto>
            <ResetLogoLayer
              v-for="item in layers" :key="`${item.layer.id}-controls`" :layer="item.layer" :logo="item.logo" :photo="canvas" :centre="item.centre"
              part="controls" :scale="scale" :viewport-zoom="viewportZoom" :frame="frame" :selected="item.layer.id === state.selectedLayerId"
            />
          </template>
          <UiMotionTransition preset="status">
            <div v-if="photoFailed" class="wait in-frame failed" role="status">这张照片无法加载，原图可能已移动或损坏</div>
            <div v-else-if="photoPending" class="wait in-frame" role="status" aria-live="polite">
              <span>正在加载照片…</span>
              <span class="wait-track ui-activity-sweep" aria-hidden="true" />
            </div>
          </UiMotionTransition>
          <PhotoCropOverlay
            v-if="cropping && !state.comparing && scene" class="crop" :crop-rect="scene.crop" :image-rect="cropBox" :ratio="cropRatio" :aspect-locked="cropRatio !== null"
            :interaction-mode="state.straightening ? 'straighten' : 'crop'"
            @pointerdown.stop @update:crop-rect="rect => actions.setCropRect(rect)" @straighten="straighten" @confirm="actions.setPage('logo')"
          />
        </div>
        </div>
      </div>

      <UiMotionTransition preset="status">
        <div v-if="subjectBadge || faceBadge" class="badges">
          <span v-if="subjectBadge" class="badge" :class="{ 'is-failed': recognition?.status === 'failed' }"><span class="badge-dot" />{{ subjectBadge }}</span>
          <span v-if="faceBadge" class="badge" :class="{ 'is-failed': recognition?.status === 'failed' }"><ScanFace :size="12" />{{ faceBadge }}</span>
        </div>
      </UiMotionTransition>
      <UiMotionTransition preset="status">
        <div v-if="state.comparing" class="compare-tag">原图</div>
      </UiMotionTransition>

      <div class="zoom" @pointerdown.stop>
        <button class="alr-icon-btn" aria-label="缩小" @click="zoomBy(1 / 1.25)"><Minus :size="14" /></button>
        <button class="zoom-label alr-num" :aria-pressed="canvasTransform.zoom === 1 && canvasTransform.panX === 0 && canvasTransform.panY === 0" title="适应窗口" @click="resetCanvasTransform">{{ canvasTransform.zoom === 1 && canvasTransform.panX === 0 && canvasTransform.panY === 0 ? '适应' : zoomLabel }}</button>
        <button class="alr-icon-btn" aria-label="放大" @click="zoomBy(1.25)"><Plus :size="14" /></button>
        <button class="zoom-label alr-num" title="实际像素" @click="setCanvasZoom(1 / Math.max(0.01, fitScale))">1:1</button>
        <button class="original-toggle" :aria-pressed="state.comparing" :title="state.comparing ? '返回胶片效果' : '显示原图'" @click="state.comparing = !state.comparing">
          <component :is="state.comparing ? EyeOff : Eye" :size="13" />{{ state.comparing ? '效果' : '原图' }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.stage { position: relative; height: 100%; min-width: 0; overflow: hidden; }
.spot {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(60% 55% at 50% 46%, rgb(var(--alr-accent-rgb) / .055), transparent 72%),
    radial-gradient(120% 90% at 50% 50%, transparent 55%, rgb(0 0 0 / .55));
}
.scroller { position: absolute; inset: 0; overflow: hidden; touch-action: none; user-select: none; }
.canvas-transform-layer { position: absolute; inset: 0; display: grid; place-items: center; transform-origin: center center; }
.stage:has(.canvas-transform-layer) { cursor: default; }
/* The print: deep layered drop, a hairline bezel and a faint lit top edge. */
.frame {
  position: relative; flex: none; background: #000;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .06), 0 2px 4px rgb(0 0 0 / .4), 0 18px 40px rgb(0 0 0 / .5), 0 40px 120px rgb(0 0 0 / .55);
}
.frame::after { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none; box-shadow: inset 0 1px 0 rgb(255 255 255 / .08); }
.frame.comparing::after { box-shadow: inset 0 0 0 2px rgb(var(--alr-accent-rgb) / .8); }
.photo { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.foreground { pointer-events: none; }
.band { position: absolute; pointer-events: none; }
.logo-clip { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
/* The crop box's own frame replaces the print's lit edge while cropping. */
.frame.cropping::after { box-shadow: none; }
.crop :deep(.crop-box) { border-color: rgb(var(--alr-accent-rgb) / .95); }
.crop :deep(.crop-handle) { border-color: var(--alr-accent); border-radius: 2px; }
.empty { position: absolute; inset: 0; display: grid; place-items: center; }
/* Until the photo (or the project) is in, the stage says so instead of showing an empty frame. */
.wait {
  display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 16px 22px 18px; border-radius: 12px;
  font-size: 12.5px; color: var(--alr-ink-2); background: rgb(var(--rgb-bg-main) / .72); box-shadow: var(--alr-edge), var(--alr-lift-1);
}
.wait.in-frame { position: absolute; left: 50%; top: 50%; z-index: 4; translate: -50% -50%; pointer-events: none; }
.wait.failed { color: var(--alr-danger); }
.wait-track { --ui-activity-color: rgb(var(--alr-accent-rgb) / .9); width: 140px; height: 3px; border-radius: 999px; background: rgb(255 255 255 / .08); }
.empty-card {
  display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 44px 64px; border-radius: 14px; color: var(--alr-mute);
  background: radial-gradient(circle at 50% 0%, rgb(var(--alr-accent-rgb) / .06), transparent 70%), rgb(var(--rgb-bg-main) / .55);
}
.empty-card::before { --alr-finder-color: rgb(var(--alr-accent-rgb) / .55); --alr-finder-size: 20px; inset: 10px; }
.empty-ring {
  display: grid; place-items: center; width: 60px; height: 60px; border-radius: 999px; color: var(--alr-accent);
  background: radial-gradient(circle at 50% 30%, rgb(var(--alr-accent-rgb) / .18), rgb(var(--alr-accent-rgb) / .04)); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .3);
}
.empty-title { font-size: 15px; font-weight: 500; color: var(--alr-ink); }
.empty-actions { display: flex; gap: 8px; margin-top: 6px; }
.badges { position: absolute; left: 14px; top: 14px; display: flex; gap: 6px; pointer-events: none; }
.badge {
  display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; border-radius: 999px; font-size: 11.5px; color: var(--alr-ink-2);
  background: linear-gradient(180deg, rgb(255 255 255 / .05), rgb(255 255 255 / .02)), rgb(var(--rgb-bg-surface) / .92); box-shadow: var(--alr-edge), var(--alr-bevel), var(--alr-lift-1);
}
.badge.is-failed { color: var(--alr-danger); }
.badge-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--alr-accent); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .8); }
.compare-tag {
  position: absolute; left: 50%; top: 14px; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 500; color: var(--alr-accent-ink);
  background: var(--alr-accent-fill); box-shadow: inset 0 1px 0 rgb(255 255 255 / .35), var(--alr-lift-1); pointer-events: none; translate: -50% 0;
}
.zoom {
  position: absolute; right: 14px; bottom: 14px; display: flex; align-items: center; gap: 1px; padding: 3px; border-radius: 10px;
  background: linear-gradient(180deg, rgb(255 255 255 / .05), rgb(255 255 255 / .02)), rgb(var(--rgb-bg-surface) / .94); box-shadow: var(--alr-edge), var(--alr-bevel), var(--alr-lift-2);
}
.zoom-label { min-width: 46px; height: 28px; padding: 0 6px; border-radius: 6px; font-size: 11.5px; color: var(--alr-ink-2); transition: var(--alr-hover), var(--alr-press); }
.zoom-label:hover { background: rgb(255 255 255 / .06); color: var(--alr-ink); }
.zoom-label:active { transform: scale(.95); }
.zoom-label[aria-pressed="true"] { color: var(--alr-accent); }
.original-toggle {
  display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; border-radius: 6px;
  color: var(--alr-ink-2); font-size: 11.5px; transition: var(--alr-hover), var(--alr-press);
}
.original-toggle:hover { background: rgb(255 255 255 / .06); color: var(--alr-ink); }
.original-toggle[aria-pressed="true"] { color: var(--alr-accent-ink); background: var(--alr-accent-fill); }
.original-toggle:active { transform: scale(.95); }
</style>
