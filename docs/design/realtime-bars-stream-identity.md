# 实时 K 线流的身份与能力契约

前端只有一条实时 K 线链路：`provider.liveBars.createStream` → `BarsLiveSource`（EventSource）→ `RealtimeBarsConnector` → `KLineBuffer.applyRealtimeBars`。所有 HTTP 源共用 `createHttpSource` 的同一个工厂，不存在按 sourceId 分支的平行实现；`mock` 的进程内假流只实现同一 `LiveBarsStream` 接口，用于测试。

## 请求身份

`LiveBarsRequest` 必须携带完整序列身份：`symbol / period / barAggregation / instrumentId / exchange / adjustment`。`symbol` 只是展示代码，跨交易所不唯一（如 `000001` 同时是深市股票和沪市指数）。调用方从已解析的 session 取 `instrument.id`、`instrument.exchange` 和 `selection.adjustment`，`BarsLiveSource` 按可用性拼入查询串；connector 优先按 `instrumentId` 定位，不再靠目录猜测。

复权口径：交易所成交价只有一套。前复权的最新一根与原始价相同，因此实时尾部 `qfq` 与 `none` 等价；后复权的最新一根需要累计因子缩放，必须显式传 `hfq`，否则 connector 默认 `none`，会把实时 bar 接到不同基准的历史序列上。因子本身不由上游单独暴露，实时尾部使用 connector 以复权类型请求到的已复权 K 线，不需要前端自行缩放。

## 能力协商

`liveBars` 是跨仓库能力位，connector 可能先于前端升级。校验在能力入库处完成：`MarketDataProviderRegistry.setCapabilities` 发现声明了 `liveBars: true` 但没有流工厂时，把该能力降级为 `false` 并报一次明确错误。运行时 `reconcileBarStreams` 只消费已归一化的能力，缺失工厂时跳过该序列，不再抛异常。品种级 `liveBars === false` 优先于源级声明（connector 只对部分市场提供实时流）。

## 断线恢复

前端不消费 `status` 帧；断线由 EventSource 自动重连，服务端在重新订阅时补一帧 snapshot。GOTDX 不提供 `Last-Event-ID` 回放，恢复能力由快照大小决定（当前为 2 根），分钟级长断线可能缺根；Binance 使用 `id` 与 replay 覆盖同一问题。两种语义由后端承担，前端保持单一消费链路。
