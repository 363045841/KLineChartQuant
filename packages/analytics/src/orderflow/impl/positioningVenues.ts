/**
 * 持仓结构采集。
 *
 * 两类多空比必须分开存，不能合并：
 * - `accountRatio`：**账户数**口径（多少比例的账户在做多）。散户主导。
 * - `topPositionRatio`：**持仓量**口径（大户的总持仓里多头占多少）。只有 Binance 提供。
 *
 * 阶段 0 实测（docs/design/data/orderflow-stage0.md §4.4）：两者方向可以相反——
 * 散户账户偏多时 BTC 24h 后 −0.20%（t −1.87），大户持仓偏多时 +0.25%（t 1.81）。
 * 把两者平均成一个「多空比」会让信号互相抵消，所以面板分开显示。
 *
 * OI 单位：Binance / Bybit / Bitget / Hyperliquid 给基础币数量，
 * OKX 同时给 `oiCcy`（币）与 `oiUsd`（美元），优先用 `oiUsd` 避免再乘价格。
 */
import { ANALYTICS_ERROR_CODES, AnalyticsError } from '../../errors'
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import type { OrderflowVenue, PositioningStats } from '../types'
import { instrumentIdFor } from './depthVenues'

/** 默认超时。 */
export const DEFAULT_POSITIONING_TIMEOUT_MS = 15_000

