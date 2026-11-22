# 数据视图视口快照

## 决策

K 线视图位置按品种身份、周期、复权和数据视图保存到 `ChartStateKernel.dataManager.viewportSnapshots`。快照包含锚点时间、锚点槽位偏移与缩放等级。

## 原因

单一的临时返回时间戳会被后续切换覆盖，且恢复依赖特定调用路径。分时布局宽度和 K 线缩放宽度也不能再共享通用覆盖值。快照以槽位（而不是像素）记录位置，恢复时不依赖 DPR 或当前几何，也不让数据层参与视口换算。

## 实现

- `zoomState.timeShareSlotWidth` 仅在 `dataView === 'timeshare'` 时参与有效柱宽计算。
- K 线宽度始终由 `zoomLevel` 派生，切出分时后无需清理临时覆盖状态。
- 切品种/周期前由 `Chart` 读取当前视口并写入快照；回到 K 线后由 `Chart` 通过 `frameView` 恢复，数据层只按 key 存取快照。
- `frameView` 把锚点 K 线按保存时的槽位偏移放回原处，与 `frameTimeRange` 共用同一个提交点。

## 边界

请求、buffer 激活和 DOM 滚动仍由 `Chart` 与 `ChartDataManager` 执行。Kernel 只保存可恢复状态，不直接操作网络或 DOM；数据层不再写缩放档位或手算像素滚动。

