import { computed, markRaw, reactive } from 'vue'
import { AI_LOGO_RESET_CENTRE_MAX, AI_LOGO_RESET_CENTRE_MIN, aiLogoResetGatherGroups } from '../../../../shared/aiLogoReset'
import { aiLogoResetFitCropRatio, aiLogoResetFrame } from '../../../../shared/aiLogoResetFrame'
import { releasePhotos, requestScaled } from '../render/imagePipeline'
import { mutateProject, onProjectRemoved, projectActions, projectSettled, resetApi, setProjectRevision, unwrap } from './projects'
import { releaseRecognitions } from './recognition'
import { placeLayer } from './placement'
import { capturePublicLogoImportTarget, resolvePublicLogoImportTarget } from './publicLogoImportTarget'
import { pushToast } from './toasts'
import {
  RESET_MAX_LAYERS_PER_PHOTO,
  defaultShadow,
  emptyScene,
  identityCorners,
  type ResetAnchor,
  type ResetBanner,
  type ResetBannerEdges,
  type ResetCrop,
  type ResetInspectorPage,
  type ResetInspectorTab,
  type ResetLayer,
  type ResetLogoAsset,
  type ResetPhoto,
  type ResetPhotoScene,
  type ResetPresetScene,
  type ResetRenderMode,
  type ResetSize
} from './types'

export type ResetPhotoFilter = 'all' | 'landscape' | 'portrait' | 'missing'
export type ResetDialog = 'export' | null

interface History { past: string[], future: string[], lastKey: string, lastAt: number }

export interface ResetWorkspaceState {
  projectId: string
  loading: boolean
  loadError: string
  /** Grant URL base for original photos: `${originalsBase}/${photoId}`. */
  originalsBase: string
  saving: 'idle' | 'pending' | 'saving' | 'error'
  photos: ResetPhoto[]
  logos: ResetLogoAsset[]
  scenes: Record<string, ResetPhotoScene>
  currentId: string | null
  selectedIds: string[]
  selectedLayerId: string | null
  /** Logos picked together in the list (Ctrl / Shift); the selected one is always among them. */
  layerSelection: string[]
  filter: ResetPhotoFilter
  /** null = fit to view */
  zoom: number | null
  importing: number
  dialog: ResetDialog
  /** Which page of the selected logo's settings is open; the tour opens the page it explains. */
  inspectorTab: ResetInspectorTab
  /** Which inspector page is open; the crop page puts the stage into crop mode. */
  page: ResetInspectorPage
  /** With the crop page open: drawing a line on the photo levels it. */
  straightening: boolean
  /** The next logo picked in the library replaces the selected layer's image instead of adding one. */
  replacing: boolean
  warpEditing: boolean
  comparing: boolean
  history: Record<string, History>
}

const LOGO_PATTERN = /\.(png|webp|svg|jpe?g)$/iu
const COALESCE_MS = 700
const HISTORY_LIMIT = 80
const SAVE_DELAY_MS = 500
/** Logos are normalised to PNG no larger than this long edge before they are stored. */
const LOGO_MAX_EDGE = 4096

// Reactive proxies cannot be structured-cloned; layers are plain JSON data.
const cloneLayer = (layer: ResetLayer): ResetLayer => JSON.parse(JSON.stringify(layer)) as ResetLayer

