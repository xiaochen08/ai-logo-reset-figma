export const UI_MOTION_PRESETS = {
  popover: 'ui-popover-motion',
  'layer-popover': 'ui-layer-popover-motion',
  dialog: 'ui-dialog-motion',
  drawer: 'ui-drawer-motion',
  status: 'ui-status-motion',
  panel: 'ui-panel-motion',
  'view-forward': 'ui-view-forward-motion',
  'view-back': 'ui-view-back-motion',
  list: 'ui-list-motion',
  progress: 'ui-progress-motion',
  feedback: 'ui-feedback-motion',
  media: 'ui-media-motion',
  celebration: 'ui-celebration-motion',
  'resources-pan': 'ui-resources-pan-motion',
  'resources-filter': 'ui-resources-filter-motion',
  'resources-body': 'ui-resources-body-motion',
  'resources-step-forward': 'ui-resources-step-forward-motion',
  'resources-step-back': 'ui-resources-step-back-motion',
  collapse: 'ui-collapse-motion'
} as const

export type UiMotionPreset = keyof typeof UI_MOTION_PRESETS

export const resolveUiMotionTransitionName = (preset: UiMotionPreset): string => (
  UI_MOTION_PRESETS[preset]
)
