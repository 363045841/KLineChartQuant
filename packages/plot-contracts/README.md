# @363045841yyt/klinechart-plot-contracts

图表 Plot 的数据契约：脚本引擎产出它，图表引擎渲染它。

只有类型定义，没有运行时代码，位于依赖图最底层，因此 `core` 与 `script` 互不依赖，
绘图数据也保持唯一一份定义。

| 类型 | 含义 |
| --- | --- |
| `PlotPoint` | 单个绘图点 |
| `LinePlot` / `HistogramPlot` / `PointsPlot` | 三种绘图形状 |
| `Plot` | 三种形状的联合 |
| `PlotFill` | 引用两个 Plot 的区域填充 |
| `PlotCollection` | 一个指标实例产出的全部 Plot 与填充 |
