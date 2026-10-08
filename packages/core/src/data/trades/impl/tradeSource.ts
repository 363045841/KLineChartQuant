/** 标准成交 Provider 装配；HTTP 范围查询和 SSE 实时帧均采用统一协议。 */
import { ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { MarketDataTransport } from '../../provider/protocol/types.js'
import { V1_ENDPOINTS } from '../../provider/protocol/types.js'
import {
  type MarketTrade,
  TRADE_MESSAGES,
  type TradeDataSource,
  type TradeFrame,
} from '../types.js'
import { parseDecimal } from './decimal.js'

/** 校验成交身份、方向和十进制载荷，缺失主动方向不推断。 */
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

/** 创建不含图表状态的成交能力，运行时读取地址配置。 */
export function createTradeDataSource(
  sourceId: string,
  transport: MarketDataTransport,
  baseUrl: () => string,
): TradeDataSource {
  return {
    async fetch({ instrument, range, signal }) {
      if (
        !transport.fetchTradeRange ||
        instrument.sourceId !== sourceId ||
        !instrument.capabilities.trades?.raw
      )
        throw new KLineChartError(ERROR_CODES.UNSUPPORTED_CAPABILITY, TRADE_MESSAGES.unsupportedRaw)
      const batch = await transport.fetchTradeRange(
        {
          sourceId,
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
        throw new KLineChartError(ERROR_CODES.FETCH_FAILED, '成交范围不完整或协议身份不一致')
      return batch
    },
    connect(instrument) {
      const listeners = new Set<(frame: TradeFrame) => void>()
      const query = new URLSearchParams({ symbol: instrument.symbol, kind: 'aggregated' })
      const source = new EventSource(
        `${baseUrl()}${V1_ENDPOINTS.sources}/${encodeURIComponent(sourceId)}/trades/stream?${query}`,
      )
      const publish = (frame: TradeFrame) => {
        for (const listener of listeners) listener(frame)
      }
      source.onmessage = (event) => {
        try {
          const value: unknown = JSON.parse(event.data)
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
                'message' in value && typeof value.message === 'string' ? value.message : undefined,
              complete:
                'complete' in value && typeof value.complete === 'boolean'
                  ? value.complete
                  : undefined,
            })
          else throw new TypeError('Invalid trade frame')
        } catch {
          publish({
            type: 'status',
            code: 'TRADE_GAP',
            message: TRADE_MESSAGES.protocolError,
            complete: false,
          })
        }
      }
      source.onerror = () =>
        publish({
          type: 'status',
          code: 'DISCONNECTED',
          message: TRADE_MESSAGES.disconnected,
          complete: false,
        })
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        close() {
          source.close()
          listeners.clear()
        },
      }
    },
  }
}
