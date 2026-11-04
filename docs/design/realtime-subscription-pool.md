# 实时订阅池（Realtime Subscription Pool）

## 决策

在数据层建立唯一的实时订阅入口 `RealtimeSubscriptionPool`：

- **逻辑订阅**以 `(sourceId, channel, instrumentId)` 标识，带引用计数。
- **物理连接**由池聚合：报价按来源聚合，K 线按来源 + 周期 + 聚合 + 复权聚合。
- **连接实现只有一份** `SseConnection`；宿主数据源通过 `MarketDataProvider.realtime` 注入自己的连接工厂。
- **连接集合变化才重建连接**，重建即重新同步快照；同一轮变化用微任务合并。

池不存行情。K 线帧交给 `RealtimeBarsConnector` 写入 `DataBuffer`，报价帧交给消费端的 signal 表。历史查询、缓存与分页仍走 `MarketDataCache`。

连接表面（`onFrame` / `onStatus` / `onError` 的监听与广播）只有一份实现 `createRealtimeCallbackHub`：SSE 连接、宿主连接工厂与池订阅共用它。关闭后所有投递静默丢弃，销毁与退订不再逐个清理监听集合。

## 分层

```
Vue / 图表         订阅、展示
MarketRuntime      需求与租约（谁要什么、何时释放）
实时订阅池         连接与扇出（批量品种、引用计数、上限）
传输                SseConnection（唯一实现）/ 宿主连接工厂
Connector          按 instruments 批量推送
```

## Wire 契约

连接就是一次订阅，URL 参数即订阅集合：

```
GET /api/v1/market-data/sources/:sourceId/stream
    ?instruments=<id>,<id>&period=<period>&barAggregation=<agg>&adjustment=<adjust>

GET /api/v1/market-data/sources/:sourceId/quotes
    ?instruments=<id>,<id>
```

帧一律带 `instrumentId`，不再用 `symbol` 作为身份：

```json
{ "type": "update", "instrumentId": "mt5:XAUUSD", "bar": { "timestamp": 0, "open": 1, "high": 1, "low": 1, "close": 1 } }
{ "type": "snapshot", "instrumentId": "mt5:XAUUSD", "bars": [] }
{ "type": "invalidate", "instrumentId": "mt5:XAUUSD" }
{ "type": "status", "instrumentId": "mt5:XAUUSD", "status": "market-closed", "detail": "weekend" }
{ "type": "quote", "instrumentId": "mt5:XAUUSD", "last": 2400.5, "prevClose": 2390.1, "timestamp": 0 }
```

报价帧只带最新价与昨收，涨跌幅由消费端派生。

## 不变量

- 一份逻辑订阅只对应一个订阅句柄；最后一个句柄关闭时连接立即销毁。
- 连接状态是连接级的，回放给该连接上的所有订阅者。
- 解析错误只报告，不销毁连接。
- 池不缓存行情，也不参与历史加载。
- 批量连接每次（重）连都重新下发快照；单流端点仍可沿用 Last-Event-ID，但多流连接的单个游标无法表达多路进度，因此不承诺逐帧续传。
