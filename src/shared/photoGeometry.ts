export type CropAspectMode = 'original' | 'full' | 'free' | 'preset' | 'custom'
export type PhotoUprightMode = 'off' | 'auto' | 'level' | 'vertical' | 'full' | 'guided'
export type PhotoOrientation = '横图' | '竖图' | '方图'

export interface NormalizedCropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropAspectRatio {
  width: number
  height: number
}

export interface CustomCropRatio extends CropAspectRatio {
  id: string
  label: string
}

export interface CropAspectPreset extends CropAspectRatio {
  id: string
  label: string
}

export interface PhotoGeometryGuideLine {
  x1: number
  y1: number
  x2: number
  y2: number
  orientation: 'horizontal' | 'vertical'
}

export interface PhotoGeometrySettings {
  version: 1
  cropRect: NormalizedCropRect
  aspectMode: CropAspectMode
  aspectRatio: CropAspectRatio | null
  aspectLocked: boolean
  quarterTurns: 0 | 1 | 2 | 3
  flipHorizontal: boolean
  flipVertical: boolean
  rotationDegrees: number
  vertical: number
  horizontal: number
  aspect: number
  scalePercent: number
  uprightMode: PhotoUprightMode
  guidedLines: PhotoGeometryGuideLine[]
}

export const BUILT_IN_CROP_ASPECT_PRESETS: readonly CropAspectPreset[] = [
  { id: '1x1', label: '1 × 1', width: 1, height: 1 },
  { id: '4x5', label: '4 × 5 / 8 × 10', width: 4, height: 5 },
  { id: '8.5x11', label: '8.5 × 11', width: 8.5, height: 11 },
  { id: '5x7', label: '5 × 7', width: 5, height: 7 },
  { id: '2x3', label: '2 × 3 / 4 × 6', width: 2, height: 3 },
  { id: '3x4', label: '3 × 4', width: 3, height: 4 },
  { id: '16x9', label: '16 × 9', width: 16, height: 9 },
  { id: '16x10', label: '16 × 10', width: 16, height: 10 },
  { id: '2.35x1', label: '2.35 × 1', width: 2.35, height: 1 },
  { id: '16x8', label: '16 × 8', width: 16, height: 8 },
  { id: '16x7', label: '16 × 7', width: 16, height: 7 }
]

const round = (value: number, digits = 4) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const clamp = (value: number, min: number, max: number, fallback = min) => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

const normalizeRatio = (
  value: Partial<CropAspectRatio> | null | undefined
): CropAspectRatio | null => {
  const width = Number(value?.width)
  const height = Number(value?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return {
    width: round(clamp(width, 0.01, 9999), 4),
    height: round(clamp(height, 0.01, 9999), 4)
  }
}

export const normalizeCropRect = (
  value: Partial<NormalizedCropRect> | null | undefined
): NormalizedCropRect => {
  const width = round(clamp(Number(value?.width), 0.001, 1, 1))
  const height = round(clamp(Number(value?.height), 0.001, 1, 1))
  return {
    x: round(clamp(Number(value?.x), 0, 1 - width, 0)),
    y: round(clamp(Number(value?.y), 0, 1 - height, 0)),
    width,
    height
  }
}

const normalizeGuideLine = (
  value: Partial<PhotoGeometryGuideLine> | null | undefined
): PhotoGeometryGuideLine | null => {
  if (value?.orientation !== 'horizontal' && value?.orientation !== 'vertical') return null
  const line = {
    x1: round(clamp(Number(value.x1), 0, 1)),
    y1: round(clamp(Number(value.y1), 0, 1)),
    x2: round(clamp(Number(value.x2), 0, 1)),
    y2: round(clamp(Number(value.y2), 0, 1)),
    orientation: value.orientation
  }
  if (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) < 0.01) return null
  return line
}

export const createDefaultPhotoGeometrySettings = (): PhotoGeometrySettings => ({
  version: 1,
  cropRect: { x: 0, y: 0, width: 1, height: 1 },
  aspectMode: 'original',
  aspectRatio: null,
  aspectLocked: true,
  quarterTurns: 0,
  flipHorizontal: false,
  flipVertical: false,
  rotationDegrees: 0,
  vertical: 0,
  horizontal: 0,
  aspect: 0,
  scalePercent: 100,
  uprightMode: 'off',
  guidedLines: []
})

