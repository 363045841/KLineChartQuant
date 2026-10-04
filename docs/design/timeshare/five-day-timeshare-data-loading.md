# 五日分时数据加载

## 决策

`5daytimeshare` 使用独立的 `fiveDayTimeShare` 数据视图，并通过 V1
`timeshare/range` 接口请求五个实际交易日。

## 数据流

`ChartDataManager` 识别五日分时周期后调用 `TimeShareBuffer.loadRange(spec, 5)`。
Buffer 通过 `SourceRouter.timeShareRange` 按 `timeShareRange.maxTradingDays` 选择数据源，
将响应作为单个 `TimeShareRange` 快照写入。

`TimeShareBuffer` 同时投影按日分组的 `range` 和兼容渲染链路的扁平点列；因此后续多日
布局可读取交易日边界，而现有分时 renderer 仍可读取连续数据。

## 边界

范围请求保留单日分时相同的三次重试、过期响应丢弃和 auto source 身份迁移规则。
单日 `timeshare` 继续走原有接口，不受影响。
