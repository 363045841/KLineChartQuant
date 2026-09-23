# 绘图模块目录语义化与契约分层

## 背景

`packages/core/src/engine/drawing/` 迁移完成后，24 个源文件（约 4200 行）全部平铺在模块根目录，
没有 `<module>/types.ts + <module>/impl/` 分层；`index.ts` 膨胀到 915 行，同时承担类型重导出、
`DrawingStore` 投影器、`DrawingDefinitionRegistry`、canvas 绘制原语渲染器、10 个图形定义工厂
以及磁吸/工具表重导出等 5 类职责。图元领域模型（`DrawingObject`、`DrawingKind`、
`PersistedDrawingAnchor`、`DrawingDefinition` 等）还错误地定义在 `foundation/plugin/types.ts`。

## 决策

### 1. 渲染 primitive 与领域模型分层

- **保留在 `foundation/plugin/types.ts`**：`DrawingStyle`、`ScreenPoint`、`DrawingLabelPosition`、
  `PrimitiveTextAttachment`、`ScreenDrawingAnchor`、`DrawingPrimitive` 及全部 `*Primitive`、
  `DrawingFrameProjection`。
  原因：`RenderContext` / `RenderOverlayContext`（foundation 的渲染契约）依赖这些屏幕原语，
  foundation 不能反向依赖 engine。
- **迁入 `engine/drawing/types.ts`**：`DrawingObject`、`ResolvedDrawingObject`、`DrawingKind`、
  `PersistedDrawingAnchor`、`ResolvedDrawingAnchor`、`DrawingAnchorType`、`DrawingLabel(s)`、
  `DrawingLabelIndex`、`DrawingWorkspaceId`、`DrawingGeometry`、`DrawingComputeContext`、
  `DrawingDefinition`。
  原因：这些是绘图领域模型，与插件系统无关，属于本模块对外契约。

### 2. 子模块语义划分

模块内按职责切成 5 个子模块，每个子模块采用 `<sub>/types.ts + <sub>/impl/` 分层（对齐
`engine/marker/shape` 既有先例）；契约类型从 impl 抽出到各层 `types.ts`，
`types.ts` 不依赖同模块 impl。

| 子模块 | 职责 |
|--------|------|
| `model` | 持久化领域模型：文档 CRUD、命令层、锚点物化、标签归一化 |
| `session` | 会话 overlay 与选择集合（预览/拖拽覆盖，不进 kernel） |
| `geometry` | 坐标换算、帧投影、线表、填充、标签布局、回归、视口裁剪 |
| `interaction` | 落点收集、预览、拖拽、命中选择、磁吸、工具表 |
| `render` | `DrawingStore` 投影器、`DrawingDefinitionRegistry`、绘制原语渲染器、图形定义工厂、渲染插件 |

### 3. 公开入口收口

`engine/drawing/index.ts` 收敛为唯一公开 barrel：只做重导出，不再承载实现。
所有模块外调用点（controllers、features/agent、engine/facade、engine/state、engine/render、
vue 适配层）统一从该 barrel 或 `engine/drawing/types.ts` 依赖，禁止再指向模块内部实现文件，
使后续内部搬移不影响外部。

适配层（Vue）的绘图类型改从 `@363045841yyt/klinechart-core/controllers` 门面获取，
不再从 `.../plugin` 子路径取（后者只保留 foundation 渲染原语）。

## 影响与验证

- 纯结构搬移 + 契约换位，无行为变更；`DrawingDocument` / `DrawingCommands` / `DrawingStore` /
  `DrawingDefinitionRegistry` 等所有公开导出名保持不变。
- 门禁：`pnpm type-check`、`pnpm test:packages`（core）、`pnpm lint`，并对绘图交互做人工回归。
