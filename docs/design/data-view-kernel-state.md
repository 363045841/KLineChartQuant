# 数据视图状态迁移

K 线与分时共用一个 `ChartStateKernel`。切换只修改 `mode.dataView`，不保存或恢复第二份图表快照。

## 状态

- `dataView`：当前数据视图，取值为 `kline`、`timeshare`、`fiveDayTimeShare` 或 `comparison`。
- `primaryRendererByView`：分别保存 K 线和分时的主序列渲染偏好。

## 派生

- `effectivePrimaryRenderer`：校验当前视图支持的主渲染器并提供回退值。
- `interactionCapabilities`：按当前视图派生平移、缩放、垂直滚动和右轴缩放能力。
- `chartMode`：现有 Controller API 的兼容只读别名，与 `dataView` 指向同一个 Signal。
- `activeRenderers`：渲染器启停的统一派生出口；K 线视图投影为 `candle`，分时视图投影为 `timeShare`。已启用指标按其 `dataViews` 声明加入，未声明的旧指标默认仅支持 K 线；名称通过 metadata 的 `getRendererName` 解析，不创建 renderer 实例。

`Chart` 只把 Kernel 的 `dataView` 投影到对应 `ChartModeHandler`，不得再持有 `_activeMode` 或分时状态快照。

## 领域边界

- `ChartDataViewId`：运行时图表视图的唯一枚举，交互、渲染、插件元数据和 Controller 状态均以它判断能力与可见性。
- `period`：行情请求周期；`TIME_SHARE_PERIOD` 与 `FIVE_DAY_TIME_SHARE_PERIOD` 仅用于数据选择、请求和时间格式等数据层逻辑，统一通过 `isTimeSharePeriod()` 分类。
- `ChartWorkspaceId`：用户配置的隔离工作区；五日分时映射到分时工作区，不能替代 `dataView`。

因此运行时逻辑不得由 `period === 'timeshare'` 推断图表类型。需要区分普通与五日分时时，直接比较 `ChartDataViewId.TimeShare` 与 `ChartDataViewId.FiveDayTimeShare`；需要共同能力时使用 `isTimeShareDataView()`。
