# 价格轴范围：单一事实来源与收集阶段决策

## 目标

价格轴范围只保留一份业务状态，并且只在一个地方决策用哪段价格区间，渲染端只做投影。
删除运行时价格轴与内核之间双向写回、以及散落在各处的「锁定范围优先」判断。

## 状态归属（SSOT）

- 内核 `mainPriceAxisState.paneRanges` 是唯一业务状态：每个 Pane 的 `rangeMode`（自动 / 锁定）与 `handRange`（锁定的价格范围）。
- 运行时 `PriceScale` 只是投影目标：`range` 由渲染端按帧写入，不再持有独立的平移 / 缩放（原 `priceOffset` / `verticalScale` 已删除），也不回写内核。
- 运行时轴的 `scaleType`、`basePrice` 仍由内核与收集结果派生，只读映射。

## 收集阶段决策

`ChartRenderer` 在 `visibleRange` 更新之后、绘制之前调用 `collectPanePriceRanges(frame)`：

1. `computePaneAutoRange`（`frame/impl/panePriceRange.ts`）按 Pane 角色与数据视图分派四条通道：
   - 副图：指标 state 的 `valueMin/valueMax`；
   - 主图 + K 线 + 比较：比较投影与主图指标极值；
   - 主图 + K 线：可见区 `max(high)` / `min(low)` 并入主图指标极值；
   - 主图 + 分时：可见 `price` / `average` 极值加留白。
2. `resolvePanePriceRange` 做唯一的锁定优先决策：锁定模式已保存范围则直接采用，否则用自动范围。
3. 结果写入 `FrameContext.panePriceRanges`；锁定模式尚无 `handRange` 时，用本帧自动范围回填（收集阶段一次性写入内核）。

无有效价格数据时自动范围返回 `null`，不再生成 `0~100` 默认范围。比较只在 K 线视图参与。

## 渲染阶段

`renderPanes` 对每个 Pane 直接投影收集结果：`setBasePrice` + `setRange`。
没有任何模式判断、比较判断或回写内核，帧缓存命中时完全不碰价格轴。

## 交互

拖动与缩放基于内核 `handRange` 做纯计算：`PriceScale.translateRange` / `scaleRange` 在刻度原生空间（线性 / 对数 / 百分比）计算新范围，`Chart.transformPrice` 只写内核。
运行时轴不再参与交互，因此同一帧内的多次拖动可以累加，品种切换后首个有效帧之前拒绝交互。

## 持久化

布局文档保存 `panePriceAxisModes` 与 `panePriceAxisRanges`。
恢复时先切换主品种清理旧范围，再原子恢复模式与范围；设置监听不再派发价格轴命令，避免默认设置覆盖刚恢复的范围。

## 附带清理

- `PaneInfo` 移除 `getPriceOffset`；指标缓存的纵向维度由显示范围本身承担。
- 删除 `resetPriceOffset` 等无效入口。
