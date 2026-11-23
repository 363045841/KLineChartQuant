/**
 * 实时流模块出口：对外只暴露契约。
 *
 * 连接由 `MarketDataContext` 持有并装配，宿主要自定义传输时注入数据源而不是自建注册表；
 * 状态词表 `STREAM_STATUS` 只用于帧校验，消费方按 `upstream-error` 上浮错误即可；
 * 错误词表则是消费方需要分支判断的公开契约。
 */

export type {
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
