export type PhotoSharpenExportClarity = 'light' | 'clear' | 'extreme'
export type PhotoSharpenExportDetailSize = 'small' | 'medium' | 'large'

export interface PhotoSharpenExportOptions {
  enabled: boolean
  clarity: PhotoSharpenExportClarity
  amount: number
  detailSize: PhotoSharpenExportDetailSize
  grainProtection: number
}
