import type { AiLogoResetAnchor, AiLogoResetPoint, AiLogoResetRect } from './aiLogoResetGeometry.ts'
import type { PhotoSharpenExportOptions } from './photoSharpenExportTypes.ts'
import { BUILT_IN_CROP_ASPECT_PRESETS } from './photoGeometry.ts'
import type { AiLogoResetPresetUse, AiLogoResetPresetView } from './aiLogoResetPresets.ts'

export type { AiLogoResetAnchor, AiLogoResetPoint, AiLogoResetRect } from './aiLogoResetGeometry.ts'

export const AI_LOGO_RESET_SCHEMA_VERSION = 1
export const AI_LOGO_RESET_LIMITS = Object.freeze({
  projects: 500,
  photos: 3000,
  logos: 64,
  layersPerPhoto: 8,
  nameLength: 60,
  logoBytes: 32 * 1024 * 1024,
  logoEdge: 8192,
  recentExports: 20,
  scanFiles: 10000
})

/** A project card shows its first four photos as a 2×2 mosaic, or a single cover for fewer. */
export const AI_LOGO_RESET_COVER_PHOTOS = 4

export const AI_LOGO_RESET_PHOTO_EXTENSIONS = Object.freeze(['.jpg', '.jpeg', '.png', '.webp'])

export type AiLogoResetOrientation = 'landscape' | 'portrait' | 'square'
export type AiLogoResetRenderMode = 'normal' | 'subject-front'

export interface AiLogoResetShadow {
  enabled: boolean
  color: string
  /** 0–100 */
  opacity: number
  /** Blur as a percentage of the rendered logo's long edge, 0–20. */
  blur: number
  /** Offset distance as a percentage of the rendered logo's long edge, 0–20. */
  distance: number
  /** Degrees, 0 = right, 90 = down. */
  angle: number
}

export interface AiLogoResetWarp {
  enabled: boolean
  /** Corner offsets in logo-box fractions: top-left, top-right, bottom-right, bottom-left. */
  corners: [AiLogoResetPoint, AiLogoResetPoint, AiLogoResetPoint, AiLogoResetPoint]
}

export interface AiLogoResetLayer {
  id: string
  logoId: string
  visible: boolean
  /** Logo centre in canvas fractions (the cropped photo with its bands), 0–1. */
  x: number
  y: number
  /** Logo width as a percentage of the canvas's short edge. */
  size: number
  rotation: number
  /** 0–100 */
  opacity: number
  anchor: AiLogoResetAnchor | null
  /** Margin from the anchored edges as a percentage of the canvas's short edge. */
  margin: number
  shadow: AiLogoResetShadow
  warp: AiLogoResetWarp
  /** A locked logo cannot be moved, resized or edited until it is unlocked. */
  locked: boolean
  /** The group this logo belongs to; group members always sit next to each other in `layers`. */
  groupId: string | null
}

export interface AiLogoResetLayerGroup {
  id: string
  name: string
  /** Applied on top of each member's own opacity: 30, 60, 80 or 100. */
  opacity: number
}

export type AiLogoResetBannerMode = 'outset' | 'inset' | 'cinematic'
export type AiLogoResetBannerFill = 'black' | 'white'

