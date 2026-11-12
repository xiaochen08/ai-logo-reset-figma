<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import { X } from '@lucide/vue'
import UiMotionTransition from '../../../components/UiMotionTransition.vue'

/** bodyHeight: a fixed frame for dialogs whose content changes, so the window never resizes or scrolls. */
const props = withDefaults(defineProps<{ open: boolean, title: string, width?: number, bodyHeight?: number, closable?: boolean }>(), { width: 440, bodyHeight: undefined, closable: true })
const emit = defineEmits<{ close: [] }>()
const titleId = useId()
const surface = ref<HTMLElement | null>(null)

watch(() => props.open, async open => {
  if (!open) return
  await nextTick()
  surface.value?.focus()
})

const onKeydown = (event: KeyboardEvent) => {
  event.stopPropagation()
  if (event.key === 'Escape' && props.closable) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <UiMotionTransition preset="dialog">
      <div v-if="open" class="alr-modal-overlay alr-portal" role="presentation" @mousedown.self="closable && emit('close')">
        <div
          ref="surface" class="alr-modal ui-motion-dialog-surface alr-glass-portal" role="dialog" aria-modal="true"
          :aria-labelledby="titleId" tabindex="-1" :style="{ width: `min(${width}px, calc(100vw - 48px))` }" @keydown="onKeydown"
        >
          <header class="alr-modal-head">
            <h2 :id="titleId">{{ title }}</h2>
            <button v-if="closable" class="alr-modal-x" aria-label="关闭" @click="emit('close')"><X :size="15" /></button>
          </header>
          <div class="alr-modal-body" :class="{ 'is-fixed': bodyHeight }" :style="bodyHeight ? { height: `${bodyHeight}px` } : undefined"><slot /></div>
          <footer v-if="$slots.actions" class="alr-modal-foot">
            <div v-if="$slots.aside" class="alr-modal-aside"><slot name="aside" /></div>
            <slot name="actions" />
          </footer>
        </div>
      </div>
    </UiMotionTransition>
  </Teleport>
</template>

<style>
/* Teleported outside .alr-root, so the palette is spelled out here. */
.alr-modal-overlay {
  position: fixed; inset: 0; z-index: 1500; display: grid; place-items: center; padding: 24px;
  background: radial-gradient(80% 70% at 50% 45%, rgb(0 0 0 / .35), rgb(0 0 0 / .6));
  font-family: "Jost", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif; color: var(--alr-ink); font-size: 13px; line-height: 1.5;
}
.alr-modal { display: flex; flex-direction: column; max-height: calc(100vh - 48px); overflow: hidden; outline: none; border-radius: 14px; box-shadow: var(--alr-edge), var(--alr-bevel-strong), var(--alr-lift-3); }
.alr-modal-head { display: flex; align-items: center; justify-content: space-between; flex: none; height: 52px; padding: 0 14px 0 22px; }
.alr-modal-head h2 { margin: 0; font-size: 15px; font-weight: 500; }
.alr-modal .alr-modal-x {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 7px; color: var(--alr-mute); background: none; border: 0; cursor: pointer;
  transition: color var(--duration-fast) var(--easing-standard), background-color var(--duration-fast) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized);
}
.alr-modal .alr-modal-x:hover { color: var(--alr-ink); background: rgb(255 255 255 / .06); }
.alr-modal .alr-modal-x:active { transform: scale(.92); }
.alr-modal-body { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 22px 20px; }
.alr-modal-body.is-fixed { flex: none; overflow: hidden; }
.alr-modal-aside { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; margin-right: 12px; font-size: 12px; color: var(--alr-mute); }
.alr-modal-foot { display: flex; justify-content: flex-end; gap: 8px; flex: none; padding: 14px 18px; background: rgb(0 0 0 / .16); box-shadow: inset 0 1px 0 rgb(255 255 255 / .05); }
.alr-modal .alr-modal-foot button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 34px; padding: 0 18px; border-radius: 9px; font: inherit; font-size: 13px;
  color: var(--alr-ink-2); background: linear-gradient(180deg, rgb(255 255 255 / .07), rgb(255 255 255 / .035)); border: 0;
  box-shadow: var(--alr-edge), var(--alr-bevel), 0 1px 2px rgb(0 0 0 / .3); cursor: pointer;
  transition: background-color var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard), box-shadow var(--duration-fast) var(--easing-standard), transform var(--duration-base) var(--easing-emphasized);
}
.alr-modal .alr-modal-foot button:hover:not(:disabled) { color: var(--alr-ink); background: linear-gradient(180deg, rgb(255 255 255 / .1), rgb(255 255 255 / .05)); }
.alr-modal .alr-modal-foot button:active:not(:disabled) { transform: scale(.97); }
.alr-modal .alr-modal-foot button:disabled { opacity: .4; cursor: default; }
.alr-modal .alr-modal-foot button.is-primary {
  background: var(--alr-accent-fill); color: var(--alr-accent-ink); font-weight: 500;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .35), inset 0 -1px 0 rgb(120 80 0 / .25), 0 1px 2px rgb(0 0 0 / .4), 0 6px 18px rgb(var(--alr-accent-rgb) / .18);
}
.alr-modal .alr-modal-foot button.is-primary:hover:not(:disabled) { background: var(--alr-accent-fill); color: var(--alr-accent-ink); box-shadow: inset 0 1px 0 rgb(255 255 255 / .45), inset 0 -1px 0 rgb(120 80 0 / .25), 0 1px 2px rgb(0 0 0 / .4), 0 8px 26px rgb(var(--alr-accent-rgb) / .3); }
.alr-modal .alr-modal-foot button.is-danger { background: linear-gradient(180deg, rgb(218 106 112), rgb(190 82 88)); color: rgb(255 255 255); font-weight: 500; box-shadow: inset 0 1px 0 rgb(255 255 255 / .25), 0 1px 2px rgb(0 0 0 / .4); }
@media (prefers-reduced-motion: reduce) {
  .alr-modal .alr-modal-foot button:active, .alr-modal .alr-modal-x:active { transform: none; }
}
</style>
