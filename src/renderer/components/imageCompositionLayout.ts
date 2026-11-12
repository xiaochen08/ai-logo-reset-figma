export interface ImageCompositionRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ImageCompositionNormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageCompositionBannerInput {
  enabled: boolean
  extendMode: '向外' | '向内' | '宽荧幕' | 'outset' | 'inset' | 'cinematic'
  fill: '黑色' | '白色' | 'black' | 'white'
  topPercent: number
  rightPercent: number
  bottomPercent: number
  leftPercent: number
  photoOffsetYPercent?: number
}

export interface ImageCompositionLayoutInput {
  frameWidth: number
  frameHeight: number
  imageWidth: number
  imageHeight: number
  banner?: ImageCompositionBannerInput | null
}

export interface ImageCompositionLayoutResult {
  scale: number
  outputWidth: number
  outputHeight: number
  fill: 'black' | 'white'
  compositionRect: ImageCompositionRect
  photoRect: ImageCompositionRect
  photoViewportRect: ImageCompositionRect | null
  photoCropTopPx: number
  photoTravelPx: number
  photoOffsetYPercent: number
  bannerRects: {
    top: ImageCompositionRect | null
    right: ImageCompositionRect | null
    bottom: ImageCompositionRect | null
    left: ImageCompositionRect | null
  }
}

export interface ImageCompositionRenderBannerRect {
  key: 'top' | 'right' | 'bottom' | 'left'
  rect: ImageCompositionRect
}

export interface ImageCompositionBannerRenderLayers {
  underlay: ImageCompositionRenderBannerRect[]
  overlay: ImageCompositionRenderBannerRect[]
}

interface ResolvedBannerInput {
  enabled: boolean
  extendMode: 'outset' | 'inset' | 'cinematic'
  fill: 'black' | 'white'
  top: number
  right: number
  bottom: number
  left: number
  photoOffsetYPercent: number
}

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

const clampPhotoOffsetYPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0
  return Math.max(-100, Math.min(100, Math.round(value * 10) / 10))
}

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value))
}

const scaleRect = (rect: ImageCompositionRect, scale: number, offsetLeft: number, offsetTop: number): ImageCompositionRect => ({
  left: offsetLeft + (rect.left * scale),
  top: offsetTop + (rect.top * scale),
  width: rect.width * scale,
  height: rect.height * scale
})

const scaleOptionalRect = (
  rect: ImageCompositionRect | null,
  scale: number,
  offsetLeft: number,
  offsetTop: number
) => rect ? scaleRect(rect, scale, offsetLeft, offsetTop) : null

const getCinematicCropTopPxFromOffset = (travelPx: number, photoOffsetYPercent: number) => {
  if (travelPx <= 0) return 0
  const ratio = (clampPhotoOffsetYPercent(photoOffsetYPercent) + 100) / 200
  return Math.round(travelPx * ratio)
}

const getPhotoOffsetYPercentFromCinematicCropTopPx = (travelPx: number, cropTopPx: number) => {
  if (travelPx <= 0) return 0
  return clampPhotoOffsetYPercent(((clamp(cropTopPx, 0, travelPx) / travelPx) * 200) - 100)
}

const resolveCinematicPhotoWindow = (
  imageHeight: number,
  top: number,
  bottom: number,
  photoOffsetYPercent: number
) => {
  const visibleHeight = Math.max(0, imageHeight - top - bottom)
  if (visibleHeight <= 0) {
    return {
      visibleHeight: 0,
      travelPx: 0,
      cropTopPx: 0,
      photoOffsetYPercent: 0
    }
  }

  const travelPx = Math.max(0, imageHeight - visibleHeight)
  if (travelPx <= 0) {
    return {
      visibleHeight,
      travelPx: 0,
      cropTopPx: 0,
      photoOffsetYPercent: 0
    }
  }

  const normalizedPhotoOffsetYPercent = clampPhotoOffsetYPercent(photoOffsetYPercent)
  return {
    visibleHeight,
    travelPx,
    cropTopPx: getCinematicCropTopPxFromOffset(travelPx, normalizedPhotoOffsetYPercent),
    photoOffsetYPercent: normalizedPhotoOffsetYPercent
  }
}

