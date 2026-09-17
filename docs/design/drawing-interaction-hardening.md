# 引擎绘图交互硬化：OHLC 磁吸与 locked 语义

> 2026-09-13 · 引擎侧下沉批次（pr/engine-drawing-hardening）。覆盖 G-01（磁吸）、G-04（locked），连带 G-03/G-06/G-07/G-08 的小项。
> locked 语义于 2026-09-16 修订：锁定由"不可选中"改为"可选中、不可拖动与编辑"。

## 背景

本批把磁吸、锁定、Shift 多选等绘图交互行为统一实现在 `packages/core/src/engine/drawing/`，作为引擎侧唯一来源，供宿主 UI 与 Agent 共用同一套 API。

## 一、OHLC 磁吸（G-01）

### 档位语义

| 档位 | 候选价格 | Y 吸附半径 | X 行为 |
|------|----------|-----------|--------|
| off  | —        | —         | 不吸附 |
| weak | high/low | 8px       | Bar 中心可解析时吸附到中心 |
| strong | high/low/open/close | 15px | 同上 |

- **X 吸附与 Y 是否命中无关**：只要 `getScreenXAtLogicalIndex(barIndex)` 非 null，X 即改写为 Bar 中心。对最终锚点的影响：同一 Bar 内点击解析出同一时间戳，仅在 Bar 边界半个 Bar 宽内有差异。
- **候选遍历顺序** `[high, low, open, close]`，距离用 `<=` 比较——同距离时后遍历者胜出。
- **修饰键（Ctrl/Meta 取反，TV 官方语义，2026-09-14 修正）**：磁吸 off 时按住 Ctrl/Command 临时开启（取 strong——TV 对磁吸开的定义即吸附 OHLC 四值）；磁吸开启（weak/strong）时按住临时关闭。对齐 TV 官方 Magnet Mode 文档（"temporarily turn on/off by holding CTRL/Command"）。绘图模式下 Ctrl 无其他占用，无冲突。
- **Shift 互斥**（2026-09-14 补齐）：Shift 按住时磁吸一律不生效——宿主的 Shift 锁角会先改写坐标，若引擎再吸附会造成双重改写；单锚点工具按 Shift 也不吸附，Shift 作为约束修饰键优先于 Ctrl 取反。
- **完全无吸附点**（Bar 中心不可解析且 Y 无命中）时 `snapPointerToOhlc` 返回 null，调用方使用原始坐标。

### 接入点

- `magnetSnapper.ts`：纯函数 `snapPointerToOhlc(mouseX, mouseY, pane, adapter, config)`，输入输出均为容器局部坐标。
- `resolveDrawingPointer` 增加第 4 可选参数 `options.magnet`，吸附发生在 `screenToAnchor` 之前（改写局部 x/y）。**不传即不吸附**——cursor 命中（findDrawingHit）、框选（startSelectionMarquee / handleSelectionMarqueeMove / commitSelectionMarquee）、线段标签（getLineLabelTarget）路径一律不传，保证点选命中与框选范围不随吸附漂移。
- `DrawingInteractionController`：`setMagnetMode('off'|'weak'|'strong')` / `getMagnetMode()`，在 `onPointerDown` 绘制分支、`onPointerMove` 预览分支与拖拽分支（`handleDragMove`）传入磁吸配置——三条路径共用 `resolveMagnetOptions(e)` 单点分发修饰键语义。
- **编辑路径（2026-09-14 补齐）**：点锚点拖拽（HitTester 以 anchorIndex 命中开拖）时被拖锚点绝对跟随指针，磁吸随指针落点收敛到 OHLC（`DragHandler.handleDragMove` 第 4 可选参数，仅 anchorIndex 分支生效）；整线拖拽是位移增量语义（全体锚点平移），无单一落点基准，不吸附——水平线/垂直线整线拖拽的吸附属后续任务（需先定义 delta→snap 语义）。
- 为何 cursor 命中与框选绝不传磁吸：拖拽会话内 `findDrawingHit` 只发生在按下瞬间，但按下命中必须用原始坐标，否则磁吸开着时锚点会"吸走"点选判定。

