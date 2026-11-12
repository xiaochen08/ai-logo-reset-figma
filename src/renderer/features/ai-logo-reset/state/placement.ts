import {
  aiLogoResetAnchoredCentre,
  aiLogoResetContainCentre,
  aiLogoResetLayerBox
} from '../../../../shared/aiLogoResetGeometry.ts'
import type { ResetAnchor, ResetLayer, ResetLogoAsset, ResetPhoto, ResetSize } from './types'

export const ANCHORS: readonly ResetAnchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br']

export const ANCHOR_LABELS: Record<ResetAnchor, string> = {
  tl: '左上', tc: '上方居中', tr: '右上',
  ml: '左侧居中', mc: '正中', mr: '右侧居中',
  bl: '左下', bc: '下方居中', br: '右下'
}

/** Rendered logo box in photo pixels. */
export const layerBox = (layer: Pick<ResetLayer, 'size'>, logo: Pick<ResetLogoAsset, 'width' | 'height' | 'content'>, photo: Pick<ResetPhoto, 'width' | 'height'>) => aiLogoResetLayerBox(layer, logo, photo)

/** Centre position (photo fractions) for an anchor with a margin measured on the photo's short edge. */
export const anchoredCentre = (
  anchor: ResetAnchor,
  margin: number,
  layer: Pick<ResetLayer, 'size'>,
  logo: Pick<ResetLogoAsset, 'width' | 'height' | 'content'>,
  photo: Pick<ResetPhoto, 'width' | 'height'>
) => aiLogoResetAnchoredCentre(anchor, margin, layer, logo, photo)

/** Anchored layers take their anchor's position; with the safe edge on, the layer is then kept inside the canvas. */
export const placeLayer = (layer: ResetLayer, logo: ResetLogoAsset, photo: ResetSize, safeEdge = false): ResetLayer => {
  const placed = layer.anchor ? { ...layer, ...anchoredCentre(layer.anchor, layer.margin, layer, logo, photo) } : layer
  return safeEdge ? { ...placed, ...aiLogoResetContainCentre(placed, placed, logo, photo) } : placed
}
