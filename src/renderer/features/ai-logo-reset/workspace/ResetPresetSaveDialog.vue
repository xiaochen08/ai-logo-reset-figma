<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Crop, PanelBottom } from '@lucide/vue'
import ResetModal from '../ui/ResetModal.vue'
import ResetSwitch from '../ui/ResetSwitch.vue'
import { aiLogoResetNextPresetName } from '../../../../shared/aiLogoResetPresets.ts'
import { AI_LOGO_RESET_LIMITS } from '../../../../shared/aiLogoReset.ts'
import { useWorkspace } from '../state/context'
import { presetStore } from '../state/presets'

const props = defineProps<{ open: boolean, busy: boolean }>()
const emit = defineEmits<{ cancel: [], save: [name: string, includeBanner: boolean] }>()
const { scene, logoById } = useWorkspace()

const name = ref('')
const includeBanner = ref(false)
const input = ref<HTMLInputElement | null>(null)
const fallbackName = computed(() => aiLogoResetNextPresetName(presetStore.items.map(item => item.name)))
const logos = computed(() => (scene.value?.layers ?? []).map(layer => ({ layer, logo: logoById(layer.logoId) })).filter(item => item.logo).reverse())
const groupCount = computed(() => scene.value?.groups.length ?? 0)
const bannerOn = computed(() => scene.value?.banner.enabled ?? false)
const bannerLabel = computed(() => {
  const banner = scene.value?.banner
  if (!banner?.enabled) return '当前未启用；打开后，套用时会关闭目标照片的横幅'
  return `当前为「${{ outset: '向外扩展', inset: '向内覆盖', cinematic: '宽荧幕' }[banner.mode]}」，套用时一并带上`
})

watch(() => props.open, async open => {
  if (!open) return
  name.value = ''
  includeBanner.value = bannerOn.value
  await nextTick()
  input.value?.focus()
})

const submit = () => {
  if (props.busy || !logos.value.length) return
  emit('save', name.value.trim() || fallbackName.value, includeBanner.value)
}
</script>

<template>
  <ResetModal :open="open" title="存为预设" :width="420" @close="emit('cancel')">
    <div class="form">
      <label class="field">
        <span class="field-label">名称</span>
        <input
          ref="input" v-model="name" class="name" :placeholder="fallbackName" :maxlength="AI_LOGO_RESET_LIMITS.nameLength"
          aria-label="预设名称" @keydown.enter.prevent="submit" @keydown.stop
        />
      </label>

      <div class="field">
        <span class="field-label">
          将保存 <b class="alr-num">{{ logos.length }}</b> 个 LOGO<template v-if="groupCount">、{{ groupCount }} 个编组</template>，以及位置、大小、效果和渲染方式
        </span>
        <div class="thumbs">
          <span v-for="item in logos" :key="item.layer.id" class="thumb alr-checker" :class="{ off: !item.layer.visible }" :title="item.logo!.name">
            <img :src="item.logo!.url" alt="" :draggable="false" />
          </span>
        </div>
      </div>

      <label class="option">
        <PanelBottom :size="14" class="option-icon" />
        <span class="option-text"><b>同时保存横幅</b><span>{{ bannerLabel }}</span></span>
        <ResetSwitch v-model="includeBanner" label="同时保存横幅" />
      </label>
      <p class="note"><Crop :size="12" />裁切按每张照片单独保存，不会存进预设。</p>
    </div>
    <template #actions>
      <button @click="emit('cancel')">取消</button>
      <button class="is-primary" :disabled="busy || !logos.length" @click="submit">{{ busy ? '正在保存…' : '保存预设' }}</button>
    </template>
  </ResetModal>
</template>

<style scoped>
.form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 7px; }
.field-label { font-size: 12px; color: var(--alr-mute); }
.field-label b { font-weight: 500; color: var(--alr-ink); }
.name {
  height: 34px; padding: 0 10px; border-radius: 8px; font: inherit; font-size: 13px; color: var(--alr-ink);
  background: var(--alr-sunken); border: 0; box-shadow: var(--alr-well); outline: none; transition: var(--alr-hover);
}
.name::placeholder { color: var(--alr-mute); }
.name:focus { box-shadow: var(--alr-well), 0 0 0 1px rgb(var(--alr-accent-rgb) / .6), 0 0 0 4px rgb(var(--alr-accent-rgb) / .12); }
.thumbs { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; border-radius: 10px; background: var(--alr-sunken); box-shadow: var(--alr-well); }
.thumb { display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 7px; box-shadow: var(--alr-bevel), 0 1px 2px rgb(0 0 0 / .4); }
.thumb.off { opacity: .45; }
.thumb img { max-width: 82%; max-height: 82%; object-fit: contain; }
.option {
  display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; cursor: pointer;
  background: rgb(255 255 255 / .025); box-shadow: inset 0 0 0 1px rgb(255 255 255 / .05);
}
.option-icon { flex: none; color: var(--alr-accent); }
.option-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.option-text b { font-size: 12.5px; font-weight: 500; color: var(--alr-ink); }
.option-text span { font-size: 11.5px; color: var(--alr-mute); }
.note { display: flex; align-items: center; gap: 6px; margin: -4px 0 0; font-size: 11.5px; color: var(--alr-mute); }
</style>
