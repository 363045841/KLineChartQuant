# 指标查询层（已废弃）

本文件描述的是旧 `IndicatorQuery`：按 `definitionId + params` 重新计算、由 `IndicatorTextFormatter` 输出紧凑文本。该层已被删除，不再存在。

替代实现与决策见 [`docs/design/agent/indicator-series-read.md`](../agent/indicator-series-read.md)：

- 读取入口是 `ChartIndicatorManager.readSeries`，经过 `IndicatorCalculationScheduler.submit`，与图表实例共用执行器和结果仓库；
- 返回的是 `IndicatorResult`（时间轴、修订号、`series`、可选错误），由 `projectIndicatorSeries` 投影为列、行、绘图对象与水平线；
- 参数统一叫 `inputs`，类型为 `number | string | boolean`，按定义声明校验；
- 输出无法识别时抛 `INDICATOR_OUTPUT_UNREADABLE`，不再降级为对象计数。
