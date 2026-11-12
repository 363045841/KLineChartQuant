/**
 * 面板装配：把五家的深度、成交、持仓合成一次快照，并检出互相打架的证据。
 *
 * 设计原则（这是「辅助观察」与「信号源」的分界线）：
 *
 * - **只摆事实，不下结论。** 面板给出「全深度买盘厚但近端卖盘厚」这样的事实，
 *   不写「所以要跌」。阶段 0 已证明这类结论的胜率只有 49.8%，写成判断会误导。
 * - **矛盾优先。** 人看五个面板会累，真正有价值的输出是「哪几个数字互相打架」。
 *   文章的开头就是靠这个抓人的：两个深度指标互相矛盾，才是信息的起点。
 * - **口径差异显式标注。** 官方聚合 vs 最近若干笔现算、账户数比 vs 持仓量比，
 *   不标注就会被读者当成同类比较——阶段 0 证明了它们方向可以相反。
 */
import type { HttpClient, ProxyEndpoint } from '../../net/types'
import {
  type Contradiction,
  type FlowStats,
  ORDERFLOW_VENUES,
  type OrderflowPanel,
  type OrderflowVenue,
  type PanelTotals,
  type VenueSnapshot,
} from '../types'
import { DEPTH_BANDS_DEFAULT, detectDepthDivergence } from './depth'
import { createDepthClient } from './depthVenues'
import { createFlowClient } from './flowVenues'
import { createPositioningClient } from './positioningVenues'

/** 面板客户端构造参数。 */
export interface PanelClientOptions {
  /** HTTP 客户端 */
  readonly httpClient: HttpClient
  /** 代理端点 */
  readonly proxy: ProxyEndpoint | null
}

/** 面板客户端。 */
export interface PanelClient {
  /**
   * 采集一次完整面板。
   *
   * @param symbol 统一交易对标识
   * @param venues 参与的交易所，缺省全部五家
   * @returns 面板快照
   */
  readonly fetch: (symbol: string, venues?: readonly OrderflowVenue[]) => Promise<OrderflowPanel>
}

/**
 * 把可能失败的一步包成「成功取值 / 失败记错误」。
 *
 * 面板的价值在于尽可能多地拿到事实：某一家持仓接口挂了，不该让整块面板失败。
 *
 * @param kind 数据类别
 * @param load 加载函数
 * @param errors 错误收集数组
 * @returns 成功时的值，失败为 null
 */
