import type {
  AiLogoAnalysisOperation,
  AiLogoCompositionMode,
  AiLogoSubjectStrategy
} from './aiLogoRecognition.ts'

export type AiLogoWorkflowMode = 'standard-logo' | 'subject-composite'

export const AI_LOGO_WORKFLOW_PORT_SCHEMA_VERSION = 1 as const

export const workflowForCompositionMode = (
  mode: AiLogoCompositionMode
): AiLogoWorkflowMode => (
  mode === 'subject-behind' ? 'subject-composite' : 'standard-logo'
)

export const compositionModeForWorkflow = (
  workflowMode: AiLogoWorkflowMode
): AiLogoCompositionMode => (
  workflowMode === 'subject-composite' ? 'subject-behind' : 'standard'
)

export const analysisOperationForWorkflow = (
  workflowMode: AiLogoWorkflowMode
): AiLogoAnalysisOperation => (
  workflowMode === 'subject-composite' ? 'composition' : 'face'
)

export const getAiLogoWorkflowLabel = (_workflowMode: AiLogoWorkflowMode): string => 'Logo'

export const getAiLogoWorkflowExportFolderPrefix = (
  _workflowMode: AiLogoWorkflowMode
): string => 'LOGO导出'

export const isAiLogoWorkflowMode = (value: unknown): value is AiLogoWorkflowMode => (
  value === 'standard-logo' || value === 'subject-composite'
)

const validateFiniteRange = (
  value: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
  label: string
): string | null => {
  if (!(key in value)) return null
  const candidate = value[key]
  return typeof candidate === 'number'
    && Number.isFinite(candidate)
    && candidate >= minimum
    && candidate <= maximum
    ? null
    : `${label}.${key} 必须是 ${minimum} 到 ${maximum} 之间的有限数值。`
}

const validateLayerSettings = (
  settings: unknown,
  layerId: string
): string | null => {
  if (!isRecord(settings)) return `水印图层 ${layerId} 缺少有效 settings。`
  const workflowMode = settings.workflowMode
  if (!isAiLogoWorkflowMode(workflowMode)) {
    return `水印图层 ${layerId} 缺少有效 workflowMode。`
  }
  const composition = settings.aiComposition
  if (
    !isRecord(composition)
    || composition.mode !== compositionModeForWorkflow(workflowMode)
  ) {
    return `水印图层 ${layerId} 的 workflowMode 与构图模式不一致。`
  }
  for (const [key, minimum, maximum] of [
    ['opacity', 0, 1],
    ['sizePercent', 1, 100]
  ] as const) {
    const error = validateFiniteRange(settings, key, minimum, maximum, `水印图层 ${layerId}`)
    if (error) return error
  }
  if (isRecord(settings.shadow)) {
    for (const key of ['opacityPercent', 'distancePercent', 'spreadPercent', 'blurPercent']) {
      const error = validateFiniteRange(
        settings.shadow,
        key,
        0,
        100,
        `水印图层 ${layerId}.shadow`
      )
      if (error) return error
    }
  }
  if (isRecord(settings.customPosition)) {
    for (const [key, minimum, maximum] of [
      ['x', -100, 200],
      ['y', -100, 200],
      ['rotation', -360, 360],
      ['scaleX', 0.01, 10],
      ['scaleY', 0.01, 10]
    ] as const) {
      const error = validateFiniteRange(
        settings.customPosition,
        key,
        minimum,
        maximum,
        `水印图层 ${layerId}.customPosition`
      )
      if (error) return error
    }
  }
  return null
}

const validateVisibleBounds = (value: unknown, layerId: string): string | null => {
  if (value === undefined) return null
  if (!isRecord(value)) return `水印图层 ${layerId} 的 visibleBounds 格式无效。`
  for (const key of ['left', 'top', 'width', 'height']) {
    const candidate = value[key]
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
      return `水印图层 ${layerId} 的 visibleBounds.${key} 必须是有限数值。`
    }
  }
  if ((value.width as number) <= 0 || (value.height as number) <= 0) {
    return `水印图层 ${layerId} 的 visibleBounds 尺寸必须大于 0。`
  }
  return null
}