/** Band widths: top and bottom as a percentage of the cropped photo's height, left and right of its width. */
export interface AiLogoResetBannerEdges {
  fill: AiLogoResetBannerFill
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Bands around the photo. outset grows the canvas, inset paints over the photo's edges,
 * cinematic letterboxes the photo in black and lets it slide up or down behind the bars.
 * Each mode keeps its own values, so switching back restores them.
 */
export interface AiLogoResetBanner {
  enabled: boolean
  mode: AiLogoResetBannerMode
  outset: AiLogoResetBannerEdges
  inset: AiLogoResetBannerEdges
  /** strength: each bar's height, % of the photo height; offsetY: -100 (photo up) to 100 (down). */
  cinematic: { strength: number, offsetY: number }
}

/** 'original' keeps the photo's own ratio, 'free' has none; anything else is a crop preset id. */
export type AiLogoResetCropAspect = string

/**
 * How the photo is turned, flipped, straightened and cropped before bands and logos.
 * The crop is in fractions of the turned, flipped and straightened photo.
 */
export interface AiLogoResetCrop {
  x: number
  y: number
  width: number
  height: number
  aspect: AiLogoResetCropAspect
  /** Runs the aspect the other way (4 × 5 becomes 5 × 4). */
  swapped: boolean
  quarterTurns: 0 | 1 | 2 | 3
  flipH: boolean
  flipV: boolean
  /** Straightening, -45 to 45 degrees clockwise; the photo is enlarged just enough to keep the frame filled. */
  angle: number
}

export interface AiLogoResetScene {
  layers: AiLogoResetLayer[]
  groups: AiLogoResetLayerGroup[]
  mode: AiLogoResetRenderMode
  faceAvoid: boolean
  /** Keeps every logo wholly inside the canvas (see aiLogoResetContainCentre). */
  safeEdge: boolean
  banner: AiLogoResetBanner
  crop: AiLogoResetCrop
}

/** Photo as persisted; `path` never leaves the Main process. */
export interface AiLogoResetStoredPhoto {
  id: string
  name: string
  path: string
  width: number
  height: number
  sizeBytes: number
  mtimeMs: number
}

export interface AiLogoResetPhotoView {
  id: string
  name: string
  width: number
  height: number
  orientation: AiLogoResetOrientation
  sizeBytes: number
}

export interface AiLogoResetLogo {
  id: string
  name: string
  /** Content-addressed PNG file name inside the tool's logo directory. */
  file: string
  width: number
  height: number
  /** Where the logo's visible pixels are, as fractions of its box; absent means the whole box. */
  content?: { x: number, y: number, width: number, height: number }
}

export interface AiLogoResetLogoView extends AiLogoResetLogo { url: string }

export type AiLogoResetExportRecordStatus = 'completed' | 'failed' | 'cancelled'

export interface AiLogoResetExportRecord {
  id: string
  createdAt: number
  outputDir: string
  total: number
  success: number
  failed: number
  status: AiLogoResetExportRecordStatus
}

export type AiLogoResetExportFormat = 'source' | 'jpeg' | 'png' | 'webp'

export interface AiLogoResetExportSettings {
  format: AiLogoResetExportFormat
  /** 60–100, used by JPEG and WEBP. */
  quality: number
  /** Resize so the long edge is at most this many pixels; null keeps the original size. */
  longEdge: number | null
  /** Same export-time sharpening as the original 智能加LOGO: the photo only, before logos are drawn. */
  photoSharpen: PhotoSharpenExportOptions
}

/** Journal batch for this tool's exports; `kind` keeps it apart from the original 智能加LOGO journals. */
export interface AiLogoResetExportJournalBatch {
  kind: 'ai-logo-reset'
  id: string
  projectId: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  completedAt?: string
  outputDir: string
  total: number
  success: number
  failed: number
  settings: AiLogoResetExportSettings
  errorMessage?: string
}

export const isAiLogoResetExportBatch = (value: unknown): value is AiLogoResetExportJournalBatch => (
  !!value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'ai-logo-reset'
)

export interface AiLogoResetProject {
  schemaVersion: typeof AI_LOGO_RESET_SCHEMA_VERSION
  revision: number
  id: string
  name: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  photos: AiLogoResetStoredPhoto[]
  logos: AiLogoResetLogo[]
  scenes: Record<string, AiLogoResetScene>
  exports: AiLogoResetExportRecord[]
}

export interface AiLogoResetProjectSummary {
  id: string
  revision: number
  name: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  photoCount: number
  /** Short-lived grant URLs for the first photos (up to AI_LOGO_RESET_COVER_PHOTOS), decoded into thumbnails by the page. */
  coverUrls: string[]
}

export interface AiLogoResetProjectView {
  id: string
  revision: number
  name: string
  pinned: boolean
  createdAt: number
  updatedAt: number
  photos: AiLogoResetPhotoView[]
  logos: AiLogoResetLogoView[]
  scenes: Record<string, AiLogoResetScene>
  exports: AiLogoResetExportRecord[]
  /** Base URL for this window's original-photo grant: `${originalsBase}/${photoId}`. */
  originalsBase: string
}

export type AiLogoResetErrorCode =
  | 'AI_LOGO_RESET_NOT_FOUND'
  | 'AI_LOGO_RESET_REVISION_CONFLICT'
  | 'AI_LOGO_RESET_INVALID'
  | 'AI_LOGO_RESET_LIMIT'
  | 'AI_LOGO_RESET_BUSY'
  | 'AI_LOGO_RESET_RECOGNITION_UNAVAILABLE'

export type AiLogoResetResponse<T> =
  | { success: true, data: T }
  | { success: false, error: string, code?: string, currentRevision?: number }

export interface AiLogoResetImportResult {
  project: AiLogoResetProjectView
  added: number
  duplicates: number
  rejected: Array<{ name: string, reason: string }>
}

export interface AiLogoResetRevisionResult { revision: number, updatedAt: number }

export type AiLogoResetExportPhase = 'preparing' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled'

export interface AiLogoResetExportStatus {
  exportId: string
  projectId: string
  phase: AiLogoResetExportPhase
  total: number
  /** Photos recognised so far while preparing. */
  prepared: number
  success: number
  failed: number
  outputDir: string | null
  message?: string
  code?: string
  /** Photos rendered without recognition results (faces or subject) because recognition failed. */
  degraded: number
  failures: Array<{ photoId: string, name: string, reason: string }>
}

export const isAiLogoResetExportStatus = (value: unknown): value is AiLogoResetExportStatus => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<AiLogoResetExportStatus>
  return typeof item.exportId === 'string' && typeof item.projectId === 'string' && typeof item.phase === 'string'
    && ['preparing', 'running', 'cancelling', 'completed', 'failed', 'cancelled'].includes(item.phase)
    && [item.total, item.prepared, item.success, item.failed, item.degraded].every(value => Number.isSafeInteger(value))
    && Array.isArray(item.failures)
}