const resolveBannerInput = (
  imageWidth: number,
  imageHeight: number,
  banner?: ImageCompositionBannerInput | null
): ResolvedBannerInput => {
  const extendMode = banner?.extendMode === '向内' || banner?.extendMode === 'inset'
    ? 'inset'
    : banner?.extendMode === '宽荧幕' || banner?.extendMode === 'cinematic'
      ? 'cinematic'
      : 'outset'
  const topPercent = clampPercent(Number(banner?.topPercent))
  const rightPercent = clampPercent(Number(banner?.rightPercent))
  const bottomPercent = clampPercent(Number(banner?.bottomPercent))
  const leftPercent = clampPercent(Number(banner?.leftPercent))
  const cinematicPercent = Math.max(topPercent, bottomPercent)
  const top = Math.round(imageHeight * ((extendMode === 'cinematic' ? cinematicPercent : topPercent) / 100))
  const right = Math.round(imageWidth * ((extendMode === 'cinematic' ? 0 : rightPercent) / 100))
  const bottom = Math.round(imageHeight * ((extendMode === 'cinematic' ? cinematicPercent : bottomPercent) / 100))
  const left = Math.round(imageWidth * ((extendMode === 'cinematic' ? 0 : leftPercent) / 100))

  return {
    enabled: Boolean(banner?.enabled),
    extendMode,
    fill: extendMode === 'cinematic'
      ? 'black'
      : banner?.fill === '白色' || banner?.fill === 'white'
        ? 'white'
        : 'black',
    top,
    right,
    bottom,
    left,
    photoOffsetYPercent: extendMode === 'cinematic' ? clampPhotoOffsetYPercent(Number(banner?.photoOffsetYPercent)) : 0
  }
}

export const getImageCompositionLayout = (input: ImageCompositionLayoutInput): ImageCompositionLayoutResult | null => {
  if (!input.frameWidth || !input.frameHeight || !input.imageWidth || !input.imageHeight) {
    return null
  }

  const banner = resolveBannerInput(input.imageWidth, input.imageHeight, input.banner)
  const insetLike = banner.extendMode === 'inset' || banner.extendMode === 'cinematic'
  const outputWidth = banner.enabled && banner.extendMode === 'outset'
    ? input.imageWidth + banner.left + banner.right
    : input.imageWidth
  const outputHeight = banner.enabled && banner.extendMode === 'outset'
    ? input.imageHeight + banner.top + banner.bottom
    : input.imageHeight
  const cinematicPhotoWindow = banner.enabled && banner.extendMode === 'cinematic'
    ? resolveCinematicPhotoWindow(input.imageHeight, banner.top, banner.bottom, banner.photoOffsetYPercent)
    : {
        visibleHeight: input.imageHeight,
        travelPx: 0,
        cropTopPx: 0,
        photoOffsetYPercent: 0
      }
  const scale = Math.min(input.frameWidth / outputWidth, input.frameHeight / outputHeight)
  const renderedWidth = outputWidth * scale
  const renderedHeight = outputHeight * scale
  const offsetLeft = (input.frameWidth - renderedWidth) / 2
  const offsetTop = (input.frameHeight - renderedHeight) / 2

  const sourcePhotoRect: ImageCompositionRect = banner.enabled && banner.extendMode === 'outset'
    ? {
        left: banner.left,
        top: banner.top,
        width: input.imageWidth,
        height: input.imageHeight
      }
    : banner.enabled && banner.extendMode === 'cinematic'
      ? {
          left: 0,
          top: banner.top - cinematicPhotoWindow.cropTopPx,
          width: input.imageWidth,
          height: input.imageHeight
        }
      : {
          left: 0,
          top: 0,
          width: input.imageWidth,
          height: input.imageHeight
        }
  const sourcePhotoViewportRect: ImageCompositionRect | null = banner.enabled && banner.extendMode === 'cinematic'
    ? {
        left: 0,
        top: banner.top,
        width: input.imageWidth,
        height: cinematicPhotoWindow.visibleHeight
      }
    : null

  const sourceTopRect = banner.enabled && banner.top > 0
    ? {
        left: 0,
        top: 0,
        width: outputWidth,
        height: banner.top
      }
    : null
  const sourceBottomRect = banner.enabled && banner.bottom > 0
    ? {
        left: 0,
        top: outputHeight - banner.bottom,
        width: outputWidth,
        height: banner.bottom
      }
    : null
  const sideTop = banner.top
  const sideHeight = Math.max(0, input.imageHeight - (insetLike ? banner.top + banner.bottom : 0))
  const sourceLeftRect = banner.enabled && banner.left > 0
    ? {
        left: banner.extendMode === 'outset' ? 0 : 0,
        top: sideTop,
        width: banner.left,
        height: sideHeight
      }
    : null
  const sourceRightRect = banner.enabled && banner.right > 0
    ? {
        left: banner.extendMode === 'outset' ? outputWidth - banner.right : outputWidth - banner.right,
        top: sideTop,
        width: banner.right,
        height: sideHeight
      }
    : null

  return {
    scale,
    outputWidth,
    outputHeight,
    fill: banner.fill,
    compositionRect: {
      left: offsetLeft,
      top: offsetTop,
      width: renderedWidth,
      height: renderedHeight
    },
    photoRect: scaleRect(sourcePhotoRect, scale, offsetLeft, offsetTop),
    photoViewportRect: scaleOptionalRect(sourcePhotoViewportRect, scale, offsetLeft, offsetTop),
    photoCropTopPx: cinematicPhotoWindow.cropTopPx,
    photoTravelPx: cinematicPhotoWindow.travelPx,
    photoOffsetYPercent: cinematicPhotoWindow.photoOffsetYPercent,
    bannerRects: {
      top: scaleOptionalRect(sourceTopRect, scale, offsetLeft, offsetTop),
      right: scaleOptionalRect(sourceRightRect, scale, offsetLeft, offsetTop),
      bottom: scaleOptionalRect(sourceBottomRect, scale, offsetLeft, offsetTop),
      left: scaleOptionalRect(sourceLeftRect, scale, offsetLeft, offsetTop)
    }
  }
}

