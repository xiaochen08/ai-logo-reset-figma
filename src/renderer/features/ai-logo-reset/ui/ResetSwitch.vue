<script setup lang="ts">
defineProps<{ modelValue: boolean, label: string, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button
    class="switch" role="switch" :aria-checked="modelValue" :aria-label="label" :disabled="disabled"
    :class="{ on: modelValue }" @click.stop="emit('update:modelValue', !modelValue)"
  ><span class="lit" aria-hidden="true" /><span class="knob" /></button>
</template>

<style scoped>
.switch {
  position: relative; flex: none; width: 30px; height: 18px; border-radius: 999px; overflow: hidden;
  background: rgb(255 255 255 / .1); box-shadow: var(--alr-well);
}
/* The lit track fades in instead of repainting a background colour. */
.lit { position: absolute; inset: 0; border-radius: inherit; background: var(--alr-accent-fill); box-shadow: inset 0 1px 0 rgb(255 255 255 / .3); opacity: 0; transition: opacity var(--duration-base) var(--easing-standard); }
.switch.on .lit { opacity: 1; }
.switch:disabled { opacity: .35; }
.knob {
  position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 999px;
  background: linear-gradient(180deg, rgb(250 250 250), rgb(214 214 214)); box-shadow: 0 1px 2px rgb(0 0 0 / .45), 0 0 0 .5px rgb(0 0 0 / .2);
  transition: transform var(--duration-base) var(--easing-emphasized);
}
.switch:active:not(:disabled) .knob { transform: scaleX(1.12); }
.switch.on .knob { transform: translateX(12px); }
.switch.on:active:not(:disabled) .knob { transform: translateX(11px) scaleX(1.12); }
</style>