export const normalizePhotoGeometrySettings = (
  value: Partial<PhotoGeometrySettings> | null | undefined
): PhotoGeometrySettings => {
  const fallback = createDefaultPhotoGeometrySettings()
  const aspectMode: CropAspectMode = ['original', 'full', 'free', 'preset', 'custom'].includes(String(value?.aspectMode))
    ? value!.aspectMode as CropAspectMode
    : fallback.aspectMode
  const uprightMode: PhotoUprightMode = ['off', 'auto', 'level', 'vertical', 'full', 'guided'].includes(String(value?.uprightMode))
    ? value!.uprightMode as PhotoUprightMode
    : fallback.uprightMode
  const quarterTurns = ((Math.trunc(Number(value?.quarterTurns) || 0) % 4) + 4) % 4 as 0 | 1 | 2 | 3
  const guidedLines = Array.isArray(value?.guidedLines)
    ? value.guidedLines.map(normalizeGuideLine).filter((line): line is PhotoGeometryGuideLine => Boolean(line)).slice(0, 4)
    : []

  return {
    version: 1,
    cropRect: normalizeCropRect(value?.cropRect),
    aspectMode,
    aspectRatio: aspectMode === 'preset' || aspectMode === 'custom'
      ? normalizeRatio(value?.aspectRatio)
      : null,
    aspectLocked: value?.aspectLocked !== false,
    quarterTurns,
    flipHorizontal: Boolean(value?.flipHorizontal),
    flipVertical: Boolean(value?.flipVertical),
    rotationDegrees: round(clamp(Number(value?.rotationDegrees), -45, 45, 0), 1),
    vertical: round(clamp(Number(value?.vertical), -100, 100, 0), 1),
    horizontal: round(clamp(Number(value?.horizontal), -100, 100, 0), 1),
    aspect: round(clamp(Number(value?.aspect), -100, 100, 0), 1),
    scalePercent: round(clamp(Number(value?.scalePercent), 50, 150, 100), 1),
    uprightMode,
    guidedLines
  }
}

export const normalizePhotoGeometryByImageId = (
  value: Record<string, Partial<PhotoGeometrySettings>> | null | undefined
): Record<string, PhotoGeometrySettings> => {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([imageId]) => imageId.trim().length > 0)
      .map(([imageId, settings]) => [imageId.trim(), normalizePhotoGeometrySettings(settings)])
  )
}

export const rotateCropAspectRatio = (ratio: CropAspectRatio): CropAspectRatio => ({
  width: ratio.height,
  height: ratio.width
})

export const applyCropAspectRatio = (
  cropRect: NormalizedCropRect,
  ratio: CropAspectRatio,
  imageWidth: number,
  imageHeight: number
): NormalizedCropRect => {
  const current = normalizeCropRect(cropRect)
  const normalizedRatio = normalizeRatio(ratio)
  if (!normalizedRatio || imageWidth <= 0 || imageHeight <= 0) return current
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  const targetPixelRatio = normalizedRatio.width / normalizedRatio.height
  let width = current.width
  let height = width * imageWidth / imageHeight / targetPixelRatio
  if (height > current.height) {
    height = current.height
    width = height * imageHeight / imageWidth * targetPixelRatio
  }
  if (width > 1) {
    width = 1
    height = width * imageWidth / imageHeight / targetPixelRatio
  }
  if (height > 1) {
    height = 1
    width = height * imageHeight / imageWidth * targetPixelRatio
  }
  return normalizeCropRect({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height
  })
}

export const normalizeCustomCropRatios = (
  value: readonly Partial<CustomCropRatio>[] | null | undefined
): CustomCropRatio[] => {
  if (!Array.isArray(value)) return []
  const result: CustomCropRatio[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    const ratio = normalizeRatio(candidate)
    if (!ratio) continue
    const ratioValue = ratio.width / ratio.height
    const key = round(ratioValue, 6).toFixed(6)
    if (seen.has(key)) continue
    const id = typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : `custom-${key}`
    const label = typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim().slice(0, 40)
      : `${ratio.width} × ${ratio.height}`
    result.push({ id, label, ...ratio })
    seen.add(key)
    if (result.length === 10) break
  }
  return result
}

