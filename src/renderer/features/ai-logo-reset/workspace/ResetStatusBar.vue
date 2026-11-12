<script setup lang="ts">
import { computed } from 'vue'
import { useWorkspace } from '../state/context'
import { exporting, isExportActive } from '../state/exporting'

const { state, actions, current, scene, visiblePhotos, missingCount } = useWorkspace()

const running = computed(() => {
  const status = exporting.status
  if (!status || status.projectId !== state.projectId || !isExportActive(status)) return ''
  if (status.phase === 'preparing') return `导出准备中 ${status.prepared}/${status.total}`
  if (status.phase === 'cancelling') return '正在取消导出'
  return `导出中 ${status.success + status.failed}/${status.total}`
})

const position = computed(() => {
  const index = current.value ? visiblePhotos.value.findIndex(photo => photo.id === current.value!.id) : -1
  return index >= 0 ? `${index + 1} / ${visiblePhotos.value.length}` : ''
})
const megabytes = computed(() => current.value ? `${(current.value.sizeBytes / 1048576).toFixed(1)} MB` : '')
</script>

<template>
  <footer class="status alr-num">
    <template v-if="current">
      <span>{{ position }}</span>
      <span class="sep" />
      <span>{{ current.width }} × {{ current.height }}</span>
      <span class="sep" />
      <span>{{ megabytes }}</span>
      <span class="sep" />
      <span>{{ scene?.layers.length ?? 0 }} 个 LOGO</span>
    </template>
    <span v-else>{{ state.photos.length ? '' : '尚未添加照片' }}</span>
    <span class="grow" />
    <button v-if="running" class="export-chip" @click="actions.open('export')">{{ running }}</button>
    <span v-if="state.photos.length && missingCount" class="warn">{{ missingCount }} 张未加 LOGO</span>
    <span class="keys"><kbd class="alr-kbd">PgUp</kbd><kbd class="alr-kbd">PgDn</kbd> 切换照片</span>
    <span class="keys"><kbd class="alr-kbd">←↑→↓</kbd> 微调</span>
  </footer>
</template>

<style scoped>
.status {
  display: flex; align-items: center; gap: 10px; flex: none; height: 30px; padding: 0 14px; font-size: 11.5px; color: var(--alr-mute); white-space: nowrap; overflow: hidden;
  background: var(--alr-panel); box-shadow: inset 0 1px 0 rgb(0 0 0 / .55), inset 0 2px 0 rgb(255 255 255 / .025);
}
.sep { width: 3px; height: 3px; border-radius: 999px; background: rgb(255 255 255 / .2); }
.grow { flex: 1; }
.warn { display: inline-flex; align-items: center; gap: 6px; color: var(--alr-accent); }
.warn::before { content: ''; width: 6px; height: 6px; border-radius: 999px; background: currentColor; box-shadow: 0 0 6px rgb(var(--alr-accent-rgb) / .7); }
.export-chip {
  height: 20px; padding: 0 9px; border-radius: 999px; font: inherit; color: var(--alr-accent); border: 0; cursor: pointer;
  background: rgb(var(--alr-accent-rgb) / .1); box-shadow: inset 0 0 0 1px rgb(var(--alr-accent-rgb) / .25); transition: var(--alr-hover);
}
.export-chip:hover { background: rgb(var(--alr-accent-rgb) / .18); }
.keys { display: inline-flex; align-items: center; gap: 4px; }
@media (max-width: 1180px) { .keys { display: none; } }
</style>
