# 实时订阅池（Realtime Subscription Pool）

## 背景

实时行情连接原先散在三处：HTTP 来源的 `BarsLiveSource`、宿主数据源的 `bars.subscribe` 适配、
以及成交流的 EventSource。每条连接只承载一个序列身份，自选列表要订阅多个品种时会撞上浏览器
同源连接上限（HTTP/1.1 约 6 条），并且切品种必须断开重连。

## 决策

在数据层建立唯一的实时订阅入口 `RealtimeSubscriptionPool`：

- **逻辑订阅**以 `(sourceId, channel, instrumentId)` 标识，带引用计数。
- **物理连接**由池聚合：报价按来源聚合，K 线按来源 + 周期 + 聚合 + 复权聚合。
- **连接实现只有一份** `SseConnection`；宿主数据源通过 `MarketDataProvider.realtime` 注入
  自己的连接工厂，不新增第二套订阅 API。
- **连接集合变化才重建连接**，重建即重新同步快照；同一轮变化用微任务合并。

池不存行情。K 线帧交给 `RealtimeBarsConnector` 写入 `DataBuffer`，报价帧交给消费端的
signal 表。历史查询、缓存与分页仍走 `MarketDataCache`。

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

报价帧只带最新价与昨收，涨跌幅由消费端派生，避免同一事实在链路上重复计算。

## 为什么不用能力字段声明多路复用

Connector 由本项目维护，批量订阅是协议要求而不是可选项；用能力字段声明会引入永远为 `true`
的分支。是否支持实时仍由 `SourceCapabilities.liveBars` 一处决定，报价通道随实时能力同时可用。

## 迁移状态

- Core：池、SSE 实现、K 线消费器、宿主适配、图表运行时接入、共享池（按注册表实例）已完成。
- Connector：MT5 / GoTDX / Binance 已按 `instruments` 批量参数、`instrumentId` 帧身份与
  `/quotes` 端点改造；报价统一实现为「日线实时流的投影」，不新增上游查询路径。
- 待接入：自选面板消费报价通道（分组与列展示）。

## 不变量

- 一份逻辑订阅只对应一个订阅句柄；最后一个句柄关闭时连接立即销毁。
- 连接状态是连接级的，回放给该连接上的所有订阅者。
- 解析错误只报告，不销毁连接。
- 池不缓存行情，也不参与历史加载。
- 批量连接每次（重）连都重新下发快照；单流端点仍可沿用 Last-Event-ID，但多流连接的
  单个游标无法表达多路进度，因此不承诺逐帧续传。
