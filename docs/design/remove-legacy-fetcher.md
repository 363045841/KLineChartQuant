# 移除旧 Fetcher 兼容层

图表运行时只通过 `MarketDataProvider` 与 `SourceRouter` 取数。旧 `DataFetcher` / registry / router / Legacy Adapter 已删除，避免两套契约并存。

图表与 Agent 现在都通过 `MarketDataCache` 查询结构化领域结果。`DataBuffer` 和 `TimeShareBuffer` 只投影查询结果，不再接受 fetcher、游标页结果或来源迁移回调。自定义数据仍走 `setData` / `applyCustomData`。