async function attempt<T>(
  kind: VenueSnapshot['errors'][number]['kind'],
  load: () => Promise<T>,
  errors: { kind: VenueSnapshot['errors'][number]['kind']; message: string }[],
): Promise<T | null> {
  try {
    return await load()
  } catch (error) {
    errors.push({ kind, message: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/**
 * 计算跨所合计。
 *
 * @param venues 各所明细
 * @returns 合计
 */
export function buildTotals(venues: readonly VenueSnapshot[]): PanelTotals {
  let openInterestBase = 0
  let openInterestNotional = 0
  let netFlow1h = 0
  let buy1h = 0
  let sell1h = 0
  let bid = 0
  let ask = 0
  const accountRatios: number[] = []
  const topRatios: number[] = []

  for (const venue of venues) {
    if (venue.positioning !== null) {
      openInterestBase += venue.positioning.openInterestBase
      openInterestNotional += venue.positioning.openInterestNotional
      if (venue.positioning.accountRatio !== null)
        accountRatios.push(venue.positioning.accountRatio)
      if (venue.positioning.topPositionRatio !== null) {
        topRatios.push(venue.positioning.topPositionRatio)
      }
    }
    // 只把完整周期的 1h 计入跨所合计：覆盖不足的样本会让合计比例系统性偏移
    const hourFlow = venue.flows.find(
      (flow) => flow.windowSeconds === 3600 && flow.coverageSeconds >= flow.windowSeconds,
    )
    if (hourFlow !== undefined) {
      netFlow1h += hourFlow.netNotional
      buy1h += hourFlow.takerBuyNotional
      sell1h += hourFlow.takerSellNotional
    }
    if (venue.depth !== null) {
      const band = venue.depth.bands.find((item) => item.band === DEPTH_BANDS_DEFAULT)
      if (band !== undefined) {
        bid += band.bidNotional
        ask += band.askNotional
      }
    }
  }

  const mean = (values: readonly number[]): number | null =>
    values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length

  const depthTotal = bid + ask
  return {
    openInterestBase,
    openInterestNotional,
    netFlow1h,
    takerBuyRatio1h: buy1h + sell1h > 0 ? buy1h / (buy1h + sell1h) : null,
    depthHalfPercent: {
      bidNotional: bid,
      askNotional: ask,
      imbalance: depthTotal > 0 ? (bid - ask) / depthTotal : 0,
    },
    accountRatioMean: mean(accountRatios),
    topPositionRatioMean: mean(topRatios),
  }
}

/**
 * 检出矛盾。
 *
 * @param venues 各所明细
 * @param totals 合计
 * @returns 矛盾列表
 */
export function detectContradictions(
  venues: readonly VenueSnapshot[],
  totals: PanelTotals,
): Contradiction[] {
  const found: Contradiction[] = []

  // 1. 深度背离：全深度与近端方向相反
  for (const venue of venues) {
    if (venue.depth === null) continue
    const divergence = detectDepthDivergence(venue.depth, DEPTH_BANDS_DEFAULT)
    if (divergence === null) continue
    const band = venue.depth.bands.find((item) => item.band === DEPTH_BANDS_DEFAULT)
    const deepSide = divergence === 'bid-far-ask-near' ? '买盘' : '卖盘'
    const nearSide = divergence === 'bid-far-ask-near' ? '卖盘' : '买盘'
    found.push({
      kind: 'depth-divergence',
      venues: [venue.venue],
      detail:
        band === undefined
          ? `${venue.venue} 全深度${deepSide}厚、近端${nearSide}厚`
          : `${venue.venue} ±${DEPTH_BANDS_DEFAULT}% 内${deepSide}厚（失衡 ${(band.imbalance * 100).toFixed(1)}%），但近端 10 档${nearSide}厚（失衡 ${(venue.depth.nearImbalance * 100).toFixed(1)}%）→ 挂单在远处，近端在反向成交`,
    })
  }

  // 2. 两类多空比方向相反
  for (const venue of venues) {
    const positioning = venue.positioning
    if (positioning === null) continue
    if (positioning.accountRatio === null || positioning.topPositionRatio === null) continue
    const accountSide = positioning.accountRatio - 1
    const topSide = positioning.topPositionRatio - 1
    if (accountSide * topSide < 0) {
      found.push({
        kind: 'ratio-split',
        venues: [venue.venue],
        detail: `${venue.venue} 账户数多空比 ${positioning.accountRatio.toFixed(2)}（${accountSide > 0 ? '偏多' : '偏空'}），但大户持仓多空比 ${positioning.topPositionRatio.toFixed(2)}（${topSide > 0 ? '偏多' : '偏空'}）→ 散户与大户立场相反`,
      })
    }
  }

  // 3. 各所净流方向不一致
  const withFlow = venues.filter((venue) => venue.flows.some((flow) => flow.windowSeconds === 3600))
  if (withFlow.length >= 2) {
    const directions = withFlow.map((venue) => {
      const flow = venue.flows.find((item) => item.windowSeconds === 3600)
      return { venue: venue.venue, net: flow === undefined ? 0 : flow.netNotional }
    })
    const buyers = directions.filter((item) => item.net > 0)
    const sellers = directions.filter((item) => item.net < 0)
    if (buyers.length > 0 && sellers.length > 0) {
      found.push({
        kind: 'venue-flow-split',
        venues: directions.map((item) => item.venue),
        detail: `净买入场所：${buyers.map((item) => `${item.venue} +$${(item.net / 1e6).toFixed(1)}M`).join('、')}；净卖出：${sellers.map((item) => `${item.venue} −$${(Math.abs(item.net) / 1e6).toFixed(1)}M`).join('、')} → 局部行为而非全市场一致`,
      })
    }
  }

  // 4. 大单方向与整体相反
  for (const venue of venues) {
    const profile = venue.largeOrders
    const flow = venue.flows.find((item) => item.granularity === 'recent-trades')
    if (profile === null || flow === undefined) continue
    const biggest = profile.buckets[profile.buckets.length - 1]
    if (biggest.notional <= 0) continue
    const bigSide = biggest.takerBuyRatio - 0.5
    const overallSide = profile.takerBuyRatio - 0.5
    if (bigSide * overallSide < 0) {
      found.push({
        kind: 'large-order-split',
        venues: [venue.venue],
        detail: `${venue.venue} 最大单档（≥$${(biggest.minNotional / 1000).toFixed(0)}K）主动买占比 ${(biggest.takerBuyRatio * 100).toFixed(1)}%，但全样本只有 ${(profile.takerBuyRatio * 100).toFixed(1)}% → 大单方向与碎单相反`,
      })
    }
  }

  // 合计层面「净流为负 + OI 上升」本可以说明空头在开新仓，但 OI 只有单次快照时
  // 无法判断升降，需要两次采样做差。缺这个前提就下结论会制造虚假确定性，
  // 所以这里不出这条矛盾，等落盘有了前值再补。
  return found
}

/**
 * 创建面板客户端。
 *
 * @param options 依赖
 * @returns 面板客户端
 */
export function createPanelClient(options: PanelClientOptions): PanelClient {
  const depthClient = createDepthClient(options)
  const flowClient = createFlowClient(options)
  const positioningClient = createPositioningClient(options)

  return {
    async fetch(
      symbol: string,
      venues: readonly OrderflowVenue[] = ORDERFLOW_VENUES,
    ): Promise<OrderflowPanel> {
      const snapshots = await Promise.all(
        venues.map(async (venue): Promise<VenueSnapshot> => {
          const errors: VenueSnapshot['errors'][number][] = []
          // 深度先行：它提供参考价格，后面的 OI 折算要用
          const depth = await attempt('depth', () => depthClient.fetch(venue, symbol), errors)
          const referencePrice = depth === null ? null : depth.midPrice
          const flows = await attempt('flow', () => flowClient.fetchFlows(venue, symbol), errors)
          const largeOrders = await attempt(
            'large-orders',
            () => flowClient.fetchLargeOrders(venue, symbol),
            errors,
          )
          const positioning = await attempt(
            'positioning',
            () => positioningClient.fetch(venue, symbol, referencePrice),
            errors,
          )
          return {
            venue,
            symbol,
            depth,
            flows: flows ?? [],
            // 实时采集路径不读落盘的分钟记录，CVD 只有从记录重建面板时才有
            cvd: [],
            largeOrders,
            positioning,
            errors,
          }
        }),
      )

      const totals = buildTotals(snapshots)
      return {
        symbol,
        timestamp: Date.now(),
        venues: snapshots,
        totals,
        contradictions: detectContradictions(snapshots, totals),
      }
    },
  }
}

/**
 * 取 1 小时净流。
 *
 * @param flows 多周期成交统计
 * @returns 1 小时统计；没有则为 null
 */
export function hourFlowOf(flows: readonly FlowStats[]): FlowStats | null {
  return flows.find((flow) => flow.windowSeconds === 3600) ?? null
}
