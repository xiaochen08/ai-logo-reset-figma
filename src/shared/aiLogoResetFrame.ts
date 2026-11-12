import type { AiLogoResetBanner, AiLogoResetBannerFill, AiLogoResetCrop } from './aiLogoReset.ts'
import { AI_LOGO_RESET_CROP_PRESETS } from './aiLogoReset.ts'
import type { AiLogoResetPoint, AiLogoResetRect, AiLogoResetSize } from './aiLogoResetGeometry.ts'

/**
 * What one photo becomes before logos are drawn, in pixels. The order is the original tool's:
 * turn, flip, straighten, crop, then bands. Logos are placed on `canvas`.
 *
 * The workspace preview, the export plan in Main and the Pillow worker all follow these numbers,
 * so a logo lands where it was seen.
 */
export interface AiLogoResetFrame {
  /** The photo as displayed (EXIF orientation applied). */
  source: AiLogoResetSize
  /** After the quarter turns. */
  turned: AiLogoResetSize
  quarterTurns: 0 | 1 | 2 | 3
  flipH: boolean
  flipV: boolean
  /** Straightening, degrees clockwise, about the turned photo's centre. */
  angle: number
  /** Enlargement that keeps the turned frame filled while straightened (1 when straight). */
  zoom: number
  /** The kept part of the turned, straightened photo. */
  crop: AiLogoResetRect
  canvas: AiLogoResetSize
  /** Where the cropped photo sits on the canvas; with cinematic bars it may reach under them. */
  photo: AiLogoResetRect
  /** The part of the canvas the photo shows through. */
  window: AiLogoResetRect
  /** The part a subject in front may cover: the photo, less any inset bands. */
  subject: AiLogoResetRect
  /** Canvas colour under the photo (outset and cinematic bands); null leaves only the photo. */
  background: string | null
  /** Inset bands painted over the photo, under the logos. */
  bands: AiLogoResetRect[]
  bandColor: string
}

const FILLS: Record<AiLogoResetBannerFill, string> = { black: '#000000', white: '#ffffff' }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Turned size of a photo. */
export const aiLogoResetTurnedSize = (source: AiLogoResetSize, quarterTurns: number): AiLogoResetSize => (
  quarterTurns % 2 ? { width: source.height, height: source.width } : { width: source.width, height: source.height }
)

/** The smallest enlargement at which a rectangle, rotated about its centre, still covers itself. */
export const aiLogoResetStraightenZoom = (size: AiLogoResetSize, angle: number) => {
  if (!angle) return 1
  const radians = Math.abs(angle) * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  return Math.max((size.width * cos + size.height * sin) / size.width, (size.width * sin + size.height * cos) / size.height)
}

/** Width over height a crop keeps, in pixels, or null when it is free. */
export const aiLogoResetCropRatio = (crop: Pick<AiLogoResetCrop, 'aspect' | 'swapped' | 'quarterTurns'>, source: AiLogoResetSize): number | null => {
  if (crop.aspect === 'free') return null
  const turned = aiLogoResetTurnedSize(source, crop.quarterTurns)
  const preset = AI_LOGO_RESET_CROP_PRESETS.find(item => item.id === crop.aspect)
  const ratio = preset ? preset.width / preset.height : turned.width / turned.height
  return crop.swapped ? 1 / ratio : ratio
}

/** The largest crop of that ratio, centred on the current crop, inside the photo (fractions of the turned photo). */
export const aiLogoResetFitCropRatio = (crop: AiLogoResetCrop, source: AiLogoResetSize): AiLogoResetCrop => {
  const ratio = aiLogoResetCropRatio(crop, source)
  if (!ratio) return crop
  const turned = aiLogoResetTurnedSize(source, crop.quarterTurns)
  const pixelRatio = ratio * turned.height / turned.width
  let width = crop.width, height = width / pixelRatio
  if (height > crop.height) { height = crop.height; width = height * pixelRatio }
  // A crop that was free or narrower grows back to the largest box that fits.
  const scale = Math.min(1 / width, 1 / height)
  width *= scale; height *= scale
  const centreX = crop.x + crop.width / 2, centreY = crop.y + crop.height / 2
  return {
    ...crop, width, height,
    x: clamp(centreX - width / 2, 0, 1 - width),
    y: clamp(centreY - height / 2, 0, 1 - height)
  }
}