### 为何不进 StateKernel

磁吸是**会话级交互配置**（与"当前用哪个工具画图"同类），不是图表业务状态：不参与持久化、不派生其他状态、不驱动 effect。放 StateKernel 会引入 settings 侵入与 effect 复杂化。它与 `Chart.setDrawingToolId` 后的 `applyToolSession` 会话副作用同一层次，故放 DrawingInteractionController 实例字段。

## 二、locked 语义（G-04）

`DrawingObject.locked === true` 的图元**可选中、可命中，但不可拖动、不可编辑**：

1. **可选中**：进入 `findDrawingHit` 与 `commitSelectionMarquee` 的候选（`getSelectableDrawings`），使工具栏得以展示解锁按钮。
2. **可命中**：公开命中查询 `hitTestAt` 同口径返回锁定图元。命中查询只回答"光标下是什么"，编辑/删除策略由调用方决定。
3. **不可拖**：`startDrag` 统一剔除锁定目标；锚点命中同样受此约束，直接点中锁定图元只选中、不开拖。
4. **不可编辑**：写命令在 `DrawingDocument` 层强制。锁定图元只接受 `locked` 字段写入（解锁），其余字段（`anchors`/`style`/`params`/`labels`/`visible`/`zIndex`）一律拒绝；`updateBatch`/`removeBatch` 对混合选择跳过锁定目标，`updateDrawing`（全量快照）、`remove*`、`commitDrawingDrag*` 直接拒绝锁定目标。
5. **唯一判定**：`isDrawingLocked`（`drawingAccess.ts`）是锁定语义的单一来源，交互层与文档层共用。

## 三、连带小项

- **G-06 Shift 多选**：`handleCursorDown` 的多选判定从 `e.ctrlKey` 扩为 `e.ctrlKey || e.shiftKey`（toggle 与空白不清空两处）。
- **G-07 锚点数表导出**：`getAnchorCountForTool` 与 SINGLE/DOUBLE/TRIPLE_ANCHOR_TOOLS 自 drawing 模块与 controllers facade 导出，宿主不再自维护副本。
- **G-08 通道类 fill 键**：渲染端 `applyFillStyle` 在 fill 缺省时从 stroke 派生（跟随语义），补默认 fill 会导致"改描边色后填充色不再跟随"的视觉语义回归，故**不改默认样式**。改为 `getBatchStyleKeys` 对"全部目标为通道类"的集合无条件包含 `fill`：通道类的填充能力由 kind 固有（渲染端必有 area 图元），fill 对其总是可批量修改；显式设置后才固化、不再跟随 stroke。混合（通道+线类）集合维持交集守卫拒绝。

## 四、G-09 类型链（vue 侧，独立提交）

`vue-tsc` 不走 vite alias，`@363045841yyt/klinechart-agent-runtime(/contracts/ui)` 落回 package exports → dist（开发 clone 从未构建）→ `features/agent` 整条类型链断裂。修复：root `tsconfig.app.json` paths 增加与 vite alias 相同的源码映射（tsconfig.vitest.json 经 extends 继承）。

## 测试与验收

- 单测：`magnetSnapper.test.ts`（档位/半径边界/夹取/pane 偏移）、`interaction.magnet.test.ts`（锚点收敛/Ctrl 取反三态/Shift 互斥/cursor 路径不受影响/锚点拖拽编辑路径）、`dragHandler.magnet.test.ts`（锚点拖拽吸附/整线拖拽不受磁吸影响）、`interaction.locked.test.ts`（可选中/不可拖）、`interaction.hitTestAt.test.ts`、`toolConfig.exports.test.ts`、DrawingDocument fill 与 locked 写入用例、selection Shift 用例。
