import type {
  PhotoSharpenBlendMode,
  PhotoSharpenModeControls,
  PhotoSharpenRenderSettings,
  PhotoSharpenSettings
} from './logoTypes.ts'
import type {
  PhotoSharpenExportClarity,
  PhotoSharpenExportDetailSize,
  PhotoSharpenExportOptions
} from './photoSharpenExportTypes.ts'

const DEFAULT_NATURAL_CONTROLS: Readonly<PhotoSharpenModeControls> = Object.freeze({
  amount: 30,
  radius: 0.8,
  threshold: 4
})

const DEFAULT_HIGH_PASS_CONTROLS = Object.freeze({
  amount: 60,
  radius: 1.2,
  threshold: 4,
  blendMode: 'overlay' as const
})

export const DEFAULT_PHOTO_SHARPEN_SETTINGS: Readonly<PhotoSharpenSettings> = Object.freeze({
  enabled: false,
  mode: 'high-pass',
  amount: DEFAULT_HIGH_PASS_CONTROLS.amount,
  radius: DEFAULT_HIGH_PASS_CONTROLS.radius,
  threshold: DEFAULT_HIGH_PASS_CONTROLS.threshold,
  highPassBlendMode: DEFAULT_HIGH_PASS_CONTROLS.blendMode,
  modeSettings: {
    natural: { ...DEFAULT_NATURAL_CONTROLS },
    highPass: { ...DEFAULT_HIGH_PASS_CONTROLS }
  }
})

const DEFAULT_PHOTO_SHARPEN_EXPORT_OPTIONS: Readonly<PhotoSharpenExportOptions> = Object.freeze({
  enabled: false,
  clarity: 'clear',
  amount: 60,
  detailSize: 'medium',
  grainProtection: 4
})

const EXPORT_CLARITY_BLEND_MODE: Readonly<Record<PhotoSharpenExportClarity, PhotoSharpenBlendMode>> = Object.freeze({
  light: 'soft-light',
  clear: 'overlay',
  extreme: 'linear-light'
})

const EXPORT_DETAIL_RADIUS: Readonly<Record<PhotoSharpenExportDetailSize, number>> = Object.freeze({
  small: 0.8,
  medium: 1.2,
  large: 2
})

export const PHOTO_SHARPEN_STANDARD_PREVIEW_MAX_EDGE = 2048
export const PHOTO_SHARPEN_ORIGINAL_PREVIEW_MAX_EDGE = 32768
export const PHOTO_SHARPEN_PREVIEW_MAX_SOURCE_PIXELS = 80_000_000

const finiteNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const normalizeControls = (
  value: Partial<PhotoSharpenModeControls> | null | undefined,
  fallback: PhotoSharpenModeControls
): PhotoSharpenModeControls => ({
  amount: Math.round(Math.max(0, Math.min(100, finiteNumber(value?.amount, fallback.amount)))),
  radius: Math.round(Math.max(0.3, Math.min(3, finiteNumber(value?.radius, fallback.radius))) * 10) / 10,
  threshold: Math.round(Math.max(0, Math.min(20, finiteNumber(value?.threshold, fallback.threshold))))
})

const normalizeBlendMode = (
  value: unknown,
  fallback: PhotoSharpenBlendMode
): PhotoSharpenBlendMode => (
  value === 'soft-light' || value === 'overlay' || value === 'linear-light'
    ? value
    : fallback
)

export const createDefaultPhotoSharpenExportOptions = (): PhotoSharpenExportOptions => ({
  ...DEFAULT_PHOTO_SHARPEN_EXPORT_OPTIONS
})

export const normalizePhotoSharpenExportOptions = (
  value?: Partial<PhotoSharpenExportOptions> | null
): PhotoSharpenExportOptions => ({
  enabled: value?.enabled === true,
  clarity: value?.clarity === 'light' || value?.clarity === 'extreme'
    ? value.clarity
    : DEFAULT_PHOTO_SHARPEN_EXPORT_OPTIONS.clarity,
  amount: Math.round(Math.max(0, Math.min(100, finiteNumber(
    value?.amount,
    DEFAULT_PHOTO_SHARPEN_EXPORT_OPTIONS.amount
  )))),
  detailSize: value?.detailSize === 'small' || value?.detailSize === 'large'
    ? value.detailSize
    : DEFAULT_PHOTO_SHARPEN_EXPORT_OPTIONS.detailSize,
  grainProtection: Math.round(Math.max(0, Math.min(20, finiteNumber(
    value?.grainProtection,
    DEFAULT_PHOTO_SHARPEN_EXPORT_OPTIONS.grainProtection
  ))))
})

export const resolvePhotoSharpenExportSettings = (
  value?: Partial<PhotoSharpenExportOptions> | null
): PhotoSharpenSettings => {
  const normalized = normalizePhotoSharpenExportOptions(value)
  return normalizePhotoSharpenSettings({
    enabled: normalized.enabled,
    mode: 'high-pass',
    amount: normalized.amount,
    radius: EXPORT_DETAIL_RADIUS[normalized.detailSize],
    threshold: normalized.grainProtection,
    highPassBlendMode: EXPORT_CLARITY_BLEND_MODE[normalized.clarity]
  })
}

export const normalizePhotoSharpenSettings = (
  value?: Partial<PhotoSharpenSettings> | null
): PhotoSharpenSettings => {
  const mode = value?.mode === 'natural' ? 'natural' : 'high-pass'
  const legacyControls = normalizeControls(
    value,
    mode === 'natural' ? DEFAULT_NATURAL_CONTROLS : DEFAULT_HIGH_PASS_CONTROLS
  )
  const hasStoredModes = Boolean(value?.modeSettings && typeof value.modeSettings === 'object')
  const natural = normalizeControls(
    value?.modeSettings?.natural,
    mode === 'natural' && value ? legacyControls : DEFAULT_NATURAL_CONTROLS
  )
  const highPassControls = normalizeControls(
    value?.modeSettings?.highPass,
    mode === 'high-pass' && value ? legacyControls : DEFAULT_HIGH_PASS_CONTROLS
  )
  const legacyHighPassBlendMode = value?.mode === 'high-pass' && !hasStoredModes
    ? 'soft-light'
    : DEFAULT_HIGH_PASS_CONTROLS.blendMode
  const highPassBlendMode = normalizeBlendMode(
    value?.modeSettings?.highPass?.blendMode ?? value?.highPassBlendMode,
    legacyHighPassBlendMode
  )
  const active = mode === 'high-pass' ? highPassControls : natural
  return {
    enabled: Boolean(value?.enabled),
    mode,
    ...active,
    highPassBlendMode,
    modeSettings: {
      natural,
      highPass: {
        ...highPassControls,
        blendMode: highPassBlendMode
      }
    }
  }
}

export const clonePhotoSharpenSettings = (settings?: Partial<PhotoSharpenSettings> | null) => (
  normalizePhotoSharpenSettings(settings)
)

export const resolvePhotoSharpenRenderSettings = (
  settings?: Partial<PhotoSharpenSettings> | null
): PhotoSharpenRenderSettings => {
  const normalized = normalizePhotoSharpenSettings(settings)
  return {
    enabled: normalized.enabled,
    mode: normalized.mode,
    amount: normalized.amount,
    radius: normalized.radius,
    threshold: normalized.threshold,
    highPassBlendMode: normalized.highPassBlendMode
  }
}

export const resolvePhotoSharpenPreviewMaxEdge = (
  _width?: unknown,
  _height?: unknown,
  _originalPreviewRequested?: boolean
) => PHOTO_SHARPEN_STANDARD_PREVIEW_MAX_EDGE
