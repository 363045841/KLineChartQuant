# 引擎绘图交互硬化：OHLC 磁吸与 locked 语义

> 2026-09-13 · 引擎侧下沉批次（pr/engine-drawing-hardening）。对应 nexus-shell 引擎缺口登记 G-01（磁吸）、G-04（locked），连带 G-03/G-06/G-07/G-08 的小项。

## 背景

nexus-shell 在壳层（ChartPointerBridge）验证了磁吸、锁定、Shift 多选等绘图交互行为（探针 B1-17/B1-18 等 39 断言全绿）。本批把已验证的能力下沉到 `packages/core/src/engine/drawing/`，壳侧实现保持不动，后续由独立的 [fork] 提交切换到引擎 API。

## 一、OHLC 磁吸（G-01）

### 档位语义（与壳侧 applyMagnet 逐点一致）

| 档位 | 候选价格 | Y 吸附半径 | X 行为 |
|------|----------|-----------|--------|
| off  | —        | —         | 不吸附 |
| weak | high/low | 8px       | Bar 中心可解析时吸附到中心 |
| strong | high/low/open/close | 15px | 同上 |

- **X 吸附与 Y 是否命中无关**：只要 `getScreenXAtLogicalIndex(barIndex)` 非 null，X 即改写为 Bar 中心。这是壳侧已验证行为（对最终锚点影响：同一 Bar 内点击解析出同一时间戳，仅在 Bar 边界半个 Bar 宽内有差异）。
- **候选遍历顺序** `[high, low, open, close]`，距离用 `<=` 比较——与壳侧一致，同距离时后遍历者胜出。
- **修饰键**：Ctrl/Meta 按住时档位覆盖为 strong（含偏好 off 时——壳侧行为如此，绘图模式下 Ctrl 无其他占用）。
- **完全无吸附点**（Bar 中心不可解析且 Y 无命中）时 `snapPointerToOhlc` 返回 null，调用方使用原始坐标。

### 接入点

- `magnetSnapper.ts`：纯函数 `snapPointerToOhlc(mouseX, mouseY, pane, adapter, config)`，输入输出均为容器局部坐标。
- `resolveDrawingPointer` 增加第 4 可选参数 `options.magnet`，吸附发生在 `screenToAnchor` 之前（改写局部 x/y）。**不传即不吸附**——cursor 命中（findDrawingHit）、框选（startSelectionMarquee / handleSelectionMarqueeMove / commitSelectionMarquee）、线段标签（getLineLabelTarget）、拖拽（DragHandler）路径一律不传，保证点选命中与框选范围不随吸附漂移。
- `DrawingInteractionController`：`setMagnetMode('off'|'weak'|'strong')` / `getMagnetMode()`，仅在 `onPointerDown` 绘制分支与 `onPointerMove` 预览分支传入磁吸配置。

### 为何不进 StateKernel

磁吸是**会话级交互配置**（与"当前用哪个工具画图"同类），不是图表业务状态：不参与持久化、不派生其他状态、不驱动 effect。放 StateKernel 会引入 settings 侵入与 effect 复杂化。它与 `Chart.setDrawingToolId` 后的 `applyToolSession` 会话副作用同一层次，故放 DrawingInteractionController 实例字段。

## 二、locked 强制语义（G-04）

`DrawingObject.locked === true` 的图元：

1. **不可点选**：不进入 `findDrawingHit` 的命中候选（cursor 点击视同空白）。
2. **不可框选**：不进入 `commitSelectionMarquee` 的候选。
3. **不可拖**：不作为连带组参与拖拽（`handleCursorDown` / `handleBoxSelectDown` 的 dragTargets 过滤 locked）；锚点级命中被 1 挡住。
4. **保持选中**：锁定不清空已有选中（选中是状态，锁定是交互约束）；已选中的 locked 图元仅从拖拽组中剔除。
5. **公开命中查询同口径**：`hitTestAt`（G-03 部分下沉）复用同一候选过滤，橡皮擦/对象树 hover 无法命中 locked 图元——删除需先解锁，与 TV 一致。

## 三、连带小项

- **G-06 Shift 多选**：`handleCursorDown` 的多选判定从 `e.ctrlKey` 扩为 `e.ctrlKey || e.shiftKey`（toggle 与空白不清空两处）。
- **G-07 锚点数表导出**：`getAnchorCountForTool` 与 SINGLE/DOUBLE/TRIPLE_ANCHOR_TOOLS 自 drawing 模块与 controllers facade 导出，宿主不再自维护副本。
- **G-08 通道类 fill 键**：病根查证——渲染端 `applyFillStyle` 在 fill 缺省时从 stroke 派生（跟随语义），补默认 fill 会导致"改描边色后填充色不再跟随"的视觉语义回归，故**不改默认样式**。改为 `getBatchStyleKeys` 对"全部目标为通道类"的集合无条件包含 `fill`：通道类的填充能力由 kind 固有（渲染端必有 area 图元），fill 对其总是可批量修改；显式设置后才固化、不再跟随 stroke。混合（通道+线类）集合维持交集守卫拒绝。

## 四、G-09 类型链（vue 侧，独立提交）

`vue-tsc` 不走 vite alias，`@363045841yyt/klinechart-agent-runtime(/contracts/ui)` 落回 package exports → dist（开发 clone 从未构建）→ `features/agent` 整条类型链断裂。修复：root `tsconfig.app.json` paths 增加与 vite alias 相同的源码映射（tsconfig.vitest.json 经 extends 继承）。类型错误 337 → 56，剩余为测试文件存量债（基线同在、非 agent 链）。

## 测试与验收

- 单测：`magnetSnapper.test.ts`（档位/半径边界/夹取/pane 偏移）、`interaction.magnet.test.ts`（锚点收敛/Ctrl 升级/cursor 路径不受影响）、`interaction.locked.test.ts`（三重强制）、`interaction.hitTestAt.test.ts`、`toolConfig.exports.test.ts`、DrawingDocument fill 用例、selection Shift 用例。
- 行为回归：nexus-shell 探针 `probe-drawing.mjs` 39/39（壳侧磁吸仍在生效，证明引擎改动零回归）。
