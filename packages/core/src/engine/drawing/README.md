# engine/drawing

绘图子系统：把「用户/Agent 声明的图元」解释为屏幕 primitives（绘制原语），并承载鼠标交互（落点、预览、拖拽、磁吸、框选、命中）。

## 目录结构

模块采用 `<子模块>/types.ts + <子模块>/impl/` 分层；`index.ts` 是唯一公开入口（纯 barrel），
`types.ts` 是模块级图元领域模型契约。渲染 primitive（`DrawingStyle`/`ScreenPoint`/`DrawingPrimitive`）
属于 foundation 的渲染契约，保留在 `foundation/plugin/types.ts`。

```
engine/drawing/
├── index.ts            # 唯一公开入口：重导出各子模块契约与实现
├── types.ts            # 图元领域模型契约（DrawingObject / DrawingKind / 锚点 / 标签 / 定义）
├── model/              # 持久化领域模型：types.ts + impl/（文档、命令、锚点、标签）
├── session/            # 会话 overlay 与选择：impl/
├── geometry/           # 坐标、帧投影、线表、填充、标签布局、回归、视口裁剪：types.ts + impl/
├── interaction/        # 落点收集、预览、拖拽、命中选择、磁吸、工具表：types.ts + impl/
├── render/             # 投影器、图形定义注册表、绘制原语渲染、图形定义工厂、渲染插件：types.ts + impl/
└── __tests__/helpers/  # 跨子模块共享测试夹具
```

## 分层与边界

| 层 | 载体 | 是否持久化 | 说明 |
|----|------|-----------|------|
| 业务 SSOT | `engine/state/drawingState.ts` 的 `drawings` / `selectedDrawingIds` | 是 | 已确认图元与选中的唯一真相，只经由 adapter 读写 |
| 文档层 | `model/impl/DrawingDocument.ts` | 是 | 图元 CRUD 的领域模型，用户 UI 与 Agent 共用同一入口 |
| 命令层 | `model/impl/DrawingCommands.ts` | 是 | 图元唯一写入口，统一提交状态并触发重绘副作用 |
| 会话 overlay | `session/impl/DrawingState.ts` | 否 | 仅预览与拖拽覆盖，渲染时与 kernel 合并，不进 kernel |
| 交互会话 | `interaction/impl/interaction.ts` 的 `DrawingInteractionController` | 否 | 锚点收集、指针会话、磁吸档位等临时状态 |

约定：

- 已确认图元的写入必须走 `DrawingCommands` → `DrawingDocument` → adapter，禁止绕过命令层直写 kernel。
- `session/impl/DrawingState.ts` 只管预览/拖拽覆盖，绝不持有已确认图元列表。
- 磁吸仅作用于落点与预览路径；命中、框选、标签等只读路径不得开启磁吸，否则命中范围会随吸附漂移。
- 线段标签的锚点、对齐、基线与字号必须同源于 `geometry/impl/labelLayout.ts`，宿主输入框只镜像热点返回值，禁止各算一套。
- 图元的线段构成与手柄开启只声明在 `geometry/impl/lines.ts`：绘制、命中、拖拽不得各自推导锚点对。
- 图元几何由 `DrawingDefinition` 的 `compute` 纯函数产出，绘制侧只消费 `DrawingPrimitive`，不感知具体图形语义。
- 子模块 `types.ts` 只放契约与依赖接口，不得依赖同子模块 `impl/`；模块外调用方只依赖 `index.ts`。

## 文件职责

