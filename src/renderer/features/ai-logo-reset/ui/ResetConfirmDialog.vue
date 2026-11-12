<script setup lang="ts">
import ResetModal from './ResetModal.vue'

defineProps<{ open: boolean, title: string, message: string, confirmLabel: string, danger?: boolean }>()
const emit = defineEmits<{ cancel: [], confirm: [] }>()
</script>

<template>
  <ResetModal :open="open" :title="title" :width="400" @close="emit('cancel')">
    <p class="confirm-text">{{ message }}</p>
    <template #actions>
      <button @click="emit('cancel')">取消</button>
      <button :class="danger ? 'is-danger' : 'is-primary'" @click="emit('confirm')">{{ confirmLabel }}</button>
    </template>
  </ResetModal>
</template>

<style scoped>
.confirm-text { margin: 0; font-size: 13px; line-height: 1.7; color: var(--alr-ink-2); }
</style>
