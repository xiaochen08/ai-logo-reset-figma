<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftRight, Check, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Ruler } from '@lucide/vue'
import ResetSlider from '../ui/ResetSlider.vue'
import { useWorkspace } from '../state/context'
import { AI_LOGO_RESET_CROP_PRESETS } from '../../../../shared/aiLogoReset.ts'

const { state, actions, scene, frame } = useWorkspace()

const crop = computed(() => scene.value?.crop ?? null)
const aspects = [
  { id: 'original', label: '原始' },
  { id: 'free', label: '自由' },
  ...AI_LOGO_RESET_CROP_PRESETS.map(preset => ({ id: preset.id, label: preset.label.split(' / ')[0] }))
]
// A square, or no ratio at all, has no other way round.
const canSwap = computed(() => !!crop.value && crop.value.aspect !== 'free' && crop.value.aspect !== '1x1')
const changed = computed(() => {
  const value = crop.value
  return !!value && (value.x > 0 || value.y > 0 || value.width < 1 || value.height < 1 || value.quarterTurns > 0 || value.flipH || value.flipV || value.angle !== 0 || value.aspect !== 'original' || value.swapped)
})
</script>

<template>
  <div v-if="crop" class="crop-panel" data-guide="crop">
    <div class="group">
      <div class="group-head">
        <span>比例</span>
        <button class="alr-icon-btn head-btn" :class="{ pressed: crop.swapped }" :disabled="!canSwap" aria-label="横竖互换" title="横竖互换" @click="actions.setCropAspect(crop.aspect, !crop.swapped)">
          <ArrowLeftRight :size="14" />
        </button>
      </div>
      <div class="aspects" role="radiogroup" aria-label="裁切比例">
        <button
          v-for="aspect in aspects" :key="aspect.id" role="radio" class="aspect alr-num" :aria-checked="crop.aspect === aspect.id" :class="{ on: crop.aspect === aspect.id }"
          @click="actions.setCropAspect(aspect.id, aspect.id === crop.aspect ? crop.swapped : false)"
        >{{ aspect.label }}</button>
      </div>
    </div>

    <div class="group">
      <div class="group-head"><span>旋转与翻转</span></div>
      <div class="tools">
        <button class="alr-btn small" aria-label="向左旋转 90°" title="向左旋转 90°" @click="actions.turnCrop(-1)"><RotateCcw :size="14" /></button>
        <button class="alr-btn small" aria-label="向右旋转 90°" title="向右旋转 90°" @click="actions.turnCrop(1)"><RotateCw :size="14" /></button>
        <button class="alr-btn small" :class="{ pressed: crop.flipH }" :aria-pressed="crop.flipH" aria-label="水平翻转" title="水平翻转" @click="actions.flipCrop('flipH')"><FlipHorizontal2 :size="14" /></button>
        <button class="alr-btn small" :class="{ pressed: crop.flipV }" :aria-pressed="crop.flipV" aria-label="垂直翻转" title="垂直翻转" @click="actions.flipCrop('flipV')"><FlipVertical2 :size="14" /></button>
      </div>
      <ResetSlider label="拉直" :model-value="crop.angle" :min="-45" :max="45" :step="0.1" unit="°" :reset="0" @update:model-value="actions.setCropAngle" />
      <button class="alr-btn small level" :class="{ pressed: state.straightening }" :aria-pressed="state.straightening" @click="state.straightening = !state.straightening">
        <Ruler :size="13" />{{ state.straightening ? '在照片上沿水平线拖动' : '拉直工具' }}
      </button>
    </div>

    <div v-if="frame" class="size-row">
      <span>裁切后</span>
      <span class="alr-num size">{{ frame.crop.width }} × {{ frame.crop.height }}</span>
    </div>
    <div class="actions">
      <button class="alr-btn small" :disabled="!changed" @click="actions.resetCrop()"><RotateCcw :size="13" />复位</button>
      <button class="alr-btn alr-btn--primary small" @click="actions.setPage('logo')"><Check :size="13" />完成</button>
    </div>
  </div>
</template>

<style scoped>
.crop-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
.group {
  display: flex; flex-direction: column; gap: 12px; padding: 12px 12px 14px; border-radius: 10px;
  background: rgb(0 0 0 / .14); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .04);
}
.group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 22px; font-size: 12.5px; font-weight: 500; color: var(--alr-ink); }
.head-btn { width: 26px; height: 26px; }
.head-btn:disabled { opacity: .35; cursor: default; }
.aspects { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.aspect {
  height: 28px; padding: 0 4px; border-radius: 7px; font-size: 11.5px; color: var(--alr-ink-2); white-space: nowrap;
  background: rgb(255 255 255 / .03); box-shadow: var(--alr-bevel); transition: var(--alr-hover), var(--alr-press);
}
.aspect:hover { color: var(--alr-ink); background: rgb(255 255 255 / .06); }
.aspect:active { transform: scale(.96); }
.aspect.on { color: var(--alr-accent-ink); background: var(--alr-accent-fill); box-shadow: inset 0 1px 0 rgb(255 255 255 / .3); }
.tools { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.small { height: 28px; padding: 0 11px; font-size: 12px; gap: 6px; justify-content: center; }
.pressed { color: var(--alr-accent); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .45); }
.level { align-self: flex-start; }
.size-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 0; font-size: 11.5px; color: var(--alr-mute); }
.size { color: var(--alr-ink-2); }
.actions { display: flex; justify-content: flex-end; gap: 6px; padding-top: 4px; }
</style>
