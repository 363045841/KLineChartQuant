# @363045841yyt/klinechart-plot-contracts

图表 Plot 的契约：生产方（脚本引擎，以及过渡期的 core 指标）声明并组装它，图表引擎渲染它。

位于依赖图最底层，不依赖任何包，因此 `core` 与 `script` 互不依赖，绘图数据也保持唯一一份定义。
除数据模型外，本包还提供声明式契约与唯一一份组装器，生产方不再各自实现组装。

| 类型 / 导出 | 含义 |
| --- | --- |
| `PlotPoint` | 单个绘图点 |
| `LinePlot` / `HistogramPlot` / `PointsPlot` | 三种绘图形状 |
| `Plot` | 三种形状的联合 |
| `PlotFill` | 引用两个 Plot 的区域填充 |
| `PlotCollection` | 一个指标实例产出的全部 Plot 与填充 |
| `PlotDeclaration` / `PlotFillDeclaration` | 声明式 Plot 与填充 |
| `PlotCollector` | 把逐 bar 输出组装成 `PlotCollection` |
| `PLOT_ERROR_CODES` | 组装期错误码 |
