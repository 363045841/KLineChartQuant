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

模块内按职责切成 6 个子模块，每个子模块采用 `<sub>/types.ts + <sub>/impl/` 分层（对齐
`engine/marker/shape` 既有先例）；契约类型从 impl 抽出到各层 `types.ts`，
`types.ts` 不依赖同模块 impl。

| 子模块 | 职责 |
|--------|------|
| `model` | 持久化领域模型：文档 CRUD、命令层、锚点物化、标签归一化 |
| `session` | 会话 overlay 与选择集合（预览/拖拽覆盖，不进 kernel） |
| `geometry` | 坐标换算、帧投影、线表、填充、标签布局、回归、视口裁剪 |
| `interaction` | 落点收集、预览、拖拽、命中选择、工具表（磁吸档位分发） |
| `magnet` | OHLC 磁吸档位契约与吸附纯函数 |
| `render` | `DrawingStore` 投影器、`DrawingDefinitionRegistry`、绘制原语渲染器、图形定义工厂、渲染插件 |

磁吸吸附（`MagnetMode` / `MagnetSnapConfig` / `snapPointerToOhlc`）独立为 `magnet` 子模块：
`geometry` 的落点解析与 `interaction` 的档位分发都依赖它，若留在 `interaction/impl`
会让 `geometry/impl/coordinateUtils.ts` 反向依赖 `interaction` 的磁吸实现。独立后磁吸相关
依赖为 `geometry → magnet`、`interaction → magnet`；`geometry/impl/frameProjection.ts` 仍因
框选投影依赖 `interaction/impl/selectionMarquee.ts`，不在本次磁吸模块抽离范围内。

### 3. 工具 ID 与磁吸档位常量收口

绘图工具 ID 与磁吸档位的字面量集中为两张常量表：`interaction/types.ts` 的 `DrawingTool`
（工具 id）与 `magnet/types.ts` 的 `MagnetMode`（off/weak/strong），`DrawingToolId` /
`MagnetMode` / `ActiveMagnetMode` 三个类型都由常量派生。新增工具或档位只改常量表，
运行时比较点（`toolConfig`、`interaction`、`PreviewRenderer`、`magnetSnapper`、
`drawingState` 与 Vue 工具栏）一律引用常量，避免重命名后各调用点静默失配。

- 常量不带 `: DrawingToolId` 标注，保留字面量类型，`switch` 才能正常收窄；
  需要完整联合类型的信号（`drawingState.drawingTool`、Vue 的 `drawingToolId`）显式标注。
  `CURSOR_DRAWING_TOOL_ID` / `BOX_SELECT_DRAWING_TOOL_ID` 保留为 `DrawingTool.Cursor` /
  `DrawingTool.BoxSelect` 的别名，engine、controllers、features/agent 与 Vue 的运行时比较
  一律引用常量，禁止散落字面量；仅测试断言与纯类型声明可保留字面量。
- `DrawingKind`（`engine/drawing/types.ts`）是与 `DrawingToolId` 不同的词汇表（如 `h-line` →
  `horizontal-line`），其字符串字面量不受本约束影响，两者通过 `getDrawingKind` 单点映射。
- Vue 侧 `range-select` 是纯 UI 模式 id（不写进 kernel `DrawingToolId`），统一由
  `packages/vue/src/components/toolbarToolIds.ts` 的 `RANGE_SELECT_UI_TOOL_ID` 提供。

### 4. 公开入口收口

`engine/drawing/index.ts` 收敛为唯一公开 barrel：只做重导出，不再承载实现。
所有模块外调用点（controllers、features/agent、engine/facade、engine/state、engine/render、
vue 适配层）统一从该 barrel 或 `engine/drawing/types.ts` 依赖，禁止再指向模块内部实现文件，
使后续内部搬移不影响外部。

适配层（Vue）的绘图类型改从 `@363045841yyt/klinechart-core/controllers` 门面获取，
不再从 `.../plugin` 子路径取（后者只保留 foundation 渲染原语）。

## 影响与验证

- 纯结构搬移 + 契约换位，无行为变更；`DrawingDocument` / `DrawingCommands` / `DrawingStore` /
  `DrawingDefinitionRegistry` 等所有公开导出名保持不变。
- 常量收口后新增/重命名工具 ID 只需改动 `DrawingTool` 常量表，编译器强制暴露所有消费点。
- 门禁：`pnpm type-check`、`pnpm test:packages`（core）、`pnpm lint`，并对绘图交互做人工回归。
