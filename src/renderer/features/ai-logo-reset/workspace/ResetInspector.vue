<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { Copy, Crop, Group, Lock, Move, Palette, PanelBottom, Plus, RotateCcw, SquareDashed, Stamp, Trash2, Upload } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import UiCollapse from '../../../components/UiCollapse.vue'
import { resolveUiMotionTransitionName } from '../../../animation/motionPresets'
import ResetSection from '../ui/ResetSection.vue'
import ResetConfirmDialog from '../ui/ResetConfirmDialog.vue'
import ResetSlider from '../ui/ResetSlider.vue'
import ResetSegmented from '../ui/ResetSegmented.vue'
import ResetSwitch from '../ui/ResetSwitch.vue'
import ResetLayerList from './ResetLayerList.vue'
import ResetBannerPanel from './ResetBannerPanel.vue'
import ResetCropPanel from './ResetCropPanel.vue'
import { ANCHORS, ANCHOR_LABELS } from '../state/placement'
import { LOGO_ACCEPT, pickFiles, useWorkspace } from '../state/context'
import { RESET_MAX_LAYERS_PER_PHOTO, type ResetInspectorPage, type ResetInspectorTab, type ResetRenderMode } from '../state/types'
import type { LogoAssetRecord } from '../../../../shared/logoTypes.ts'

const { state, actions, current, scene, frame, selectedLayer } = useWorkspace()

const layer = computed(() => selectedLayer.value)
const logoDropping = ref(false)