export interface AiLogoResetExportRequest {
  projectId: string
  expectedRevision: number
  photoIds: string[]
  settings: AiLogoResetExportSettings
}

/** face: faces only (face avoidance). subject: subject mask plus the faces found with it (subject in front). */
export type AiLogoResetRecognitionKind = 'face' | 'subject'

export interface AiLogoResetRecognition {
  photoId: string
  kind: AiLogoResetRecognitionKind
  /** Face boxes in photo fractions, displayed orientation. */
  faces: Array<{ x: number, y: number, width: number, height: number }>
  maskUrl: string | null
}

/** The recognition the stage and the export use for a scene: subject in front needs the subject mask, face avoidance alone needs faces. */
export const aiLogoResetRecognitionKindFor = (scene: AiLogoResetScene): AiLogoResetRecognitionKind | null => {
  if (!scene.layers.some(layer => layer.visible)) return null
  if (scene.mode === 'subject-front') return 'subject'
  return scene.faceAvoid ? 'face' : null
}

export interface AiLogoResetApi {
  listProjects(): Promise<AiLogoResetResponse<AiLogoResetProjectSummary[]>>
  createProject(request: { name: string }): Promise<AiLogoResetResponse<AiLogoResetProjectSummary>>
  openProject(projectId: string): Promise<AiLogoResetResponse<AiLogoResetProjectView>>
  renameProject(request: { projectId: string, expectedRevision: number, name: string }): Promise<AiLogoResetResponse<AiLogoResetRevisionResult>>
  setPinned(request: { projectId: string, expectedRevision: number, pinned: boolean }): Promise<AiLogoResetResponse<AiLogoResetRevisionResult>>
  deleteProject(request: { projectId: string, expectedRevision: number }): Promise<AiLogoResetResponse<true>>
  /** Scenes travel as JSON text to keep large projects inside IPC node limits. */
  saveScenes(request: { projectId: string, expectedRevision: number, scenesJson: string }): Promise<AiLogoResetResponse<AiLogoResetRevisionResult>>
  importPhotos(request: { projectId: string, expectedRevision: number, paths: string[] }): Promise<AiLogoResetResponse<AiLogoResetImportResult>>
  removePhotos(request: { projectId: string, expectedRevision: number, photoIds: string[] }): Promise<AiLogoResetResponse<AiLogoResetRevisionResult>>
  /** The page normalises every logo (PNG, WEBP, SVG) into PNG bytes before upload. */
  importLogo(request: { projectId: string, expectedRevision: number, name: string, png: Uint8Array }): Promise<AiLogoResetResponse<{ logo: AiLogoResetLogoView, revision: number }>>
  /** Copies an existing shared Logo asset into this reset project without exposing its file path to the page. */
  importLogoAsset(request: { projectId: string, expectedRevision: number, assetId: string }): Promise<AiLogoResetResponse<{ logo: AiLogoResetLogoView, revision: number }>>
  recognize(request: { projectId: string, photoId: string, kind: AiLogoResetRecognitionKind }): Promise<AiLogoResetResponse<AiLogoResetRecognition>>
  startExport(request: AiLogoResetExportRequest): Promise<AiLogoResetResponse<AiLogoResetExportStatus>>
  cancelExport(exportId: string): Promise<AiLogoResetResponse<true>>
  getExportStatus(): Promise<AiLogoResetResponse<AiLogoResetExportStatus | null>>
  openExportFolder(exportId: string): Promise<AiLogoResetResponse<true>>
  onExportProgress(listener: (status: AiLogoResetExportStatus) => void): () => void
  /** Presets are shared by every project; listed in the stored order. */
  listPresets(): Promise<AiLogoResetResponse<AiLogoResetPresetView[]>>
  /** Saves a photo's scene (as the page has it) as a new preset, first among the unpinned ones. */
  savePreset(request: { projectId: string, name: string, sceneJson: string, includeBanner: boolean }): Promise<AiLogoResetResponse<AiLogoResetPresetView>>
  /** Renames, pins, or (with source) replaces the preset's logos with a photo's scene. */
  updatePreset(request: { presetId: string, name?: string, pinned?: boolean, source?: { projectId: string, sceneJson: string, includeBanner: boolean } }): Promise<AiLogoResetResponse<AiLogoResetPresetView>>
  deletePreset(request: { presetId: string }): Promise<AiLogoResetResponse<true>>
  reorderPresets(request: { presetIds: string[] }): Promise<AiLogoResetResponse<true>>
  /** Adds the preset's logos to the project where needed and returns its scene in the project's logo ids. */
  usePreset(request: { projectId: string, expectedRevision: number, presetId: string }): Promise<AiLogoResetResponse<AiLogoResetPresetUse>>
  getPathForFile(file: File): string
}