/** Decodes any browser-readable logo (PNG, WEBP, JPG, SVG) and re-encodes it as PNG bytes. */
const logoToPng = async (file: File) => {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = image.naturalWidth || 512, height = image.naturalHeight || 512
    const ratio = Math.min(1, LOGO_MAX_EDGE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('CANVAS_UNAVAILABLE')
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG_ENCODE_FAILED')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

const createState = (projectId: string): ResetWorkspaceState => ({
  projectId,
  loading: true,
  loadError: '',
  originalsBase: '',
  saving: 'idle',
  photos: [],
  logos: [],
  scenes: {},
  currentId: null,
  selectedIds: [],
  selectedLayerId: null,
  layerSelection: [],
  filter: 'all',
  zoom: null,
  importing: 0,
  dialog: null,
  inspectorTab: 'place',
  page: 'logo',
  straightening: false,
  replacing: false,
  warpEditing: false,
  comparing: false,
  history: {}
})

const createWorkspace = (projectId: string) => {
  const state = reactive(createState(projectId)) as ResetWorkspaceState

  const current = computed(() => state.photos.find(photo => photo.id === state.currentId) ?? null)
  const scene = computed(() => (state.currentId ? state.scenes[state.currentId] : undefined) ?? null)
  const selectedLayer = computed(() => scene.value?.layers.find(layer => layer.id === state.selectedLayerId) ?? null)
  // Turn, crop and bands of the current photo; logos are placed on its canvas.
  const frameOf = (photo: Pick<ResetPhoto, 'width' | 'height'>, target: ResetPhotoScene | undefined) => {
    const base = target ?? emptyScene()
    return aiLogoResetFrame(photo, base.crop, base.banner)
  }
  const frame = computed(() => current.value ? frameOf(current.value, scene.value ?? undefined) : null)
  const canvasOf = (photoId: string): ResetSize | null => {
    const photo = state.photos.find(item => item.id === photoId)
    return photo ? frameOf(photo, state.scenes[photoId]).canvas : null
  }
  const logoById = (id: string) => state.logos.find(logo => logo.id === id)
  const missingCount = computed(() => state.photos.filter(photo => !(state.scenes[photo.id]?.layers.some(layer => layer.visible))).length)
  const visiblePhotos = computed(() => state.photos.filter(photo => {
    if (state.filter === 'all') return true
    if (state.filter === 'missing') return !(state.scenes[photo.id]?.layers.some(layer => layer.visible))
    if (state.filter === 'landscape') return photo.orientation !== 'portrait'
    return photo.orientation === 'portrait'
  }))

  const historyOf = (photoId: string) => (state.history[photoId] ??= { past: [], future: [], lastKey: '', lastAt: 0 })
  const canUndo = computed(() => !!state.currentId && (state.history[state.currentId]?.past.length ?? 0) > 0)
  const canRedo = computed(() => !!state.currentId && (state.history[state.currentId]?.future.length ?? 0) > 0)

  /** Record one undo step per edit gesture; repeated edits with the same key inside a short window coalesce. */
  const checkpoint = (photoId: string, key: string) => {
    const history = historyOf(photoId)
    const now = performance.now()
    if (key && history.lastKey === key && now - history.lastAt < COALESCE_MS) { history.lastAt = now; return }
    history.past.push(JSON.stringify(state.scenes[photoId] ?? emptyScene()))
    if (history.past.length > HISTORY_LIMIT) history.past.shift()
    history.future = []
    history.lastKey = key
    history.lastAt = now
  }

  const photoUrl = (photo: Pick<ResetPhoto, 'id'>) => `${state.originalsBase}/${photo.id}`
  const sync = () => projectActions.touch(projectId, { photoCount: state.photos.length })

  // Scene edits are saved as a whole, debounced; writes share the project's revision queue.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  const save = async () => {
    saveTimer = null
    if (state.loading || state.loadError) return
    state.saving = 'saving'
    try {
      const scenesJson = JSON.stringify(state.scenes)
      await mutateProject(projectId, expectedRevision => resetApi().saveScenes({ projectId, expectedRevision, scenesJson }))
      if (!saveTimer) state.saving = 'idle'
    } catch (error) {
      state.saving = 'error'
      pushToast({ tone: 'error', title: 'LOGO 设置保存失败', detail: errorText(error) })
    }
  }
  const scheduleSave = () => {
    if (disposed || state.loading) return
    state.saving = 'pending'
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { void save() }, SAVE_DELAY_MS)
  }
  const flush = async () => {
    if (saveTimer) { clearTimeout(saveTimer); await save() }
    await projectSettled(projectId)
  }

  const mutateScene = (key: string, change: (scene: ResetPhotoScene) => void, photoId = state.currentId) => {
    if (!photoId) return
    checkpoint(photoId, key)
    change(state.scenes[photoId] ??= emptyScene())
    scheduleSave()
  }

  /** Edits one logo; a locked logo is left as it is. */
  const mutateLayer = (key: string, change: (layer: ResetLayer, canvas: ResetSize, logo: ResetLogoAsset) => void, layerId = state.selectedLayerId, photoId = state.currentId) => {
    const photo = photoId ? state.photos.find(item => item.id === photoId) : null
    if (!photo || !layerId) return
    if (state.scenes[photo.id]?.layers.find(item => item.id === layerId)?.locked) return
    mutateScene(`${key}:${layerId}`, target => {
      const layer = target.layers.find(item => item.id === layerId)
      const logo = layer && logoById(layer.logoId)
      if (!layer || !logo) return
      const canvas = frameOf(photo, target).canvas
      change(layer, canvas, logo)
      // Stored where it is drawn, so a drag at the edge stops there and moves back at once.
      Object.assign(layer, placeLayer(layer, logo, canvas, target.safeEdge))
    })
  }

  /** After the canvas changes size (crop, bands), anchored logos follow their anchors and the safe edge holds. */
  const replaceAll = (target: ResetPhotoScene, photo: Pick<ResetPhoto, 'width' | 'height'>) => {
    const canvas = frameOf(photo, target).canvas
    target.layers = target.layers.map(layer => {
      const logo = logoById(layer.logoId)
      return logo ? placeLayer(layer, logo, canvas, target.safeEdge) : layer
    })
  }

  /** Changes the current photo's frame (crop or bands) and re-places its logos on the new canvas. */
  const mutateFrame = (key: string, change: (target: ResetPhotoScene, photo: ResetPhoto) => void) => {
    const photo = current.value
    if (!photo) return
    mutateScene(key, target => {
      change(target, photo)
      replaceAll(target, photo)
    })
  }

  /** Writes a new layer order: group members are gathered and empty groups dropped. */
  const writeOrder = (target: ResetPhotoScene, layers: ResetLayer[]) => {
    const gathered = aiLogoResetGatherGroups(layers, target.groups)
    target.layers = gathered.layers
    target.groups = gathered.groups
  }
  const selection = () => {
    const ids = new Set(state.layerSelection)
    if (state.selectedLayerId) ids.add(state.selectedLayerId)
    return (scene.value?.layers ?? []).filter(layer => ids.has(layer.id))
  }

  /**
   * Puts a source's logos, groups and render settings on a photo, re-placed for its canvas.
   * Each photo gets its own layer and group ids, so a later edit to one photo leaves the others alone.
   * A null banner leaves the photo's own bands; the crop always stays the photo's.
   */
  const copyInto = (target: ResetPhotoScene, photo: Pick<ResetPhoto, 'width' | 'height'>, source: ResetPresetScene) => {
    target.mode = source.mode
    target.faceAvoid = source.faceAvoid
    target.safeEdge = source.safeEdge
    if (source.banner) target.banner = JSON.parse(JSON.stringify(source.banner)) as ResetBanner
    const groupIds = new Map(source.groups.map(group => [group.id, crypto.randomUUID()]))
    target.groups = source.groups.map(group => ({ ...group, id: groupIds.get(group.id)! }))
    const canvas = frameOf(photo, target).canvas
    target.layers = source.layers.map(layer => {
      const logo = logoById(layer.logoId)
      const copy: ResetLayer = { ...cloneLayer(layer), id: crypto.randomUUID(), groupId: layer.groupId ? groupIds.get(layer.groupId) ?? null : null }
      return logo ? placeLayer(copy, logo, canvas, source.safeEdge) : copy
    })
  }

  // After undo or redo, the selection keeps only logos that still exist.
  const keepSelection = (photoId: string) => {
    const ids = new Set(state.scenes[photoId].layers.map(layer => layer.id))
    state.layerSelection = state.layerSelection.filter(id => ids.has(id))
    if (!state.selectedLayerId || !ids.has(state.selectedLayerId)) state.selectedLayerId = state.scenes[photoId].layers.at(-1)?.id ?? null
  }

  const actions = {
    async load() {
      state.loading = true
      state.loadError = ''
      try {
        const project = await unwrap(resetApi().openProject(projectId))
        setProjectRevision(projectId, project.revision)
        state.originalsBase = project.originalsBase
        state.photos = project.photos.map(photo => markRaw(photo))
        state.logos = project.logos
        state.scenes = project.scenes
        projectActions.touch(projectId, { name: project.name, photoCount: project.photos.length })
        if (!state.currentId && state.photos[0]) actions.select(state.photos[0].id)
        // Every thumbnail loads in the background, behind tiles in view, so the strip can show real progress.
        for (const photo of state.photos) void requestScaled(photo.id, 'thumb', photoUrl(photo), 0).catch(() => {})
      } catch (error) {
        state.loadError = errorText(error)
      } finally {
        state.loading = false
      }
    },

    /** Imports dropped or picked files and folders by their real paths; Main reads them read-only. */
    async importPhotos(files: File[]) {
      let paths: string[]
      try {
        const api = resetApi()
        paths = files.map(file => api.getPathForFile(file)).filter(Boolean)
      } catch (error) {
        pushToast({ tone: 'error', title: '无法导入照片', detail: errorText(error) })
        return
      }
      if (!paths.length) {
        pushToast({ tone: 'error', title: '没有可导入的照片', detail: '支持 JPG、PNG、WEBP。' })
        return
      }
      state.importing += paths.length
      try {
        const result = await mutateProject(projectId, async expectedRevision => {
          const response = await resetApi().importPhotos({ projectId, expectedRevision, paths })
          return response.success ? { success: true as const, data: { ...response.data, revision: response.data.project.revision } } : response
        })
        state.originalsBase = result.project.originalsBase
        const known = new Set(state.photos.map(photo => photo.id))
        const added = result.project.photos.filter(photo => !known.has(photo.id)).map(photo => markRaw(photo))
        for (const photo of added) state.scenes[photo.id] ??= emptyScene()
        state.photos.push(...added)
        if (!state.currentId && added[0]) actions.select(added[0].id)
        added.forEach((photo, index) => { void requestScaled(photo.id, 'thumb', photoUrl(photo), index < 24 ? 2 : 0).catch(() => {}) })
        sync()
        if (added.length) pushToast({ tone: 'ok', title: `已添加 ${added.length} 张照片` })
        if (result.duplicates) pushToast({ tone: 'info', title: `${result.duplicates} 张照片已在项目中` })
        if (result.rejected.length) pushToast({ tone: 'error', title: `${result.rejected.length} 个文件未导入`, detail: result.rejected[0].reason })
        if (!added.length && !result.duplicates && !result.rejected.length) pushToast({ tone: 'error', title: '没有可导入的照片', detail: '支持 JPG、PNG、WEBP。' })
      } catch (error) {
        pushToast({ tone: 'error', title: '照片导入失败', detail: errorText(error) })
      } finally {
        state.importing -= paths.length
      }
    },

    async importLogos(files: File[]) {
      const accepted = files.filter(file => LOGO_PATTERN.test(file.name))
      if (!accepted.length) {
        pushToast({ tone: 'error', title: '没有可用的 LOGO', detail: '支持透明 PNG、WEBP、SVG。' })
        return
      }
      for (const file of accepted) {
        try {
          const png = await logoToPng(file)
          const name = file.name.replace(/\.[^.]+$/u, '')
          const result = await mutateProject(projectId, expectedRevision => resetApi().importLogo({ projectId, expectedRevision, name, png }))
          state.logos.push(result.logo)
          if (current.value) actions.addLayer(result.logo.id)
        } catch (error) {
          pushToast({ tone: 'error', title: `${file.name} 无法导入`, detail: errorText(error) })
        }
      }
    },

    async importPublicLogo(assetId: string, replace = false) {
      const target = capturePublicLogoImportTarget(state.currentId, state.selectedLayerId, replace)
      try {
        const result = await mutateProject(projectId, expectedRevision => resetApi().importLogoAsset({ projectId, expectedRevision, assetId }))
        state.logos.push(result.logo)
        const resolved = resolvePublicLogoImportTarget(target, state.photos, state.scenes)
        if (resolved?.mode === 'replace' && resolved.layerId) {
          actions.replaceLayerLogo(result.logo.id, resolved.layerId, resolved.photoId)
        } else if (resolved?.mode === 'add') {
          actions.addLayer(result.logo.id, resolved.photoId)
        }
        pushToast(resolved
          ? { tone: 'ok', title: `已添加公共 LOGO「${result.logo.name}」` }
          : { tone: 'info', title: `公共 LOGO「${result.logo.name}」已加入素材`, detail: '原照片或图层已变化，未自动放置。' })
      } catch (error) {
        pushToast({ tone: 'error', title: '公共 LOGO 添加失败', detail: errorText(error) })
      }
    },

    select(photoId: string, mode: 'replace' | 'toggle' | 'range' = 'replace') {
      if (mode === 'toggle') {
        state.selectedIds = state.selectedIds.includes(photoId) ? state.selectedIds.filter(id => id !== photoId) : [...state.selectedIds, photoId]
      } else if (mode === 'range' && state.currentId) {
        const ids = visiblePhotos.value.map(photo => photo.id)
        const [from, to] = [ids.indexOf(state.currentId), ids.indexOf(photoId)].sort((a, b) => a - b)
        state.selectedIds = from >= 0 && to >= 0 ? ids.slice(from, to + 1) : [photoId]
      } else {
        state.selectedIds = [photoId]
      }
      if (state.currentId !== photoId) {
        state.currentId = photoId
        state.selectedLayerId = state.scenes[photoId]?.layers.at(-1)?.id ?? null
        state.layerSelection = state.selectedLayerId ? [state.selectedLayerId] : []
        state.warpEditing = false
        state.straightening = false
      }
    },

    step(delta: number) {
      const ids = visiblePhotos.value.map(photo => photo.id)
      if (!ids.length) return
      const index = state.currentId ? ids.indexOf(state.currentId) : -1
      actions.select(ids[Math.min(ids.length - 1, Math.max(0, index + delta))])
    },

    removePhotos(ids: string[]) {
      const removing = new Set(ids)
      if (!removing.size) return
      void mutateProject(projectId, expectedRevision => resetApi().removePhotos({ projectId, expectedRevision, photoIds: [...removing] }))
        .catch(error => pushToast({ tone: 'error', title: '移除照片失败', detail: errorText(error) }))
      state.photos = state.photos.filter(photo => {
        if (!removing.has(photo.id)) return true
        delete state.scenes[photo.id]
        delete state.history[photo.id]
        return false
      })
      releasePhotos(removing)
      releaseRecognitions(projectId, removing)
      state.selectedIds = state.selectedIds.filter(id => !removing.has(id))
      if (state.currentId && removing.has(state.currentId)) {
        state.currentId = null
        if (state.photos[0]) actions.select(state.photos[0].id)
      }
      sync()
    },

    addLayer(logoId: string, photoId = state.currentId) {
      const photo = photoId ? state.photos.find(item => item.id === photoId) : null
      const logo = logoById(logoId)
      if (!photo || !logo) return
      const target = state.scenes[photo.id] ?? emptyScene()
      if (target.layers.length >= RESET_MAX_LAYERS_PER_PHOTO) {
        pushToast({ tone: 'error', title: `每张照片最多 ${RESET_MAX_LAYERS_PER_PHOTO} 个 LOGO` })
        return
      }
      const layer = placeLayer({
        id: crypto.randomUUID(), logoId, visible: true, x: 0.5, y: 0.5, size: 18, rotation: 0, opacity: 100,
        anchor: 'br', margin: 4, shadow: defaultShadow(), warp: { enabled: false, corners: identityCorners() }, locked: false, groupId: null
      }, logo, frameOf(photo, target).canvas, target.safeEdge)
      mutateScene('add-layer', scene => { scene.layers.push(layer) }, photo.id)
      if (state.currentId === photo.id) actions.selectLayer(layer.id)
    },

    /** Removes the logo, or every logo picked in the list; locked ones stay. */
    removeLayer(layerId?: string | null) {
      const removing = new Set((layerId ? (scene.value?.layers ?? []).filter(layer => layer.id === layerId) : selection())
        .filter(layer => !layer.locked).map(layer => layer.id))
      if (!removing.size) return
      mutateScene('remove-layer', target => writeOrder(target, target.layers.filter(layer => !removing.has(layer.id))))
      if (state.selectedLayerId && removing.has(state.selectedLayerId)) actions.selectLayer(scene.value?.layers.at(-1)?.id ?? null)
      else state.layerSelection = state.layerSelection.filter(id => !removing.has(id))
      state.warpEditing = false
    },

    duplicateLayer(layerId = state.selectedLayerId) {
      const source = scene.value?.layers.find(layer => layer.id === layerId)
      if (!source || !scene.value) return
      if (scene.value.layers.length >= RESET_MAX_LAYERS_PER_PHOTO) {
        pushToast({ tone: 'error', title: `每张照片最多 ${RESET_MAX_LAYERS_PER_PHOTO} 个 LOGO` })
        return
      }
      // The copy sits right above its source, in the same group, and unlocked.
      const copy: ResetLayer = {
        ...cloneLayer(source), id: crypto.randomUUID(), anchor: null, locked: false, x: Math.min(1, source.x + 0.03), y: Math.min(1, source.y + 0.03)
      }
      mutateScene('duplicate-layer', target => {
        const index = target.layers.findIndex(layer => layer.id === source.id)
        target.layers.splice(index + 1, 0, copy)
      })
      actions.selectLayer(copy.id)
    },

    /**
     * One step up or down. An ungrouped logo steps over a whole group; a grouped one moves inside
     * its group and leaves it at the group's edge.
     */
    moveLayerOrder(layerId: string, delta: number) {
      mutateScene('order', target => {
        const layers = [...target.layers]
        const index = layers.findIndex(layer => layer.id === layerId)
        if (index < 0) return
        const layer = layers[index]
        const neighbour = layers[index + delta]
        if (layer.groupId) {
          if (neighbour?.groupId === layer.groupId) [layers[index], layers[index + delta]] = [neighbour, layer]
          else layers[index] = { ...layer, groupId: null }
        } else {
          if (!neighbour) return
          let to = index + delta
          if (neighbour.groupId) while (layers[to + delta]?.groupId === neighbour.groupId) to += delta
          layers.splice(index, 1)
          layers.splice(to, 0, layer)
        }
        writeOrder(target, layers)
      })
    },

    /** Drag and drop in the list: the logo goes above or below another, joining that logo's group (or none). */
    moveLayerTo(layerId: string, targetId: string, side: 'above' | 'below', groupId: string | null) {
      if (layerId === targetId) return
      mutateScene('order', target => {
        const moving = target.layers.find(layer => layer.id === layerId)
        if (!moving) return
        const layers = target.layers.filter(layer => layer.id !== layerId)
        const index = layers.findIndex(layer => layer.id === targetId)
        if (index < 0) return
        layers.splice(side === 'above' ? index + 1 : index, 0, { ...moving, groupId })
        writeOrder(target, layers)
      })
    },

    /** Drops a logo onto a group's header: it joins the group, on top. */
    moveLayerIntoGroup(layerId: string, groupId: string) {
      const members = scene.value?.layers.filter(layer => layer.groupId === groupId && layer.id !== layerId) ?? []
      const top = members.at(-1)
      if (top) actions.moveLayerTo(layerId, top.id, 'above', groupId)
    },

    /** Moves a whole group above or below a logo, or above or below the group that logo belongs to. */
    moveGroupTo(groupId: string, targetId: string, side: 'above' | 'below') {
      mutateScene('order', target => {
        const block = target.layers.filter(layer => layer.groupId === groupId)
        const rest = target.layers.filter(layer => layer.groupId !== groupId)
        const targetLayer = rest.find(layer => layer.id === targetId)
        if (!block.length || !targetLayer) return
        const peers = targetLayer.groupId ? rest.filter(layer => layer.groupId === targetLayer.groupId) : [targetLayer]
        const index = side === 'above' ? rest.indexOf(peers.at(-1)!) + 1 : rest.indexOf(peers[0])
        rest.splice(index, 0, ...block)
        writeOrder(target, rest)
      })
    },

    toggleLayerVisible(layerId: string) {
      mutateScene(`visible:${layerId}`, target => {
        const layer = target.layers.find(item => item.id === layerId)
        if (layer) layer.visible = !layer.visible
      })
    },

    toggleLayerLocked(layerId: string) {
      mutateScene(`locked:${layerId}`, target => {
        const layer = target.layers.find(item => item.id === layerId)
        if (layer) layer.locked = !layer.locked
      })
      if (state.selectedLayerId === layerId) state.warpEditing = false
    },

    /** Swaps the logo image of a layer and keeps everything else; the size follows the new image's shape. */
    replaceLayerLogo(logoId: string, layerId = state.selectedLayerId, photoId = state.currentId) {
      if (state.currentId === photoId) state.replacing = false
      if (!logoById(logoId)) return
      mutateLayer('replace', layer => { layer.logoId = logoId }, layerId, photoId)
    },

    /** Picks this logo and waits for a new image from the library. */
    startReplacing(layerId: string) {
      if (scene.value?.layers.find(layer => layer.id === layerId)?.locked) return
      actions.selectLayer(layerId)
      state.replacing = true
    },

    /**
     * replace: only this logo. toggle (Ctrl): adds or removes it from the picked set. range (Shift):
     * everything between the selected logo and this one. A group header picks all its members.
     */
    selectLayer(layerId: string | null, mode: 'replace' | 'toggle' | 'range' = 'replace') {
      const layers = scene.value?.layers ?? []
      state.replacing = false
      if (!layerId) {
        state.selectedLayerId = null
        state.layerSelection = []
        state.warpEditing = false
        return
      }
      if (mode === 'toggle') {
        const picked = state.layerSelection.includes(layerId)
        state.layerSelection = picked ? state.layerSelection.filter(id => id !== layerId) : [...state.layerSelection, layerId]
        state.selectedLayerId = picked ? state.layerSelection.at(-1) ?? null : layerId
      } else if (mode === 'range' && state.selectedLayerId) {
        const ids = layers.map(layer => layer.id)
        const [from, to] = [ids.indexOf(state.selectedLayerId), ids.indexOf(layerId)].sort((a, b) => a - b)
        state.layerSelection = from >= 0 ? ids.slice(from, to + 1) : [layerId]
        state.selectedLayerId = layerId
      } else {
        state.layerSelection = [layerId]
        state.selectedLayerId = layerId
      }
      state.warpEditing = false
    },

    selectGroup(groupId: string) {
      const members = (scene.value?.layers ?? []).filter(layer => layer.groupId === groupId)
      state.layerSelection = members.map(layer => layer.id)
      state.selectedLayerId = members.at(-1)?.id ?? null
      state.warpEditing = false
    },

    /** Groups the picked logos (two or more) where the topmost of them is. */
    groupSelection() {
      const picked = selection()
      if (picked.length < 2) return
      const ids = new Set(picked.map(layer => layer.id))
      const groupId = crypto.randomUUID()
      mutateScene('group', target => {
        const used = new Set(target.groups.map(group => group.name))
        let number = target.groups.length + 1
        while (used.has(`LOGO 组 ${number}`)) number += 1
        target.groups.push({ id: groupId, name: `LOGO 组 ${number}`, opacity: 100 })
        const members = target.layers.filter(layer => ids.has(layer.id)).map(layer => ({ ...layer, groupId }))
        const rest = target.layers.filter(layer => !ids.has(layer.id))
        // Where the topmost picked logo was, counted among the logos that stay.
        const topIndex = target.layers.findLastIndex(layer => ids.has(layer.id))
        const insertAt = target.layers.slice(0, topIndex).filter(layer => !ids.has(layer.id)).length
        rest.splice(insertAt, 0, ...members)
        // Members that came from other groups leave them; gathering keeps the new group in one piece.
        writeOrder(target, rest)
      })
    },

    ungroup(groupId = scene.value?.layers.find(layer => layer.id === state.selectedLayerId)?.groupId ?? null) {
      if (!groupId) return
      mutateScene('ungroup', target => {
        target.layers = target.layers.map(layer => layer.groupId === groupId ? { ...layer, groupId: null } : layer)
        target.groups = target.groups.filter(group => group.id !== groupId)
      })
    },

    renameGroup(groupId: string, name: string) {
      const trimmed = name.trim().slice(0, 60)
      if (!trimmed) return
      mutateScene(`group-name:${groupId}`, target => {
        const group = target.groups.find(item => item.id === groupId)
        if (group) group.name = trimmed
      })
    },

    setGroupOpacity(groupId: string, opacity: number) {
      mutateScene(`group-opacity:${groupId}`, target => {
        const group = target.groups.find(item => item.id === groupId)
        if (group) group.opacity = opacity
      })
    },

    /** Shows or hides, locks or unlocks, every member at once. */
    setGroupFlag(groupId: string, flag: 'visible' | 'locked', value: boolean) {
      mutateScene(`group-${flag}:${groupId}`, target => {
        for (const layer of target.layers) if (layer.groupId === groupId) layer[flag] = value
      })
    },

    /** Free placement from a direct drag; leaves anchor mode. */
    moveLayer(layerId: string, x: number, y: number, gesture: string) {
      mutateLayer(`move:${gesture}`, layer => {
        layer.anchor = null
        layer.x = Math.min(AI_LOGO_RESET_CENTRE_MAX, Math.max(AI_LOGO_RESET_CENTRE_MIN, x))
        layer.y = Math.min(AI_LOGO_RESET_CENTRE_MAX, Math.max(AI_LOGO_RESET_CENTRE_MIN, y))
      }, layerId)
    },

    nudge(dx: number, dy: number) {
      const layer = selectedLayer.value
      if (!layer) return
      actions.moveLayer(layer.id, layer.x + dx, layer.y + dy, 'keyboard')
    },

    setAnchor(anchor: ResetAnchor) { mutateLayer('anchor', layer => { layer.anchor = anchor }) },
    setMargin(margin: number) { mutateLayer('margin', layer => { layer.margin = margin; layer.anchor ??= 'br' }) },
    setSize(size: number, gesture = 'slider') { mutateLayer(`size:${gesture}`, layer => { layer.size = Math.min(80, Math.max(2, size)) }) },
    setRotation(rotation: number, gesture = 'slider') { mutateLayer(`rotation:${gesture}`, layer => { layer.rotation = ((rotation % 360) + 540) % 360 - 180 }) },
    setOpacity(opacity: number) { mutateLayer('opacity', layer => { layer.opacity = opacity }) },
    setShadow(patch: Partial<ResetLayer['shadow']>) { mutateLayer(`shadow:${Object.keys(patch).join(',')}`, layer => { Object.assign(layer.shadow, patch) }) },
    setWarpEnabled(enabled: boolean) {
      mutateLayer('warp-enabled', layer => { layer.warp.enabled = enabled })
      state.warpEditing = enabled
    },
    setWarpCorner(index: number, x: number, y: number, gesture: string) {
      mutateLayer(`warp:${gesture}`, layer => { layer.warp.corners[index] = { x, y } })
    },
    resetWarp() { mutateLayer('warp-reset', layer => { layer.warp.corners = identityCorners() }) },

    setMode(mode: ResetRenderMode) { mutateScene('mode', target => { target.mode = mode }) },
    setFaceAvoid(enabled: boolean) { mutateScene('face-avoid', target => { target.faceAvoid = enabled }) },
    setSafeEdge(enabled: boolean) {
      mutateFrame('safe-edge', target => { target.safeEdge = enabled })
    },

    setPage(page: ResetInspectorPage) {
      state.page = page
      state.straightening = false
      if (page !== 'logo') state.warpEditing = false
    },

    /** Banner switch, mode, the open mode's edges, or the cinematic values; logos follow the new canvas. */
    setBanner(patch: Partial<Pick<ResetBanner, 'enabled' | 'mode'>>) {
      mutateFrame(`banner:${Object.keys(patch).join(',')}`, target => { Object.assign(target.banner, patch) })
    },
    setBannerEdges(patch: Partial<ResetBannerEdges>, gesture = 'slider') {
      mutateFrame(`banner-edges:${Object.keys(patch).join(',')}:${gesture}`, target => {
        if (target.banner.mode !== 'cinematic') Object.assign(target.banner[target.banner.mode], patch)
      })
    },
    setCinematic(patch: Partial<ResetBanner['cinematic']>, gesture = 'slider') {
      mutateFrame(`cinematic:${Object.keys(patch).join(',')}:${gesture}`, target => { Object.assign(target.banner.cinematic, patch) })
    },

    /** Crop rectangle from the overlay or a reset; one undo step per drag. */
    setCropRect(rect: Pick<ResetCrop, 'x' | 'y' | 'width' | 'height'>, gesture = 'drag') {
      mutateFrame(`crop-rect:${gesture}`, target => { Object.assign(target.crop, rect) })
    },
    /** Aspect choice; the crop is refitted to it around its centre. */
    setCropAspect(aspect: string, swapped = false) {
      mutateFrame('crop-aspect', (target, photo) => {
        target.crop = aiLogoResetFitCropRatio({ ...target.crop, aspect, swapped }, photo)
      })
    },
    /** A quarter turn clockwise (1) or back (-1); the crop turns with the photo. */
    turnCrop(direction: 1 | -1) {
      mutateFrame('crop-turn', (target, photo) => {
        const crop = target.crop
        const rect = direction === 1
          ? { x: 1 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width }
          : { x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width }
        const quarterTurns = ((crop.quarterTurns + direction + 4) % 4) as ResetCrop['quarterTurns']
        // A preset keeps its own shape across turns; 'original' follows the photo by itself.
        const swapped = crop.aspect === 'original' || crop.aspect === 'free' ? crop.swapped : !crop.swapped
        target.crop = aiLogoResetFitCropRatio({ ...crop, ...rect, quarterTurns, swapped }, photo)
      })
    },
    flipCrop(axis: 'flipH' | 'flipV') {
      mutateFrame(`crop-${axis}`, target => {
        const crop = target.crop
        target.crop = axis === 'flipH'
          ? { ...crop, flipH: !crop.flipH, x: 1 - crop.x - crop.width, angle: -crop.angle }
          : { ...crop, flipV: !crop.flipV, y: 1 - crop.y - crop.height, angle: -crop.angle }
      })
    },
    setCropAngle(angle: number, gesture = 'slider') {
      mutateFrame(`crop-angle:${gesture}`, target => { target.crop.angle = Math.round(Math.min(45, Math.max(-45, angle)) * 10) / 10 })
    },
    resetCrop() {
      mutateFrame('crop-reset', target => { target.crop = emptyScene().crop })
    },

    /** Copies the current photo's logos, groups and bands to every other photo, re-anchoring per canvas size. The crop stays per photo. */
    syncToAll(targetIds?: string[]) {
      const source = scene.value
      const photo = current.value
      if (!source || !photo) return 0
      const ids = (targetIds ?? state.photos.map(item => item.id)).filter(id => id !== photo.id)
      for (const id of ids) {
        const target = state.photos.find(item => item.id === id)
        if (!target) continue
        mutateScene('sync', scene => copyInto(scene, target, source), id)
      }
      return ids.length
    },

    /** Puts a preset (already in this project's logo ids) on the given photos, replacing their logos; one undo step per photo. */
    applyPreset(source: ResetPresetScene, added: ResetLogoAsset[], photoIds: string[]) {
      for (const logo of added) if (!logoById(logo.id)) state.logos.push(logo)
      let count = 0
      for (const id of photoIds) {
        const photo = state.photos.find(item => item.id === id)
        if (!photo) continue
        mutateScene('preset', scene => copyInto(scene, photo, source), id)
        count += 1
      }
      if (state.currentId && photoIds.includes(state.currentId)) {
        state.layerSelection = []
        state.selectedLayerId = scene.value?.layers.at(-1)?.id ?? null
        state.replacing = false
      }
      return count
    },

    undo() {
      const id = state.currentId
      const history = id ? state.history[id] : undefined
      const previous = history?.past.pop()
      if (!id || !history || !previous) return
      history.future.push(JSON.stringify(state.scenes[id] ?? emptyScene()))
      history.lastKey = ''
      state.scenes[id] = JSON.parse(previous) as ResetPhotoScene
      scheduleSave()
      keepSelection(id)
    },

    redo() {
      const id = state.currentId
      const history = id ? state.history[id] : undefined
      const next = history?.future.pop()
      if (!id || !history || !next) return
      history.past.push(JSON.stringify(state.scenes[id] ?? emptyScene()))
      history.lastKey = ''
      state.scenes[id] = JSON.parse(next) as ResetPhotoScene
      scheduleSave()
      keepSelection(id)
    },

    setZoom(zoom: number | null) { state.zoom = zoom === null ? null : Math.min(4, Math.max(0.1, zoom)) },
    open(dialog: ResetDialog) { state.dialog = dialog },
    close() { state.dialog = null },

    flush,

    dispose() {
      disposed = true
      if (saveTimer) { clearTimeout(saveTimer); void save() }
      releasePhotos(state.photos.map(photo => photo.id))
    }
  }

  return { state, current, scene, frame, canvasOf, selectedLayer, logoById, missingCount, visiblePhotos, canUndo, canRedo, photoUrl, actions }
}

export type ResetWorkspace = ReturnType<typeof createWorkspace>

const workspaces = new Map<string, ResetWorkspace>()

onProjectRemoved(id => {
  workspaces.get(id)?.actions.dispose()
  workspaces.delete(id)
})

export const workspaceFor = (projectId: string): ResetWorkspace => {
  let workspace = workspaces.get(projectId)
  if (!workspace) {
    workspace = createWorkspace(projectId)
    workspaces.set(projectId, workspace)
    void workspace.actions.load()
  }
  return workspace
}