// The inspector's three pages, in order: logos, bands, crop. The crop page also puts the stage into crop mode.
const pages = computed(() => [
  { value: 'logo' as const, label: 'LOGO', icon: Stamp, active: false },
  { value: 'banner' as const, label: '横幅', icon: PanelBottom, active: !!scene.value?.banner.enabled },
  { value: 'crop' as const, label: '裁切', icon: Crop, active: !!scene.value && isCropped(scene.value.crop) }
])
const isCropped = (crop: NonNullable<typeof scene.value>['crop']) => crop.width < 1 || crop.height < 1 || crop.quarterTurns > 0 || crop.flipH || crop.flipV || crop.angle !== 0
const pageIndex = computed(() => pages.value.findIndex(item => item.value === state.page))
const pagesId = useId()
const pageMotion = ref<'view-forward' | 'view-back'>('view-forward')
const pageOrder = (value: ResetInspectorPage) => pages.value.findIndex(item => item.value === value)
watch(() => state.page, (next, before) => { pageMotion.value = pageOrder(next) > pageOrder(before) ? 'view-forward' : 'view-back' })
const pageKey = (event: KeyboardEvent) => {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = pages.value[(pageIndex.value + step + pages.value.length) % pages.value.length]
  actions.setPage(next.value)
  ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-page="${next.value}"]`)?.focus()
}

// Replacing (started from a layer row): the next logo picked in the library takes the selected layer's place.
const replacing = computed(() => state.replacing && !!layer.value)
type PendingLogoPick = { kind: 'local' | 'public', id: string, name: string, replace: boolean }
const pendingLogoPick = ref<PendingLogoPick | null>(null)
const pageHasLogo = computed(() => (scene.value?.layers.length ?? 0) > 0)
const applyLogoPick = (pick: PendingLogoPick) => {
  if (pick.kind === 'public') void actions.importPublicLogo(pick.id, pick.replace)
  else if (pick.replace) actions.replaceLayerLogo(pick.id)
  else actions.addLayer(pick.id)
}
const requestLogoPick = (pick: Omit<PendingLogoPick, 'replace'>) => {
  const next = { ...pick, replace: replacing.value }
  if (next.replace || !pageHasLogo.value) applyLogoPick(next)
  else pendingLogoPick.value = next
}
const confirmLogoPick = () => {
  const pick = pendingLogoPick.value
  pendingLogoPick.value = null
  if (pick) applyLogoPick(pick)
}
const pickLogo = (logoId: string) => {
  const logo = state.logos.find(item => item.id === logoId)
  if (logo) requestLogoPick({ kind: 'local', id: logo.id, name: logo.name })
}
const pickedCount = computed(() => new Set([...state.layerSelection, ...(state.selectedLayerId ? [state.selectedLayerId] : [])]).size)

type PublicLogo = LogoAssetRecord & { previewDataUrl?: string }
const publicLogoStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const publicLogoError = ref('')
const publicLogos = ref<PublicLogo[]>([])
let publicLogoLoad: Promise<void> | null = null

const loadPublicLogos = () => {
  if (publicLogoLoad || publicLogoStatus.value === 'ready') return publicLogoLoad ?? Promise.resolve()
  publicLogoStatus.value = 'loading'
  publicLogoLoad = (async () => {
    const response = await window.photoToolboxLogoAssets?.listLogoAssets()
    if (!response?.success || !response.data) throw new Error(response?.error ?? '读取公共 LOGO 失败。')
    const items = await Promise.all(response.data.map(async asset => {
      const preview = await window.photoToolboxFiles?.createLogoPreview(asset.localPath, { maxEdge: 160 })
      return { ...asset, previewDataUrl: preview?.success && preview.data?.previewDataUrl ? preview.data.previewDataUrl : undefined }
    }))
    publicLogos.value = items
    publicLogoError.value = ''
    publicLogoStatus.value = 'ready'
  })().catch(error => {
    publicLogoStatus.value = 'error'
    publicLogoError.value = error instanceof Error ? error.message : String(error)
  }).finally(() => { publicLogoLoad = null })
  return publicLogoLoad
}

const pickPublicLogo = (asset: PublicLogo) => { requestLogoPick({ kind: 'public', id: asset.id, name: asset.originalName }) }

const addLogo = async () => actions.importLogos(await pickFiles({ accept: LOGO_ACCEPT }))
const dropLogo = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  logoDropping.value = false
  void actions.importLogos(Array.from(event.dataTransfer?.files ?? []))
}
const overLogo = (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); logoDropping.value = true }

const modes: ReadonlyArray<{ value: ResetRenderMode, label: string }> = [
  { value: 'normal', label: '普通' },
  { value: 'subject-front', label: '主体前置' }
]
const shadowColor = (event: Event) => actions.setShadow({ color: (event.target as HTMLInputElement).value })
// Logos arrive and leave with the shared list motion.
const listMotion = resolveUiMotionTransitionName('list')

// The selected logo's settings are split into three pages so each category reads on its own.
// The open page lives in the workspace so the tour can open the page it explains.
const tab = computed(() => state.inspectorTab)
const tabs = computed(() => [
  { value: 'place' as const, label: '位置', icon: Move, active: false },
  { value: 'look' as const, label: '外观', icon: Palette, active: !!layer.value?.shadow.enabled || (layer.value?.opacity ?? 100) < 100 },
  { value: 'warp' as const, label: '透视', icon: SquareDashed, active: !!layer.value?.warp.enabled }
])
const tabIndex = computed(() => tabs.value.findIndex(item => item.value === tab.value))
const tabsId = useId()
// Tabs are ordered, so a switch moves toward the page it opens; the old page leaves before the new one enters.
const tabMotion = ref<'view-forward' | 'view-back'>('view-forward')
const order = (value: ResetInspectorTab) => tabs.value.findIndex(item => item.value === value)
watch(() => state.inspectorTab, (next, before) => { tabMotion.value = order(next) > order(before) ? 'view-forward' : 'view-back' })
const selectTab = (next: ResetInspectorTab) => { state.inspectorTab = next }
const tabKey = (event: KeyboardEvent) => {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  event.preventDefault()
  const next = tabs.value[(tabIndex.value + step + tabs.value.length) % tabs.value.length]
  selectTab(next.value)
  ;(event.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-tab="${next.value}"]`)?.focus()
}
// The anchor frame takes the canvas's orientation, so the nine points sit where they will land.
const frameWidth = computed(() => {
  const canvas = frame.value?.canvas
  const ratio = canvas && canvas.height > 0 ? canvas.width / canvas.height : 1.5
  return `${Math.round(Math.min(112, Math.max(48, 72 * ratio)))}px`
})
onMounted(() => { void loadPublicLogos() })
</script>

