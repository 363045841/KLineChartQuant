/**
 * 主动买卖与大单分层采集。
 *
 * 两家有官方聚合、三家只能现算，这个差异必须在数据里标出来（`granularity`），
 * 否则把「最近 60 笔」和「完整 1 小时」放进同一张表比较，会得出完全错误的结论。
 *
 * | 交易所 | 来源 | 粒度 | 可覆盖周期 |
 * | --- | --- | --- | --- |
 * | Binance | `fapi/v1/klines` 第 7/10 字段（quoteVolume / takerBuyQuoteVolume） | 官方聚合 | 1m / 5m / 15m / 1h |
 * | OKX | `rubik/stat/taker-volume`（`[ts, 卖, 买]`，USD 名义额） | 官方聚合 | 5m / 1H / 1D |
 * | Bybit | `v5/market/recent-trade`（side + size） | 最近若干笔 | 约 1 分钟 |
 * | Bitget | `v2/mix/market/fills`（side + size） | 最近若干笔 | 约 1 分钟 |
 * | Hyperliquid | `info {type:"recentTrades"}`（side B/A + sz） | 最近若干笔 | 约 1 分钟 |
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import type { FlowStats, LargeOrderBucket, LargeOrderProfile, OrderflowVenue } from '../types'
import { instrumentIdFor } from './depthVenues'

/** 默认超时。 */
export const DEFAULT_FLOW_TIMEOUT_MS = 15_000

/** 面板展示的周期（秒）。 */
export const FLOW_WINDOWS = [3600, 900, 300, 60] as const

/** 大单分档边界（计价币）。与文章口径一致：$10K / $100K / $500K。 */
const LARGE_ORDER_EDGES = [0, 10_000, 100_000, 500_000] as const

/** 端点。 */
const ENDPOINTS = {
  binanceKlines: 'https://fapi.binance.com/fapi/v1/klines',
  binanceAggTrades: 'https://fapi.binance.com/fapi/v1/aggTrades',
  okxTaker: 'https://www.okx.com/api/v5/rubik/stat/taker-volume',
  bybitTrades: 'https://api.bybit.com/v5/market/recent-trade',
  bitgetFills: 'https://api.bitget.com/api/v2/mix/market/fills',
  hyperliquid: 'https://api.hyperliquid.xyz/info',
} as const

/**
 * 判断是否普通对象。
 *
 * @param value 任意值
 * @returns 是否对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析 JSON。
 *
 * @param body 响应体
 * @param url 地址
 * @returns 解析结果
 * @throws AnalyticsError 非法 JSON
 */
function parseJson(body: string, url: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    throw new AnalyticsError(
      ANALYTICS_ERROR_CODES.RESPONSE_INVALID_JSON,
      `响应不是合法 JSON：${url}`,
      { url, excerpt: body.slice(0, 200) },
    )
  }
}

/**
 * 由买卖金额构造统计。
 *
 * @param base 基础字段
 * @param buy 主动买入金额
 * @param sell 主动卖出金额
 * @returns 统计对象
 */
function buildFlow(
  base: Omit<FlowStats, 'takerBuyNotional' | 'takerSellNotional' | 'takerBuyRatio' | 'netNotional'>,
  buy: number,
  sell: number,
): FlowStats {
  const total = buy + sell
  return {
    ...base,
    takerBuyNotional: buy,
    takerSellNotional: sell,
    takerBuyRatio: total > 0 ? buy / total : 0.5,
    netNotional: buy - sell,
  }
}

/**
 * 把逐笔成交折成大单分层。
 *
 * @param trades 逐笔（含金额与是否主动买）
 * @param venue 交易所
 * @param symbol 交易对
 * @param timestamp 采集时刻
 * @param spanMs 时间跨度
 * @returns 分层结果
 */
export function buildLargeOrderProfile(
  trades: readonly {
    readonly notional: number
    readonly takerBuy: boolean
    readonly time: number
  }[],
  venue: OrderflowVenue,
  symbol: string,
  timestamp: number,
  spanMs: number,
): LargeOrderProfile {
  const total = trades.reduce((sum, trade) => sum + trade.notional, 0)
  const buckets: LargeOrderBucket[] = []
  for (let index = 0; index < LARGE_ORDER_EDGES.length; index += 1) {
    const min = LARGE_ORDER_EDGES[index]
    const max = index + 1 < LARGE_ORDER_EDGES.length ? LARGE_ORDER_EDGES[index + 1] : null
    const inBucket = trades.filter(
      (trade) => trade.notional >= min && (max === null || trade.notional < max),
    )
    const notional = inBucket.reduce((sum, trade) => sum + trade.notional, 0)
    const buy = inBucket
      .filter((trade) => trade.takerBuy)
      .reduce((sum, trade) => sum + trade.notional, 0)
    buckets.push({
      minNotional: min,
      maxNotional: max,
      notional,
      share: total > 0 ? notional / total : 0,
      takerBuyRatio: notional > 0 ? buy / notional : 0.5,
    })
  }
  const buyTotal = trades
    .filter((trade) => trade.takerBuy)
    .reduce((sum, trade) => sum + trade.notional, 0)
  return {
    venue,
    symbol,
    timestamp,
    trades: trades.length,
    spanMs,
    buckets,
    takerBuyRatio: total > 0 ? buyTotal / total : 0.5,
  }
}

