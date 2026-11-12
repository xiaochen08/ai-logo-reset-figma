import {
  normalizeCropRect,
  normalizePhotoGeometrySettings,
  type NormalizedCropRect,
  type PhotoGeometrySettings
} from '../../shared/photoGeometry.ts'

export type CropHandle =
  | 'move'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-right'
  | 'bottom-left'

const MIN_SIZE = 0.02
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const resolveCropEditingPreviewGeometry = (
  settings: PhotoGeometrySettings,
  cropModeActive: boolean
) => {
  const normalized = normalizePhotoGeometrySettings(settings)
  return cropModeActive
    ? {
        ...normalized,
        cropRect: { x: 0, y: 0, width: 1, height: 1 }
      }
    : normalized
}

export const resizeNormalizedCropRect = (input: {
  start: NormalizedCropRect
  handle: CropHandle
  deltaX: number
  deltaY: number
  ratio?: number | null
  imageAspect?: number
}): NormalizedCropRect => {
  const start = normalizeCropRect(input.start)
  if (input.handle === 'move') {
    return {
      x: Math.round(clamp(start.x + input.deltaX, 0, 1 - start.width) * 10000) / 10000,
      y: Math.round(clamp(start.y + input.deltaY, 0, 1 - start.height) * 10000) / 10000,
      width: start.width,
      height: start.height
    }
  }

  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (input.handle.includes('left')) left += input.deltaX
  if (input.handle.includes('right')) right += input.deltaX
  if (input.handle.includes('top')) top += input.deltaY
  if (input.handle.includes('bottom')) bottom += input.deltaY

  left = clamp(left, 0, right - MIN_SIZE)
  right = clamp(right, left + MIN_SIZE, 1)
  top = clamp(top, 0, bottom - MIN_SIZE)
  bottom = clamp(bottom, top + MIN_SIZE, 1)

  if (input.ratio && input.ratio > 0) {
    const imageAspect = Math.max(0.0001, input.imageAspect ?? 1)
    const targetNormalizedRatio = input.ratio / imageAspect
    const width = right - left
    const height = bottom - top
    const horizontalHandle = input.handle === 'left' || input.handle === 'right'
    let desiredWidth = horizontalHandle ? width : height * targetNormalizedRatio
    let desiredHeight = horizontalHandle ? width / targetNormalizedRatio : height
    const fitScale = Math.min(1, 1 / desiredWidth, 1 / desiredHeight)
    desiredWidth *= fitScale
    desiredHeight *= fitScale
    const centerX = (left + right) / 2
    const centerY = (top + bottom) / 2

    left = centerX - desiredWidth / 2
    right = centerX + desiredWidth / 2
    top = centerY - desiredHeight / 2
    bottom = centerY + desiredHeight / 2

    if (left < 0) {
      right -= left
      left = 0
    }
    if (right > 1) {
      left -= right - 1
      right = 1
    }
    if (top < 0) {
      bottom -= top
      top = 0
    }
    if (bottom > 1) {
      top -= bottom - 1
      bottom = 1
    }
    left = clamp(left, 0, 1 - MIN_SIZE)
    right = clamp(right, left + MIN_SIZE, 1)
    top = clamp(top, 0, 1 - MIN_SIZE)
    bottom = clamp(bottom, top + MIN_SIZE, 1)
  }

  return normalizeCropRect({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  })
}