export const getEffectivePhotoOrientation = (
  imageWidth: number,
  imageHeight: number,
  settings: PhotoGeometrySettings
): PhotoOrientation => {
  const normalized = normalizePhotoGeometrySettings(settings)
  const swapsAxes = normalized.quarterTurns % 2 === 1
  const orientedWidth = swapsAxes ? imageHeight : imageWidth
  const orientedHeight = swapsAxes ? imageWidth : imageHeight
  const outputWidth = orientedWidth * normalized.cropRect.width
  const outputHeight = orientedHeight * normalized.cropRect.height
  const ratio = outputWidth / Math.max(1, outputHeight)
  if (Math.abs(ratio - 1) <= 0.01) return '方图'
  return ratio > 1 ? '横图' : '竖图'
}

export const getPhotoGeometryOutputSize = (
  imageWidth: number,
  imageHeight: number,
  settings?: Partial<PhotoGeometrySettings> | null
) => {
  const normalized = normalizePhotoGeometrySettings(settings)
  const swapsAxes = normalized.quarterTurns % 2 === 1
  const orientedWidth = swapsAxes ? imageHeight : imageWidth
  const orientedHeight = swapsAxes ? imageWidth : imageHeight
  return {
    width: Math.max(1, Math.round(orientedWidth * normalized.cropRect.width)),
    height: Math.max(1, Math.round(orientedHeight * normalized.cropRect.height)),
    orientedWidth,
    orientedHeight
  }
}

export const mapPhotoGeometryPoint = (
  point: { x: number; y: number },
  settings?: Partial<PhotoGeometrySettings> | null
) => {
  const normalized = normalizePhotoGeometrySettings(settings)
  let x = point.x
  let y = point.y
  if (normalized.quarterTurns === 1) {
    ;[x, y] = [1 - y, x]
  } else if (normalized.quarterTurns === 2) {
    ;[x, y] = [1 - x, 1 - y]
  } else if (normalized.quarterTurns === 3) {
    ;[x, y] = [y, 1 - x]
  }
  if (normalized.flipHorizontal) x = 1 - x
  if (normalized.flipVertical) y = 1 - y

  const aspectScale = 1 + normalized.aspect / 200
  const scale = normalized.scalePercent / 100
  const centeredX = (x - 0.5) * aspectScale
  const centeredY = y - 0.5
  const perspectiveX = centeredX + centeredY * normalized.horizontal / 200
  const perspectiveY = centeredY + centeredX * normalized.vertical / 200
  const radians = normalized.rotationDegrees * Math.PI / 180
  const rotatedX = (perspectiveX * Math.cos(radians) - perspectiveY * Math.sin(radians)) * scale
  const rotatedY = (perspectiveX * Math.sin(radians) + perspectiveY * Math.cos(radians)) * scale
  x = rotatedX + 0.5
  y = rotatedY + 0.5

  return {
    x: (x - normalized.cropRect.x) / normalized.cropRect.width,
    y: (y - normalized.cropRect.y) / normalized.cropRect.height
  }
}

export const mapPhotoGeometryBounds = (
  bounds: { x: number; y: number; width: number; height: number },
  settings?: Partial<PhotoGeometrySettings> | null
) => {
  const points = [
    mapPhotoGeometryPoint({ x: bounds.x, y: bounds.y }, settings),
    mapPhotoGeometryPoint({ x: bounds.x + bounds.width, y: bounds.y }, settings),
    mapPhotoGeometryPoint({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, settings),
    mapPhotoGeometryPoint({ x: bounds.x, y: bounds.y + bounds.height }, settings)
  ]
  const left = Math.max(0, Math.min(...points.map((point) => point.x)))
  const top = Math.max(0, Math.min(...points.map((point) => point.y)))
  const right = Math.min(1, Math.max(...points.map((point) => point.x)))
  const bottom = Math.min(1, Math.max(...points.map((point) => point.y)))
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  }
}

export const deriveGuidedPhotoGeometry = (
  settings?: Partial<PhotoGeometrySettings> | null
): PhotoGeometrySettings => {
  const normalized = normalizePhotoGeometrySettings(settings)
  const horizontalAngles: number[] = []
  const verticalDeviations: number[] = []
  for (const line of normalized.guidedLines) {
    const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1) * 180 / Math.PI
    if (line.orientation === 'horizontal') {
      const normalizedAngle = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle
      horizontalAngles.push(normalizedAngle)
    } else {
      const deviation = angle >= 0 ? angle - 90 : angle + 90
      verticalDeviations.push(deviation)
    }
  }
  const average = (values: number[]) => (
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  )
  return normalizePhotoGeometrySettings({
    ...normalized,
    uprightMode: 'guided',
    rotationDegrees: -average(horizontalAngles),
    horizontal: -average(verticalDeviations) * 2
  })
}