/** 端点。 */
const ENDPOINTS = {
  binanceOi: 'https://fapi.binance.com/fapi/v1/openInterest',
  binanceAccountRatio: 'https://fapi.binance.com/futures/data/globalLongShortAccountRatio',
  binanceTopPositionRatio: 'https://fapi.binance.com/futures/data/topLongShortPositionRatio',
  okxOi: 'https://www.okx.com/api/v5/public/open-interest',
  okxAccountRatio: 'https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio',
  bybitOi: 'https://api.bybit.com/v5/market/open-interest',
  bybitAccountRatio: 'https://api.bybit.com/v5/market/account-ratio',
  bitgetOi: 'https://api.bitget.com/api/v2/mix/market/open-interest',
  bitgetAccountRatio: 'https://api.bitget.com/api/v2/mix/market/account-long-short',
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

/** 持仓采集构造参数。 */
export interface PositioningClientOptions {
  /** HTTP 客户端 */
  readonly httpClient: HttpClient
  /** 代理端点 */
  readonly proxy: ProxyEndpoint | null
  /** 超时毫秒 */
  readonly timeoutMs?: number
}

/** 持仓采集接口。 */
export interface PositioningClient {
  /**
   * 采集持仓结构。
   *
   * @param venue 交易所
   * @param symbol 交易对
   * @param referencePrice 参考价格：某些交易所不给 OI 的名义金额，用它折算；null 表示无法折算
   * @returns 持仓结构
   */
  readonly fetch: (
    venue: OrderflowVenue,
    symbol: string,
    referencePrice: number | null,
  ) => Promise<PositioningStats>
}

/**
 * 创建持仓采集客户端。
 *
 * @param options 依赖
 * @returns 采集接口
 */
export function createPositioningClient(options: PositioningClientOptions): PositioningClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_POSITIONING_TIMEOUT_MS

  /**
   * 发起请求并解析。
   *
   * @param url 地址
   * @param body POST 请求体；null 表示 GET
   * @returns 解析结果
   */
  async function call(url: string, body: unknown): Promise<unknown> {
    const response =
      body === null
        ? await options.httpClient.getText({ url, timeoutMs, proxy: options.proxy })
        : await options.httpClient.postJson({
            url,
            timeoutMs,
            proxy: options.proxy,
            body: JSON.stringify(body),
          })
    return parseJson(response.body, url)
  }

  /**
   * 用参考价格折算名义金额。
   *
   * @param base 基础币数量
   * @param price 价格
   * @returns 名义金额；无价格时返回 0
   */
  function notionalOf(base: number, price: number | null): number {
    return price === null ? 0 : base * price
  }

  return {
    async fetch(
      venue: OrderflowVenue,
      symbol: string,
      referencePrice: number | null,
    ): Promise<PositioningStats> {
      const instrumentId = instrumentIdFor(venue, symbol)
      const now = Date.now()

      if (venue === 'binance') {
        const oiPayload = await call(
          `${ENDPOINTS.binanceOi}?symbol=${encodeURIComponent(instrumentId)}`,
          null,
        )
        const openInterestBase = isRecord(oiPayload) ? Number(oiPayload.openInterest) : Number.NaN
        if (!Number.isFinite(openInterestBase)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Binance OI 字段非法：${symbol}`,
          )
        }
        const accountPayload = await call(
          `${ENDPOINTS.binanceAccountRatio}?symbol=${encodeURIComponent(instrumentId)}&period=1h&limit=1`,
          null,
        )
        const topPayload = await call(
          `${ENDPOINTS.binanceTopPositionRatio}?symbol=${encodeURIComponent(instrumentId)}&period=1h&limit=1`,
          null,
        )
        const readRatio = (payload: unknown): number | null => {
          if (!Array.isArray(payload) || payload.length === 0) return null
          const first = payload[0]
          if (!isRecord(first)) return null
          const value = Number(first.longShortRatio)
          return Number.isFinite(value) ? value : null
        }
        return {
          venue,
          symbol,
          timestamp: now,
          openInterestBase,
          openInterestNotional: notionalOf(openInterestBase, referencePrice),
          accountRatio: readRatio(accountPayload),
          topPositionRatio: readRatio(topPayload),
        }
      }

      if (venue === 'okx') {
        const payload = await call(
          `${ENDPOINTS.okxOi}?instType=SWAP&instId=${encodeURIComponent(instrumentId)}`,
          null,
        )
        const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
        const first = data[0]
        if (!isRecord(first)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `OKX OI 结构不符：${symbol}`,
          )
        }
        // 优先用 oiUsd，避免再用参考价折算一次引入误差
        const notional = Number(first.oiUsd)
        const base = Number(first.oiCcy)
        if (!Number.isFinite(base)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `OKX OI 字段非法：${symbol}`,
          )
        }
        const currency = instrumentId.split('-')[0]
        const ratioPayload = await call(
          `${ENDPOINTS.okxAccountRatio}?ccy=${encodeURIComponent(currency)}&period=1H`,
          null,
        )
        const ratioData =
          isRecord(ratioPayload) && Array.isArray(ratioPayload.data) ? ratioPayload.data : []
        const ratioRow = ratioData[0]
        const accountRatio =
          Array.isArray(ratioRow) && ratioRow.length >= 2 ? Number(ratioRow[1]) : Number.NaN
        return {
          venue,
          symbol,
          timestamp: now,
          openInterestBase: base,
          openInterestNotional: Number.isFinite(notional)
            ? notional
            : notionalOf(base, referencePrice),
          accountRatio: Number.isFinite(accountRatio) ? accountRatio : null,
          topPositionRatio: null,
        }
      }

      if (venue === 'bybit') {
        const oiPayload = await call(
          `${ENDPOINTS.bybitOi}?category=linear&symbol=${encodeURIComponent(instrumentId)}&intervalTime=1h&limit=1`,
          null,
        )
        const oiResult = isRecord(oiPayload) && isRecord(oiPayload.result) ? oiPayload.result : null
        const oiList = oiResult !== null && Array.isArray(oiResult.list) ? oiResult.list : []
        const oiRow = oiList[0]
        const base = isRecord(oiRow) ? Number(oiRow.openInterest) : Number.NaN
        if (!Number.isFinite(base)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Bybit OI 字段非法：${symbol}`,
          )
        }
        const ratioPayload = await call(
          `${ENDPOINTS.bybitAccountRatio}?category=linear&symbol=${encodeURIComponent(instrumentId)}&period=1h&limit=1`,
          null,
        )
        const ratioResult =
          isRecord(ratioPayload) && isRecord(ratioPayload.result) ? ratioPayload.result : null
        const ratioList =
          ratioResult !== null && Array.isArray(ratioResult.list) ? ratioResult.list : []
        const ratioRow = ratioList[0]
        // Bybit 给的是 buyRatio / sellRatio（和为 1），转成「多空比」以与其它所可比
        let accountRatio: number | null = null
        if (isRecord(ratioRow)) {
          const buy = Number(ratioRow.buyRatio)
          const sell = Number(ratioRow.sellRatio)
          if (Number.isFinite(buy) && Number.isFinite(sell) && sell > 0) {
            accountRatio = buy / sell
          }
        }
        return {
          venue,
          symbol,
          timestamp: now,
          openInterestBase: base,
          openInterestNotional: notionalOf(base, referencePrice),
          accountRatio,
          topPositionRatio: null,
        }
      }

      if (venue === 'bitget') {
        const oiPayload = await call(
          `${ENDPOINTS.bitgetOi}?productType=USDT-FUTURES&symbol=${encodeURIComponent(instrumentId)}`,
          null,
        )
        const oiData = isRecord(oiPayload) && isRecord(oiPayload.data) ? oiPayload.data : null
        const oiList =
          oiData !== null && Array.isArray(oiData.openInterestList) ? oiData.openInterestList : []
        const oiRow = oiList[0]
        const base = isRecord(oiRow) ? Number(oiRow.size) : Number.NaN
        if (!Number.isFinite(base)) {
          throw new AnalyticsError(
            ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
            `Bitget OI 字段非法：${symbol}`,
          )
        }
        const ratioPayload = await call(
          `${ENDPOINTS.bitgetAccountRatio}?productType=USDT-FUTURES&symbol=${encodeURIComponent(instrumentId)}&period=1h`,
          null,
        )
        const ratioList =
          isRecord(ratioPayload) && Array.isArray(ratioPayload.data) ? ratioPayload.data : []
        // Bitget 的列表按时间升序，最后一条是最新
        const ratioRow = ratioList[ratioList.length - 1]
        const accountRatio = isRecord(ratioRow)
          ? Number(ratioRow.longShortAccountRatio)
          : Number.NaN
        return {
          venue,
          symbol,
          timestamp: now,
          openInterestBase: base,
          openInterestNotional: notionalOf(base, referencePrice),
          accountRatio: Number.isFinite(accountRatio) ? accountRatio : null,
          topPositionRatio: null,
        }
      }

      const payload = await call(ENDPOINTS.hyperliquid, { type: 'metaAndAssetCtxs' })
      if (!Array.isArray(payload) || payload.length < 2) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Hyperliquid metaAndAssetCtxs 结构不符：${symbol}`,
        )
      }
      const universe = payload[0]
      const contexts = payload[1]
      if (!isRecord(universe) || !Array.isArray(universe.universe) || !Array.isArray(contexts)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Hyperliquid universe 结构不符：${symbol}`,
        )
      }
      // assetCtxs 与 universe 同序，按币名找到下标后再取对应上下文
      const index = universe.universe.findIndex(
        (item) => isRecord(item) && item.name === instrumentId,
      )
      if (index < 0) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.ARGUMENT_INVALID,
          `Hyperliquid 无此币种：${instrumentId}`,
          { instrumentId },
        )
      }
      const context = contexts[index]
      if (!isRecord(context)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Hyperliquid 缺少资产上下文：${instrumentId}`,
        )
      }
      const base = Number(context.openInterest)
      const markPrice = Number(context.markPx)
      if (!Number.isFinite(base)) {
        throw new AnalyticsError(
          ANALYTICS_ERROR_CODES.RESPONSE_SHAPE_INVALID,
          `Hyperliquid OI 字段非法：${instrumentId}`,
        )
      }
      return {
        venue,
        symbol,
        timestamp: now,
        openInterestBase: base,
        openInterestNotional: notionalOf(
          base,
          Number.isFinite(markPrice) ? markPrice : referencePrice,
        ),
        // Hyperliquid 不公开多空比
        accountRatio: null,
        topPositionRatio: null,
      }
    },
  }
}
