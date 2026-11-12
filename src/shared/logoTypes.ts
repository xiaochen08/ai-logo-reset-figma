/** Public UI sandbox: only the shared Logo library record used by ResetInspector. */
export interface LogoAssetRecord {
  id: string
  originalName: string
  localPath: string
  sizeBytes: number
  width: number
  height: number
  visibleWidth?: number
  visibleHeight?: number
  hasAlpha: boolean
  order?: number
  createdAt: string
  lastUsedAt: string
  source?: 'png' | 'psd-layer' | 'cloud-svg' | 'cloud-png'
}

// Small photo-sharpen contract required by the original export settings UI.
export type PhotoSharpenMode = 'natural' | 'high-pass'
export type PhotoSharpenBlendMode = 'soft-light' | 'overlay' | 'linear-light'
export interface PhotoSharpenModeControls { amount: number; radius: number; threshold: number }
export interface PhotoSharpenModeSettings {
  natural: PhotoSharpenModeControls
  highPass: PhotoSharpenModeControls & { blendMode: PhotoSharpenBlendMode }
}
export interface PhotoSharpenRenderSettings extends PhotoSharpenModeControls {
  enabled: boolean
  mode: PhotoSharpenMode
  highPassBlendMode: PhotoSharpenBlendMode
}
export interface PhotoSharpenSettings extends PhotoSharpenRenderSettings {
  modeSettings: PhotoSharpenModeSettings
}