<template>
  <aside class="inspector">
    <div class="head">
      <span class="head-title">调整</span>
      <span class="head-sub" :title="current?.name">{{ current?.name ?? '未选择照片' }}</span>
      <span v-if="frame" class="head-size alr-num" title="导出尺寸">{{ frame.canvas.width }}×{{ frame.canvas.height }}</span>
    </div>

    <div class="page-bar" :class="{ inert: !current }">
      <div class="tabs" role="tablist" aria-label="调整内容" data-guide="pages" @keydown="pageKey">
        <span class="alr-slide tab-thumb" :style="{ transform: `translateX(${pageIndex * 100}%)` }" aria-hidden="true" />
        <button
          v-for="item in pages" :id="`${pagesId}-${item.value}`" :key="item.value" role="tab" :data-page="item.value"
          :aria-selected="state.page === item.value" :aria-controls="`${pagesId}-panel`" :tabindex="state.page === item.value ? 0 : -1"
          :class="{ on: state.page === item.value }" @click="actions.setPage(item.value)"
        >
          <component :is="item.icon" :size="13" />{{ item.label }}
          <span class="tab-dot" :class="{ lit: item.active }" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="page-stack">
    <UiMotionTransition :preset="pageMotion" mode="out-in">
    <div :id="`${pagesId}-panel`" :key="state.page" class="page-view" role="tabpanel" :aria-labelledby="`${pagesId}-${state.page}`">
    <div v-if="state.page === 'banner'" class="body alr-scroll" :class="{ inert: !current }"><ResetBannerPanel /></div>
    <div v-else-if="state.page === 'crop'" class="body alr-scroll" :class="{ inert: !current }"><ResetCropPanel /></div>
    <template v-else>
    <div class="body alr-scroll" :class="{ inert: !current }">
      <ResetSection title="LOGO" data-guide="library">
        <template #tail>
          <button
            class="alr-icon-btn tail-btn" :disabled="pickedCount < 2" aria-label="编组" :title="pickedCount < 2 ? '按住 Ctrl 选中两个以上 LOGO 后编组' : '编组（Ctrl+G）'"
            @click.stop="actions.groupSelection()"
          ><Group :size="14" /></button>
          <span class="alr-num tail-count">{{ scene?.layers.length ?? 0 }}/{{ RESET_MAX_LAYERS_PER_PHOTO }}</span>
        </template>
        <TransitionGroup
          tag="div" :name="listMotion" class="library" data-alr-logo-drop :class="{ dropping: logoDropping, replacing }"
          @dragenter="overLogo" @dragover="overLogo" @dragleave.stop="logoDropping = false" @drop="dropLogo"
        >
          <button
            v-for="asset in publicLogos" :key="`public-${asset.id}`" class="chip alr-checker public-chip"
            :title="replacing ? `换成公共 LOGO「${asset.originalName}」` : `添加公共 LOGO「${asset.originalName}」`"
            :aria-label="replacing ? `换成公共 LOGO ${asset.originalName}` : `添加公共 LOGO ${asset.originalName}`"
            @click="pickPublicLogo(asset)"
          >
            <img v-if="asset.previewDataUrl" :src="asset.previewDataUrl" alt="" :draggable="false" />
            <span v-else class="public-logo-fallback">LOGO</span>
            <span class="chip-plus"><Plus :size="12" /></span>
          </button>
          <button
            v-for="logo in state.logos" :key="logo.id" class="chip alr-checker"
            :title="replacing ? `换成「${logo.name}」` : `添加「${logo.name}」`" :aria-label="replacing ? `换成 LOGO ${logo.name}` : `添加 LOGO ${logo.name}`"
            @click="pickLogo(logo.id)"
          >
            <img :src="logo.url" alt="" :draggable="false" />
            <span class="chip-plus"><Plus :size="12" /></span>
          </button>
          <button key="__add" class="chip chip-add" aria-label="导入 LOGO" title="导入透明 PNG / WEBP / SVG，也可直接拖到这里" @click="addLogo">
            <Upload :size="14" />
          </button>
          <button v-if="publicLogoStatus === 'error'" key="__public-error" class="public-logo-error" type="button" @click="loadPublicLogos">
            公共 LOGO 读取失败，点击重试
          </button>
        </TransitionGroup>

        <ResetLayerList />
      </ResetSection>

      <UiMotionTransition preset="panel" mode="out-in">
      <div v-if="!layer" key="hint" class="hint alr-finder" data-guide="adjust">
        <span class="hint-icon"><Stamp :size="18" /></span>
        <span class="hint-title">{{ state.logos.length || publicLogos.length ? '选中或添加一个 LOGO' : '先导入一个 LOGO' }}</span>
        <button v-if="!state.logos.length && !publicLogos.length" class="alr-btn small" @click="addLogo"><Upload :size="13" />导入 LOGO</button>
      </div>
      <section v-else key="layer" class="adjust" aria-label="所选 LOGO" data-guide="adjust">
        <div class="adjust-bar">
          <div class="tabs" role="tablist" aria-label="LOGO 调整" data-guide="tabs" @keydown="tabKey">
            <span class="alr-slide tab-thumb" :style="{ transform: `translateX(${tabIndex * 100}%)` }" aria-hidden="true" />
            <button
              v-for="item in tabs" :id="`${tabsId}-${item.value}`" :key="item.value" role="tab" :data-tab="item.value"
              :aria-selected="tab === item.value" :aria-controls="`${tabsId}-panel`" :tabindex="tab === item.value ? 0 : -1"
              :class="{ on: tab === item.value }" @click="selectTab(item.value)"
            >
              <component :is="item.icon" :size="13" />{{ item.label }}
              <span class="tab-dot" :class="{ lit: item.active }" aria-hidden="true" />
            </button>
          </div>
          <button class="alr-icon-btn bar-btn" aria-label="复制这个 LOGO" title="复制" @click="actions.duplicateLayer()"><Copy :size="14" /></button>
          <button class="alr-icon-btn bar-btn danger" :disabled="layer.locked" aria-label="删除这个 LOGO" title="删除" @click="actions.removeLayer()"><Trash2 :size="14" /></button>
        </div>
        <button v-if="layer.locked" class="locked-note" @click="actions.toggleLayerLocked(layer.id)"><Lock :size="13" />已锁定，点此解锁后再调整</button>

        <!-- The card reaches the footer, so a shorter page never moves anything below it. -->
        <div class="adjust-pages" :class="{ inert: layer.locked }">
          <UiMotionTransition :preset="tabMotion" mode="out-in">
            <div :id="`${tabsId}-panel`" :key="tab" class="adjust-body" role="tabpanel" :aria-labelledby="`${tabsId}-${tab}`" :data-guide="`page-${tab}`">
              <template v-if="tab === 'place'">
                <div class="group" data-guide="align">
                  <div class="group-head"><span>对齐</span><span class="group-value">{{ layer.anchor ? ANCHOR_LABELS[layer.anchor] : '自由位置' }}</span></div>
                  <div class="anchor-stage">
                    <div class="anchors" role="radiogroup" aria-label="对齐位置" :style="{ width: frameWidth }">
                      <button
                        v-for="anchor in ANCHORS" :key="anchor" role="radio" :aria-checked="layer.anchor === anchor" :aria-label="ANCHOR_LABELS[anchor]"
                        :title="ANCHOR_LABELS[anchor]" :class="{ on: layer.anchor === anchor }" @click="actions.setAnchor(anchor)"
                      ><span /></button>
                    </div>
                  </div>
                  <ResetSlider label="边距" :model-value="layer.margin" :min="0" :max="25" :step="0.5" unit="%" :reset="4" @update:model-value="actions.setMargin" />
                </div>
                <div class="group" data-guide="size">
                  <div class="group-head"><span>尺寸与角度</span></div>
                  <ResetSlider label="大小" :model-value="layer.size" :min="2" :max="80" :step="0.5" unit="%" :reset="18" @update:model-value="actions.setSize" />
                  <ResetSlider label="旋转" :model-value="layer.rotation" :min="-180" :max="180" :step="0.5" unit="°" :reset="0" @update:model-value="actions.setRotation" />
                </div>
              </template>
              <template v-else-if="tab === 'look'">
                <div class="group">
                  <ResetSlider label="不透明度" :model-value="layer.opacity" :min="0" :max="100" unit="%" :reset="100" @update:model-value="actions.setOpacity" />
                </div>
                <div class="group" :class="{ dim: !layer.shadow.enabled }">
                  <label class="group-head">
                    <span>阴影</span>
                    <ResetSwitch label="启用阴影" :model-value="layer.shadow.enabled" @update:model-value="enabled => actions.setShadow({ enabled })" />
                  </label>
                  <UiCollapse :open="layer.shadow.enabled" class="group-collapse">
                    <div class="group-fields">
                      <label class="color-row">
                        <span>颜色</span>
                        <span class="color-value">
                          <span class="alr-mono">{{ layer.shadow.color.toUpperCase() }}</span>
                          <span class="swatch" :style="{ background: layer.shadow.color }">
                            <input type="color" :value="layer.shadow.color" aria-label="阴影颜色" @input="shadowColor" />
                          </span>
                        </span>
                      </label>
                      <ResetSlider label="不透明度" :model-value="layer.shadow.opacity" :min="0" :max="100" unit="%" :reset="65" @update:model-value="opacity => actions.setShadow({ opacity })" />
                      <ResetSlider label="模糊" :model-value="layer.shadow.blur" :min="0" :max="20" :step="0.5" unit="%" :reset="2.5" @update:model-value="blur => actions.setShadow({ blur })" />
                      <ResetSlider label="距离" :model-value="layer.shadow.distance" :min="0" :max="20" :step="0.5" unit="%" :reset="2.5" @update:model-value="distance => actions.setShadow({ distance })" />
                      <ResetSlider label="角度" :model-value="layer.shadow.angle" :min="0" :max="360" unit="°" :reset="45" @update:model-value="angle => actions.setShadow({ angle })" />
                    </div>
                  </UiCollapse>
                </div>
              </template>
              <template v-else>
                <div class="group" :class="{ dim: !layer.warp.enabled }">
                  <label class="group-head">
                    <span>透视变形</span>
                    <ResetSwitch label="启用透视变形" :model-value="layer.warp.enabled" @update:model-value="actions.setWarpEnabled" />
                  </label>
                  <p class="group-note">拖动画面上的四个角点，让 LOGO 贴合斜面。</p>
                  <UiCollapse :open="layer.warp.enabled" class="group-collapse">
                    <div class="row-actions">
                      <button class="alr-btn small" :aria-pressed="state.warpEditing" :class="{ pressed: state.warpEditing }" @click="state.warpEditing = !state.warpEditing">
                        {{ state.warpEditing ? '完成编辑' : '编辑角点' }}
                      </button>
                      <button class="alr-btn small" @click="actions.resetWarp()"><RotateCcw :size="13" />复位</button>
                    </div>
                  </UiCollapse>
                </div>
              </template>
            </div>
          </UiMotionTransition>
        </div>
      </section>
      </UiMotionTransition>
    </div>

    <!-- Photo-wide settings stay pinned under the logo card instead of riding on its height. -->
    <footer class="foot" :class="{ inert: !current }">
      <div class="foot-row" data-guide="render-mode">
        <span>渲染模式</span>
        <ResetSegmented class="foot-seg" label="渲染模式" :model-value="scene?.mode ?? 'normal'" :options="modes" @update:model-value="actions.setMode" />
      </div>
      <label class="foot-row" data-guide="face-avoid">
        <span>人脸避让</span>
        <ResetSwitch label="人脸避让" :model-value="scene?.faceAvoid ?? false" @update:model-value="actions.setFaceAvoid" />
      </label>
      <label class="foot-row" data-guide="safe-edge" title="LOGO 的图案始终完整留在照片里（四周透明的部分不算），不会拖出或转出画面">
        <span>安全边界</span>
        <ResetSwitch label="安全边界" :model-value="scene?.safeEdge ?? true" @update:model-value="actions.setSafeEdge" />
      </label>
    </footer>
    </template>
    </div>
    </UiMotionTransition>
    </div>
    <ResetConfirmDialog
      :open="!!pendingLogoPick"
      title="当前照片已有 LOGO"
      :message="`当前照片已经有 ${scene?.layers.length ?? 0} 个 LOGO，要继续添加「${pendingLogoPick?.name ?? ''}」吗？`"
      confirm-label="继续添加"
      @cancel="pendingLogoPick = null"
      @confirm="confirmLogoPick"
    />
  </aside>
