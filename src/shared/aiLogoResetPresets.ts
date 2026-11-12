import {
  AI_LOGO_RESET_LIMITS,
  isAiLogoResetId,
  normalizeAiLogoResetBanner,
  normalizeAiLogoResetLogo,
  normalizeAiLogoResetName,
  normalizeAiLogoResetScene,
  type AiLogoResetBanner,
  type AiLogoResetLayer,
  type AiLogoResetLayerGroup,
  type AiLogoResetLogo,
  type AiLogoResetLogoView,
  type AiLogoResetRenderMode,
  type AiLogoResetScene
} from './aiLogoReset.ts'

export const AI_LOGO_RESET_PRESET_VERSION = 1
export const AI_LOGO_RESET_PRESET_LIMIT = 200

/** What a preset puts on a photo. The crop belongs to each photo and is never saved in a preset. */
export interface AiLogoResetPresetScene {
  /** Layer logoIds refer to the preset's own logos. */
  layers: AiLogoResetLayer[]
  groups: AiLogoResetLayerGroup[]
  mode: AiLogoResetRenderMode
  faceAvoid: boolean
  safeEdge: boolean
  /** Bands saved with the preset; null leaves each photo's own bands alone. */
  banner: AiLogoResetBanner | null
}

/** Presets are shared by every project of the tool. */
export interface AiLogoResetPreset {
  id: string
  name: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  /** Snapshots of the logos its layers use; the PNG files live in the tool's shared, content-addressed logo directory. */
  logos: AiLogoResetLogo[]
  scene: AiLogoResetPresetScene
}

export interface AiLogoResetPresetView extends Omit<AiLogoResetPreset, 'logos'> {
  logos: AiLogoResetLogoView[]
}

export interface AiLogoResetPresetFile {
  version: number
  /** In the user's order; pinned presets are shown first. */
  presets: AiLogoResetPreset[]
}

