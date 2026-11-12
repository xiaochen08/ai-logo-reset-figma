import type { AiLogoResetLayer, AiLogoResetLayerGroup, AiLogoResetLogo, AiLogoResetScene } from './aiLogoReset.ts'
import {
  aiLogoResetEffectiveCentre,
  aiLogoResetLayerBox,
  aiLogoResetRasterToPhoto,
  aiLogoResetShadowOffset,
  aiLogoResetShadowPadding,
  type AiLogoResetMat3,
  type AiLogoResetRect,
  type AiLogoResetSize
} from './aiLogoResetGeometry.ts'

/** One logo as the export renderer draws it, all lengths in canvas pixels. */
export interface AiLogoResetRenderLayer {
  logoId: string
  logoWidth: number
  logoHeight: number
  /** Visible source pixels as fractions of the imported PNG; absent means the whole image. */
  content: AiLogoResetRect
  pad: number
  /** Padded raster (logo at pad, pad) → canvas pixels. */
  matrix: AiLogoResetMat3
  opacity: number
  shadow: null | { color: string, alpha: number, dx: number, dy: number, sigma: number }
}

/** A layer's opacity with its group's applied, 0–1. */
export const aiLogoResetLayerOpacity = (layer: Pick<AiLogoResetLayer, 'opacity' | 'groupId'>, groups: readonly AiLogoResetLayerGroup[]) => {
  const group = layer.groupId ? groups.find(item => item.id === layer.groupId) : undefined
  return layer.opacity / 100 * (group ? group.opacity / 100 : 1)
}

/**
 * Visible layers of one photo, bottom to top, exactly as the stage shows them. `photo` is the
 * canvas the logos sit on (see aiLogoResetFrame) and faces are fractions of it.
 */
export const buildAiLogoResetRenderLayers = (
  photo: AiLogoResetSize,
  scene: AiLogoResetScene,
  logos: readonly Pick<AiLogoResetLogo, 'id' | 'width' | 'height' | 'content'>[],
  faces: readonly AiLogoResetRect[] | null
): AiLogoResetRenderLayer[] => {
  const byId = new Map(logos.map(logo => [logo.id, logo]))
  return scene.layers.flatMap((layer: AiLogoResetLayer) => {
    const logo = byId.get(layer.logoId)
    const opacity = aiLogoResetLayerOpacity(layer, scene.groups)
    if (!logo || !layer.visible || opacity <= 0) return []
    const box = aiLogoResetLayerBox(layer, logo, photo)
    const pad = aiLogoResetShadowPadding(box, layer.shadow)
    const centre = aiLogoResetEffectiveCentre(layer, logo, photo, faces, scene.faceAvoid, scene.safeEdge)
    const offset = aiLogoResetShadowOffset(box, layer.shadow)
    return [{
      logoId: logo.id,
      logoWidth: box.width,
      logoHeight: box.height,
      content: logo.content ?? { x: 0, y: 0, width: 1, height: 1 },
      pad,
      matrix: aiLogoResetRasterToPhoto(layer, centre, box, pad, photo),
      opacity,
      shadow: layer.shadow.enabled && layer.shadow.opacity > 0
        ? { color: layer.shadow.color, alpha: layer.shadow.opacity / 100, dx: offset.dx, dy: offset.dy, sigma: offset.sigma }
        : null
    }]
  })
}
