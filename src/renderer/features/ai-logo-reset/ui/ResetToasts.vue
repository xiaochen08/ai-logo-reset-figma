<script setup lang="ts">
import { CircleAlert, CircleCheck, Info, X } from '@lucide/vue'
import { resolveUiMotionTransitionName } from '../../../animation/motionPresets'
import { dismissToast, toasts } from '../state/toasts'

const icons = { info: Info, ok: CircleCheck, error: CircleAlert }
</script>

<template>
  <Teleport to="body">
    <div class="alr-toasts alr-portal" aria-live="polite">
      <TransitionGroup :name="resolveUiMotionTransitionName('status')">
        <div v-for="toast in toasts" :key="toast.id" class="alr-toast" :class="`is-${toast.tone}`" role="status">
          <component :is="icons[toast.tone]" :size="15" class="alr-toast-icon" />
          <div class="alr-toast-text">
            <div class="alr-toast-title">{{ toast.title }}</div>
            <div v-if="toast.detail" class="alr-toast-detail">{{ toast.detail }}</div>
          </div>
          <button class="alr-toast-close" aria-label="关闭提示" @click="dismissToast(toast.id)"><X :size="13" /></button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/* Top-left, just under the tool's 48px top bar; the newest sits at the bottom of the stack. */
.alr-toasts {
  position: fixed; left: 18px; top: 58px; z-index: 2000;
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px; pointer-events: none;
  font-family: "Jost", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
}
.alr-toast {
  position: relative; overflow: hidden; pointer-events: auto; display: flex; align-items: flex-start; gap: 10px;
  min-width: 260px; max-width: 380px; padding: 11px 10px 11px 14px; border-radius: 12px;
  background: linear-gradient(180deg, rgb(255 255 255 / .05), rgb(255 255 255 / .02)), var(--alr-panel-2);
  box-shadow: var(--alr-edge), var(--alr-bevel-strong), var(--alr-lift-2);
  color: var(--alr-ink); font-size: 12.5px; line-height: 1.45;
}
/* A tone strip on the leading edge says ok / error before the text is read. */
.alr-toast::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px; border-radius: 2px; background: rgb(255 255 255 / .2); }
.alr-toast.is-ok::before { background: var(--alr-ok); box-shadow: 0 0 8px rgb(var(--rgb-success) / .6); }
.alr-toast.is-error::before { background: var(--alr-danger); box-shadow: 0 0 8px rgb(var(--rgb-danger) / .6); }
.alr-toast-icon { flex: none; margin-top: 2px; color: var(--alr-ink-2); }
.alr-toast.is-ok .alr-toast-icon { color: var(--alr-ok); }
.alr-toast.is-error .alr-toast-icon { color: var(--alr-danger); }
.alr-toast-text { flex: 1; min-width: 0; }
.alr-toast-title { font-weight: 500; }
.alr-toast-detail { margin-top: 2px; color: var(--alr-mute); font-size: 11.5px; white-space: pre-line; }
.alr-toast-close {
  flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; color: var(--alr-mute); background: none; border: 0; cursor: pointer;
  transition: color var(--duration-fast) var(--easing-standard), background-color var(--duration-fast) var(--easing-standard);
}
.alr-toast-close:hover { color: var(--alr-ink); background: rgb(255 255 255 / .06); }
</style>
