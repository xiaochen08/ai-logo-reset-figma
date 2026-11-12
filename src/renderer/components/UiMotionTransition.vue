<template>
  <Transition
    :name="resolveUiMotionTransitionName(preset)"
    :appear="appear"
    :mode="mode"
    :css="enabled"
  >
    <slot />
  </Transition>
</template>

<script setup lang="ts">
import {
  resolveUiMotionTransitionName,
  type UiMotionPreset
} from '../animation/motionPresets'

withDefaults(defineProps<{
  preset: UiMotionPreset
  appear?: boolean
  enabled?: boolean
  mode?: 'in-out' | 'out-in'
}>(), {
  appear: false,
  enabled: true,
  mode: undefined
})
</script>
