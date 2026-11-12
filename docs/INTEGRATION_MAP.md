# UI → 原项目接口映射

基线：私有桌面仓库 main@261fcbdd，前端复制自 `src/renderer/features/ai-logo-reset`。

| UI 组件 | 状态 / 操作 | 正式接回点 |
| --- | --- | --- |
| AiLogoResetEntry | 项目列表与项目路由 | `state/projects.ts` → `AiLogoResetApi.listProjects/openProject` |
| ResetLobby、ResetProjectCard | 新建/重命名/置顶/删除 | `projectActions.create/rename/togglePin/remove` |
| ResetWorkspace、ResetTopBar | 添加照片/撤销重做/识别/同步 | `state/workspace.ts` 的 `actions` 与 `state/recognition.ts` |
| ResetPhotoStrip | 过滤、缩略图、多选、删除 | `actions.select/step/removePhotos` 与 `render/imagePipeline.ts` |
| ResetStage、ResetLogoLayer | 照片变换、LOGO 拖动、旋转、缩放、主体前置 | `aiLogoResetGeometry/Frame/RenderPlan`、`actions` |
| ResetInspector、ResetLayerList | 图层属性、编组、显隐、锁定、换素材 | `actions` 与 `src/shared/aiLogoReset.ts` |
| ResetCropPanel、ResetBannerPanel | 裁切、拉直、旋转、黑边、横幅 | `aiLogoResetFrame.ts` 与 `actions` |
| ResetPresetMenu、ResetPresetSaveDialog | 保存、应用、更新、排序与删除预设 | `state/presets.ts` 和 `AiLogoResetApi.*Preset*` |
| ResetExportDialog、ResetExportProgress | 导出参数、进度、取消、失败 | `state/exporting.ts` → `AiLogoResetApi.startExport/cancelExport/onExportProgress` |
| ResetStatusBar、ResetToasts、UiGuideTour | 状态反馈及新手引导 | `state/toasts.ts`、`guide/steps.ts` |

## 数据与不能回退的规则

- 采用原始 `AiLogoResetScene`、`AiLogoResetLayer`、`AiLogoResetCrop`、`AiLogoResetBanner`、`AiLogoResetExportSettings` 类型，保留 JSON 字段。
- `state/projects.ts` 有项目版本号和写入队列，避免多处同时修改时覆盖更改。
- 编辑器 `actions.flush()` 与导出前保存调用属于真实数据安全路径，回接时必须完整验证。
- 真正的照片、LOGO 素材、识别、输出与计费由 Electron Main / Python Worker / 现有共享服务提供。
- Figma Make 的 `src/mock/mockBackend.ts` 只供网页预览，回接时删除该模拟注入，使用正式 Preload 授权 API。
- `src/renderer/features/ai-logo-reset/state/workspace.ts` 中的 `__aiLogoDemoPhotoUrls` 仅是网页导入照片的 Mock 兼容路径；接回桌面时恢复原项目的真实授权 URL。
- `src/renderer/features/ai-logo-reset/render/imagePipeline.ts` 中的演示 SVG 直连仅用于演示素材；接回桌面时继续使用现有图片解码/缩略图逻辑。

## 建议的最终交接内容

1. 全部可运行界面及组件源码
2. 修改前后的操作流程对照
3. UI 事件到原有 actions / IPC 的映射清单
4. 对原有数据结构的变更提案及迁移说明
5. 覆盖空项目、200 张照片、无 LOGO、多人、导出失败等状态的截图或演示
