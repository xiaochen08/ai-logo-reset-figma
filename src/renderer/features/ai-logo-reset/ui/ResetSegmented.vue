<script setup lang="ts" generic="T extends string">
import { computed } from 'vue'

const props = defineProps<{ modelValue: T, options: ReadonlyArray<{ value: T, label: string, title?: string }>, label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()

const index = computed(() => props.options.findIndex(option => option.value === props.modelValue))
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="label" :style="{ '--seg-count': options.length }">
    <div class="track">
      <span class="alr-slide thumb" :style="{ width: `${100 / options.length}%`, transform: `translateX(${Math.max(0, index) * 100}%)`, opacity: index < 0 ? 0 : 1 }" aria-hidden="true" />
      <button
        v-for="option in options" :key="option.value" role="radio" :aria-checked="modelValue === option.value" :title="option.title"
        :class="{ on: modelValue === option.value }" @click="emit('update:modelValue', option.value)"
      >{{ option.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.seg { padding: 2px; border-radius: var(--alr-r-m); background: var(--alr-sunken); box-shadow: var(--alr-well); }
.track { position: relative; display: grid; grid-template-columns: repeat(var(--seg-count), minmax(0, 1fr)); border-radius: 6px; }
.thumb { background: linear-gradient(180deg, rgb(255 255 255 / .1), rgb(255 255 255 / .06)), var(--alr-raise); box-shadow: var(--alr-edge), var(--alr-bevel), 0 1px 3px rgb(0 0 0 / .4); }
.seg button { position: relative; z-index: 1; height: 26px; padding: 0 6px; border-radius: 6px; font-size: 12px; color: var(--alr-mute); white-space: nowrap; transition: color var(--duration-fast) var(--easing-standard); }
.seg button:hover { color: var(--alr-ink-2); }
.seg button.on { color: var(--alr-ink); font-weight: 500; }
</style>