const ANCHORS = new Set<AiLogoResetAnchor>(['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'])
const ID = /^[A-Za-z0-9_-]{1,64}$/u

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
/** A logo's centre may sit beyond the canvas (canvas fractions), so it can bleed off an edge; the canvas clips it. */
export const AI_LOGO_RESET_CENTRE_MIN = -0.5
export const AI_LOGO_RESET_CENTRE_MAX = 1.5

const finite = (value: unknown, fallback: number, min: number, max: number) => (
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
)

export const isAiLogoResetId = (value: unknown): value is string => typeof value === 'string' && ID.test(value)

const uniqueBy = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>()
  return items.filter(item => !seen.has(item.id) && !!seen.add(item.id))
}

export const aiLogoResetOrientation = (width: number, height: number): AiLogoResetOrientation => (
  Math.abs(width - height) / Math.max(width, height, 1) < 0.02 ? 'square' : width > height ? 'landscape' : 'portrait'
)

export const normalizeAiLogoResetName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/gu, '').trim()
  return trimmed ? trimmed.slice(0, AI_LOGO_RESET_LIMITS.nameLength) : null
}

const normalizeShadow = (value: unknown): AiLogoResetShadow => {
  const source = isRecord(value) ? value : {}
  return {
    enabled: source.enabled === true,
    color: typeof source.color === 'string' && /^#[0-9a-f]{6}$/iu.test(source.color) ? source.color.toLowerCase() : '#000000',
    opacity: finite(source.opacity, 65, 0, 100),
    blur: finite(source.blur, 2.5, 0, 20),
    distance: finite(source.distance, 2.5, 0, 20),
    angle: finite(source.angle, 45, 0, 360)
  }
}

const normalizeCorner = (value: unknown): AiLogoResetPoint => {
  const source = isRecord(value) ? value : {}
  return { x: finite(source.x, 0, -2, 2), y: finite(source.y, 0, -2, 2) }
}

