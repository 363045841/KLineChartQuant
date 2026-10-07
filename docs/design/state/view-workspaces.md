# 视图工作区

## 决策

用户指标与 pane 布局按工作区隔离：`kline` 与 `timeshare` 各自保存独立实例、pane 规格、比例和坐标轴类型。`TimeShare` 与 `FiveDayTimeShare` 归并到同一个 `timeshare` 工作区。

## State Model

`IndicatorState` 为每个工作区保存完整 `IndicatorInstanceSpec[]` 快照。`PaneState` 为每个工作区保存 `paneSpecs`、`paneRatios` 和 `paneScaleTypes` 快照。既有的 `instances`、`paneSpecs`、`paneRatios` 与 `paneScaleTypes` 继续只暴露当前激活工作区，因此 renderer、layout 和框架绑定不需要了解非激活工作区。

## Switching

`ChartStateKernel.actions.setDataView()` 将 data view 映射为工作区，并在一个 `batch()` 中激活 indicator 与 pane 快照，再写入当前主序列的 mode instance。首次进入空工作区时只初始化该工作区的 `main` pane。切换不会复制、删除或同步另一个工作区的用户指标、参数与 pane。

## Runtime Safety

工作区切换会递增指标配置 revision。异步 scheduler 结果必须匹配当前 revision 才能提交，因此离开工作区前发起的计算不会覆盖已激活工作区的 render state。非激活 pane 的 renderer 会卸载，render state 只在当前工作区的渲染生命周期内使用。

## 持久化

K 线与分时工作区不再单独持久化，而是随图表布局文档保存：`LayoutDocument.workspaces` 携带完整的用户指标、pane 布局比例和坐标轴类型快照；mode 管理的主序列、行情数据、viewport 与 renderer 实例均不保存。`LayoutManager` 把具名文档写入 IndexedDB。

`createChartController` 在 Chart 挂载后调用 `LayoutManager.initialize()`，恢复活动布局并投影首帧。内核 `workspaces` 信号变化触发布局自动保存（合并 600ms 内连续变更），切换、`pagehide` 与 Chart 销毁前补写。StateKernel 仍是业务状态 SSOT，只提供完整快照的恢复与读取。

## Runtime 启动阶段

Chart 构造阶段只建立 kernel、Scene、layout 与 manager 依赖。所有运行时依赖就绪后，`Chart.startRuntime()` 统一启动指标 projection、viewport、活跃 Layer 投影和首帧绘制。`ChartIndicatorManager.start()` 首先从完整 kernel snapshot 投影 pane、renderer 与 scheduler，再订阅后续状态变更；因此恢复快照与运行时用户操作经过同一条 reconcile 链路。
