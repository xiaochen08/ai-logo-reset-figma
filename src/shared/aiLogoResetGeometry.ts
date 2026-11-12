/**
 * Pure placement math for 智能加LOGO（重置版）. The workspace preview and the export
 * renderer both derive every logo's pixel geometry from these functions, so the
 * exported file matches the stage exactly.
 */

export type AiLogoResetAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br'
export interface AiLogoResetPoint { x: number, y: number }
export interface AiLogoResetSize { width: number, height: number }
export interface AiLogoResetRect { x: number, y: number, width: number, height: number }

/** A logo's size, and where its visible pixels are (fractions of its box; absent = the whole box). */
export interface AiLogoResetLogoShape extends AiLogoResetSize { content?: AiLogoResetRect }

export interface AiLogoResetShadowParams { enabled: boolean, opacity: number, blur: number, distance: number, angle: number }

export interface AiLogoResetPlacementLayer {
  x: number
  y: number
  size: number
  rotation: number
  anchor: AiLogoResetAnchor | null
  margin: number
  shadow: AiLogoResetShadowParams
  warp: { enabled: boolean, corners: readonly AiLogoResetPoint[] }
}

/** Row-major 3×3 projective matrix: x' = (m0 x + m1 y + m2) / (m6 x + m7 y + m8). */
export type AiLogoResetMat3 = [number, number, number, number, number, number, number, number, number]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Rendered logo box in photo pixels: width is a percentage of the photo's short edge. */
export const aiLogoResetLayerBox = (layer: Pick<AiLogoResetPlacementLayer, 'size'>, logo: AiLogoResetLogoShape, photo: AiLogoResetSize): AiLogoResetSize => {
  const short = Math.min(photo.width, photo.height)
  const width = Math.max(1, short * layer.size / 100)
  const content = logo.content ?? { x: 0, y: 0, width: 1, height: 1 }
  const contentWidth = Math.max(1, logo.width * content.width)
  const contentHeight = Math.max(1, logo.height * content.height)
  return { width, height: width * (contentHeight / contentWidth) }
}

/** Centre (photo fractions) for an anchor with a margin measured on the photo's short edge. */
export const aiLogoResetAnchoredCentre = (
  anchor: AiLogoResetAnchor,
  margin: number,
  layer: Pick<AiLogoResetPlacementLayer, 'size'>,
  logo: AiLogoResetLogoShape,
  photo: AiLogoResetSize
): AiLogoResetPoint => {
  const box = aiLogoResetLayerBox(layer, logo, photo)
  const gap = Math.min(photo.width, photo.height) * margin / 100
  const column = anchor[1], row = anchor[0]
  const x = column === 'l' ? gap + box.width / 2 : column === 'r' ? photo.width - gap - box.width / 2 : photo.width / 2
  const y = row === 't' ? gap + box.height / 2 : row === 'b' ? photo.height - gap - box.height / 2 : photo.height / 2
  return { x: clamp(x / photo.width, 0, 1), y: clamp(y / photo.height, 0, 1) }
}

/** Space around the logo box (same units as the box) that contains the full shadow falloff. */
export const aiLogoResetShadowPadding = (box: AiLogoResetSize, shadow: AiLogoResetShadowParams) => {
  if (!shadow.enabled) return 0
  const edge = Math.max(box.width, box.height)
  return Math.ceil(edge * (shadow.blur * 1.5 + shadow.distance) / 100 + 2)
}

/** Canvas-equivalent shadow parameters for a box: offset and Gaussian sigma in box units. */
export const aiLogoResetShadowOffset = (box: AiLogoResetSize, shadow: AiLogoResetShadowParams) => {
  const edge = Math.max(box.width, box.height)
  const radians = shadow.angle * Math.PI / 180
  const distance = edge * shadow.distance / 100
  const blur = edge * shadow.blur / 100
  // Canvas shadowBlur is twice the Gaussian standard deviation.
  return { dx: Math.cos(radians) * distance, dy: Math.sin(radians) * distance, blur, sigma: blur / 2 }
}

export const aiLogoResetWarpedQuad = (box: AiLogoResetSize, corners: readonly AiLogoResetPoint[]): AiLogoResetPoint[] => {
  const base = [{ x: 0, y: 0 }, { x: box.width, y: 0 }, { x: box.width, y: box.height }, { x: 0, y: box.height }]
  return base.map((point, index) => ({ x: point.x + (corners[index]?.x ?? 0) * box.width, y: point.y + (corners[index]?.y ?? 0) * box.height }))
}