const normalizeLayer = (value: unknown, logoIds: ReadonlySet<string>): AiLogoResetLayer | null => {
  if (!isRecord(value) || !isAiLogoResetId(value.id) || !isAiLogoResetId(value.logoId) || !logoIds.has(value.logoId)) return null
  const warp = isRecord(value.warp) ? value.warp : {}
  const corners = Array.isArray(warp.corners) ? warp.corners : []
  return {
    id: value.id,
    logoId: value.logoId,
    visible: value.visible !== false,
    x: finite(value.x, 0.5, AI_LOGO_RESET_CENTRE_MIN, AI_LOGO_RESET_CENTRE_MAX),
    y: finite(value.y, 0.5, AI_LOGO_RESET_CENTRE_MIN, AI_LOGO_RESET_CENTRE_MAX),
    size: finite(value.size, 18, 2, 80),
    rotation: finite(value.rotation, 0, -180, 180),
    opacity: finite(value.opacity, 100, 0, 100),
    anchor: typeof value.anchor === 'string' && ANCHORS.has(value.anchor as AiLogoResetAnchor) ? value.anchor as AiLogoResetAnchor : null,
    margin: finite(value.margin, 4, 0, 40),
    shadow: normalizeShadow(value.shadow),
    warp: { enabled: warp.enabled === true, corners: [0, 1, 2, 3].map(index => normalizeCorner(corners[index])) as AiLogoResetWarp['corners'] },
    locked: value.locked === true,
    groupId: isAiLogoResetId(value.groupId) ? value.groupId : null
  }
}

export const AI_LOGO_RESET_GROUP_OPACITIES: readonly number[] = Object.freeze([30, 60, 80, 100])
export const AI_LOGO_RESET_CROP_PRESETS = BUILT_IN_CROP_ASPECT_PRESETS

/**
 * Keeps each group's members next to each other, where its lowest member is, and drops
 * groups without members and memberships of groups that do not exist.
 */
export const aiLogoResetGatherGroups = <T extends Pick<AiLogoResetLayer, 'groupId'>>(layers: readonly T[], groups: readonly AiLogoResetLayerGroup[]) => {
  const known = new Set(groups.map(group => group.id))
  const members = new Map<string, T[]>()
  for (const layer of layers) {
    if (layer.groupId && known.has(layer.groupId)) members.set(layer.groupId, [...(members.get(layer.groupId) ?? []), layer])
  }
  const gathered: T[] = []
  for (const layer of layers) {
    const groupId = layer.groupId && known.has(layer.groupId) ? layer.groupId : null
    if (!groupId) gathered.push(layer.groupId ? { ...layer, groupId: null } : layer)
    else if (members.get(groupId)?.[0] === layer) gathered.push(...members.get(groupId)!)
  }
  return { layers: gathered, groups: groups.filter(group => members.has(group.id)) }
}

export const aiLogoResetDefaultBanner = (): AiLogoResetBanner => ({
  enabled: false,
  mode: 'outset',
  outset: { fill: 'white', top: 0, right: 0, bottom: 12, left: 0 },
  inset: { fill: 'black', top: 0, right: 0, bottom: 12, left: 0 },
  cinematic: { strength: 12, offsetY: 0 }
})

export const aiLogoResetDefaultCrop = (): AiLogoResetCrop => ({
  x: 0, y: 0, width: 1, height: 1, aspect: 'original', swapped: false, quarterTurns: 0, flipH: false, flipV: false, angle: 0
})

/** An outset band may be as wide as the photo; inset bands always leave part of the photo showing. */
const normalizeBannerEdges = (value: unknown, fallback: AiLogoResetBannerEdges, max: number): AiLogoResetBannerEdges => {
  const source = isRecord(value) ? value : {}
  const edge = (key: 'top' | 'right' | 'bottom' | 'left') => Math.round(finite(source[key], fallback[key], 0, max))
  return { fill: source.fill === 'black' || source.fill === 'white' ? source.fill : fallback.fill, top: edge('top'), right: edge('right'), bottom: edge('bottom'), left: edge('left') }
}

export const normalizeAiLogoResetBanner = (value: unknown): AiLogoResetBanner => {
  const source = isRecord(value) ? value : {}
  const fallback = aiLogoResetDefaultBanner()
  const cinematic = isRecord(source.cinematic) ? source.cinematic : {}
  return {
    enabled: source.enabled === true,
    mode: source.mode === 'inset' || source.mode === 'cinematic' ? source.mode : 'outset',
    outset: normalizeBannerEdges(source.outset, fallback.outset, 100),
    inset: normalizeBannerEdges(source.inset, fallback.inset, 45),
    cinematic: {
      strength: Math.round(finite(cinematic.strength, fallback.cinematic.strength, 0, 40)),
      offsetY: Math.round(finite(cinematic.offsetY, 0, -100, 100) * 10) / 10
    }
  }
}