export const validateAiLogoWorkerWorkflowContract = (value: unknown): string | null => {
  if (!isRecord(value) || !isAiLogoWorkflowMode(value.workflowMode)) {
    return '导出任务缺少有效的 workflowMode。'
  }
  if (!isRecord(value.settings) || value.settings.workflowMode !== value.workflowMode) {
    return '导出任务顶层设置与工作流房间不一致。'
  }
  if (!Array.isArray(value.images)) {
    return '导出任务 images 必须是数组。'
  }

  for (const image of value.images) {
    if (!isRecord(image)) return '导出子项格式无效。'
    if ('logoLayers' in image) {
      if (!Array.isArray(image.logoLayers)) return '导出子项 logoLayers 必须是数组。'
      if (image.logoLayers.length > 8) return '每张照片最多 8 个水印图层。'
      if (!isRecord(image.sceneSettings) || !isRecord(image.sceneSettings.banner)) {
        return '导出子项缺少有效 sceneSettings。'
      }
      const layerIds = new Set<string>()
      for (const layer of image.logoLayers) {
        if (!isRecord(layer)) return '水印图层格式无效。'
        const layerId = typeof layer.layerId === 'string' ? layer.layerId.trim() : ''
        if (!layerId) return '水印图层 layerId 不能为空。'
        if (layerIds.has(layerId)) return `水印图层 layerId 重复：${layerId}。`
        layerIds.add(layerId)
        if (!isRecord(layer.logo)) return `水印图层 ${layerId} 缺少 Logo 素材。`
        const logoPath = typeof layer.logo.path === 'string' ? layer.logo.path.trim() : ''
        if (!logoPath) return `水印图层 ${layerId} 的 Logo 路径不能为空。`
        const boundsError = validateVisibleBounds(layer.logo.visibleBounds, layerId)
        if (boundsError) return boundsError
        const settingsError = validateLayerSettings(layer.settings, layerId)
        if (settingsError) return settingsError
      }
      continue
    }
    if (!isRecord(image.logoSettings)) return '导出子项缺少独立 logoSettings。'
    if ('watermarkEnabled' in image && typeof image.watermarkEnabled !== 'boolean') {
      return '导出子项 watermarkEnabled 必须是布尔值。'
    }
    const imageWorkflowMode = image.logoSettings.workflowMode
    if (!isAiLogoWorkflowMode(imageWorkflowMode)) {
      return '导出子项缺少有效的 workflowMode。'
    }
    const composition = image.logoSettings.aiComposition
    const expectedMode = compositionModeForWorkflow(imageWorkflowMode)
    if (!isRecord(composition) || composition.mode !== expectedMode) {
      return '导出子项 workflowMode 与自身构图模式不一致。'
    }
  }
  return null
}

export interface AiLogoWorkflowPortPayload {
  imagePath: string
  operation: AiLogoAnalysisOperation
  subjectStrategy?: AiLogoSubjectStrategy
  selectedPersonIds?: string[]
}

export interface AiLogoWorkflowPortMessage {
  schemaVersion: typeof AI_LOGO_WORKFLOW_PORT_SCHEMA_VERSION
  senderWorkflow: AiLogoWorkflowMode
  receiverCapability: 'shared-image-analysis'
  requestId: string
  payload: Readonly<AiLogoWorkflowPortPayload>
}

const PORT_MESSAGE_KEYS = new Set([
  'schemaVersion',
  'senderWorkflow',
  'receiverCapability',
  'requestId',
  'payload'
])
const PORT_PAYLOAD_KEYS = new Set([
  'imagePath',
  'operation',
  'subjectStrategy',
  'selectedPersonIds'
])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const assertOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>
): void => {
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error('窄窗口拒绝了包含内部状态或多余字段的消息。')
  }
}

export const parseAiLogoWorkflowPortMessage = (
  value: unknown
): Readonly<AiLogoWorkflowPortMessage> => {
  if (!isRecord(value)) throw new Error('窄窗口消息格式无效。')
  assertOnlyKeys(value, PORT_MESSAGE_KEYS)
  if (
    value.schemaVersion !== AI_LOGO_WORKFLOW_PORT_SCHEMA_VERSION
    || !isAiLogoWorkflowMode(value.senderWorkflow)
    || value.receiverCapability !== 'shared-image-analysis'
    || typeof value.requestId !== 'string'
    || !value.requestId.trim()
    || !isRecord(value.payload)
  ) {
    throw new Error('窄窗口消息身份或版本无效。')
  }

  assertOnlyKeys(value.payload, PORT_PAYLOAD_KEYS)
  const imagePath = typeof value.payload.imagePath === 'string'
    ? value.payload.imagePath.trim()
    : ''
  const operation = value.payload.operation
  if (!imagePath || (operation !== 'face' && operation !== 'composition')) {
    throw new Error('窄窗口消息载荷无效。')
  }
  if (
    analysisOperationForWorkflow(value.senderWorkflow) !== operation
  ) {
    throw new Error('窄窗口消息的工作流与识别操作不匹配。')
  }

  const selectedPersonIds = Array.isArray(value.payload.selectedPersonIds)
    ? value.payload.selectedPersonIds.filter((item): item is string => typeof item === 'string')
    : undefined
  const payload: AiLogoWorkflowPortPayload = {
    imagePath,
    operation
  }
  if (value.payload.subjectStrategy !== undefined) {
    payload.subjectStrategy = value.payload.subjectStrategy as AiLogoSubjectStrategy
  }
  if (selectedPersonIds) {
    payload.selectedPersonIds = Object.freeze([...selectedPersonIds]) as string[]
  }
  Object.freeze(payload)
  return Object.freeze({
    schemaVersion: AI_LOGO_WORKFLOW_PORT_SCHEMA_VERSION,
    senderWorkflow: value.senderWorkflow,
    receiverCapability: 'shared-image-analysis',
    requestId: value.requestId.trim(),
    payload
  })
}

export const createAiLogoWorkflowPortMessage = (
  value: Omit<AiLogoWorkflowPortMessage, 'schemaVersion'>
): Readonly<AiLogoWorkflowPortMessage> => (
  parseAiLogoWorkflowPortMessage({
    schemaVersion: AI_LOGO_WORKFLOW_PORT_SCHEMA_VERSION,
    ...value
  })
)
