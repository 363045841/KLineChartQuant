# 对比图表模式

## 决策

`comparison` 是与 `kline`、`timeshare` 互斥的 `ChartMode`。它只展示对比集合中若干品种（各自归一化为相对自身基准的涨跌幅）的折线，不区分主品种。

## 状态职责

`mode.dataView` 决定当前显示的图表视图、主图 renderer 和交互能力。`comparison` 子状态负责对比品种集合（`specs`）、颜色和加载状态，不承担当前视图选择。

极值标记是由 `@Indicator({ dataViews: ['kline'] })` 声明的 mode 辅助 renderer。它参与 `activeRenderers$` 投影，但不进入用户指标实例或主图图例。

## 无主品种概念

对比视图没有“主品种”。对比品种集合 `comparisonState.specs` 是唯一业务状态，所有序列在渲染、y 轴范围和图例中一律平等：

- 首序列 `specs[0]` 仅作为横轴时间索引与百分比基准的**参考序列**（`ChartDataManager.getComparisonReferenceData`），没有视觉或图例特权。
- `comparisonLine` 为集合中每个已加载品种各画一条折线；集合为空则不绘制。
- `getComparisonViewLineRange` 只遍历对比集合的等价价极值，不读取 kline 主品种数据。
- 图例 `collectComparisonRows` 只列出对比集合成员，不再追加主品种行。
- 参考序列的 bar 数经 `comparisonState.referenceLength` 驱动 `dataLength$`，使没有 kline 主品种时仍能计算可见区间。

## 切换规则

对比集合非空时进入 `comparison`，清空时恢复 `kline`。视图激活由 `comparisonState.active`（`specs.length > 0`）驱动，既不依赖 kline `symbols.length > 1`，也不依赖主品种是否存在。分时数据不进入对比模式。

## 主品种进入对比视图的路径

kline 主品种要出现在对比视图，必须由调用方把它作为普通序列显式加入对比集合。UI 侧：首次添加对比商品时，`KLineChart` 把当前 kline 主品种经 `addComparisonSymbol` 推入集合，之后切换主品种时把集合中原本的主品种条目替换为新品种。core 不读取 kline 主品种来构造对比集合。
