/**
 * 标准成交流装配：HTTP 范围查询与 SSE 实时帧共用同一份协议。
 *
 * 实时连接由宿主事件流打开；本模块只负责 URL、帧校验与监听者分发。
 */
import { ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { MarketDataTransport } from '../../provider/protocol/types.js'
import { V1_ENDPOINTS } from '../../provider/protocol/types.js'
import type { EventStreamFactory } from '../../stream/types.js'
import {
  type MarketTrade,
  TRADE_MESSAGES,
  TRADE_STREAM_CODES,
  type TradeDataSource,
  type TradeFrame,
} from '../types.js'
import { parseDecimal } from './decimal.js'

/** 校验成交记录；价格与数量按十进制字符串下发，缺失或非法都视为协议错误。 */
function isMarketTrade(value: unknown): value is MarketTrade {
  if (
    !value ||
    typeof value !== 'object' ||
    !('tradeId' in value) ||
    !('timestamp' in value) ||
    !('price' in value) ||
    !('size' in value) ||
    !('side' in value)
  )
    return false
  if (
    typeof value.tradeId !== 'string' ||
    !/^\d+$/.test(value.tradeId) ||
    typeof value.timestamp !== 'number' ||
    !Number.isSafeInteger(value.timestamp) ||
    value.timestamp <= 0 ||
    typeof value.price !== 'string' ||
    typeof value.size !== 'string' ||
    (value.side !== 'buy' && value.side !== 'sell')
  )
    return false
  try {
    return parseDecimal(value.price).units > 0n && parseDecimal(value.size).units > 0n
  } catch {
    return false
  }
}

/**
 * 创建成交流数据源。
 *
 * @param source - 数据源 id，与 Provider 注册保持一致
 * @param transport - 同一 Provider 的 HTTP 传输，用于范围查询
 * @param baseUrl - 数据源生效地址的读取函数
 * @param openEventStream - 宿主事件流，实时成交与 K 线共用同一份实现
 */
export function createTradeDataSource(
  source: string,
  transport: MarketDataTransport,
  baseUrl: () => string,
  openEventStream: EventStreamFactory,
): TradeDataSource {
  return {
    async fetch({ instrument, range, signal }) {
      if (
        !transport.fetchTradeRange ||
        instrument.source !== source ||
        !instrument.capabilities.trades?.raw
      )
        throw new KLineChartError(ERROR_CODES.UNSUPPORTED_CAPABILITY, TRADE_MESSAGES.unsupportedRaw)
      const batch = await transport.fetchTradeRange(
        {
          // wire 字段由后端 Go 结构体绑定，命名与统一层 source 保持一致。
          sourceId: source,
          instrument: {
            id: instrument.id,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            providerRef: instrument.providerRef,
          },
          ...range,
        },
        signal,
      )
      if (
        !batch.items.every(
          (item) =>
            isMarketTrade(item) && item.timestamp >= range.from && item.timestamp < range.to,
        ) ||
        batch.range.from !== range.from ||
        batch.range.to !== range.to ||
        !batch.complete
      )
        throw new KLineChartError(ERROR_CODES.FETCH_FAILED, '成交流范围与返回结果不一致')
      return batch
    },
    connect(instrument) {
      const listeners = new Set<(frame: TradeFrame) => void>()
      const query = new URLSearchParams({ symbol: instrument.symbol, kind: 'aggregated' })
      const stream = openEventStream(
        `${baseUrl()}${V1_ENDPOINTS.sources}/${encodeURIComponent(source)}/trades/stream?${query}`,
        {
          onOpen: () => publish({ type: 'status', code: TRADE_STREAM_CODES.connected }),
          onData: (data) => {
            try {
              const value: unknown = JSON.parse(data)
              if (!value || typeof value !== 'object' || !('type' in value))
                throw new TypeError('Invalid trade frame')
              if (
                value.type === 'trades' &&
                'trades' in value &&
                Array.isArray(value.trades) &&
                value.trades.every(isMarketTrade)
              )
                publish({ type: 'trades', trades: value.trades })
              else if (value.type === 'status' && 'code' in value && typeof value.code === 'string')
                publish({
                  type: 'status',
                  code: value.code,
                  message:
                    'message' in value && typeof value.message === 'string'
                      ? value.message
                      : undefined,
                  complete:
                    'complete' in value && typeof value.complete === 'boolean'
                      ? value.complete
                      : undefined,
                })
              else throw new TypeError('Invalid trade frame')
            } catch (error) {
              console.error('[Trade stream] Invalid frame', source, error)
              publish({
                type: 'status',
                code: TRADE_STREAM_CODES.gap,
                message: TRADE_MESSAGES.protocolError,
                complete: false,
              })
            }
          },
          onError: () =>
            publish({
              type: 'status',
              code: TRADE_STREAM_CODES.disconnected,
              message: TRADE_MESSAGES.disconnected,
              complete: false,
            }),
        },
      )

      /** 连接打开是确定的边界：只有真实建连后才发布 CONNECTED 消息。 */
      function publish(frame: TradeFrame): void {
        for (const listener of [...listeners]) {
          try {
            listener(frame)
          } catch (error) {
            console.error('[Trade stream] Subscriber failed', source, error)
          }
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        close() {
          stream.close()
          listeners.clear()
        },
      }
    },
  }
}
