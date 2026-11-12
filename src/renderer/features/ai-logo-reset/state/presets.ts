import { reactive } from 'vue'
import { aiLogoResetPresetDisplayOrder } from '../../../../shared/aiLogoResetPresets.ts'
import { mutateProject, resetApi, unwrap } from './projects'
import type { ResetPhotoScene, ResetPreset } from './types'

/** Presets belong to the tool, not to a project: one list for every workspace. */
export const presetStore = reactive({
  /** Stored order; the list shows pinned presets first. */
  items: [] as ResetPreset[],
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: ''
})

export const shownPresets = () => aiLogoResetPresetDisplayOrder(presetStore.items)

const replace = (preset: ResetPreset) => {
  const index = presetStore.items.findIndex(item => item.id === preset.id)
  if (index >= 0) presetStore.items[index] = preset
}

let loading: Promise<void> | null = null

export const presetActions = {
  load(force = false) {
    if (loading) return loading
    if (presetStore.status === 'ready' && !force) return Promise.resolve()
    presetStore.status = 'loading'
    loading = unwrap(resetApi().listPresets())
      .then(items => { presetStore.items = items; presetStore.status = 'ready'; presetStore.error = '' })
      .catch(error => { presetStore.status = 'error'; presetStore.error = error instanceof Error ? error.message : String(error) })
      .finally(() => { loading = null })
    return loading
  },

  async save(projectId: string, scene: ResetPhotoScene, name: string, includeBanner: boolean) {
    const preset = await unwrap(resetApi().savePreset({ projectId, name, sceneJson: JSON.stringify(scene), includeBanner }))
    // New presets lead the unpinned ones, as the store puts them.
    const pinned = presetStore.items.filter(item => item.pinned)
    presetStore.items = [...pinned, preset, ...presetStore.items.filter(item => !item.pinned)]
    return preset
  },

  async rename(presetId: string, name: string) {
    replace(await unwrap(resetApi().updatePreset({ presetId, name })))
  },

  async setPinned(presetId: string, pinned: boolean) {
    replace(await unwrap(resetApi().updatePreset({ presetId, pinned })))
  },

  /** Replaces the preset's logos and settings with a photo's. */
  async overwrite(presetId: string, projectId: string, scene: ResetPhotoScene, includeBanner: boolean) {
    const preset = await unwrap(resetApi().updatePreset({ presetId, source: { projectId, sceneJson: JSON.stringify(scene), includeBanner } }))
    replace(preset)
    return preset
  },

  async remove(presetId: string) {
    await unwrap(resetApi().deletePreset({ presetId }))
    presetStore.items = presetStore.items.filter(item => item.id !== presetId)
  },

  /** Moves a preset next to another of the same kind (pinned or not); the list updates at once and rolls back on failure. */
  async move(presetId: string, targetId: string, side: 'above' | 'below') {
    const items = [...presetStore.items]
    const moving = items.find(item => item.id === presetId)
    const target = items.find(item => item.id === targetId)
    if (!moving || !target || moving === target || moving.pinned !== target.pinned) return
    const rest = items.filter(item => item !== moving)
    rest.splice(rest.indexOf(target) + (side === 'below' ? 1 : 0), 0, moving)
    const previous = presetStore.items
    presetStore.items = rest
    try {
      await unwrap(resetApi().reorderPresets({ presetIds: rest.map(item => item.id) }))
    } catch (error) {
      presetStore.items = previous
      throw error
    }
  },

  /** Readies a preset for a project: its logos are added where missing; returns the scene in the project's logo ids. */
  use(projectId: string, presetId: string) {
    return mutateProject(projectId, expectedRevision => resetApi().usePreset({ projectId, expectedRevision, presetId }))
  }
}
