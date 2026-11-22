# Agent 与 UI 统一行情查询 API

## 背景

图表加载此前通过 `ChartDataManager -> DataBuffer -> SourceRouter` 取数，而 Agent 只能查询当前图表已加载的快照。两条入口会使任意品种的无状态行情查询依赖图表选择、视口和渲染生命周期，并把分页、重试和缓存覆盖策略绑定到图表 Buffer。

## 决策

行情查询收敛在 `ChartAgentMarketQueries`：`instruments_query`、`market_bars_query`、`market_timeshare_query`（`days` 吸收单日与多日）三只只读工具都调用它。指标序列读取属于指标命令面（`indicator_series_query` → `ChartAgentIndicatorCommands.series`），不挂在行情查询上。图表侧仍直接使用 `ChartDataManager` 与共享的 `MarketDataCache`，不为 Agent 建立第二套取数服务。

每个 API 都使用图表实例级 `MarketDataCache`。缓存通过同一 `MarketDataProviderRegistry` 创建 `SourceRouter`，负责内存命中、`limit` / `beforeTimestamp` 游标分页、重试、并发请求去重和 auto source 锁定。图表 `ChartDataManager` 与 Agent facade 持有同一个缓存实例，不存在第二条取数链路。

公开的 `queryBars` 接受 `limit`（一页取多少根）与可选 `beforeTimestamp`（排他时间戳游标，省略表示最新一页）。Agent 侧额外提供 `queryBarsWindow`：调用方只给 `from`/`to` 日期窗口与 `limit`（返回根数上限），向前翻多少页由缓存决定，窗口没覆盖完时用 `truncated` 明示。查询返回实际来源、品种描述和该页数据；不会直接写入当前图表选择、StateKernel、指标或 Renderer。

## 当前范围

`DataBuffer` 与 `TimeShareBuffer` 只负责图表快照投影，已不包含 fetcher 注入、请求调度、重试、分页或来源迁移。当前缓存只保留内存层；IndexedDB 和 TTL 可以以后作为 `MarketDataCache` 的内部实现增加，不能创建新的公开查询入口。

## 内存上限与淘汰

`MarketDataCache` 按图表实例管理近似内存用量，默认上限为 50 MiB。每次写入或命中都会更新条目的 LRU 顺序；超出上限后淘汰最久未访问的完整 K 线、单日分时或多日分时条目。单个条目本身超过上限时保留该条目，保证触发查询仍可返回结果。

估算值基于缓存对象的 JSON 有效载荷并计入 JS 对象与数组的保守开销，不等同于浏览器 heap 的精确占用。用户可在图表设置中把上限调整为 5 至 512 MiB，并查看当前实例的估算用量和条目数；设置变更立即触发淘汰。

## 品种查询

在 Core 的 `data/provider` 增加 `lookupInstrumentsBySymbol()`，按标准代码返回 `{ instruments, searchedSources, failedSources }`。`instruments` 是精确匹配的 `InstrumentDescriptor`，失败源单独列出。该 API 不替换现有 `searchInstruments()`。

边界：

- `searchInstruments()` 服务前端联想搜索，保留关键词、多候选和调用方指定的 `limit`。
- `lookupInstrumentsBySymbol()` 统一处理空白与大小写，再过滤为精确代码匹配；保留同代码、不同 `source` 或 `exchange` 的结果。
- `ChartAgentMarketQueries.lookup()` 先走精确匹配，未命中再用 `searchInstruments()` 取关键字候选；`instruments_query` 只是它的契约外壳，候选筛选与 symbol 比较规则不进入工具层。
- 零匹配不是一个成功结果：搜索完整时抛 `INSTRUMENT_NOT_FOUND`，`details` 带出查询词与已搜索的源；有源查询失败且无候选时抛 `FETCH_FAILED`，不把“没查成”报成“不存在”。

候选获取：当前 Provider Catalog 仅提供有上限的 `search()`。精确查询以代码作为关键词，使用由 Core 持有的候选上限，再进行精确过滤。若后续 Catalog 增加原生精确查询能力，`lookupInstrumentsBySymbol()` 是唯一替换候选获取实现的位置，UI 与 Agent 调用方无需调整。

## 数据源与日期

- **源默认由 Core 解析**：读工具不要求 `source`；用户点名数据源或 `instruments_query` 返回后可以原样回传，其余情况由 Core 在全部已启用源中解析。描述里只列能服务该能力的源，覆盖范围靠 `instruments_query` 的 `source` 与失败信封里的 `details` 发现。
- **交易日来自日线**：分时缺省交易日取该品种日线最后一根；给定日期没有数据时报 `INVALID_TRADING_DATE`，并带出更早的交易日。`tradingCalendar` 只提供未来槽位，不参与这里的解析。
- **K 线窗口**：`from`/`to` 在日线及以上写 `YYYY-MM-DD`，日内写 RFC 3339；`limit` 是返回根数上限，未覆盖完窗口时 `truncated=true`。

对比标的的歧义裁决策略在 `ComparisonCommands`，见 [对比图表模式](../comparison/comparison.md) 与 [对比标的歧义裁决与 Ask Question 工具](../comparison/comparison-ambiguity-ask-user.md)。
