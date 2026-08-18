# 语义配置 Props 映射

## 决策

语义配置不再直接控制运行中的 Chart。`toKLineChartProps` 仅将已验证的
`SemanticChartConfig` 映射为 `KLineChart` 的原生 `symbols`、`indicators` 和
`customMarkers` props。

`KLineChart` 只通过一条受控 props 同步路径写入 `ChartController`：先创建指标实例，
再设置数据源，最后更新 markers。挂载和后续 props 更新复用该路径。

## 原因

此前 Vue 挂载期手动创建主图指标，而更新期通过 `SemanticChartController` 写入图表。
两条路径覆盖的业务状态不同，导致首帧与后续更新不一致。

## 边界

`customData` 和 `settings` 继续是组件原生 props。`customData` 优先于 `symbols`，
用于内联数据模式；未传 `customData` 时，`symbols` 驱动 Provider 加载。

语义格式移除 `chart.kWidth`、`chart.kGap` 和 `theme`：前两者没有可写的等价 Kernel
契约，其中 `kGap` 是派生状态；主题应通过组件的原生 settings API 配置。
