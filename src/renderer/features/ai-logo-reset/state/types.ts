import type {
  AiLogoResetAnchor,
  AiLogoResetBanner,
  AiLogoResetBannerEdges,
  AiLogoResetCrop,
  AiLogoResetLayer,
  AiLogoResetLayerGroup,
  AiLogoResetLogoView,
  AiLogoResetOrientation,
  AiLogoResetPhotoView,
  AiLogoResetPoint,
  AiLogoResetProjectSummary,
  AiLogoResetRenderMode,
  AiLogoResetScene,
  AiLogoResetShadow,
  AiLogoResetWarp
} from '../../../../shared/aiLogoReset.ts'
import type { AiLogoResetFrame } from '../../../../shared/aiLogoResetFrame.ts'
import type { AiLogoResetPresetScene, AiLogoResetPresetView } from '../../../../shared/aiLogoResetPresets.ts'
import { AI_LOGO_RESET_LIMITS, emptyAiLogoResetScene } from '../../../../shared/aiLogoReset.ts'

// The page works on the shared persisted contract directly; these aliases keep component imports short.
export type ResetOrientation = AiLogoResetOrientation
export type ResetRenderMode = AiLogoResetRenderMode
export type ResetAnchor = AiLogoResetAnchor
export type ResetPhoto = AiLogoResetPhotoView
export type ResetLogoAsset = AiLogoResetLogoView
export type ResetShadow = AiLogoResetShadow
export type ResetPoint = AiLogoResetPoint
export type ResetWarp = AiLogoResetWarp
export type ResetLayer = AiLogoResetLayer
export type ResetLayerGroup = AiLogoResetLayerGroup
export type ResetPhotoScene = AiLogoResetScene
export type ResetBanner = AiLogoResetBanner
export type ResetBannerEdges = AiLogoResetBannerEdges
export type ResetCrop = AiLogoResetCrop
export type ResetFrame = AiLogoResetFrame
export type ResetPreset = AiLogoResetPresetView
export type ResetPresetScene = AiLogoResetPresetScene
export type ResetSize = { width: number, height: number }
export type ResetInspectorTab = 'place' | 'look' | 'warp'
/** The inspector's pages: the logos, the bands around the photo, and the crop (which also puts the stage into crop mode). */
export type ResetInspectorPage = 'logo' | 'banner' | 'crop'
export type ResetProjectSummary = AiLogoResetProjectSummary

export const RESET_MAX_LAYERS_PER_PHOTO = AI_LOGO_RESET_LIMITS.layersPerPhoto

export const defaultShadow = (): ResetShadow => ({ enabled: false, color: '#000000', opacity: 65, blur: 2.5, distance: 2.5, angle: 45 })

export const identityCorners = (): ResetWarp['corners'] => [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]

export const emptyScene = emptyAiLogoResetScene
