<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'
import UiCollapse from '../../../components/UiCollapse.vue'
import ResetSegmented from '../ui/ResetSegmented.vue'
import ResetSlider from '../ui/ResetSlider.vue'
import ResetSwitch from '../ui/ResetSwitch.vue'
import { useWorkspace } from '../state/context'
import type { ResetBanner, ResetBannerEdges } from '../state/types'

const { actions, scene, frame } = useWorkspace()

const banner = computed(() => scene.value?.banner ?? null)
const modes: ReadonlyArray<{ value: ResetBanner['mode'], label: string, title: string }> = [
  { value: 'outset', label: '向外扩展', title: '在照片四周加边，画面变大' },
  { value: 'inset', label: '向内覆盖', title: '色带盖住照片边缘，尺寸不变' },
  { value: 'cinematic', label: '宽荧幕', title: '上下黑边，照片可上下移动' }
]
const fills: ReadonlyArray<{ value: ResetBannerEdges['fill'], label: string }> = [
  { value: 'white', label: '白色' },
  { value: 'black', label: '黑色' }
]
const edges = computed(() => banner.value && banner.value.mode !== 'cinematic' ? banner.value[banner.value.mode] : null)
// Inset bands always leave part of the photo showing.
const edgeMax = computed(() => banner.value?.mode === 'inset' ? 45 : 100)
const sides: ReadonlyArray<{ key: 'top' | 'bottom' | 'left' | 'right', label: string }> = [
  { key: 'top', label: '上' }, { key: 'bottom', label: '下' }, { key: 'left', label: '左' }, { key: 'right', label: '右' }
]

// The modes are ordered, so switching moves toward the one it opens; the old controls leave first.
const order = (mode: ResetBanner['mode'] | undefined) => modes.findIndex(item => item.value === mode)
const motion = ref<'view-forward' | 'view-back'>('view-forward')
watch(() => banner.value?.mode, (next, before) => { motion.value = order(next) >= order(before) ? 'view-forward' : 'view-back' })
const pageKey = computed(() => banner.value?.mode === 'cinematic' ? 'cinematic' : 'edges')
</script>

<template>
  <div v-if="banner" class="banner-panel" data-guide="banner">
    <div class="group" :class="{ dim: !banner.enabled }">
      <label class="group-head">
        <span>横幅扩展</span>
        <ResetSwitch label="启用横幅扩展" :model-value="banner.enabled" @update:model-value="enabled => actions.setBanner({ enabled })" />
      </label>
      <UiCollapse :open="banner.enabled" class="group-collapse">
        <div class="group-fields">
          <ResetSegmented label="扩展方式" :model-value="banner.mode" :options="modes" @update:model-value="mode => actions.setBanner({ mode })" />
          <div class="mode-pages">
            <UiMotionTransition :preset="motion" mode="out-in">
              <div v-if="pageKey === 'edges' && edges" key="edges" class="fields">
                <div class="row">
                  <span>颜色</span>
                  <ResetSegmented class="fill-seg" label="横幅颜色" :model-value="edges.fill" :options="fills" @update:model-value="fill => actions.setBannerEdges({ fill })" />
                </div>
                <ResetSlider
                  v-for="side in sides" :key="`${banner.mode}-${side.key}`" :label="side.label" :model-value="edges[side.key]" :min="0" :max="edgeMax" unit="%" :reset="0"
                  @update:model-value="value => actions.setBannerEdges({ [side.key]: value })"
                />
              </div>
              <div v-else key="cinematic" class="fields">
                <ResetSlider label="黑边高度" :model-value="banner.cinematic.strength" :min="0" :max="40" unit="%" :reset="12" @update:model-value="strength => actions.setCinematic({ strength })" />
                <ResetSlider label="画面上下" :model-value="banner.cinematic.offsetY" :min="-100" :max="100" :reset="0" @update:model-value="offsetY => actions.setCinematic({ offsetY })" />
              </div>
            </UiMotionTransition>
          </div>
        </div>
      </UiCollapse>
    </div>
    <div v-if="frame" class="size-row">
      <span>导出尺寸</span>
      <span class="alr-num size">{{ frame.canvas.width }} × {{ frame.canvas.height }}</span>
    </div>
  </div>
</template>

<style scoped>
.banner-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.group {
  display: flex; flex-direction: column; gap: 12px; padding: 12px 12px 14px; border-radius: 10px;
  background: rgb(0 0 0 / .14); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .04);
  transition: background-color var(--duration-base) var(--easing-standard);
}
.group.dim { background: rgb(0 0 0 / .08); }
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; font-size: 12.5px; font-weight: 500; color: var(--alr-ink); }
.group-collapse { margin-top: -12px; }
.group-fields { display: flex; flex-direction: column; gap: 14px; padding-top: 14px; }
.fields { display: flex; flex-direction: column; gap: 12px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 28px; font-size: 12px; color: var(--alr-ink-2); }
.fill-seg { width: 132px; flex: none; }
.size-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; font-size: 11.5px; color: var(--alr-mute); }
.size { color: var(--alr-ink-2); }
</style>
