import {
  aiLogoResetIsConvexQuad,
  aiLogoResetQuadHomography,
  aiLogoResetWarpedQuad
} from '../../../../shared/aiLogoResetGeometry.ts'
import type { ResetPoint } from '../state/types'

/**
 * CSS matrix3d that maps an element box of width × height onto four target corners
 * (top-left, top-right, bottom-right, bottom-left), expressed in the same pixel space.
 * Use with `transform-origin: 0 0`. Returns null for degenerate quads. The export
 * renderer applies the same homography from the shared geometry module.
 */
export const quadToMatrix3d = (width: number, height: number, quad: readonly ResetPoint[]): string | null => {
  const m = aiLogoResetQuadHomography({ width, height }, quad)
  if (!m) return null
  return `matrix3d(${m[0]},${m[3]},0,${m[6]},${m[1]},${m[4]},0,${m[7]},0,0,1,0,${m[2]},${m[5]},0,${m[8]})`
}

/** Target corners for a logo box with fractional corner offsets. */
export const warpedQuad = (width: number, height: number, offsets: readonly ResetPoint[]): ResetPoint[] => aiLogoResetWarpedQuad({ width, height }, offsets)

/** A quad is usable when it stays convex with a consistent winding. */
export const isConvexQuad = (quad: readonly ResetPoint[]) => aiLogoResetIsConvexQuad(quad)
