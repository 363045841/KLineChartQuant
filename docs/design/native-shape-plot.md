# 原生 Shape Plot

Shape 作为现有 Plot 的第四种 kind，沿用指标计算、PlotCollector、PlotCollection、范围投影和 Plot Layer。不存在 Marker 状态、独立 Layer 或脚本专用渲染链路。Char 和变长 Arrow 不在本次范围内。

共享契约定义 12 种 style、5 种 location 和 6 种 size。宿主将同一组枚举注入 QuickJS，编辑器从契约生成声明；不再维护 VM 专属的 PlotKind 取值。原生指标和脚本统一通过 createPlot 补齐样式默认值。

逐 bar 数据仍为数值和颜色。Shape 接受布尔条件，入口转为 0/1；相对位置隐藏零值和非有限值，absolute 允许价格 0。样式、尺寸、文字可在 plot 调用参数或 plots 声明中配置，形状和文字颜色均可逐 bar 覆盖。文字支持换行。

PlotCollector 用一个有序条目集合保存声明和数据列：plots 声明预先创建条目，直接调用按首次出现创建条目，二者不维护各自的收集链路。调用参数复用声明校验，并覆盖对应条目的配置；同一 id 首次输出后 kind 和整列样式保持固定，颜色随数据点变化。

abovebar/belowbar 使用 offset 后目标 K 线的 high/low；分时数据使用 price。top/bottom 使用 pane 高度和轴边距，absolute 使用价格投影。完整字形和文字包围盒参与相对定位，避免遮盖目标 K 线。

只有价格定位的 Plot 参与数值范围及填充边界，条件值不能拉伸价格轴。取消绘制阶段的无数值范围提前返回，让纯 Shape 指标能够绘制。相对位置 Shape 不提供副图数值范围，副图轴继续使用现有无数值范围策略。

字形、文字测量和锚点进入现有 retained geometry 缓存，滚动只重放坐标。缓存输入包含 Plot、行情快照和主题，确保行情修订或文字字体变化重新投影。Canvas2D 直接绘制这些路径，与现有 GPU 线条和柱子共享 Plot Layer。

默认采用 xcross、abovebar、auto。尺寸使用 CSS 像素，DPR 由现有画布变换统一处理。auto 使用固定默认尺寸；本实现覆盖绘图语义，不承诺 TradingView 私有字体和尺寸的像素级一致。

手动验证：在脚本编辑器运行 packages/script/scripts/shape.js，使用实际行情检查 12 种形状、文字、滚动和缩放；将声明 location 改为 top/bottom/absolute 验证定位。自动测试覆盖 VM 到收集器、纯 Shape 绘制、条件/价格范围、offset、文字颜色和滚动缓存。