export const aiLogoResetIsConvexQuad = (quad: readonly AiLogoResetPoint[]) => {
  if (quad.length !== 4) return false
  let sign = 0
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i], b = quad[(i + 1) % 4], c = quad[(i + 2) % 4]
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(cross) < 1e-6) return false
    const next = Math.sign(cross)
    if (sign && next !== sign) return false
    sign = next
  }
  return true
}

/** Homography mapping the box (0..width, 0..height) onto quad (TL, TR, BR, BL). Null for degenerate quads. */
export const aiLogoResetQuadHomography = (box: AiLogoResetSize, quad: readonly AiLogoResetPoint[]): AiLogoResetMat3 | null => {
  if (quad.length !== 4 || box.width <= 0 || box.height <= 0) return null
  const [p0, p1, p2, p3] = quad
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y
  const den = dx1 * dy2 - dx2 * dy1
  if (Math.abs(den) < 1e-9) return null
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const h = (dx1 * dy3 - dx3 * dy1) / den
  const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x
  const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y
  const m: AiLogoResetMat3 = [a / box.width, b / box.height, c, d / box.width, e / box.height, f, g / box.width, h / box.height, 1]
  return m.every(Number.isFinite) ? m : null
}

export const aiLogoResetMultiply = (a: AiLogoResetMat3, b: AiLogoResetMat3): AiLogoResetMat3 => {
  const out = new Array<number>(9) as AiLogoResetMat3
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      out[row * 3 + column] = a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column]
    }
  }
  return out
}

export const aiLogoResetApply = (m: AiLogoResetMat3, point: AiLogoResetPoint): AiLogoResetPoint => {
  const w = m[6] * point.x + m[7] * point.y + m[8]
  return { x: (m[0] * point.x + m[1] * point.y + m[2]) / w, y: (m[3] * point.x + m[4] * point.y + m[5]) / w }
}

const translate = (x: number, y: number): AiLogoResetMat3 => [1, 0, x, 0, 1, y, 0, 0, 1]
const rotate = (degrees: number): AiLogoResetMat3 => {
  const radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians)
  return [cos, -sin, 0, sin, cos, 0, 0, 0, 1]
}

/** The perspective part of a layer: box space → warped box space, or identity. */
export const aiLogoResetWarpMatrix = (box: AiLogoResetSize, warp: AiLogoResetPlacementLayer['warp']): AiLogoResetMat3 => (
  (warp.enabled ? aiLogoResetQuadHomography(box, aiLogoResetWarpedQuad(box, warp.corners)) : null) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]
)

/**
 * Maps a point of the padded logo raster (logo drawn at pad, pad) to photo pixels:
 * translate(centre) · rotate · translate(−box/2) · warp · translate(−pad).
 * This is exactly the transform stack the stage applies through CSS.
 */
export const aiLogoResetRasterToPhoto = (
  layer: Pick<AiLogoResetPlacementLayer, 'rotation' | 'warp'>,
  centre: AiLogoResetPoint,
  box: AiLogoResetSize,
  pad: number,
  photo: AiLogoResetSize
): AiLogoResetMat3 => [
  translate(centre.x * photo.width, centre.y * photo.height),
  rotate(layer.rotation),
  translate(-box.width / 2, -box.height / 2),
  aiLogoResetWarpMatrix(box, layer.warp),
  translate(-pad, -pad)
].reduce((acc, next) => aiLogoResetMultiply(acc, next))

/** Logo box corners (no shadow) in photo pixels; with `area` (fractions of the box), that part's corners. */
export const aiLogoResetLayerQuad = (
  layer: AiLogoResetPlacementLayer,
  centre: AiLogoResetPoint,
  logo: AiLogoResetLogoShape,
  photo: AiLogoResetSize,
  area: AiLogoResetRect = { x: 0, y: 0, width: 1, height: 1 }
) => {
  const box = aiLogoResetLayerBox(layer, logo, photo)
  const matrix = aiLogoResetRasterToPhoto(layer, centre, box, 0, photo)
  const left = area.x * box.width, top = area.y * box.height, right = (area.x + area.width) * box.width, bottom = (area.y + area.height) * box.height
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }].map(point => aiLogoResetApply(matrix, point))
}

/**
 * Where a logo's visible pixels are, from its decoded pixels (alpha above about 6%), as fractions of
 * the image. A fully transparent image counts as the whole box.
 */
