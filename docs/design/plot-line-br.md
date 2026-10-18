# 普通折线与断线折线

脚本通过独立方法表达空值语义：`plot.Line(value, name)` 跨空值连接前后有效点，对应 Pine 的 `plot.style_line`；`plot.LineBR(value, name)` 在空值处断开，对应 `plot.style_linebr`。

共享契约分别使用 `line` 与 `linebr`，不再提供 connectGaps 选项。两种类型共享样式、数据采集、投影与绘制代码，仅在空点处的分段处理不同。方法名决定类型，采集器禁止同名 Plot 在一次运行中切换类型。编辑器和两种执行器复用共享声明与枚举。

连接只改变折线路径，不插值或填补数据，因此空值位置的图例、范围统计和 fill 数据保留原有语义。颜色变化沿用后一个有效点的颜色；不可见区间之间的投影遍历跳跃仍会开始新段。

原先的 `plot.Line()` 遇空值断线，现在改为跨空值连接。需要保留断线行为的脚本应改用 `plot.LineBR()`，内置脚本中显式条件留空的 RSI、Stoch 绘图已迁移。core 的 PlotSpec 通过 `kind: 'linebr'` 选择断线折线。