const CROP_ASPECTS = new Set(['original', 'free', ...BUILT_IN_CROP_ASPECT_PRESETS.map(preset => preset.id)])
/** Smallest crop side, as a fraction of the photo. */
export const AI_LOGO_RESET_MIN_CROP = 0.02

export const normalizeAiLogoResetCrop = (value: unknown): AiLogoResetCrop => {
  const source = isRecord(value) ? value : {}
  const width = finite(source.width, 1, AI_LOGO_RESET_MIN_CROP, 1), height = finite(source.height, 1, AI_LOGO_RESET_MIN_CROP, 1)
  return {
    x: finite(source.x, 0, 0, 1 - width),
    y: finite(source.y, 0, 0, 1 - height),
    width,
    height,
    aspect: typeof source.aspect === 'string' && CROP_ASPECTS.has(source.aspect) ? source.aspect : 'original',
    swapped: source.swapped === true,
    quarterTurns: Math.trunc(finite(source.quarterTurns, 0, 0, 3)) as AiLogoResetCrop['quarterTurns'],
    flipH: source.flipH === true,
    flipV: source.flipV === true,
    angle: Math.round(finite(source.angle, 0, -45, 45) * 10) / 10
  }
}

export const emptyAiLogoResetScene = (): AiLogoResetScene => ({
  layers: [], groups: [], mode: 'normal', faceAvoid: false, safeEdge: true, banner: aiLogoResetDefaultBanner(), crop: aiLogoResetDefaultCrop()
})

const normalizeGroup = (value: unknown): AiLogoResetLayerGroup | null => {
  if (!isRecord(value) || !isAiLogoResetId(value.id)) return null
  const opacity = AI_LOGO_RESET_GROUP_OPACITIES.includes(Number(value.opacity)) ? Number(value.opacity) : 100
  return { id: value.id, name: normalizeAiLogoResetName(value.name) ?? 'LOGO 组', opacity }
}

export const normalizeAiLogoResetScene = (value: unknown, logoIds: ReadonlySet<string>): AiLogoResetScene => {
  const source = isRecord(value) ? value : {}
  const seen = new Set<string>()
  const layers = (Array.isArray(source.layers) ? source.layers : [])
    .map(layer => normalizeLayer(layer, logoIds))
    .filter((layer): layer is AiLogoResetLayer => !!layer && !seen.has(layer.id) && !!seen.add(layer.id))
    .slice(0, AI_LOGO_RESET_LIMITS.layersPerPhoto)
  const groups = uniqueBy((Array.isArray(source.groups) ? source.groups : []).map(normalizeGroup).filter((group): group is AiLogoResetLayerGroup => !!group))
  return {
    ...aiLogoResetGatherGroups(layers, groups),
    mode: source.mode === 'subject-front' ? 'subject-front' : 'normal', faceAvoid: source.faceAvoid === true,
    // On unless the user turned it off.
    safeEdge: source.safeEdge !== false,
    banner: normalizeAiLogoResetBanner(source.banner),
    crop: normalizeAiLogoResetCrop(source.crop)
  }
}

/** Keeps scenes only for photos in the project; unknown logo references are dropped. */
export const normalizeAiLogoResetScenes = (value: unknown, photoIds: readonly string[], logoIds: ReadonlySet<string>): Record<string, AiLogoResetScene> => {
  const source = isRecord(value) ? value : {}
  const scenes: Record<string, AiLogoResetScene> = {}
  for (const id of photoIds) scenes[id] = normalizeAiLogoResetScene(source[id], logoIds)
  return scenes
}

