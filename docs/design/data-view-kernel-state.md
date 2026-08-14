# 数据视图状态迁移

K 线与分时共用一个 `ChartStateKernel`。切换只修改 `mode.dataView`，不保存或恢复第二份图表快照。

## 状态

- `dataView`：当前数据视图，取值为 `kline` 或 `timeshare`。
- `primaryRendererByView`：分别保存 K 线和分时的主序列渲染偏好。

## 派生

- `effectivePrimaryRenderer`：校验当前视图支持的主渲染器并提供回退值。
- `interactionCapabilities`：按当前视图派生平移、缩放、垂直滚动和右轴缩放能力。
- `chartMode`：现有 Controller API 的兼容只读别名，与 `dataView` 指向同一个 Signal。
- `activeRenderers`：渲染器启停的统一派生出口；K 线视图投影为 `candle`，分时视图投影为 `timeShare`。已启用指标按其 `dataViews` 声明加入，未声明的旧指标默认仅支持 K 线；名称通过 metadata 的 `getRendererName` 解析，不创建 renderer 实例。

`Chart` 只把 Kernel 的 `dataView` 投影到对应 `ChartModeHandler`，不得再持有 `_activeMode` 或分时状态快照。
