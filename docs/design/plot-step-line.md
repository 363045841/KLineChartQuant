# 阶梯线绘图

`plot.StepLine(value, name, options?)` 跨空值连接前后有效点，`plot.StepLineBR(value, name, options?)` 在空值处断开，分别对应 Pine 的 `plot.style_stepline` 与 `plot.style_steplinebr`。两者返回 PlotRef，可供 fill 引用，复用普通折线的颜色、尺寸、虚线、显隐与偏移选项。

共享声明和绘图数据分别使用 stepline 与 steplinebr 类型。脚本编辑器、两种执行器和 core 的 PlotSpec 共用这些类型，不引入额外样式开关。

投影仍保存原始有效点，保证图例、自动缩放与空值数据语义一致。构建折线路径时，在相邻有效点的水平中点插入两个转折点，先水平、再垂直、再水平。跨空值时按两端有效点计算中点；BR 在缺点处清除前一个端点。同值直接水平连接，颜色变化使用后一个有效点的颜色。偏移在原有投影阶段处理，滚动和 DPR 沿用公共渲染链路。

生成的折线路径共用于 GPU 与 Canvas，不新增绘制后端。填充在每个相邻 bar 区间的中点分为两段，阶梯边界各自保持水平，普通边界继续线性插值，然后沿用交点裁切，避免填充斜穿阶梯。fill 仍不跨缺失数据生成面积。
