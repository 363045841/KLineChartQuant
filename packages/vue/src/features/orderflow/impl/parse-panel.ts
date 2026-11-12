// 服务端面板 JSON 的类型守卫。
//
// 不用 `as` 强制转换：服务端字段改名时，面板必须显示「数据格式不符」，
// 而不是把 undefined 当 0 画出来——0 在订单流里是有意义的值（比如净流为零），
// 静默填 0 会让人误读成「市场完全均衡」。

import type {
  BandView,
  ContradictionView,
  DepthView,
  FlowView,
  LargeOrderBucketView,
  LargeOrderView,
  PanelView,
  PositioningView,
  TotalsView,
  VenueView,
  WallView,
} from '../types.js'

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
 * 读有限数字，非法时返回 null。
 *
 * @param value 任意值
 * @returns 数字或 null
 */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 读字符串，非法时返回 null。
 *
 * @param value 任意值
 * @returns 字符串或 null
 */
function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * 解析数字数组中的一个元素。
 *
 * @param value 元素
 * @returns 数字或 0
 */
function arrNum(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * 解析一组价格墙。
 *
 * @param value 原始值
 * @returns 价格墙数组
 */
function parseWalls(value: unknown): readonly WallView[] {
  if (!Array.isArray(value)) return []
  const walls: WallView[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const side = str(item.side)
    if (side !== 'bid' && side !== 'ask') continue
    walls.push({
      side,
      price: arrNum(item.price),
      notional: arrNum(item.notional),
      distancePct: arrNum(item.distancePct),
    })
  }
  return walls
}

/**
 * 解析区间统计。
 *
 * @param value 原始值
 * @returns 区间数组
 */
function parseBands(value: unknown): readonly BandView[] {
  if (!Array.isArray(value)) return []
  const bands: BandView[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const band = num(item.band)
    if (band === null) continue
    bands.push({
      band,
      bidNotional: arrNum(item.bidNotional),
      askNotional: arrNum(item.askNotional),
      imbalance: arrNum(item.imbalance),
      complete: item.complete === true,
    })
  }
  return bands
}

/**
 * 解析深度。
 *
 * @param value 原始值
 * @returns 深度或 null
 */
function parseDepth(value: unknown): DepthView | null {
  if (!isRecord(value)) return null
  const midPrice = num(value.midPrice)
  if (midPrice === null) return null
  return {
    midPrice,
    bidCoveragePct: arrNum(value.bidCoveragePct),
    askCoveragePct: arrNum(value.askCoveragePct),
    bands: parseBands(value.bands),
    nearImbalance: arrNum(value.nearImbalance),
    walls: parseWalls(value.walls),
  }
}

/**
 * 解析成交统计。
 *
 * @param value 原始值
 * @returns 成交数组
 */
function parseFlows(value: unknown): readonly FlowView[] {
  if (!Array.isArray(value)) return []
  const flows: FlowView[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const windowSeconds = num(item.windowSeconds)
    if (windowSeconds === null) continue
    const granularity = str(item.granularity)
    flows.push({
      windowSeconds,
      takerBuyRatio: arrNum(item.takerBuyRatio),
      netNotional: arrNum(item.netNotional),
      // 服务端没给该字段时留 null：宁可显示未知，也不把不完整的周期当成完整周期
      coverageSeconds: num(item.coverageSeconds),
      granularity:
        granularity === 'recent-trades'
          ? 'recent-trades'
          : granularity === 'self-aggregated'
            ? 'self-aggregated'
            : 'aggregated',
    })
  }
  return flows
}

/**
 * 解析大单分档。
 *
 * @param value 原始值
 * @returns 分档数组
 */
function parseBuckets(value: unknown): readonly LargeOrderBucketView[] {
  if (!Array.isArray(value)) return []
  const buckets: LargeOrderBucketView[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const minNotional = num(item.minNotional)
    if (minNotional === null) continue
    buckets.push({
      minNotional,
      maxNotional: num(item.maxNotional),
      notional: arrNum(item.notional),
      share: arrNum(item.share),
      takerBuyRatio: arrNum(item.takerBuyRatio),
    })
  }
  return buckets
}

/**
 * 解析大单分层。
 *
 * @param value 原始值
 * @returns 分层或 null
 */
function parseLargeOrders(value: unknown): LargeOrderView | null {
  if (!isRecord(value)) return null
  const buckets = parseBuckets(value.buckets)
  if (buckets.length === 0) return null
  return {
    trades: arrNum(value.trades),
    spanMs: arrNum(value.spanMs),
    takerBuyRatio: arrNum(value.takerBuyRatio),
    buckets,
  }
}

/**
 * 解析持仓。
 *
 * @param value 原始值
 * @returns 持仓或 null
 */
function parsePositioning(value: unknown): PositioningView | null {
  if (!isRecord(value)) return null
  const venue = str(value.venue)
  const openInterestBase = num(value.openInterestBase)
  if (venue === null || openInterestBase === null) return null
  return {
    venue,
    openInterestBase,
    openInterestNotional: arrNum(value.openInterestNotional),
    accountRatio: num(value.accountRatio),
    topPositionRatio: num(value.topPositionRatio),
  }
}

/**
 * 解析单所快照。
 *
 * @param value 原始值
 * @returns 快照或 null
 */
function parseVenue(value: unknown): VenueView | null {
  if (!isRecord(value)) return null
  const venue = str(value.venue)
  if (venue === null) return null
  const errors: { kind: string; message: string }[] = []
  if (Array.isArray(value.errors)) {
    for (const item of value.errors) {
      if (!isRecord(item)) continue
      const kind = str(item.kind)
      const message = str(item.message)
      if (kind === null || message === null) continue
      errors.push({ kind, message })
    }
  }
  return {
    venue,
    depth: parseDepth(value.depth),
    flows: parseFlows(value.flows),
    largeOrders: parseLargeOrders(value.largeOrders),
    positioning: parsePositioning(value.positioning),
    errors,
  }
}

/**
 * 解析合计。
 *
 * @param value 原始值
 * @returns 合计或 null
 */
function parseTotals(value: unknown): TotalsView | null {
  if (!isRecord(value)) return null
  const depth = isRecord(value.depthHalfPercent) ? value.depthHalfPercent : null
  return {
    openInterestBase: arrNum(value.openInterestBase),
    openInterestNotional: arrNum(value.openInterestNotional),
    netFlow1h: arrNum(value.netFlow1h),
    takerBuyRatio1h: num(value.takerBuyRatio1h),
    depthHalfPercent: {
      bidNotional: depth === null ? 0 : arrNum(depth.bidNotional),
      askNotional: depth === null ? 0 : arrNum(depth.askNotional),
      imbalance: depth === null ? 0 : arrNum(depth.imbalance),
    },
    accountRatioMean: num(value.accountRatioMean),
    topPositionRatioMean: num(value.topPositionRatioMean),
  }
}

/**
 * 解析矛盾列表。
 *
 * @param value 原始值
 * @returns 矛盾数组
 */
function parseContradictions(value: unknown): readonly ContradictionView[] {
  if (!Array.isArray(value)) return []
  const items: ContradictionView[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const kind = str(item.kind)
    const detail = str(item.detail)
    if (kind === null || detail === null) continue
    items.push({ kind, detail })
  }
  return items
}

/**
 * 解析面板快照。
 *
 * @param value 服务端返回的未知值
 * @returns 面板或 null（结构不符）
 */
export function parsePanel(value: unknown): PanelView | null {
  if (!isRecord(value)) return null
  const symbol = str(value.symbol)
  const timestamp = num(value.timestamp)
  const totals = parseTotals(value.totals)
  if (symbol === null || timestamp === null || totals === null) return null
  if (!Array.isArray(value.venues)) return null
  const venues: VenueView[] = []
  for (const item of value.venues) {
    const venue = parseVenue(item)
    if (venue !== null) venues.push(venue)
  }
  return {
    symbol,
    timestamp,
    totals,
    venues,
    contradictions: parseContradictions(value.contradictions),
  }
}
