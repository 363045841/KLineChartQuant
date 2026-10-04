# Agent 与 UI 统一行情查询 API

## 背景

图表加载此前通过 `ChartDataManager -> DataBuffer -> SourceRouter` 取数，而 Agent 只能查询当前图表已加载的快照。两条入口会使任意品种的无状态行情查询依赖图表选择、视口和渲染生命周期，并把分页、重试和缓存覆盖策略绑定到图表 Buffer。

## 决策

在 `ChartAgentController` 上直接提供并以 `@Tool` 注册 `queryBars`、`queryTimeShare` 与 `queryTimeShareRange`。UI 直接调用这些公开方法，Agent 从同一个注册表调用它们；不建立 Agent 专用服务或适配层。

每个 API 都使用图表实例级 `MarketDataCache`。缓存通过同一 `MarketDataProviderRegistry` 创建 `SourceRouter`，负责内存命中、`limit`/`before` 游标分页、重试、并发请求去重和 auto source 锁定。图表 `ChartDataManager` 与 Agent facade 持有同一个缓存实例，不存在第二条取数链路。

公开的 `queryBars` 接受 `limit`（拉多少根）与可选 `before`（排他时间戳游标，省略表示最新一页），拉多少就请求多少，不做时间范围覆盖外推。查询返回实际来源、品种描述和该页数据；不会直接写入当前图表选择、StateKernel、指标或 Renderer。

## 当前范围

`DataBuffer` 与 `TimeShareBuffer` 只负责图表快照投影，已不包含 fetcher 注入、请求调度、重试、分页或来源迁移。当前缓存只保留内存层；IndexedDB 和 TTL 可以以后作为 `MarketDataCache` 的内部实现增加，不能创建新的公开查询入口。

## 内存上限与淘汰

`MarketDataCache` 按图表实例管理近似内存用量，默认上限为 50 MiB。每次写入或命中都会更新条目的 LRU 顺序；超出上限后淘汰最久未访问的完整 K 线、单日分时或多日分时条目。单个条目本身超过上限时保留该条目，保证触发查询仍可返回结果。

估算值基于缓存对象的 JSON 有效载荷并计入 JS 对象与数组的保守开销，不等同于浏览器 heap 的精确占用。用户可在图表设置中把上限调整为 5 至 512 MiB，并查看当前实例的估算用量和条目数；设置变更立即触发淘汰。

## 精确品种查询

在 Core 的 `data/provider` 增加 `lookupInstrumentsBySymbol()`，用于按标准代码返回精确匹配的 `InstrumentDescriptor[]`。该 API 不替换现有 `searchInstruments()`。

边界：

- `searchInstruments()` 服务前端联想搜索，保留关键词、多候选和调用方指定的 `limit`。
- `lookupInstrumentsBySymbol()` 统一处理空白与大小写，再过滤为精确代码匹配；保留同代码、不同 `sourceId` 或 `exchange` 的结果。
- `@Tool` 直接标注在 `ChartAgentController.lookupInstrumentsBySymbol()`；Agent Runtime 只适配 Core 注册的方法，不承担候选筛选或 symbol 比较规则。

候选获取：当前 Provider Catalog 仅提供有上限的 `search()`。精确查询以代码作为关键词，使用由 Core 持有的候选上限，再进行精确过滤。若后续 Catalog 增加原生精确查询能力，`lookupInstrumentsBySymbol()` 是唯一替换候选获取实现的位置，UI 与 Agent 调用方无需调整。

对比标的的歧义裁决策略在 `ComparisonCommands`，见 [对比图表模式](../comparison/comparison.md) 与 [对比标的歧义裁决与 Ask Question 工具](../comparison/comparison-ambiguity-ask-user.md)。