export const aiLogoResetOpaqueBounds = (pixels: Uint8Array, width: number, height: number, alphaOffset = 3): AiLogoResetRect => {
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4 + alphaOffset
    for (let x = 0; x < width; x += 1) {
      if (pixels[row + x * 4] <= 16) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < 0) return { x: 0, y: 0, width: 1, height: 1 }
  return { x: left / width, y: top / height, width: (right + 1 - left) / width, height: (bottom + 1 - top) / height }
}

const ANCHOR_ORDER: readonly AiLogoResetAnchor[] = ['br', 'bl', 'tr', 'tl', 'bc', 'tc', 'mr', 'ml', 'mc']

const boundsOf = (points: readonly AiLogoResetPoint[]) => {
  const xs = points.map(point => point.x), ys = points.map(point => point.y)
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
}

/** Clear space a free-placed logo keeps from the photo's edges with the safe edge on, % of the short edge. */
export const AI_LOGO_RESET_SAFE_EDGE = 2

/**
 * The nearest centre at which the logo's visible pixels (rotated and warped; transparent edges and
 * the shadow not counted) stay inside the photo. A free-placed logo keeps AI_LOGO_RESET_SAFE_EDGE
 * clear; an anchored one keeps its own margin when that is smaller. A logo larger than the photo on
 * an axis is centred on that axis.
 */
export const aiLogoResetContainCentre = (
  layer: AiLogoResetPlacementLayer,
  centre: AiLogoResetPoint,
  logo: AiLogoResetLogoShape,
  photo: AiLogoResetSize
): AiLogoResetPoint => {
  const gap = Math.min(photo.width, photo.height) * (layer.anchor ? Math.min(layer.margin, AI_LOGO_RESET_SAFE_EDGE) : AI_LOGO_RESET_SAFE_EDGE) / 100
  const box = boundsOf(aiLogoResetLayerQuad(layer, centre, logo, photo))
  const shift = (low: number, high: number, size: number) => {
    if (high - low > size - gap * 2) return size / 2 - (low + high) / 2
    if (low < gap) return gap - low
    if (high > size - gap) return size - gap - high
    return 0
  }
  return {
    x: clamp(centre.x + shift(box.left, box.right, photo.width) / photo.width, 0, 1),
    y: clamp(centre.y + shift(box.top, box.bottom, photo.height) / photo.height, 0, 1)
  }
}

/**
 * Where a layer is drawn. With face avoidance on and faces known, a layer whose box
 * overlaps a (padded) face moves to the nearest anchor position that is clear; when
 * no position is clear, or faces are unknown, it stays where the user put it. With the
 * safe edge on, every position considered is first brought wholly inside the photo.
 */
export const aiLogoResetEffectiveCentre = (
  layer: AiLogoResetPlacementLayer,
  logo: AiLogoResetLogoShape,
  photo: AiLogoResetSize,
  faces: readonly AiLogoResetRect[] | null,
  faceAvoid: boolean,
  safeEdge = false
): AiLogoResetPoint => {
  const fit = (centre: AiLogoResetPoint) => safeEdge ? aiLogoResetContainCentre(layer, centre, logo, photo) : centre
  const own = fit({ x: layer.x, y: layer.y })
  if (!faceAvoid || !faces?.length) return own
  const zones = faces.map(face => {
    const padX = face.width * 0.15, padY = face.height * 0.15
    return {
      left: (face.x - padX) * photo.width, top: (face.y - padY) * photo.height,
      right: (face.x + face.width + padX) * photo.width, bottom: (face.y + face.height + padY) * photo.height
    }
  })
  const clear = (centre: AiLogoResetPoint) => {
    const box = boundsOf(aiLogoResetLayerQuad(layer, centre, logo, photo))
    return zones.every(zone => box.right <= zone.left || box.left >= zone.right || box.bottom <= zone.top || box.top >= zone.bottom)
  }
  if (clear(own)) return own
  const margin = layer.margin > 0 ? layer.margin : 4
  const candidates = ANCHOR_ORDER.map(anchor => fit(aiLogoResetAnchoredCentre(anchor, margin, layer, logo, photo)))
    .filter(clear)
    .sort((a, b) => Math.hypot((a.x - own.x) * photo.width, (a.y - own.y) * photo.height) - Math.hypot((b.x - own.x) * photo.width, (b.y - own.y) * photo.height))
  return candidates[0] ?? own
}
