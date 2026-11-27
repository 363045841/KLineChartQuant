# 行情服务

## 背景

重构前，图表、计算与警报各自维护一条取数链路：

- 图表的数据管理器持有 `MarketDataCache`、旧 `MarketRuntime` 与自己的 Buffer，负责历史分页、实时合并和滚动补偿。
- 计算中心又建一份 `MarketDataCache`，由 `IndicatorBarsRepository` 管理需求与共享 Buffer。
- 警报的 `createAlertFeedSource` 再建一份缓存，自己拉历史、合并实时。

结果是同一个品种、同一周期可能被拉三遍，三条链路的分页和收线语义各自演化。

## 契约

唯一入口是 `MarketDataService`：

- `bars(spec, { aggregation, initialBars })`：订阅 K 线序列。
- `timeShare(spec, { days, tradingDate? })`：订阅分时序列。
- `trades(spec)`：订阅逐笔成交。
- `read` / `readSymbol`：一次性读取一页历史，供脚本计算使用。
- `queryBarsWindow` / `queryBars` / `queryTimeShare` / `queryTimeShareRange`：窗口与分时查询。
- `clear` / `setMaxBytes` / `stats`：缓存管理。
- `dispose`：释放全部序列、连接与缓存。

`bars` 返回 `BarsSeries`：只读数据与状态，不暴露写入能力。同一序列的多个使用者拿到同一个句柄，引用计数归零时才断开连接并删除缓冲。

## 所有权

- `MarketDataCache` 与 `SeriesRepository` 由服务独占，图表和 Agent 不再持有。
- 实时订阅、重连补偿、收线标记（`lastBarClosed`）和向前分页都在服务内部完成。
- 计算中心只调用 `read` / `readSymbol`，不建立订阅、不持有缓存。
- 警报通过 `createAlertFeeds` 把服务序列投影成计算中枢的 feed，自己不再查询历史。

## 不变量

- 环境实现由组合根注入；服务内部没有 IndexedDB、`EventSource` 或 `Worker` 的默认实现。
- 一个运行时只有一份行情缓存。
- 服务不 import 图表、控制器或渲染代码，因此可以在无 DOM 的 Node 进程中运行。
- 周期、复权、聚合方式必须显式传入，非法值直接抛错，不做近似替换。

## 文件

- `packages/core/src/data/service/types.ts`：公开契约。
- `packages/core/src/data/service/impl/createMarketDataService.ts`：实现。
- `packages/core/src/data/buffer/seriesSelection.ts`：序列身份契约。
- `packages/core/src/data/buffer/impl/seriesRepository.ts`：Buffer 拓扑与生命周期。
- `packages/core/src/data/buffer/impl/marketDataCache.ts`：分页缓存、重试与在途请求去重。
- `packages/core/src/engine/data/chartDataManager.ts`：图表侧只读投影。
- `packages/core/src/engine/calculation/market/impl/readIndicatorBars.ts`：计算侧只读读取。
- `packages/core/src/features/alerts/impl/createAlertFeeds.ts`：警报侧 feed 投影。

## 验收

- 图表、计算、警报对同一序列只产生一份缓存和一条连接。
- 图表切换品种后旧序列引用归零，连接关闭。
- Node 进程可以只创建服务与计算中枢，不依赖 DOM。