</template>

<style scoped>
.inspector { display: flex; flex-direction: column; height: 100%; min-width: 0; overflow: hidden; background: var(--alr-panel-sheen), var(--alr-panel); box-shadow: var(--alr-edge); }
.head { display: flex; align-items: center; gap: 10px; flex: none; height: 48px; padding: 0 16px; border-bottom: 1px solid rgb(255 255 255 / .05); }
.head-title { font-size: 13px; font-weight: 500; }
.head-sub { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; color: var(--alr-mute); }
.head-size { flex: none; padding: 0 6px; border-radius: 4px; font-size: 10.5px; line-height: 18px; color: var(--alr-mute); background: rgb(255 255 255 / .04); box-shadow: var(--alr-bevel); }
.body { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow-y: auto; }
.inert { opacity: .4; pointer-events: none; }
.tail-count { font-size: 11px; color: var(--alr-mute); }
.tail-btn { width: 24px; height: 24px; margin-right: 4px; }
.tail-btn:disabled { opacity: .35; cursor: default; }
/* Pages hold their own scroll; the bar above them never moves. */
.page-bar { flex: none; padding: 8px 12px 4px; }
.page-bar .tabs { margin-right: 0; }
.page-stack { position: relative; flex: 1; min-height: 0; }
.page-view { position: absolute; inset: 0; display: flex; flex-direction: column; }
.library.replacing .chip { box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .45); }
.locked-note {
  display: flex; align-items: center; justify-content: center; gap: 6px; margin: 8px 10px 0; height: 30px; border-radius: 8px;
  font-size: 12px; color: var(--alr-accent); background: rgb(var(--alr-accent-rgb) / .08); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .25);
  transition: var(--alr-hover);
}
.locked-note:hover { background: rgb(var(--alr-accent-rgb) / .13); }
.bar-btn:disabled { opacity: .35; cursor: default; }

