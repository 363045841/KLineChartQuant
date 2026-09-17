# 组合图元锚点物化与拖拽策略

## 决策

组合图元（`parallel-channel`、`flat-line`、`disjoint-channel`）在**创建时**把派生点一次性物化为持久化锚点，之后只持久化坐标。渲染、命中、拖拽一律只读 `anchors`，不再在帧内推导端点。拖拽时的跟随规则由命中目标与拖拽策略声明，不进入持久化模型。

## 问题

此前这三个图元只持久化 3 个锚点，第 4 个端点（`p4` / `h1` / `h2`）在 `compute()` 里由屏幕坐标推导并放进 `DrawingGeometry.computedAnchors`。命中检测只遍历 `drawing.anchors`，派生端点不在其中，因此该点无法被拖动；拖拽逻辑也只能按 `kind` 写特例。

## 创建期物化

- `getDrawingInputAnchorCount(kind)`：创建时用户输入的锚点数（1 / 2 / 3）。
- `getDrawingAnchorCount(kind)`：持久化后的完整锚点数（组合图元为 4）。
- `materializeDrawingAnchors(kind, anchors, createAnchorId, timeline)` 把输入锚点补齐为完整锚点：
  - `parallel-channel`：第四点由第三点按前两点的逻辑索引差平移，价格同向相加。
  - `disjoint-channel`：索引差同上，价格取反。
  - `flat-line`：两个水平端点分别落在首两点的时间上、价格取第三个输入点，替代输入的第三个锚点。
- 派生点的时间戳经逻辑索引换算取得，保证后续帧内投影可解析；索引超出数据末尾时记为 `futureOffset`。派生点落在首根 K 线之前时抛 `DRAWING_INVALID_ANCHOR`，因为时间坐标无法表达该位置。
- 旧的 3 锚点快照在 `replaceDrawings` 导入时按同一函数补齐。

## 帧内消费

绘图定义直接读 4 个持久化锚点。只有 `regression-channel` 保留 `computedAnchors`：它的端点是数据拟合结果，没有可持久化的固定坐标，命中时映射回两个范围锚点。

`HitTester` 的锚点命中天然覆盖全部持久化锚点，第 4 个点因此可拖。通道类图元的线段由持久化锚点按 `[0, 1]` 与 `[2, 3]` 成对构成，不再按 kind 推导。

## 拖拽策略

- `DrawingDragTarget`：点（一个锚点下标）、边（两个锚点下标）、整体。
- `DrawingDragStrategy` 与 `resolveDragAnchors(kind, target, anchorCount)`：把命中目标解析为一起按同一屏幕位移移动的锚点下标。缺省行为是点只动自身、边动两端、整体动全部。
- `DragHandler` 不认识 `kind`，只在拖拽移动时按目标解析移动组；位移换算（屏幕位移 → 时间 / 价格）仍由 `DragHandler` 统一完成。

## 已登记策略

`parallel-channel`：端点按角色跨线成对（`0/2` 左端、`1/3` 右端）。拖动任一端点时，另一条线上的同角色端点按同一位移跟随，剩下两点固定，因此两条线向量始终相同、始终平行；拖动一条边则整条线平移，另一条线不动。`HitTester` 为平行通道的线段带上两个锚点下标，命中线段即产生 `edge` 目标。
