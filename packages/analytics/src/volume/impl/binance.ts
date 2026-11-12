/**
 * 币安 K 线买卖量客户端。
 *
 * 只调一个端点：`GET /api/v3/klines`。K 线元组共 12 个字段，本模块关心的 8 个：
 *   [0] openTime  [5] volume(base)  [6] closeTime  [7] quoteVolume
 *   [8] trades    [9] takerBuyBaseVolume  [10] takerBuyQuoteVolume
 *
 * 卖出量由减法得出，随后做守恒断言。断言用相对容差 `VOLUME_SPLIT_RELATIVE_TOLERANCE`：
 * 数据源给的是十进制字符串，转 double 后的求差求和会产生浮点噪声（quote 量级 1e7 时
 * 一个 ULP 就有 4e-9），直接 `===` 会把每一批数据都误判成损坏。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import type {
  BinanceClient,
  BinanceKlineRequest,
  BinanceKlineResult,
  VolumeBar,
  VolumeInterval,
} from '../types'
import { VOLUME_INTERVALS, VOLUME_SPLIT_RELATIVE_TOLERANCE } from '../types'

/** 币安 REST 基址。 */
export const BINANCE_API_BASE = 'https://api.binance.com/api/v3'

/** 单次最多 1000 根 K 线。 */
export const BINANCE_MAX_KLINES = 1000

/** 默认超时。 */
export const DEFAULT_BINANCE_TIMEOUT_MS = 15_000

/** 默认采集交易对。 */
export const DEFAULT_VOLUME_SYMBOLS: readonly string[] = ['BTCUSDT', 'ETHUSDT']

/** 客户端构造参数。 */
export interface BinanceClientOptions {
  /** HTTP 客户端 */
  readonly httpClient: HttpClient
  /** 代理端点；本机直连币安可用，默认 null */
  readonly proxy: ProxyEndpoint | null
  /** 单次请求超时，默认 15 秒 */
  readonly timeoutMs?: number
}

/** K 线元组里各字段的 0 基下标。 */
const KLINE_INDEX = {
  openTime: 0,
  baseVolume: 5,
  closeTime: 6,
  quoteVolume: 7,
  trades: 8,
  takerBuyBaseVolume: 9,
  takerBuyQuoteVolume: 10,
} as const

/** K 线元组最小长度：只要覆盖到第 11 个字段即可。 */
const KLINE_MIN_LENGTH = 11

/**
 * 把 K 线元组里的字符串数字转成有限数字。
 *
 * @param fields K 线元组
 * @param index 字段下标
 * @param symbol 交易对（错误上下文）
 * @returns 有限数字
 * @throws AnalyticsError 字段缺失或不是合法数字
 */
function readNumber(fields: readonly unknown[], index: number, symbol: string): number {
  const raw = fields[index]
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `${symbol} 第 ${index} 个 K 线字段不是数字`,
      { symbol, index },
    )
  }
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `${symbol} 第 ${index} 个 K 线字段不是有限数字`,
      { symbol, index, raw },
    )
  }
  return value
}

/**
 * 校验「买方量 + 卖方量 = 总量」。
 *
 * @param buyVolume 主动买入量
 * @param sellVolume 主动卖出量
 * @param totalVolume 总量
 * @param field 字段名（base 或 quote），用于错误信息
 * @param symbol 交易对
 * @throws AnalyticsError 守恒被破坏
 */
function assertSplitConservation(
  buyVolume: number,
  sellVolume: number,
  totalVolume: number,
  field: 'base' | 'quote',
  symbol: string,
): void {
  const reconstructed = buyVolume + sellVolume
  // 容差随量级放大：quote 成交量在 1e7 量级，绝对容差会把浮点噪声当成错误。
  const tolerance = Math.max(1, Math.abs(totalVolume)) * VOLUME_SPLIT_RELATIVE_TOLERANCE
  if (buyVolume < 0 || sellVolume < 0 || Math.abs(reconstructed - totalVolume) > tolerance) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.VOLUME_SPLIT_MISMATCH,
      `${symbol} 买卖量拆分不守恒（${field}）：${buyVolume} + ${sellVolume} != ${totalVolume}`,
      {
        symbol,
        field,
        buyVolume,
        sellVolume,
        totalVolume,
        delta: reconstructed - totalVolume,
      },
    )
  }
}

