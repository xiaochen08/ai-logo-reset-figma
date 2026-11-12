<script setup lang="ts">
import { ref, useId } from 'vue'
import { ChevronDown } from '@lucide/vue'
import UiCollapse from '../../../components/UiCollapse.vue'

const props = withDefaults(defineProps<{ title: string, defaultOpen?: boolean, dot?: boolean }>(), { defaultOpen: true, dot: false })
const open = ref(props.defaultOpen)
const bodyId = useId()
</script>

<template>
  <section class="section">
    <!-- The row toggles on click; the title button is the accessible control and the tail keeps its own controls. -->
    <div class="head" @click="open = !open">
      <button class="toggle" :aria-expanded="open" :aria-controls="bodyId" @click.stop="open = !open">
        <span class="title">{{ title }}</span>
        <span v-if="dot" class="dot" aria-hidden="true" />
      </button>
      <span class="tail" @click.stop><slot name="tail" /></span>
      <ChevronDown :size="14" class="chev" :class="{ closed: !open }" aria-hidden="true" />
    </div>
    <UiCollapse :id="bodyId" :open="open"><div class="body"><slot /></div></UiCollapse>
  </section>
</template>

<style scoped>
.section { position: relative; }
.section + .section::before { content: ''; position: absolute; left: 16px; right: 16px; top: 0; height: 1px; background: rgb(255 255 255 / .05); }
.head { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 12px 0 16px; cursor: pointer; }
.toggle { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; height: 100%; text-align: left; }
.title { font-size: 12.5px; font-weight: 500; color: var(--alr-ink-2); transition: color var(--duration-fast) var(--easing-standard); }
.head:hover .title { color: var(--alr-ink); }
.dot { width: 6px; height: 6px; border-radius: 999px; background: var(--alr-accent); box-shadow: 0 0 8px rgb(var(--alr-accent-rgb) / .7); }
.tail { display: flex; align-items: center; gap: 6px; cursor: default; }
.chev { flex: none; color: var(--alr-mute); transition: transform var(--duration-base) var(--easing-emphasized), color var(--duration-fast) var(--easing-standard); }
.head:hover .chev { color: var(--alr-ink-2); }
.chev.closed { transform: rotate(-90deg); }
.body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
</style>