/** 成交采集客户端构造参数。 */
export interface FlowClientOptions {
  /** HTTP 客户端 */
  readonly httpClient: HttpClient
  /** 代理端点 */
  readonly proxy: ProxyEndpoint | null
  /** 超时毫秒 */
  readonly timeoutMs?: number
}

/** 成交采集接口。 */
export interface FlowClient {
  /**
   * 采集多周期主动买卖。
   *
   * @param venue 交易所
   * @param symbol 交易对
   * @returns 按窗口从大到小排序的统计
   */
  readonly fetchFlows: (venue: OrderflowVenue, symbol: string) => Promise<readonly FlowStats[]>

  /**
   * 采集大单分层（秒级快照）。
   *
   * @param venue 交易所
   * @param symbol 交易对
   * @returns 分层结果；该所不支持时返回 null
   */
  readonly fetchLargeOrders: (
    venue: OrderflowVenue,
    symbol: string,
  ) => Promise<LargeOrderProfile | null>

  /**
   * 采集原始逐笔成交（供钟级累加器使用）。
   *
   * @param venue 交易所
   * @param symbol 交易对
   * @param cursor 上次返回的游标；`null` 表示从当前最新开始
   * @returns 成交明细与新游标
   */
  readonly fetchTrades: (
    venue: OrderflowVenue,
    symbol: string,
    cursor: string | null,
  ) => Promise<TradeBatch>
}

/** 一笔原始成交。 */
export interface RawTrade {
  /** 交易所内的成交 ID，用于去重 */
  readonly id: string
  /** 名义金额（计价币） */
  readonly notional: number
  /** 是否主动买 */
  readonly takerBuy: boolean
  /** 成交时刻（毫秒） */
  readonly time: number
}

/** 一批原始成交。 */
export interface TradeBatch {
  /** 成交明细，按时间升序 */
  readonly trades: readonly RawTrade[]
  /** 下次续拉用的游标；`null` 表示该所不支持续拉 */
  readonly nextCursor: string | null
  /** 覆盖口径：`exact` 不漏笔，`sampled` 两次拉取之间可能漏 */
  readonly coverage: 'exact' | 'sampled'
}

/**
 * 创建成交采集客户端。
 *
 * @param options 依赖
 * @returns 采集接口
 */
