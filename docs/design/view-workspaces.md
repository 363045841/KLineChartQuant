# View Workspaces

## Decision

用户指标与 pane 布局按工作区隔离：`kline` 与 `timeshare` 各自保存独立实例、pane
规格、比例和坐标轴类型。`TimeShare` 与 `FiveDayTimeShare` 归并到同一个 `timeshare`
工作区。

## State Model

`IndicatorState` 为每个工作区保存完整 `IndicatorInstanceSpec[]` 快照。`PaneState` 为
每个工作区保存 `paneSpecs`、`paneRatios` 和 `paneScaleTypes` 快照。既有的
`instances`、`paneSpecs`、`paneRatios` 与 `paneScaleTypes` 继续只暴露当前激活工作区，
因此 renderer、layout 和框架绑定不需要了解非激活工作区。

## Switching

`ChartStateKernel.actions.setDataView()` 将 data view 映射为工作区，并在一个 `batch()`
中激活 indicator 与 pane 快照，再写入当前主序列的 mode instance。首次进入空工作区时
只初始化该工作区的 `main` pane。切换不会复制、删除或同步另一个工作区的用户指标、参数、

## Runtime Safety

工作区切换会递增指标配置 revision。异步 scheduler 结果必须匹配当前 revision 才能提交，
因此离开工作区前发起的计算不会覆盖已激活工作区的 render state。非激活 pane 的 renderer
会卸载，state namespace 只在当前工作区的渲染生命周期内使用。
