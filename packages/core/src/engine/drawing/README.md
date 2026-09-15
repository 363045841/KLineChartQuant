# engine/drawing

绘图子系统：把「用户/Agent 声明的图元」解释为屏幕 primitives（绘制原语），并承载鼠标交互（落点、预览、拖拽、磁吸、框选、命中）。

## 分层与边界

| 层 | 载体 | 是否持久化 | 说明 |
|----|------|-----------|------|
| 业务 SSOT | `engine/state/drawingState.ts` 的 `drawings` / `selectedDrawingIds` | 是 | 已确认图元与选中的唯一真相，只经由 adapter 读写 |
| 文档层 | `DrawingDocument` | 是 | 图元 CRUD 的领域模型，用户 UI 与 Agent 共用同一入口 |
| 命令层 | `DrawingCommands` | 是 | 图元唯一写入口，统一提交状态并触发重绘副作用 |
| 会话 overlay | `DrawingState`（本目录） | 否 | 仅预览与拖拽覆盖，渲染时与 kernel 合并，不进 kernel |
| 交互会话 | `DrawingInteractionController` | 否 | 锚点收集、指针会话、磁吸档位等临时状态 |

约定：

- 已确认图元的写入必须走 `DrawingCommands` → `DrawingDocument` → adapter，禁止绕过命令层直写 kernel。
- `DrawingState` 只管预览/拖拽覆盖，绝不持有已确认图元列表。
- 磁吸仅作用于落点与预览路径；命中、框选、标签等只读路径不得开启磁吸，否则命中范围会随吸附漂移。
- 线段标签的锚点、对齐、基线与字号必须同源于 `labelLayout.ts`，宿主输入框只镜像热点返回值，禁止各算一套。
- 图元几何由 `DrawingDefinition` 的 `compute` 纯函数产出，绘制侧只消费 `DrawingPrimitive`，不感知具体图形语义。

## 文件职责

| 文件 | 职责 |
|------|------|
| `index.ts` | 模块入口：导出类型、`DrawingStore` 投影器、`DrawingDefinitionRegistry`、默认绘制原语渲染器与全部内置图形定义（trend/ray/fib/rectangle/channel/regression 等），并重导出交互控制器、工具表与磁吸模块 |
| `DrawingDocument.ts` | 绘图文档：图元 CRUD、校验与错误码，用户与 Agent 的统一契约 |
| `DrawingCommands.ts` | 命令层：唯一写入路径，提交状态变更并触发 canvas 失效 |
| `DrawingState.ts` | 会话 overlay：预览图元与拖拽覆盖的存取 |
| `interaction.ts` | `DrawingInteractionController`：组合 AnchorCollector/PreviewRenderer/HitTester/DragHandler，处理工具切换、指针会话、选中与磁吸 |
| `AnchorCollector.ts` | 多锚点工具的分步锚点累积（单锚点工具首次点击即创建） |
| `PreviewRenderer.ts` | 依据待定锚点构造预览图元（按单/双/三锚点工具分支） |
| `HitTester.ts` | 命中测试：锚点、线段、文字标签、回归通道端点，并暴露 `getDrawingLineSegments` 供框选复用 |
| `DragHandler.ts` | 拖拽会话：整线平移与单锚点编辑，编辑路径可应用磁吸 |
| `DrawingSelection.ts` | 选中集合的纯函数操作（清空、Ctrl 多选切换） |
| `selectionMarquee.ts` | 框选会话几何与临时绘制原语投影 |
| `coordinateUtils.ts` | 锚点逻辑坐标（时间戳 + 价格）↔ 屏幕坐标换算、`resolveDrawingPointer`、点线距离几何 |
| `labelLayout.ts` | 线段标签绘制与热点共用的布局：语义位置 + 上侧法线偏移 + 可读旋转角 + 绘制基线 |
| `magnetSnapper.ts` | OHLC 磁吸纯函数 `snapPointerToOhlc` 与档位（weak=高/低，strong=OHLC 极值） |
| `frameProjection.ts` | 将当前 Pane 的图元投影为帧数据（`ResolvedDrawingObject` + 绘制原语列表） |
| `plugin.ts` | 渲染插件：把帧投影产出的绘制原语绘制到 Pane |
| `toolConfig.ts` | 工具 ID 类型、单/双/三锚点工具表、工具→图形 kind 与 extend 模式映射 |
| `linearRegression.ts` | 回归通道使用的线性回归 |

## 数据流

```
落点        resolveDrawingPointer ──▶ AnchorCollector ──▶ PreviewRenderer ──▶ DrawingState(overlay)
确认        DrawingInteractionController ──▶ DrawingCommands ──▶ DrawingDocument ──▶ kernel.drawingState
渲染        kernel ⊕ overlay ──▶ DrawingStore ──▶ frameProjection ──▶ plugin(绘制原语渲染)
交互        指针事件 ──▶ HitTester / selectionMarquee / DragHandler ──▶ DrawingCommands
```

## 测试与设计文档

- 单测位于 `__tests__/`，共享夹具见 `__tests__/helpers/drawingTestKit.ts`，用例只声明差异。
- 设计决策见 `docs/design/drawing-*.md`（交互硬化、多选、框选、命令边界、文档 CRUD 边界、时间锚点投影、文字布局等）。
