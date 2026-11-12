<script setup lang="ts">
// Shared feature styles load before component styles so component modifiers win ties.
import './aiLogoReset.css'
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiMotionTransition from '../../components/UiMotionTransition.vue'
import ResetLobby from './lobby/ResetLobby.vue'
import ResetWorkspace from './workspace/ResetWorkspace.vue'
import ResetToasts from './ui/ResetToasts.vue'
import { lobby, projectActions } from './state/projects'
import { pushToast } from './state/toasts'
import '@fontsource/jost/400.css'
import '@fontsource/jost/500.css'
import '@fontsource/jost/600.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/600.css'
import '@fontsource/jetbrains-mono/400.css'

const LOBBY = '/tools/ai-logo-reset'
const route = useRoute()
const router = useRouter()

const projectId = computed(() => typeof route.params.projectId === 'string' ? route.params.projectId : null)
const project = computed(() => projectId.value ? projectActions.find(projectId.value) ?? null : null)

if (!lobby.loaded && !lobby.loading) void projectActions.refresh()

// A project missing from the cached list (e.g. created in another window) is looked up once more before giving up.
const rechecked = new Set<string>()
watch([projectId, () => lobby.loaded], async ([id, loaded]) => {
  if (!loaded || !id || projectActions.find(id)) return
  if (!rechecked.has(id)) {
    rechecked.add(id)
    await projectActions.refresh()
    if (projectId.value !== id || projectActions.find(id)) return
  }
  pushToast({ tone: 'error', title: '项目不存在', detail: '已返回项目大厅。' })
  void router.replace(LOBBY)
}, { immediate: true })

const open = (id: string) => { void router.push(`${LOBBY}/workspace/${encodeURIComponent(id)}`) }
const back = () => { void router.push(LOBBY) }
</script>

<template>
  <div class="alr-root">
    <!-- Views cross over: the leaving view is lifted out of flow so the new one mounts at once. -->
    <UiMotionTransition :preset="project ? 'view-forward' : 'view-back'">
      <ResetWorkspace v-if="project" :key="project.id" :project="project" @back="back" />
      <ResetLobby v-else-if="!projectId" key="lobby" @open="open" />
    </UiMotionTransition>
    <ResetToasts />
  </div>
</template>