| 文件 | 职责 |
|------|------|
| `index.ts` | 唯一公开入口：重导出模块契约、`DrawingStore`、`DrawingDefinitionRegistry`、绘制原语渲染器、全部内置图形定义与交互控制器 |
| `types.ts` | 图元领域模型契约（`DrawingObject`、`DrawingKind`、锚点、标签、`DrawingDefinition` 等） |
| `model/types.ts` | 文档/命令的声明式输入 patch、样式键与依赖接口 |
| `model/impl/DrawingDocument.ts` | 绘图文档：图元 CRUD、校验与错误码，用户与 Agent 的统一契约 |
| `model/impl/DrawingCommands.ts` | 命令层：唯一写入路径，提交状态变更并触发 canvas 失效 |
| `model/impl/materializeAnchors.ts` | 锚点数量表与持久化锚点物化 |
| `model/impl/drawingLabels.ts` | 标签键契约与归一化 |
| `model/impl/drawingAccess.ts` | 锁定判断与锚点一致性比较 |
| `session/impl/DrawingState.ts` | 会话 overlay：预览图元与拖拽覆盖的存取 |
| `session/impl/DrawingSelection.ts` | 选中集合的纯函数操作（清空、Ctrl 多选切换） |
| `interaction/impl/interaction.ts` | `DrawingInteractionController`：组合 AnchorCollector/PreviewRenderer/HitTester/DragHandler，处理工具切换、指针会话、选中与磁吸 |
| `interaction/impl/AnchorCollector.ts` | 多锚点工具的分步锚点累积（单锚点工具首次点击即创建） |
| `interaction/impl/PreviewRenderer.ts` | 依据待定锚点构造预览图元（按单/双/三锚点工具分支） |
| `interaction/impl/HitTester.ts` | 命中测试：锚点、线段中点手柄、线段、文字标签、回归通道端点，并暴露 `getDrawingLineSegments` 供框选复用 |
| `interaction/impl/DragHandler.ts` | 拖拽会话：单锚点、线段中点手柄与整体平移，编辑路径可应用磁吸 |
| `interaction/impl/dragPolicy.ts` | 拖拽跟随策略：按图元种类与锚点序号推导联动锚点 |
| `interaction/impl/selectionMarquee.ts` | 框选会话几何与临时绘制原语投影 |
| `interaction/impl/magnetSnapper.ts` | OHLC 磁吸纯函数 `snapPointerToOhlc` 与档位（weak=高/低，strong=OHLC 极值） |
| `interaction/impl/toolConfig.ts` | 工具 ID 类型、单/双/三锚点工具表、工具→图形 kind 与 extend 模式映射 |
| `geometry/impl/coordinateUtils.ts` | 锚点逻辑坐标（时间戳 + 价格）↔ 屏幕坐标换算、`resolveDrawingPointer`、点线距离几何 |
| `geometry/impl/frameProjection.ts` | 将当前 Pane 的图元投影为帧数据（`ResolvedDrawingObject` + 绘制原语列表） |
| `geometry/impl/lines.ts` | 线表：图元的线段由哪些锚点构成，以及该线段是否开启中点垂直手柄（绘制、命中、拖拽共用） |
| `geometry/impl/fillRegions.ts` | 通道类图元的填充多边形装配 |
| `geometry/impl/labelLayout.ts` | 线段标签绘制与热点共用的布局：语义位置 + 上侧法线偏移 + 可读旋转角 + 绘制基线 |
| `geometry/impl/linearRegression.ts` | 回归通道使用的线性回归 |
| `geometry/impl/lineClipping.ts` | 线段视口裁剪（Cohen–Sutherland）与延长线求交 |
| `render/impl/DrawingStore.ts` | 绘图投影器：kernel 业务 SSOT ⊕ 会话 overlay，供渲染插件读取 |
| `render/impl/DrawingDefinitionRegistry.ts` | 图形定义注册表（按 kind 查找并计算几何） |
| `render/impl/primitiveRendererSet.ts` | `createDefaultPrimitiveRendererSet`：把绘制原语画到 canvas |
| `render/impl/definitions/` | 内置图形定义工厂（trend/ray/fib/rectangle/arrow/channel/regression 等）与注册入口 |
| `render/impl/plugin.ts` | 渲染插件：把帧投影产出的绘制原语绘制到 Pane |

## 数据流

```
落点        resolveDrawingPointer ──▶ AnchorCollector ──▶ PreviewRenderer ──▶ DrawingState(overlay)
确认        DrawingInteractionController ──▶ DrawingCommands ──▶ DrawingDocument ──▶ kernel.drawingState
渲染        kernel ⊕ overlay ──▶ DrawingStore ──▶ frameProjection ──▶ plugin(绘制原语渲染)
交互        指针事件 ──▶ HitTester / selectionMarquee / DragHandler ──▶ DrawingCommands
```

## 测试与设计文档

- 单测位于各子模块 `__tests__/`，跨子模块共享夹具见 `__tests__/helpers/drawingTestKit.ts`，用例只声明差异。
- 目录与契约分层决策见 `docs/design/drawing-module-layout.md`；交互与模型设计见 `docs/design/drawing-*.md`（交互硬化、多选、框选、命令边界、文档 CRUD 边界、时间锚点投影、文字布局等）。
