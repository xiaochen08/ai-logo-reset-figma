import type {
  ImageCompositionLayoutResult,
  ImageCompositionRect
} from './imageCompositionLayout'

export interface ImagePreviewViewportSize {
  width: number
  height: number
}

export interface ImagePreviewViewportPoint {
  x: number
  y: number
}

export interface ImagePreviewViewportTransform {
  zoom: number
  panX: number
  panY: number
}

export interface ImagePreviewFrameTransformPainterOptions {
  requestFrame: (callback: () => void) => number
  cancelFrame: (frame: number) => void
  paint: (transform: string) => void
}

export const IMAGE_PREVIEW_MIN_ZOOM = 0.1
export const IMAGE_PREVIEW_MAX_ZOOM = 16
export const IMAGE_PREVIEW_MIN_VISIBLE_EDGE = 64

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
)

export const createImagePreviewTransform = (): ImagePreviewViewportTransform => ({
  zoom: 1,
  panX: 0,
  panY: 0
})

const normalizeCssNumber = (value: number) => Object.is(value, -0) ? 0 : value

export const resolveImagePreviewFrameTransform = (
  committed: ImagePreviewViewportTransform,
  next: ImagePreviewViewportTransform
) => {
  const scale = normalizeCssNumber(next.zoom / committed.zoom)
  const translateX = normalizeCssNumber(next.panX - committed.panX * scale)
  const translateY = normalizeCssNumber(next.panY - committed.panY * scale)
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`
}

export const createImagePreviewFrameTransformPainter = (
  options: ImagePreviewFrameTransformPainterOptions
) => {
  let frame: number | null = null
  let revision = 0
  let pending: {
    committed: ImagePreviewViewportTransform
    next: ImagePreviewViewportTransform
  } | null = null

  const queue = (
    committed: ImagePreviewViewportTransform,
    next: ImagePreviewViewportTransform
  ) => {
    pending = { committed, next }
    if (frame !== null) return
    const scheduledRevision = ++revision
    frame = options.requestFrame(() => {
      if (scheduledRevision !== revision) return
      frame = null
      const update = pending
      pending = null
      if (!update) return
      options.paint(resolveImagePreviewFrameTransform(update.committed, update.next))
    })
  }

  const cancel = () => {
    revision += 1
    if (frame !== null) options.cancelFrame(frame)
    frame = null
    pending = null
  }

  return { queue, cancel }
}

export const resolveImagePreviewWheelZoom = (
  currentZoom: number,
  deltaY: number
) => clamp(
  currentZoom * Math.exp(-deltaY * 0.0014),
  IMAGE_PREVIEW_MIN_ZOOM,
  IMAGE_PREVIEW_MAX_ZOOM
)

export const clampImagePreviewTransform = (
  transform: ImagePreviewViewportTransform,
  viewport: ImagePreviewViewportSize,
  fittedMedia: ImagePreviewViewportSize,
  minimumVisibleEdge = IMAGE_PREVIEW_MIN_VISIBLE_EDGE
): ImagePreviewViewportTransform => {
  const zoom = clamp(
    transform.zoom,
    IMAGE_PREVIEW_MIN_ZOOM,
    IMAGE_PREVIEW_MAX_ZOOM
  )
  if (
    viewport.width <= 0
    || viewport.height <= 0
    || fittedMedia.width <= 0
    || fittedMedia.height <= 0
  ) {
    return { zoom, panX: 0, panY: 0 }
  }

  const scaledWidth = fittedMedia.width * zoom
  const scaledHeight = fittedMedia.height * zoom
  const visibleX = Math.min(minimumVisibleEdge, viewport.width / 2, scaledWidth / 2)
  const visibleY = Math.min(minimumVisibleEdge, viewport.height / 2, scaledHeight / 2)
  const maximumPanX = viewport.width / 2 + scaledWidth / 2 - visibleX
  const maximumPanY = viewport.height / 2 + scaledHeight / 2 - visibleY

  return {
    zoom,
    panX: clamp(transform.panX, -maximumPanX, maximumPanX),
    panY: clamp(transform.panY, -maximumPanY, maximumPanY)
  }
}

export const zoomImagePreviewAtPoint = (
  transform: ImagePreviewViewportTransform,
  requestedZoom: number,
  pointer: ImagePreviewViewportPoint,
  viewport: ImagePreviewViewportSize,
  fittedMedia: ImagePreviewViewportSize
): ImagePreviewViewportTransform => {
  const zoom = clamp(
    requestedZoom,
    IMAGE_PREVIEW_MIN_ZOOM,
    IMAGE_PREVIEW_MAX_ZOOM
  )
  const ratio = zoom / transform.zoom
  const pointerFromCenterX = pointer.x - viewport.width / 2
  const pointerFromCenterY = pointer.y - viewport.height / 2

  return clampImagePreviewTransform({
    zoom,
    panX: pointerFromCenterX - (pointerFromCenterX - transform.panX) * ratio,
    panY: pointerFromCenterY - (pointerFromCenterY - transform.panY) * ratio
  }, viewport, fittedMedia)
}

const transformRect = (
  rect: ImageCompositionRect,
  transform: ImagePreviewViewportTransform,
  viewport: ImagePreviewViewportSize
): ImageCompositionRect => ({
  left: viewport.width / 2
    + transform.panX
    + (rect.left - viewport.width / 2) * transform.zoom,
  top: viewport.height / 2
    + transform.panY
    + (rect.top - viewport.height / 2) * transform.zoom,
  width: rect.width * transform.zoom,
  height: rect.height * transform.zoom
})

const transformOptionalRect = (
  rect: ImageCompositionRect | null,
  transform: ImagePreviewViewportTransform,
  viewport: ImagePreviewViewportSize
) => rect ? transformRect(rect, transform, viewport) : null

export const transformImageCompositionLayout = (
  layout: ImageCompositionLayoutResult,
  transform: ImagePreviewViewportTransform,
  viewport: ImagePreviewViewportSize
): ImageCompositionLayoutResult => ({
  ...layout,
  scale: layout.scale * transform.zoom,
  compositionRect: transformRect(layout.compositionRect, transform, viewport),
  photoRect: transformRect(layout.photoRect, transform, viewport),
  photoViewportRect: transformOptionalRect(layout.photoViewportRect, transform, viewport),
  bannerRects: {
    top: transformOptionalRect(layout.bannerRects.top, transform, viewport),
    right: transformOptionalRect(layout.bannerRects.right, transform, viewport),
    bottom: transformOptionalRect(layout.bannerRects.bottom, transform, viewport),
    left: transformOptionalRect(layout.bannerRects.left, transform, viewport)
  }
})