export const mapNormalizedPhotoRectToComposition = (
  layout: ImageCompositionLayoutResult,
  bounds: ImageCompositionNormalizedRect
): ImageCompositionRect | null => {
  const photoLeft = layout.photoRect.left - layout.compositionRect.left
  const photoTop = layout.photoRect.top - layout.compositionRect.top
  const mapped = {
    left: photoLeft + bounds.x * layout.photoRect.width,
    top: photoTop + bounds.y * layout.photoRect.height,
    width: bounds.width * layout.photoRect.width,
    height: bounds.height * layout.photoRect.height
  }
  const viewport = layout.photoViewportRect ?? layout.compositionRect
  const viewportLeft = viewport.left - layout.compositionRect.left
  const viewportTop = viewport.top - layout.compositionRect.top
  const left = Math.max(mapped.left, viewportLeft)
  const top = Math.max(mapped.top, viewportTop)
  const right = Math.min(mapped.left + mapped.width, viewportLeft + viewport.width)
  const bottom = Math.min(mapped.top + mapped.height, viewportTop + viewport.height)

  if (right <= left || bottom <= top) return null
  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  }
}

export const getBannerRenderLayers = (
  layout: ImageCompositionLayoutResult,
  banner?: ImageCompositionBannerInput | null
): ImageCompositionBannerRenderLayers => {
  if (!banner?.enabled) {
    return {
      underlay: [],
      overlay: []
    }
  }

  const activeRects = (Object.entries(layout.bannerRects) as Array<[
    'top' | 'right' | 'bottom' | 'left',
    ImageCompositionRect | null
  ]>)
    .filter(([, rect]) => Boolean(rect && rect.width > 0 && rect.height > 0))
    .map(([key, rect]) => ({
      key,
      rect: rect!
    }))

  if (banner.extendMode === '向内' || banner.extendMode === 'inset' || banner.extendMode === '宽荧幕' || banner.extendMode === 'cinematic') {
    return {
      underlay: [],
      overlay: activeRects
    }
  }

  return {
    underlay: activeRects,
    overlay: []
  }
}

export const getDraggedCinematicPhotoOffsetYPercent = (
  layout: ImageCompositionLayoutResult,
  startPhotoOffsetYPercent: number,
  deltaY: number
) => {
  if (!layout.photoViewportRect || layout.photoTravelPx <= 0 || layout.scale <= 0) {
    return clampPhotoOffsetYPercent(startPhotoOffsetYPercent)
  }

  const startCropTopPx = getCinematicCropTopPxFromOffset(layout.photoTravelPx, startPhotoOffsetYPercent)
  const nextCropTopPx = clamp(startCropTopPx - (deltaY / layout.scale), 0, layout.photoTravelPx)
  return getPhotoOffsetYPercentFromCinematicCropTopPx(layout.photoTravelPx, nextCropTopPx)
}
