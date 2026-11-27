/**
 * 实时行情模块入口：只暴露契约。
 *
 * 连接实现由 `MarketDataContext` 装配；需要自定义连接时注入 Provider 的
 * `stream`，不使用模块级注册表。状态字典 `STREAM_STATUS` 只用于帧校验，
 * 已发布的 `upstream-error` 语义不再细分。
 */

export type {
  EventStream,
  EventStreamFactory,
  EventStreamHandlers,
  StreamBar,
  StreamChannel,
  StreamClose,
  StreamErrorCode,
  StreamEvent,
  StreamFrame,
  StreamHub,
  StreamPhase,
  StreamQuote,
  StreamRequest,
  StreamStatus,
  StreamSubscription,
  StreamSubscriptionRequest,
  StreamTransport,
  StreamTransportFactory,
  StreamTransportHandlers,
} from './types.js'
export { STREAM_ERROR_CODES } from './types.js'
