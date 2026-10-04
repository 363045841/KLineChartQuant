# 数据视图状态

K 线与分时共用一个 `ChartStateKernel`。切换只修改 `chartModel.dataView`，不恢复第二份图表快照。

`engine/chartModel/` 模块是数据视图的唯一事实来源：`CHART_VIEW_DEFINITIONS` 声明每个视图的主序列渲染偏好、`requiresMarketSession`、横向能力与主图系统实例，`createChartModel()` 保存 `dataView` 状态并派生 `effectivePrimaryRenderer` 与 `interactionCapabilities`。视图行为实现（`impl/modes/`）与视图上的比较叠加投影、比较状态（`impl/comparison/`）也在本模块内；比较品种的数据协调与 CRUD 命令留在 `engine/data/`。

## 状态

- `dataView`：当前数据视图，取值为 `kline`、`timeshare` 或 `fiveDayTimeShare`。
- `primaryRendererByView`：分别保存 K 线和分时的主序列渲染偏好，默认值来自 `CHART_VIEW_DEFINITIONS`。

## 派生

- `effectivePrimaryRenderer`：校验当前视图支持的主渲染器并提供回退值。
- `interactionCapabilities`：按当前视图派生平移、缩放、垂直滚动和右轴缩放能力，来源为 `CHART_VIEW_DEFINITIONS[view].capabilities`。
- `chartMode`：现有 Controller API 的兼容只读别名，与 `dataView` 指向同一个 Signal。
- `activeRenderers`：渲染器启停的统一派生出口；K 线视图投影为 `candle`，分时视图投影为 `timeShare`。已启用指标按其 `dataViews` 声明加入，未声明的旧指标默认仅支持 K 线；名称通过 metadata 的 `getRendererName` 解析，不创建 renderer 实例。

`Chart` 只把 Kernel 的 `dataView` 投影到对应 `ChartModeHandler`，不得再持有 `_activeMode` 或分时状态快照。

## 领域边界

- `ChartDataViewId`：运行时图表视图的唯一枚举，只从 `engine/chartModel/` 流出；交互、渲染、插件元数据和 Controller 状态均以它判断能力与可见性。
- `period`：行情请求周期；`TIME_SHARE_PERIOD` 与 `FIVE_DAY_TIME_SHARE_PERIOD` 仅用于数据选择、请求和时间格式等数据层逻辑，统一通过 `isTimeSharePeriod()` 分类。
- `ChartWorkspaceId`：用户配置的隔离工作区；五日分时映射到分时工作区，不能替代 `dataView`。

周期到视图的推导只在 `resolveChartDataView(period)` 一处；视图能力、横向交互与系统实例的声明只在 `CHART_VIEW_DEFINITIONS` 一处。新增视图时补齐这份声明即可，不再散落 if 判断视图。