const normalizeStoredPhoto = (value: unknown): AiLogoResetStoredPhoto | null => {
  if (!isRecord(value) || !isAiLogoResetId(value.id) || typeof value.path !== 'string' || !value.path) return null
  const width = finite(value.width, 0, 0, 1_000_000), height = finite(value.height, 0, 0, 1_000_000)
  if (!width || !height) return null
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name ? value.name.slice(0, 260) : 'photo',
    path: value.path,
    width: Math.round(width),
    height: Math.round(height),
    sizeBytes: finite(value.sizeBytes, 0, 0, Number.MAX_SAFE_INTEGER),
    mtimeMs: finite(value.mtimeMs, 0, 0, Number.MAX_SAFE_INTEGER)
  }
}

export const normalizeAiLogoResetLogo = (value: unknown): AiLogoResetLogo | null => {
  if (!isRecord(value) || !isAiLogoResetId(value.id) || typeof value.file !== 'string' || !/^[a-f0-9]{64}\.png$/u.test(value.file)) return null
  const width = finite(value.width, 0, 0, AI_LOGO_RESET_LIMITS.logoEdge), height = finite(value.height, 0, 0, AI_LOGO_RESET_LIMITS.logoEdge)
  if (!width || !height) return null
  const logo: AiLogoResetLogo = { id: value.id, name: normalizeAiLogoResetName(value.name) ?? 'LOGO', file: value.file, width: Math.round(width), height: Math.round(height) }
  const content = isRecord(value.content) ? value.content : null
  if (content) {
    const x = finite(content.x, 0, 0, 1), y = finite(content.y, 0, 0, 1)
    const box = { x, y, width: finite(content.width, 1, 0, 1 - x), height: finite(content.height, 1, 0, 1 - y) }
    if (box.width > 0 && box.height > 0) logo.content = box
  }
  return logo
}

const normalizeExport = (value: unknown): AiLogoResetExportRecord | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.outputDir !== 'string') return null
  const status = value.status === 'failed' || value.status === 'cancelled' ? value.status : 'completed'
  return {
    id: value.id.slice(0, 64),
    createdAt: finite(value.createdAt, 0, 0, Number.MAX_SAFE_INTEGER),
    outputDir: value.outputDir,
    total: finite(value.total, 0, 0, 1_000_000),
    success: finite(value.success, 0, 0, 1_000_000),
    failed: finite(value.failed, 0, 0, 1_000_000),
    status
  }
}

/** Strict-enough reader for persisted projects: invalid rows are dropped, never invented. */
export const normalizeAiLogoResetProject = (value: unknown): AiLogoResetProject | null => {
  if (!isRecord(value) || !isAiLogoResetId(value.id)) return null
  const photos = uniqueBy((Array.isArray(value.photos) ? value.photos : []).map(normalizeStoredPhoto).filter((photo): photo is AiLogoResetStoredPhoto => !!photo))
    .slice(0, AI_LOGO_RESET_LIMITS.photos)
  const logos = uniqueBy((Array.isArray(value.logos) ? value.logos : []).map(normalizeAiLogoResetLogo).filter((logo): logo is AiLogoResetLogo => !!logo))
    .slice(0, AI_LOGO_RESET_LIMITS.logos)
  const createdAt = finite(value.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
  return {
    schemaVersion: AI_LOGO_RESET_SCHEMA_VERSION,
    revision: Number.isSafeInteger(value.revision) && Number(value.revision) >= 1 ? Number(value.revision) : 1,
    id: value.id,
    name: normalizeAiLogoResetName(value.name) ?? 'LOGO 项目',
    pinned: value.pinned === true,
    createdAt,
    updatedAt: finite(value.updatedAt, createdAt, 0, Number.MAX_SAFE_INTEGER),
    photos,
    logos,
    scenes: normalizeAiLogoResetScenes(value.scenes, photos.map(photo => photo.id), new Set(logos.map(logo => logo.id))),
    exports: (Array.isArray(value.exports) ? value.exports : []).map(normalizeExport)
      .filter((record): record is AiLogoResetExportRecord => !!record)
      .slice(0, AI_LOGO_RESET_LIMITS.recentExports)
  }
}

export const aiLogoResetPhotoView = (photo: AiLogoResetStoredPhoto): AiLogoResetPhotoView => ({
  id: photo.id,
  name: photo.name,
  width: photo.width,
  height: photo.height,
  orientation: aiLogoResetOrientation(photo.width, photo.height),
  sizeBytes: photo.sizeBytes
})

/** Normalised face boxes used by placement; faces are in oriented photo fractions. */
export type AiLogoResetFaces = AiLogoResetRect[]
