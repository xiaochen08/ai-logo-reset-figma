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
