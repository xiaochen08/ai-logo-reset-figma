import { aiLogoResetShadowOffset, aiLogoResetShadowPadding } from '../../../../shared/aiLogoResetGeometry.ts'
import type { AiLogoResetRect } from '../../../../shared/aiLogoResetGeometry.ts'
import type { ResetShadow } from '../state/types'

/** Preview pixel budget per logo canvas (long edge, device pixels). */
export const LOGO_PREVIEW_MAX_EDGE = 1600

export interface LogoRasterInput {
  image: HTMLImageElement
  /** Rendered logo box in CSS pixels. */
  width: number
  height: number
  shadow: ResetShadow
  devicePixelRatio: number
  /** Visible source pixels as fractions of the imported PNG; absent means the whole image. */
  content?: AiLogoResetRect
}

/** Extra space around the logo box, in CSS pixels, needed to contain the shadow. */
export const shadowPadding = (width: number, height: number, shadow: ResetShadow) => aiLogoResetShadowPadding({ width, height }, shadow)

const hexToRgba = (hex: string, alpha: number) => {
  const value = /^#([0-9a-f]{6})$/iu.exec(hex)?.[1] ?? '000000'
  const n = Number.parseInt(value, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * Draws a logo (and its shadow) into a bounded canvas. The shadow is part of the
 * raster rather than a CSS filter so it never escapes the canvas box or the
 * workspace compositor; size is capped by LOGO_PREVIEW_MAX_EDGE.
 */
export const drawLogoRaster = (canvas: HTMLCanvasElement, input: LogoRasterInput) => {
  const { image, width, height, shadow, content } = input
  const pad = shadowPadding(width, height, shadow)
  const cssWidth = width + pad * 2, cssHeight = height + pad * 2
  const scale = Math.min(Math.max(1, input.devicePixelRatio), LOGO_PREVIEW_MAX_EDGE / Math.max(1, cssWidth, cssHeight))
  canvas.width = Math.max(1, Math.round(cssWidth * scale))
  canvas.height = Math.max(1, Math.round(cssHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) return pad
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, cssWidth, cssHeight)
  if (shadow.enabled && shadow.opacity > 0) {
    const offset = aiLogoResetShadowOffset({ width, height }, shadow)
    context.shadowColor = hexToRgba(shadow.color, shadow.opacity / 100)
    context.shadowBlur = offset.blur * scale
    context.shadowOffsetX = offset.dx * scale
    context.shadowOffsetY = offset.dy * scale
  }
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const source = content ?? { x: 0, y: 0, width: 1, height: 1 }
  const sx = Math.max(0, Math.min(sourceWidth, source.x * sourceWidth))
  const sy = Math.max(0, Math.min(sourceHeight, source.y * sourceHeight))
  const sw = Math.max(1, Math.min(sourceWidth - sx, source.width * sourceWidth))
  const sh = Math.max(1, Math.min(sourceHeight - sy, source.height * sourceHeight))
  context.drawImage(image, sx, sy, sw, sh, pad, pad, width, height)
  return pad
}