/**
 * 把一根 K 线元组拆成买卖量明细。
 *
 * @param fields K 线元组（12 字段）
 * @param symbol 交易对
 * @returns 拆分后的 K 线
 * @throws AnalyticsError 字段非法或拆分不守恒
 */
export function splitKline(fields: readonly unknown[], symbol: string): VolumeBar {
  if (fields.length < KLINE_MIN_LENGTH) {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
      `${symbol} 的 K 线元组只有 ${fields.length} 个字段，少于 ${KLINE_MIN_LENGTH} 个`,
      { symbol, length: fields.length },
    )
  }

  const baseVolume = readNumber(fields, KLINE_INDEX.baseVolume, symbol)
  const quoteVolume = readNumber(fields, KLINE_INDEX.quoteVolume, symbol)
  const takerBuyBaseVolume = readNumber(fields, KLINE_INDEX.takerBuyBaseVolume, symbol)
  const takerBuyQuoteVolume = readNumber(fields, KLINE_INDEX.takerBuyQuoteVolume, symbol)

  const takerSellBaseVolume = baseVolume - takerBuyBaseVolume
  const takerSellQuoteVolume = quoteVolume - takerBuyQuoteVolume

  assertSplitConservation(takerBuyBaseVolume, takerSellBaseVolume, baseVolume, 'base', symbol)
  assertSplitConservation(takerBuyQuoteVolume, takerSellQuoteVolume, quoteVolume, 'quote', symbol)

  return {
    openTime: readNumber(fields, KLINE_INDEX.openTime, symbol),
    closeTime: readNumber(fields, KLINE_INDEX.closeTime, symbol),
    baseVolume,
    quoteVolume,
    takerBuyBaseVolume,
    takerSellBaseVolume,
    takerBuyQuoteVolume,
    takerSellQuoteVolume,
    trades: readNumber(fields, KLINE_INDEX.trades, symbol),
  }
}

/**
 * 校验周期参数。
 *
 * @param interval 周期字符串
 * @returns 通过校验的周期
 * @throws AnalyticsError 周期不受支持
 */
export function parseVolumeInterval(interval: string): VolumeInterval {
  for (const candidate of VOLUME_INTERVALS) {
    if (candidate === interval) {
      return candidate
    }
  }
  throw new AnalyticsError(
    ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
    `不支持的 K 线周期：${interval}`,
    { interval, supported: VOLUME_INTERVALS },
  )
}

/**
 * 创建币安客户端。
 *
 * @param options HTTP 客户端、代理与超时
 * @returns K 线拉取接口
 */
export function createBinanceClient(options: BinanceClientOptions): BinanceClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BINANCE_TIMEOUT_MS

  return {
    async getKlines(request: BinanceKlineRequest): Promise<BinanceKlineResult> {
      if (
        !Number.isInteger(request.limit) ||
        request.limit <= 0 ||
        request.limit > BINANCE_MAX_KLINES
      ) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
          `K 线根数必须在 1..${BINANCE_MAX_KLINES} 之间：${request.limit}`,
          { limit: request.limit },
        )
      }

      const url = `${BINANCE_API_BASE}/klines?symbol=${encodeURIComponent(request.symbol)}&interval=${request.interval}&limit=${request.limit}`
      const response = await options.httpClient.getText({
        url,
        timeoutMs,
        proxy: options.proxy,
      })

      let payload: unknown
      try {
        payload = JSON.parse(response.body)
      } catch (error) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_INVALID_JSON,
          `币安 K 线响应不是合法 JSON：${url}`,
          { url, excerpt: response.body.slice(0, 200) },
        )
      }
      if (!Array.isArray(payload)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `币安 K 线响应不是数组：${url}`,
        )
      }

      const bars = payload.map((row) => {
        if (!Array.isArray(row)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `币安 K 线存在非数组记录：${request.symbol}`,
          )
        }
        return splitKline(row, request.symbol)
      })

      return { bars, elapsedMs: response.elapsedMs }
    },
  }
}