export const aiLogoResetFrame = (source: AiLogoResetSize, crop: AiLogoResetCrop, banner: AiLogoResetBanner): AiLogoResetFrame => {
  const turned = aiLogoResetTurnedSize(source, crop.quarterTurns)
  const left = clamp(Math.round(crop.x * turned.width), 0, turned.width - 1)
  const top = clamp(Math.round(crop.y * turned.height), 0, turned.height - 1)
  const cropRect = {
    x: left,
    y: top,
    width: clamp(Math.round(crop.width * turned.width), 1, turned.width - left),
    height: clamp(Math.round(crop.height * turned.height), 1, turned.height - top)
  }
  const width = cropRect.width, height = cropRect.height
  const base = {
    source: { width: source.width, height: source.height }, turned, quarterTurns: crop.quarterTurns, flipH: crop.flipH, flipV: crop.flipV,
    angle: crop.angle, zoom: aiLogoResetStraightenZoom(turned, crop.angle), crop: cropRect, bands: [] as AiLogoResetRect[]
  }
  const whole = { x: 0, y: 0, width, height }
  if (!banner.enabled) return { ...base, canvas: { width, height }, photo: whole, window: whole, subject: whole, background: null, bandColor: FILLS.black }

  if (banner.mode === 'cinematic') {
    // Bars of the same height top and bottom; the photo slides behind them by offsetY.
    const bar = Math.min(Math.round(height * banner.cinematic.strength / 100), Math.floor((height - 1) / 2))
    const visible = height - bar * 2
    const travel = height - visible
    const hidden = Math.round(travel * (banner.cinematic.offsetY + 100) / 200)
    const window = { x: 0, y: bar, width, height: visible }
    return { ...base, canvas: { width, height }, photo: { x: 0, y: bar - hidden, width, height }, window, subject: window, background: FILLS.black, bandColor: FILLS.black }
  }

  const edges = banner[banner.mode]
  const band = (percent: number, of: number) => Math.round(of * percent / 100)
  const t = band(edges.top, height), b = band(edges.bottom, height), l = band(edges.left, width), r = band(edges.right, width)
  if (banner.mode === 'outset') {
    const photo = { x: l, y: t, width, height }
    return { ...base, canvas: { width: width + l + r, height: height + t + b }, photo, window: photo, subject: photo, background: FILLS[edges.fill], bandColor: FILLS[edges.fill] }
  }
  // Inset: bands over the photo's edges, the side bands between the top and bottom ones.
  const innerHeight = Math.max(0, height - t - b)
  const bands = [
    { x: 0, y: 0, width, height: t },
    { x: 0, y: height - b, width, height: b },
    { x: 0, y: t, width: l, height: innerHeight },
    { x: width - r, y: t, width: r, height: innerHeight }
  ].filter(rect => rect.width > 0 && rect.height > 0)
  const subject = { x: l, y: t, width: Math.max(0, width - l - r), height: innerHeight }
  return { ...base, canvas: { width, height }, photo: whole, window: whole, subject, background: null, bands, bandColor: FILLS[edges.fill] }
}

/** A point of the displayed photo (pixels) on the turned, straightened photo. */
export const aiLogoResetTurnPoint = (frame: Pick<AiLogoResetFrame, 'source' | 'turned' | 'quarterTurns' | 'flipH' | 'flipV' | 'angle' | 'zoom'>, point: AiLogoResetPoint): AiLogoResetPoint => {
  const { width, height } = frame.source
  let x = point.x, y = point.y
  if (frame.quarterTurns === 1) [x, y] = [height - y, x]
  else if (frame.quarterTurns === 2) [x, y] = [width - x, height - y]
  else if (frame.quarterTurns === 3) [x, y] = [y, width - x]
  if (frame.flipH) x = frame.turned.width - x
  if (frame.flipV) y = frame.turned.height - y
  if (!frame.angle && frame.zoom === 1) return { x, y }
  const radians = frame.angle * Math.PI / 180
  const cx = frame.turned.width / 2, cy = frame.turned.height / 2
  const dx = x - cx, dy = y - cy
  return {
    x: cx + frame.zoom * (dx * Math.cos(radians) - dy * Math.sin(radians)),
    y: cy + frame.zoom * (dx * Math.sin(radians) + dy * Math.cos(radians))
  }
}

/** A point of the displayed photo (pixels) on the canvas (pixels). */
export const aiLogoResetCanvasPoint = (frame: AiLogoResetFrame, point: AiLogoResetPoint): AiLogoResetPoint => {
  const turned = aiLogoResetTurnPoint(frame, point)
  return { x: turned.x - frame.crop.x + frame.photo.x, y: turned.y - frame.crop.y + frame.photo.y }
}

/**
 * Face boxes (fractions of the displayed photo) as fractions of the canvas, cut to the part of
 * the photo that shows; faces cropped away are dropped.
 */
export const aiLogoResetCanvasFaces = (frame: AiLogoResetFrame, faces: readonly AiLogoResetRect[] | null): AiLogoResetRect[] | null => {
  if (!faces) return null
  const { width, height } = frame.source
  const view = frame.window
  return faces.flatMap(face => {
    const corners = [[face.x, face.y], [face.x + face.width, face.y], [face.x + face.width, face.y + face.height], [face.x, face.y + face.height]]
      .map(([x, y]) => aiLogoResetCanvasPoint(frame, { x: x * width, y: y * height }))
    const left = Math.max(view.x, Math.min(...corners.map(point => point.x)))
    const top = Math.max(view.y, Math.min(...corners.map(point => point.y)))
    const right = Math.min(view.x + view.width, Math.max(...corners.map(point => point.x)))
    const bottom = Math.min(view.y + view.height, Math.max(...corners.map(point => point.y)))
    if (right - left < 1 || bottom - top < 1) return []
    return [{ x: left / frame.canvas.width, y: top / frame.canvas.height, width: (right - left) / frame.canvas.width, height: (bottom - top) / frame.canvas.height }]
  })
}

/** The worker's copy of a frame: plain numbers, no derived lookups. */
export const aiLogoResetFramePayload = (frame: AiLogoResetFrame) => ({
  quarterTurns: frame.quarterTurns,
  flipH: frame.flipH,
  flipV: frame.flipV,
  angle: frame.angle,
  zoom: frame.zoom,
  crop: frame.crop,
  canvas: frame.canvas,
  photo: frame.photo,
  window: frame.window,
  subject: frame.subject,
  background: frame.background,
  bands: frame.bands,
  bandColor: frame.bandColor
})

export type AiLogoResetFramePayload = ReturnType<typeof aiLogoResetFramePayload>
