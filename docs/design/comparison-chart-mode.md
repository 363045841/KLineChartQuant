# 对比图表模式

## 决策

`comparison` 是与 `kline`、`timeshare` 互斥的 `ChartMode`。它只展示主品种和对比品种的涨跌幅折线。

## 状态职责

`mode.dataView` 决定当前显示的图表视图、主图 renderer 和交互能力。`comparison` 子状态继续负责对比品种、颜色和加载状态，不承担当前视图选择。

极值标记是由 `@Indicator({ dataViews: ['kline'] })` 声明的 mode 辅助 renderer。它参与 `activeRenderers$` 投影，但不进入用户指标实例或主图图例。

## 切换规则

添加首个对比品种时切换到 `comparison`；移除最后一个对比品种时恢复 `kline`。分时数据不进入对比模式。
