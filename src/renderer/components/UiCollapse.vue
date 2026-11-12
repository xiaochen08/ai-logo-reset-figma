<template>
  <!-- Stays mounted: the shared collapse preset animates between open and closed and can reverse mid-way. -->
  <div :class="[name, { 'is-open': open }]" :inert="!open || undefined" :aria-hidden="!open || undefined">
    <div :class="`${name}-clip`">
      <div :class="`${name}-body`"><slot /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { resolveUiMotionTransitionName } from '../animation/motionPresets'

defineProps<{ open: boolean }>()
const name = resolveUiMotionTransitionName('collapse')
</script>
