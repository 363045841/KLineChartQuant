# Agent 与 UI 统一行情查询 API

## 背景

图表加载此前通过 `ChartDataManager -> DataBuffer -> SourceRouter` 取数，而 Agent 只能查询当前图表已加载的快照。两条入口会使任意品种的无状态行情查询依赖图表选择、视口和渲染生命周期，并把分页、重试和缓存覆盖策略绑定到图表 Buffer。

## 决策

在 `ChartAgentController` 上直接提供并以 `@Tool` 注册 `queryBars`、`queryTimeShare` 与 `queryTimeShareRange`。UI 直接调用这些公开方法，Agent 从同一个注册表调用它们；不建立 Agent 专用服务或适配层。

每个 API 都使用图表实例级 `MarketDataCache`。缓存通过同一 `MarketDataProviderRegistry` 创建 `SourceRouter`，负责内存命中、`limit`/`before` 游标分页、重试、并发请求去重和 auto source 锁定。图表 `ChartDataManager` 与 Agent facade 持有同一个缓存实例，不存在第二条取数链路。

公开的 `queryBars` 接受 `limit`（拉多少根）与可选 `before`（排他时间戳游标，省略表示最新一页），拉多少就请求多少，不做时间范围覆盖外推。查询返回实际来源、品种描述和该页数据；不会直接写入当前图表选择、StateKernel、指标或 Renderer。

## 当前范围

`DataBuffer` 与 `TimeShareBuffer` 只负责图表快照投影，已不包含 fetcher 注入、请求调度、重试、分页或来源迁移。当前缓存只保留内存层；IndexedDB、容量淘汰和 TTL 可以以后作为 `MarketDataCache` 的内部实现增加，不能创建新的公开查询入口。