.library { position: relative; display: grid; grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); gap: 6px; padding: 6px; margin: -6px; border-radius: var(--alr-r-l); transition: var(--alr-hover); }
.library.dropping { background: rgb(var(--alr-accent-rgb) / .07); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .5); }
.public-logo-fallback { display: grid; place-items: center; width: 46px; height: 36px; color: var(--alr-mute); font-size: 9px; }
.public-chip { box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .2), var(--alr-bevel); }
.public-chip::after { content: '公共'; position: absolute; left: 4px; top: 4px; padding: 1px 3px; border-radius: 3px; color: var(--alr-accent-ink); background: var(--alr-accent-fill); font-size: 8px; line-height: 1.1; }
.public-logo-error { grid-column: 1 / -1; padding: 6px; color: var(--alr-accent); font-size: 10px; text-align: left; }
.chip { position: relative; aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: var(--alr-r-m); box-shadow: var(--alr-bevel); transition: var(--alr-hover), var(--alr-press); }
.chip:hover { box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .55), 0 4px 14px rgb(0 0 0 / .35); }
.chip:active { transform: scale(.94); }
.chip img { max-width: 76%; max-height: 76%; object-fit: contain; transition: transform var(--duration-base) var(--easing-emphasized); }
.chip:hover img { transform: scale(1.06); }
.chip-plus {
  position: absolute; right: 4px; bottom: 4px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 999px;
  color: var(--alr-accent-ink); background: var(--alr-accent-fill); box-shadow: 0 1px 3px rgb(0 0 0 / .5);
  opacity: 0; transform: scale(.6); transition: opacity var(--duration-fast) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized);
}
.chip:hover .chip-plus { opacity: 1; transform: none; }
.chip-add { color: var(--alr-mute); background: rgb(255 255 255 / .02); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .09); }
.chip-add:hover { color: var(--alr-accent); background: rgb(var(--alr-accent-rgb) / .06); }

