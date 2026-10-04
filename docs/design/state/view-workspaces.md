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

K 线与分时工作区的用户配置使用 `localStorage` 持久化，键名为 `kline-chart-view-workspaces`。存储内容是完整 workspace 快照，仅包括用户指标、pane 布局比例和坐标轴类型；mode 管理的主序列、行情数据、viewport 与 renderer 实例均不保存。

`createChartController` 在创建 `Chart` 前同步读取快照，再作为 kernel 初始状态注入，避免首帧默认布局闪烁。JSON 损坏时直接使用默认布局。

用户通过指标或 pane 的语义入口变更工作区时，`Chart` 调用持久化适配器调度保存。适配器以 1 秒 trailing debounce 合并连续变更；`pagehide` 和 Chart 销毁时仅在有待写入变更时立即补写。

StateKernel 仍是业务状态 SSOT，只提供完整快照的恢复与读取。浏览器存储、定时器和页面事件只存在于 controller 层适配器中；读取异常或配额不足均降级为默认内存状态，不影响图表运行。

## Runtime 启动阶段

Chart 构造阶段只建立 kernel、Scene、layout 与 manager 依赖。所有运行时依赖就绪后，`Chart.startRuntime()` 统一启动指标 projection、viewport、活跃 Layer 投影和首帧绘制。`ChartIndicatorManager.start()` 首先从完整 kernel snapshot 投影 pane、renderer 与 scheduler，再订阅后续状态变更；因此恢复快照与运行时用户操作经过同一条 reconcile 链路。