export function createFlowClient(options: FlowClientOptions): FlowClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FLOW_TIMEOUT_MS

  /**
   * 发起 GET 并解析。
   *
   * @param url 地址
   * @returns 解析结果
   */
  async function getJson(url: string): Promise<unknown> {
    const response = await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
    return parseJson(response.body, url)
  }

  /**
   * 发起 POST 并解析。
   *
   * @param url 地址
   * @param body 请求体
   * @returns 解析结果
   */
  async function postJson(url: string, body: unknown): Promise<unknown> {
    const response = await options.httpClient.postJson({
      url,
      timeoutMs,
      proxy: options.proxy,
      body: JSON.stringify(body),
    })
    return parseJson(response.body, url)
  }

  /**
   * 采集大单分层的实现。
   *
   * 抽成具名函数而不是对象方法：`fetchFlows` 在三家「只有逐笔流」的交易所上要复用它，
   * 用 `this.fetchLargeOrders` 会在方法被解构调用时丢掉绑定。
   *
   * @param venue 交易所
   * @param symbol 交易对
   * @returns 分层结果；该所不支持时返回 null
   */
  async function fetchLargeOrdersImpl(
    venue: OrderflowVenue,
    symbol: string,
  ): Promise<LargeOrderProfile | null> {
    const instrumentId = instrumentIdFor(venue, symbol)
    const now = Date.now()

    /**
     * 从「价格 + 数量 + 主动买标记」列表构造分层。
     *
     * @param rows 原始行
     * @param extract 字段提取函数
     * @returns 分层结果
     */
    function fromRows(
      rows: readonly unknown[],
      extract: (row: Record<string, unknown>) => {
        price: number
        size: number
        time: number
        takerBuy: boolean
      } | null,
    ): LargeOrderProfile | null {
      const trades: { notional: number; takerBuy: boolean; time: number }[] = []
      for (const row of rows) {
        if (!isRecord(row)) continue
        const fields = extract(row)
        if (fields === null) continue
        const { price, size, time, takerBuy } = fields
        if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(time)) continue
        trades.push({ notional: price * size, takerBuy, time })
      }
      if (trades.length === 0) return null
      const times = trades.map((trade) => trade.time)
      return buildLargeOrderProfile(
        trades,
        venue,
        symbol,
        now,
        Math.max(...times) - Math.min(...times),
      )
    }

    if (venue === 'binance') {
      const url = `${ENDPOINTS.binanceAggTrades}?symbol=${encodeURIComponent(instrumentId)}&limit=1000`
      const payload = await getJson(url)
      if (!Array.isArray(payload)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Binance aggTrades 不是数组：${symbol}`,
        )
      }
      return fromRows(payload, (row) => ({
        price: Number(row.p),
        size: Number(row.q),
        time: Number(row.T),
        // m=true 表示买方是挂单方 → 主动方是卖方
        takerBuy: row.m === false,
      }))
    }

    if (venue === 'bybit') {
      const url = `${ENDPOINTS.bybitTrades}?category=linear&symbol=${encodeURIComponent(instrumentId)}&limit=1000`
      const payload = await getJson(url)
      const result = isRecord(payload) && isRecord(payload.result) ? payload.result : null
      const list = result !== null && Array.isArray(result.list) ? result.list : []
      return fromRows(list, (row) => ({
        price: Number(row.price),
        size: Number(row.size),
        time: Number(row.time),
        takerBuy: row.side === 'Buy',
      }))
    }

    if (venue === 'bitget') {
      const url = `${ENDPOINTS.bitgetFills}?productType=USDT-FUTURES&symbol=${encodeURIComponent(instrumentId)}&limit=1000`
      const payload = await getJson(url)
      const list = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
      return fromRows(list, (row) => ({
        price: Number(row.price),
        size: Number(row.size),
        time: Number(row.ts),
        takerBuy: row.side === 'buy',
      }))
    }

    if (venue === 'hyperliquid') {
      const payload = await postJson(ENDPOINTS.hyperliquid, {
        type: 'recentTrades',
        coin: instrumentId,
      })
      const list = Array.isArray(payload) ? payload : []
      return fromRows(list, (row) => ({
        price: Number(row.px),
        size: Number(row.sz),
        time: Number(row.time),
        // B = 买方主动，A = 卖方主动
        takerBuy: row.side === 'B',
      }))
    }

    // OKX 的逐笔成交流不对外开放（只有聚合统计），返回 null 由调用方降级
    return null
  }

  return {
    async fetchFlows(venue: OrderflowVenue, symbol: string): Promise<readonly FlowStats[]> {
      const instrumentId = instrumentIdFor(venue, symbol)
      const now = Date.now()

      if (venue === 'binance') {
        // 一次请求取 1h 窗口内的 1m K 线，逐个窗口累加即可得到 1h/15m/5m/1m 四个周期
        const url = `${ENDPOINTS.binanceKlines}?symbol=${encodeURIComponent(instrumentId)}&interval=1m&limit=60`
        const payload = await getJson(url)
        if (!Array.isArray(payload)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Binance K 线不是数组：${symbol}`,
          )
        }
        const rows = payload.filter((row): row is unknown[] => Array.isArray(row))
        return FLOW_WINDOWS.map((window) => {
          const slice = rows.slice(-Math.max(1, window / 60))
          let buy = 0
          let sell = 0
          for (const row of slice) {
            const quote = Number(row[7])
            const buyQuote = Number(row[10])
            if (!Number.isFinite(quote) || !Number.isFinite(buyQuote)) continue
            buy += buyQuote
            sell += quote - buyQuote
          }
          return buildFlow(
            {
              venue,
              symbol,
              windowSeconds: window,
              timestamp: now,
              granularity: 'aggregated',
            },
            buy,
            sell,
          )
        })
      }

      if (venue === 'okx') {
        const currency = instrumentId.split('-')[0]
        const url = `${ENDPOINTS.okxTaker}?ccy=${encodeURIComponent(currency)}&instType=CONTRACTS&period=1H`
        const payload = await getJson(url)
        const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
        const first = data[0]
        if (!Array.isArray(first) || first.length < 3) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `OKX taker-volume 结构不符：${symbol}`,
          )
        }
        // OKX 顺序是 [ts, 卖量, 买量]，与大多数接口相反，这里显式命名避免看反
        const sell = Number(first[1])
        const buy = Number(first[2])
        return [
          buildFlow(
            {
              venue,
              symbol,
              windowSeconds: 3600,
              timestamp: Number(first[0]),
              granularity: 'aggregated',
            },
            buy,
            sell,
          ),
        ]
      }

      // 其余三家只有逐笔成交流，现算短窗口
      const profile = await fetchLargeOrdersImpl(venue, symbol)
      if (profile === null) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `${venue} 无可用成交流：${symbol}`,
          { venue },
        )
      }
      const buy = profile.buckets.reduce(
        (sum, bucket) => sum + bucket.notional * bucket.takerBuyRatio,
        0,
      )
      const sell = profile.buckets.reduce(
        (sum, bucket) => sum + bucket.notional * (1 - bucket.takerBuyRatio),
        0,
      )
      return [
        buildFlow(
          {
            venue,
            symbol,
            windowSeconds: Math.max(1, Math.round(profile.spanMs / 1000)),
            timestamp: profile.timestamp,
            granularity: 'recent-trades',
          },
          buy,
          sell,
        ),
      ]
    },

    fetchLargeOrders: fetchLargeOrdersImpl,

    async fetchTrades(
      venue: OrderflowVenue,
      symbol: string,
      cursor: string | null,
    ): Promise<TradeBatch> {
      const instrumentId = instrumentIdFor(venue, symbol)

      if (venue === 'binance') {
        // fromId 可以从指定成交之后继续拉，是唯一能做到「不漏笔」的方式
        const query =
          cursor === null
            ? `symbol=${encodeURIComponent(instrumentId)}&limit=1000`
            : `symbol=${encodeURIComponent(instrumentId)}&fromId=${encodeURIComponent(cursor)}&limit=1000`
        const payload = await getJson(`${ENDPOINTS.binanceAggTrades}?${query}`)
        if (!Array.isArray(payload)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Binance aggTrades 不是数组：${symbol}`,
          )
        }
        const trades: RawTrade[] = []
        let lastId: string | null = cursor
        for (const row of payload) {
          if (!isRecord(row)) continue
          const price = Number(row.p)
          const qty = Number(row.q)
          const time = Number(row.T)
          if (!Number.isFinite(price) || !Number.isFinite(qty) || !Number.isFinite(time)) continue
          const id = String(row.a)
          trades.push({ id, notional: price * qty, takerBuy: row.m === false, time })
          lastId = id
        }
        return { trades, nextCursor: lastId, coverage: 'exact' }
      }

      if (venue === 'bybit') {
        const url = `${ENDPOINTS.bybitTrades}?category=linear&symbol=${encodeURIComponent(instrumentId)}&limit=1000`
        const payload = await getJson(url)
        const result = isRecord(payload) && isRecord(payload.result) ? payload.result : null
        const list = result !== null && Array.isArray(result.list) ? result.list : []
        const trades: RawTrade[] = []
        for (const row of list) {
          if (!isRecord(row)) continue
          const price = Number(row.price)
          const size = Number(row.size)
          const time = Number(row.time)
          if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(time)) continue
          trades.push({
            id: String(row.execId),
            notional: price * size,
            takerBuy: row.side === 'Buy',
            time,
          })
        }
        // 按时间升序返回，与 Binance 分支一致
        trades.sort((left, right) => left.time - right.time)
        return { trades, nextCursor: null, coverage: 'sampled' }
      }

      if (venue === 'bitget') {
        const url = `${ENDPOINTS.bitgetFills}?productType=USDT-FUTURES&symbol=${encodeURIComponent(instrumentId)}&limit=1000`
        const payload = await getJson(url)
        const list = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
        const trades: RawTrade[] = []
        for (const row of list) {
          if (!isRecord(row)) continue
          const price = Number(row.price)
          const size = Number(row.size)
          const time = Number(row.ts)
          if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(time)) continue
          trades.push({
            id: String(row.tradeId),
            notional: price * size,
            takerBuy: row.side === 'buy',
            time,
          })
        }
        trades.sort((left, right) => left.time - right.time)
        return { trades, nextCursor: null, coverage: 'sampled' }
      }

      if (venue === 'hyperliquid') {
        const payload = await postJson(ENDPOINTS.hyperliquid, {
          type: 'recentTrades',
          coin: instrumentId,
        })
        const list = Array.isArray(payload) ? payload : []
        const trades: RawTrade[] = []
        for (const row of list) {
          if (!isRecord(row)) continue
          const price = Number(row.px)
          const size = Number(row.sz)
          const time = Number(row.time)
          if (!Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(time)) continue
          trades.push({
            id: String(row.tid),
            notional: price * size,
            takerBuy: row.side === 'B',
            time,
          })
        }
        trades.sort((left, right) => left.time - right.time)
        return { trades, nextCursor: null, coverage: 'sampled' }
      }

      throw new AnalyticsError(
        ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
        `OKX 不提供逐笔成交流，无法做钟级分层：${symbol}`,
        { venue, symbol },
      )
    },
  }
}