.hint { display: flex; flex-direction: column; align-items: center; gap: 10px; margin: 8px 16px 16px; padding: 24px 16px; border-radius: var(--alr-r-l); background: rgb(255 255 255 / .015); text-align: center; }
.hint-icon {
  display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; color: var(--alr-accent);
  background: radial-gradient(circle at 50% 30%, rgb(var(--alr-accent-rgb) / .2), rgb(var(--alr-accent-rgb) / .06)); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .2);
}
.hint-title { font-size: 12.5px; color: var(--alr-ink-2); }
.small { height: 28px; padding: 0 11px; font-size: 12px; gap: 6px; }
.pressed { color: var(--alr-accent); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .45); }

/* The selected logo's settings: one raised plate, three category pages. */
.adjust {
  display: flex; flex-direction: column; flex: 1 0 auto; margin: 4px 12px 12px; border-radius: 12px; overflow: hidden;
  background: linear-gradient(180deg, rgb(255 255 255 / .035), rgb(255 255 255 / .012) 120px), var(--alr-panel-2);
  box-shadow: var(--alr-edge), var(--alr-bevel), var(--alr-lift-1);
}
.adjust-bar { display: flex; align-items: center; gap: 2px; padding: 8px 8px 8px 8px; box-shadow: inset 0 -1px 0 rgb(0 0 0 / .35), 0 1px 0 rgb(255 255 255 / .03); }
.tabs { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: 1; min-width: 0; margin-right: 4px; padding: 2px; border-radius: 9px; background: var(--alr-sunken); box-shadow: var(--alr-well); }
.tab-thumb {
  top: 2px; left: 2px; height: calc(100% - 4px); width: calc((100% - 4px) / 3); border-radius: 7px;
  background: linear-gradient(180deg, rgb(255 255 255 / .11), rgb(255 255 255 / .06)), var(--alr-raise); box-shadow: var(--alr-edge), var(--alr-bevel), 0 1px 3px rgb(0 0 0 / .45);
}
.tabs button {
  position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 5px; height: 28px; padding: 0 4px; border-radius: 7px;
  font-size: 12px; color: var(--alr-mute); white-space: nowrap; transition: color var(--duration-fast) var(--easing-standard);
}
.tabs button:hover { color: var(--alr-ink-2); }
.tabs button.on { color: var(--alr-ink); font-weight: 500; }
.tabs button :deep(svg) { flex: none; transition: color var(--duration-fast) var(--easing-standard); }
.tabs button.on :deep(svg) { color: var(--alr-accent); }
.tabs button:focus-visible { outline: none; box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .6); }
/* A lit dot tells which pages already change the logo. */
.tab-dot {
  width: 5px; height: 5px; margin-left: -1px; border-radius: 999px; background: var(--alr-accent); box-shadow: 0 0 6px rgb(var(--alr-accent-rgb) / .8);
  opacity: 0; transform: scale(.4); transition: opacity var(--duration-fast) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized);
}
.tab-dot.lit { opacity: 1; transform: none; }
.bar-btn { width: 30px; height: 30px; flex: none; }
.bar-btn.danger:hover { color: var(--alr-danger); background: rgb(var(--rgb-danger) / .1); }

