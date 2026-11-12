# 智能加 LOGO（重置版）｜Figma Make UI 设计工程

这是光影盒子「智能加 LOGO（重置版）」的**独立、公开、前端设计沙盒**。从桌面客户端提取原始 Vue 组件、样式、状态管理及共享几何/数据规则，保留真实操作入口，使用浏览器模拟接口运行。

**重要：这个仓库只用于 UI / UX 设计与交互验收。** 演示照片为合成 SVG，导出、识别、文件保存、会员和计费均为模拟行为。它不会操作真实用户照片，不包含 Electron Main、Python Worker、生产服务器、密钥或账号。

## 给 Figma Make

仓库地址：`https://github.com/xiaochen08/ai-logo-reset-figma`

在 Figma Make 使用 GitHub 导入或克隆本仓库。先运行项目，进入「婚礼品牌 · UI 演示」查看工作区。阅读 [FIGMA_MAKE_HANDOFF.md](./docs/FIGMA_MAKE_HANDOFF.md) 后开始重新设计。

本项目采用 **Vue 3 + TypeScript + Vite**。请尽量沿用这些组件和接口。Figma Make 若自行生成 React 版本，请同时提供新的界面、各操作的事件映射和状态说明，以便 Codex 回接现有 Vue / Electron 软件。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端显示的地址（默认 `http://localhost:5173`）。运行构建：`npm run build`，类型验证：`npm run typecheck`。

## 主要页面

- 项目大厅：新建、搜索、排序、置顶、重命名与删除
- 工作区：照片栏、画布、LOGO 素材、图层编组、位置、阴影、透视
- 裁切 / 横幅：独立的画布几何控制
- 批量操作：多选照片、同步 LOGO、共享预设
- 导出：设置、进度、取消、完成或失败状态演示
- 新手引导、通知与交互动画

## 源码与交付

- 提取基线：`xiaochen08/photo_toolbox_desktop` 的 `main@261fcbdd4cd6d90abe74794207274d249c143041`
- 源码目录：`src/renderer/features/ai-logo-reset/`
- 演示后端：`src/mock/mockBackend.ts`
- 数据类型：`src/shared/`
- 演示图片：`public/demo/`
- [功能与回接映射](./docs/INTEGRATION_MAP.md)
- [安全边界与验证清单](./docs/SCOPE_AND_TESTS.md)

请在独立分支进行设计改动，提交 PR。正式软件只在 Codex 审核、接回真实 IPC 并验证后再改动。
