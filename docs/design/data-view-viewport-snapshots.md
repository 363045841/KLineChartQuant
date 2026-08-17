# 数据视图 Viewport 快照

## 决策

K 线视图位置按品种身份、周期、复权和数据视图保存到 `ChartStateKernel.dataManager.viewportSnapshots`。快照包含锚点时间、相对横向偏移和缩放等级。

## 原因

单一的临时返回时间戳会被后续切换覆盖，且恢复依赖特定调用路径。分时布局宽度和 K 线缩放宽度也不能再共享通用覆盖值。

## 实现

- `zoomState.timeShareKWidth` 仅在 `dataView === 'timeshare'` 时参与有效柱宽计算。
- K 线宽度始终由 `zoomLevel` 派生，切出分时后无需清理临时覆盖状态。
- `ChartDataManager` 在激活分时 buffer 前保存当前 K 线锚点；K 线 buffer 激活后消费匹配快照并恢复 `scrollLeft`。
- `Chart.setCurrentPeriod()` 与 `Chart.setSymbols()` 都调用同一恢复入口，避免路径遗漏。

## 边界

请求、buffer 激活和 DOM 滚动仍由 `Chart` 与 `ChartDataManager` 执行。Kernel 只保存可恢复状态，不直接操作网络或 DOM。