.adjust-pages { flex: 1; }
.adjust-body { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
.group {
  display: flex; flex-direction: column; gap: 12px; padding: 12px 12px 14px; border-radius: 10px;
  background: rgb(0 0 0 / .14); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .04);
  transition: background-color var(--duration-base) var(--easing-standard);
}
.group.dim { background: rgb(0 0 0 / .08); }
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; font-size: 12.5px; font-weight: 500; color: var(--alr-ink); }
.group.dim .group-head > span:first-child { color: var(--alr-ink-2); }
.group-value { font-size: 11.5px; font-weight: 400; color: var(--alr-accent); }
/* The parent gap moves inside the collapse, so a closed group ends right under its header. */
.group-collapse { margin-top: -12px; }
.group-fields { display: flex; flex-direction: column; gap: 12px; padding-top: 14px; }
.group-note { margin: -4px 0 0; font-size: 11.5px; line-height: 1.55; color: var(--alr-mute); }
.row-actions { display: flex; gap: 6px; }
.group-collapse .row-actions { padding-top: 12px; }

/* A miniature of the photo: nine snap points sit where the logo would land. */
.anchor-stage { display: grid; place-items: center; padding: 10px 0 4px; }
.anchors {
  display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); height: 72px; padding: 3px; border-radius: 6px;
  background: linear-gradient(160deg, rgb(255 255 255 / .07), rgb(255 255 255 / .02)), var(--alr-sunken);
  box-shadow: var(--alr-well), 0 0 0 1px rgb(255 255 255 / .05), 0 6px 16px rgb(0 0 0 / .35);
}
.anchors button { display: grid; place-items: center; border-radius: 4px; transition: var(--alr-hover); }
.anchors button span {
  width: 6px; height: 6px; border-radius: 999px; background: rgb(255 255 255 / .2);
  transition: background-color var(--duration-fast) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized), box-shadow var(--duration-fast) var(--easing-standard);
}
.anchors button:hover { background: rgb(255 255 255 / .05); }
.anchors button:hover span { background: var(--alr-ink-2); transform: scale(1.2); }
.anchors button.on { background: rgb(var(--alr-accent-rgb) / .12); }
.anchors button.on span { background: var(--alr-accent); transform: scale(1.5); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .75); }

.color-row { display: flex; align-items: center; justify-content: space-between; min-height: 24px; font-size: 12px; color: var(--alr-ink-2); }
.color-value { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--alr-mute); }
.swatch { position: relative; width: 22px; height: 22px; overflow: hidden; border-radius: 999px; box-shadow: 0 0 0 1px rgb(255 255 255 / .2), 0 1px 3px rgb(0 0 0 / .5); cursor: pointer; transition: var(--alr-press); }
.swatch:hover { transform: scale(1.08); }
.swatch input { position: absolute; inset: -6px; width: calc(100% + 12px); height: calc(100% + 12px); opacity: 0; cursor: pointer; }
.foot {
  flex: none; display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 14px;
  background: rgb(0 0 0 / .14); box-shadow: inset 0 1px 0 rgb(255 255 255 / .05);
}
.foot-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; font-size: 12px; color: var(--alr-ink-2); }
.foot-seg { flex: none; width: 176px; }
@media (prefers-reduced-motion: reduce) { .tab-dot { transform: none; } }
</style>
