# 收益表现颜色 Token

## 背景

区间选择工具栏需要按正收益、负收益和持平状态展示颜色。直接复用
`candleUpBody` / `candleDownBody` 会把业务统计文本耦合到 K 线实体的渲染角色，
也无法独立配置收益文本颜色。

## 决策

在 `ColorTokens` 中增加三个语义角色：

- `performancePositive`：正收益或正向表现。
- `performanceNegative`：负收益或负向表现。
- `performanceNeutral`：零收益或无法计算的中性状态。

默认色遵循当前主题的涨跌配色；浅色正收益色额外加深以满足小号文本的 WCAG AA
对比度要求，但 Token 身份独立。Vue 工具栏通过
`--klc-color-performance-positive`、`--klc-color-performance-negative` 和
`--klc-color-performance-neutral` 消费颜色，不再依赖 candle Token。

## 市场约定与覆盖

`withAsiaMarketColors` 交换正、负收益颜色，使中国市场的正收益显示为红色、负收益
显示为绿色；中性色不交换。三个 Token 同时进入颜色预设白名单，允许明暗主题分别
覆盖。`useChartTheme` 统一通过 `resolveThemeColors` 生成 CSS 变量，确保市场约定和颜色
预设只经过一条解析路径。

## 影响

这是向 `ColorTokens` 增加必填字段的类型变更。内置明暗主题已提供完整值，基于
`mergeTheme` 的局部覆盖不受影响；外部直接构造完整 `Theme` 的消费者需要补齐三个字段。
