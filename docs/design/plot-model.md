# 指标 Plot 模型

普通指标统一输出 `line`、`histogram` 或 `points`。`fill` 通过两个 Plot ID 引用边界，不复制序列。
Script 与 Core 共用 `packages/script/src/contracts/plot.ts` 中的绘图契约。

## 数据与职责

- 计算执行器及 Worker 保留计算器的原始金融计算结果，参数、实例去重和版本提交规则不变。
- 指标声明 `plots`，指定取值字段、周期、显示开关、颜色和轴范围；不负责坐标转换。
- 实例投影生成 `PlotRenderState`。绘图、图例和价格范围都读取这份模型，不再读取指标专属的 `series` 字段。
- 原始数据按 K 线下标对齐。缺少点或 `NaN` 表示空值，线条在这里断开。
- Plot ID 在同一个指标实例内保持稳定；实例 ID 区分同名指标的不同实例。

## 帧投影

可见区间变化只重算数值范围，复用全量 Plot 数据。Plot Layer 复用同一轴版本的世界坐标，滚动时只改变重放偏移。
未来序列沿用图表的逻辑索引投影，不由一目均衡表单独推导另一套坐标。隐藏边界线不会隐藏仍启用的填充。

RSI 等指标可声明固定轴范围，CCI 可要求包含参考区间，非负指标可限制下界。柱状 Plot 的基准值也参与轴范围。
颜色使用现有主题 token，主题变化重建展示投影，不触发金融计算。

## 专用输出

结构、区域、成交分布和足迹使用 `customState`：它们的数据是领域对象，不是一根 K 线对应一个数值。
这条链路只用于专用输出，普通指标不保留旧的渲染状态、投影器或绘图实现。

## Script 接入

Script 的 `OutputSink.onPlot` 通过 `PlotCollector` 收集为共享 Plot 模型。
Core 使用 `registerScriptIndicator` 注册到现有实例体系，再交给通用 Plot Layer。
使用方法见 [Script 接入图表](./script-chart-integration.md)。
