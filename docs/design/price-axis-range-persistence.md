# 价格轴范围：单一事实来源与收集阶段决策

## 目标

价格轴范围只保留一份业务状态，并且只在一个地方决策用哪段价格区间，渲染端只做投影。

## 状态归属（SSOT）

- 内核 `axesState.paneRanges` 是唯一业务状态：每个轴的 `rangeMode`（`all` / `bars` / `ratio` / `manual`）
  与 `range`（手动模式的显示范围，自动口径为 `null`）。
- 运行时 `PriceScale` 只是投影目标：`range` 由渲染端按帧写入，不持有独立的平移 / 缩放，也不回写内核。
- 运行时轴的 `scaleType`、`basePrice` 仍由内核与收集结果派生，只读映射。

## 收集阶段

`ChartRenderer` 在 `visibleRange` 更新之后、绘制之前调用 `collectPanePriceRanges(frame)`：

1. `preparePanePriceRangeInputs` 读取比较投影、足迹与轴状态；指标输出极值按轴惰性读取，
   同帧同轴只调用一次，缓存帧不读取。
2. `resolveFramePanePriceRanges` 逐轴求**主投影**（basis）：
   - 指标轴：自身输出极值；
   - 价格轴 + 比较：比较投影；
   - 价格轴：可见区 `max(high)` / `min(low)`（线形 / 面积图只取收盘）。
3. `collectRangeContributions` 按口径收集基准之外的来源：只有 `all`（以及 `manual` 的初始化）
   并入指标极值、足迹与可见绘图；`bars` / `ratio` 一律不收集。
4. `computeAutoRange` 按口径出范围：`all` 取并集，`bars` 只取基准，`ratio` 按固定占比留白，
   `manual` 按全并算一次用于回填。
5. `resolvePanePriceRange` 做唯一裁决：自动口径直接采用本帧结果；手动模式已有范围就保留，
   没有则用本帧结果回填并标记初始化。
6. 结果写入 `FrameContext.panePriceRanges`；待回填的手动范围在循环结束后一次快照写回内核。

无有效价格数据时自动范围返回 `null`，不再生成 `0~100` 默认范围。比较只在 K 线视图参与。

## 渲染阶段

`renderPanes` 对每个 Pane 直接投影收集结果：`setBasePrice` + `setRange`。
没有任何模式判断、比较判断或回写内核，帧缓存命中时完全不碰价格轴。

## 交互

拖动与缩放基于内核 `range` 做纯计算：`PriceScale.translateRange` / `scaleRange` 在刻度原生空间
（线性 / 对数 / 百分比）计算新范围，`Chart.transformPrice` 只写内核。
运行时轴不参与交互，因此同一帧内的多次拖动可以累加；不是 `manual` 或尚未初始化时拒绝交互。

## 持久化

布局文档保存 `panePriceAxisModes` 与 `panePriceAxisRanges`；后者只包含手动模式的范围。
恢复时先切换主品种清理旧范围，再原子恢复模式与范围；设置变更不再派发价格轴命令，
避免默认设置覆盖刚恢复的范围。

## 附带清理

- `PaneInfo` 移除 `getPriceOffset`；指标缓存的纵向维度由显示范围本身承担。
- 删除 `resetPriceOffset`、`setMainPriceAxisRangeMode` 等无效入口。
