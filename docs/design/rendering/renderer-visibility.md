# 渲染器可见性投影

## 声明式可见性

`ChartStateKernel.activeRenderers$` 是受管渲染层可见性的声明式来源。每个条目包含渲染器插件名和 Scene layer ID。`Chart` 拥有一个 effect，diff 上一帧与期望的 layer ID，只对受管集合更新可见性。

投影范围包括：

- 当前主序列 renderer；
- 主图指标数据层与共享图例层；
- 每个活动副图的 data、scale、title 层。

它从不安装或移除插件。

原因：插件工厂可能分配资源，不能在 `computed()` 中运行。指标 metadata 因此暴露纯的渲染器名解析器（data、scale、title）。scale 解析器使用插件真实的 `indicatorKey` 命名约定，避免旧的 `_scale_` 与 `Scale_` 不匹配。

生命周期：`ChartIndicatorManager` 与 `SubPaneManager` 仍负责安装、配置与卸载渲染器资源；`TimeShareMode` 只改业务状态。没有 manager 直接改 Scene layer 可见性，从而把运行时资源生命周期与状态驱动的可见性分离。

## 最新价线的模式可见性

`lastPriceLine` 与 `lastPriceLabelRegistrar` 是 mode 自有的主图 Indicators，声明 `dataViews: ['kline']`。它们由 `CHART_VIEW_DEFINITIONS[ChartDataViewId.KLine].mainInstances` 声明，只有 K 线视图创建这些系统实例，分时视图不创建。

原因：最新价虚线描述主 K 线的最后收盘价，在分时的 pane 中没有意义。它必须跟随与 `extremaMarkers` 相同的声明式可见性投影，而不是依赖绘制时的模式判断。

生命周期：`ChartIndicatorManager` 从 Indicator 定义安装两个层；`ChartStateKernel.activeRenderers$` 从活动的 mode 实例集合选择它们的可见性，因此分时视图从不启用任何最新价 renderer。

图例：图例上下文只在 K 线视图渲染 `currentBar`（O/H/L/C/Vol 行），分时视图不渲染。
