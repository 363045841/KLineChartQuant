# 原生 Shape Plot

Shape 作为现有 Plot 的第四种 kind，沿用指标计算、PlotCollector、PlotCollection、范围投影和 Plot Layer。不存在 Marker 状态、独立 Layer 或脚本专用渲染链路。Char 和变长 Arrow 不在本次范围内。

共享契约定义 12 种 style、5 种 location 和 6 种 size。宿主将同一组枚举注入 QuickJS，编辑器从契约生成声明；不再维护 VM 专属的 PlotKind 取值。

默认值只有一处来源：`createPlot` 补齐 Plot 字段（线宽、基线、半径、虚线和 Shape 样式），`createFill` 补齐填充字段（不透明度与反转色）。原生指标投影与脚本采集器都调用它们，不再各自写 `??` 兜底；点图半径只有 1.5、填充不透明度只有 0.15 两个数字。

逐 bar 数据仍为数值和颜色。Shape 接受布尔条件，入口把 false 记为 na、true 记为 1。「不绘制」只有一种表示：数据点缺省或 `value` 为 NaN，0 与其他有限值一样是合法取值。相对定位（abovebar/belowbar/top/bottom）只用 K 线的位置，只有 absolute 才把 `value` 当价格；此前「相对定位下 0 表示无信号」的双重语义已取消，条件不成立一律用 false/NaN 表达。样式、尺寸、文字在 plot 调用参数中配置，形状和文字颜色均可逐 bar 覆盖。文字支持换行。

PlotCollector 用一个有序条目集合保存数据列：Plot 按首次出现的 name 建立条目，类型取调用处。调用参数复用契约校验并写入条目配置；同一 id 首次输出后 kind 保持固定，整列样式按字段签名比较（不序列化，也不受调用处每根 bar 新建数组影响），颜色随数据点变化。

填充引用只在两处校验：生产者 PlotCollector.collect 与投影端 projectPlots，两端都调用契约的 `validatePlotFills`。Plot Layer 不重复判定，只在投影缓存里解析一次端点，滚动重放不重新按 id 查找。

abovebar/belowbar 使用 offset 后目标 K 线的 high/low；分时数据使用 price。top/bottom 使用 pane 高度和轴边距，absolute 使用价格投影。完整字形和文字包围盒参与相对定位，避免遮盖目标 K 线。

只有价格定位的 Plot 参与数值范围及填充边界，条件值不能拉伸价格轴。取消绘制阶段的无数值范围提前返回，让纯 Shape 指标能够绘制。相对位置 Shape 不提供副图数值范围，副图轴继续使用现有无数值范围策略。

字形、文字测量和锚点进入现有 retained geometry 缓存，滚动只重放坐标。投影结果按 kind 携带各自的重放数据（批次、矩形、字形），绘制端不再判空或回查；缓存输入包含 Plot、行情快照和主题，确保行情修订或文字字体变化重新投影。Canvas2D 直接绘制这些路径，与现有 GPU 线条和柱子共享 Plot Layer。

默认采用 xcross、abovebar、auto。尺寸使用 CSS 像素，DPR 由现有画布变换统一处理。auto 使用固定默认尺寸；本实现覆盖绘图语义，不承诺 TradingView 私有字体和尺寸的像素级一致。

手动验证：在脚本编辑器运行 packages/script/scripts/shape.ts，使用实际行情检查 12 种形状、文字、滚动和缩放；将调用 location 改为 top/bottom/absolute 验证定位。自动测试覆盖 VM 到收集器、纯 Shape 绘制、na 表示（false 与 NaN 不绘制、0 会绘制）、价格范围、offset、文字颜色和滚动缓存。
