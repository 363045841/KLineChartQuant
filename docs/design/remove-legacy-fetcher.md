# 移除旧 Fetcher 兼容层

图表运行时只通过 `MarketDataProvider` 与 `SourceRouter` 取数。旧 `DataFetcher` / registry / router / Legacy Adapter 已删除，避免两套契约并存。

Buffer 只接受结构化结果：`BarPageResult` 与 `TimeShareResult`。不再兼容裸数组或分时点列回退。自定义数据仍走 `setData` / `applyCustomData`。
