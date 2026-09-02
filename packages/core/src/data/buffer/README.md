# Market Data Cache

本目录实现图表实例级行情内存缓存与图表快照适配器。

```text
UI / @Tool / ChartDataManager
  -> MarketDataCache
  -> SourceRouter
  -> MarketDataProvider
  -> DataBuffer / TimeShareBuffer
  -> StateKernel / Renderer
```

`MarketDataCache` 是唯一的取数策略层，负责：

- 按实际来源、品种、周期与复权隔离 K 线缓存。
- 以 `limit` 和可选 `before` 游标直接响应调用方的一页请求。
- 合并已缓存页并按时间戳去重。
- 处理重试与同一序列的 in-flight 请求去重。
- 在 auto source 首次成功后锁定后续分页来源。
- 缓存单日和多日分时查询结果。

调用方直接描述要拉多少根（`limit`）以及从哪个时间戳之前开始（`before`，省略表示最新一页）；不按时间范围做覆盖外推。

`DataBuffer` 和 `TimeShareBuffer` 是图表运行时快照适配器，只发布数据、loading 和 error。它们不持有 fetcher，不执行重试，不判断缓存缺口，也不迁移来源。

当前实现只使用内存。IndexedDB、TTL、容量上限和淘汰策略应作为 `MarketDataCache` 的内部存储策略加入，不能改变 UI、Agent 或图表加载的公开 API。