/** A preset made ready for one project. */
export interface AiLogoResetPresetUse {
  revision: number
  /** Logos added to the project so the preset's layers have their images. */
  added: AiLogoResetLogoView[]
  /** The preset's scene with logo ids rewritten to the project's. */
  scene: AiLogoResetPresetScene
  /** Layers dropped because their logo file no longer exists. */
  missing: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0

export const normalizeAiLogoResetPresetScene = (value: unknown, logoIds: ReadonlySet<string>): AiLogoResetPresetScene => {
  const source = isRecord(value) ? value : {}
  const { layers, groups, mode, faceAvoid, safeEdge } = normalizeAiLogoResetScene(source, logoIds)
  return { layers, groups, mode, faceAvoid, safeEdge, banner: isRecord(source.banner) ? normalizeAiLogoResetBanner(source.banner) : null }
}

/** A stored preset, or null when it is unusable (no valid id or no logo left to place). */
export const normalizeAiLogoResetPreset = (value: unknown): AiLogoResetPreset | null => {
  if (!isRecord(value) || !isAiLogoResetId(value.id)) return null
  const seen = new Set<string>()
  const logos = (Array.isArray(value.logos) ? value.logos : [])
    .map(normalizeAiLogoResetLogo)
    .filter((logo): logo is AiLogoResetLogo => !!logo && !seen.has(logo.id) && !!seen.add(logo.id))
  const scene = normalizeAiLogoResetPresetScene(value.scene, seen)
  if (!scene.layers.length) return null
  // Only logos a layer uses are kept.
  const used = new Set(scene.layers.map(layer => layer.logoId))
  const createdAt = time(value.createdAt)
  return {
    id: value.id,
    name: normalizeAiLogoResetName(value.name) ?? '预设',
    pinned: value.pinned === true,
    createdAt,
    updatedAt: Math.max(createdAt, time(value.updatedAt)),
    logos: logos.filter(logo => used.has(logo.id)),
    scene
  }
}

export const normalizeAiLogoResetPresets = (value: unknown): AiLogoResetPreset[] => {
  const source = isRecord(value) && Array.isArray(value.presets) ? value.presets : []
  const seen = new Set<string>()
  return source
    .map(normalizeAiLogoResetPreset)
    .filter((preset): preset is AiLogoResetPreset => !!preset && !seen.has(preset.id) && !!seen.add(preset.id))
    .slice(0, AI_LOGO_RESET_PRESET_LIMIT)
}

/** Pinned first; otherwise the stored order. */
export const aiLogoResetPresetDisplayOrder = <T extends Pick<AiLogoResetPreset, 'pinned'>>(presets: readonly T[]): T[] => [
  ...presets.filter(preset => preset.pinned),
  ...presets.filter(preset => !preset.pinned)
]

/** "预设N" with the smallest N not in use. */
export const aiLogoResetNextPresetName = (names: readonly string[]) => {
  const used = new Set(names)
  let index = 1
  while (used.has(`预设${index}`)) index += 1
  return `预设${index}`
}

/** A preset of a photo's logos, groups and render settings; logos keep their project ids inside the preset. */
export const buildAiLogoResetPreset = (input: {
  id: string
  name: string
  now: number
  scene: AiLogoResetScene
  logos: readonly AiLogoResetLogo[]
  includeBanner: boolean
  pinned?: boolean
  createdAt?: number
}): AiLogoResetPreset => {
  const known = new Map(input.logos.map(logo => [logo.id, logo]))
  const layers = input.scene.layers.filter(layer => known.has(layer.logoId))
  if (!layers.length) throw new Error('当前照片还没有 LOGO，无法保存为预设。')
  const used = new Set(layers.map(layer => layer.logoId))
  const groups = input.scene.groups.filter(group => layers.some(layer => layer.groupId === group.id))
  return {
    id: input.id,
    name: normalizeAiLogoResetName(input.name) ?? '预设',
    pinned: input.pinned ?? false,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
    logos: input.logos.filter(logo => used.has(logo.id)).map(logo => structuredClone(logo)),
    scene: {
      layers: structuredClone(layers),
      groups: structuredClone(groups),
      mode: input.scene.mode,
      faceAvoid: input.scene.faceAvoid,
      safeEdge: input.scene.safeEdge,
      banner: input.includeBanner ? structuredClone(input.scene.banner) : null
    }
  }
}

/**
 * Fits a preset to a project: each preset logo is matched to a project logo with the same
 * file, or added as a new one when its file still exists. Layers whose file is gone are dropped.
 */
export const mapAiLogoResetPresetToProject = (
  preset: AiLogoResetPreset,
  projectLogos: readonly AiLogoResetLogo[],
  fileExists: (file: string) => boolean,
  createId: () => string
): { added: AiLogoResetLogo[], scene: AiLogoResetPresetScene, missing: number } => {
  const byFile = new Map(projectLogos.map(logo => [logo.file, logo.id]))
  const ids = new Map<string, string>()
  const added: AiLogoResetLogo[] = []
  for (const logo of preset.logos) {
    const existing = byFile.get(logo.file)
    if (existing) { ids.set(logo.id, existing); continue }
    if (!fileExists(logo.file)) continue
    const copy = { ...structuredClone(logo), id: createId() }
    byFile.set(copy.file, copy.id)
    ids.set(logo.id, copy.id)
    added.push(copy)
  }
  if (projectLogos.length + added.length > AI_LOGO_RESET_LIMITS.logos) {
    throw new RangeError(`每个项目最多 ${AI_LOGO_RESET_LIMITS.logos} 个 LOGO，无法完整应用这个预设。`)
  }
  const layers = preset.scene.layers
    .filter(layer => ids.has(layer.logoId))
    .map(layer => ({ ...structuredClone(layer), logoId: ids.get(layer.logoId)! }))
  const groups = preset.scene.groups.filter(group => layers.some(layer => layer.groupId === group.id))
  return {
    added,
    scene: { ...structuredClone(preset.scene), layers, groups },
    missing: preset.scene.layers.length - layers.length
  }
}
