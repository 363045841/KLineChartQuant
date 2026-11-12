/**
 * 从落盘记录重建面板快照。
 *
 * 为什么需要这一步：落盘时分成了三类流（depth / flow / positioning），
 * 而面板需要「同一时刻的三类数据并排看」。如果不在这里重建，前端就得自己
 * 做跨所合计与矛盾识别——那份逻辑一旦在两端各写一遍，数字迟早不一致。
 *
 * 组装规则：
 * - 每所取**各自最新**的一条深度与持仓；成交按「最新时间戳的那一批窗口」取。
 * - 三类数据的采集时刻允许不同：某家持仓接口挂了，它的深度仍然有效。
 *   面板显示的是「各自最新的可用事实」，并在 `errors` 里如实标注缺了哪类。
 * - 不做时间对齐插值。把 60 秒前的 OI 和 5 秒前的深度说成「同一时刻」是伪精度。
 */
import {
  type DepthRecord,
  type FlowCvdPoint,
  type FlowMinuteRecord,
  type FlowRecord,
  type FlowStats,
  type LargeOrderRecord,
  type OrderflowPanel,
  type OrderflowVenue,
  type PositioningRecord,
  type VenueSnapshot,
} from '../types'
import { FLOW_WINDOWS } from './flowVenues'
import { MINUTE_MS, minuteStartOf } from './largeOrderAccumulator'
import { buildTotals, detectContradictions } from './panel'

/** CVD 曲线最多回看的连续分钟数。 */
const CVD_MINUTES = 60

/** 最新一分钟允许落后「上一个已结束分钟」的时长；超过就当作数据停摆，不出曲线。 */
const CVD_STALE_MS = 5 * 60_000

/** 重建所需的原始记录，已按时间升序。 */
export interface PanelRecords {
  /** 交易对 */
  readonly symbol: string
  /** 深度记录 */
  readonly depth: readonly DepthRecord[]
  /** 成交记录（同一时刻会有多个窗口） */
  readonly flow: readonly FlowRecord[]
  /** 单分钟主动买卖（我们自己按分钟累加的） */
  readonly flowMinutes: readonly FlowMinuteRecord[]
  /** 持仓记录 */
  readonly positioning: readonly PositioningRecord[]
  /** 钟级大单记录（只有整点才有值，通常只有最近的几条） */
  readonly largeOrders: readonly LargeOrderRecord[]
}

/**
 * 取数组最后一条。
 *
 * @param rows 记录
 * @returns 最后一条；空数组为 null
 */
function lastOf<T>(rows: readonly T[]): T | null {
  return rows.length === 0 ? null : rows[rows.length - 1]
}

/**
 * 取某所最新的那一批成交窗口。
 *
 * 同一轮采集会把 1h/15m/5m/1m 一起写入，时间戳相同；这里按最大时间戳整批取，
 * 避免出现「1h 是新数据、1m 是上一轮」这种混合状态。
 *
 * @param rows 该所的成交记录（按时间升序）
 * @returns 最新一批窗口
 */
function latestFlowBatch(rows: readonly FlowRecord[]): readonly FlowRecord[] {
  if (rows.length === 0) return []
  let latest = 0
  for (const row of rows) {
    if (row.timestamp > latest) latest = row.timestamp
  }
  return rows.filter((row) => row.timestamp === latest)
}

/**
 * 由单分钟记录向上聚合成多周期主动买卖。
 *
 * 覆盖判定不用额外字段：缺行就是缺覆盖。窗口内应有 N 个已结束分钟，
 * 只统计实际存在的行，覆盖秒数 = 行数 × 60，因此采集中断过的周期会自己变短。
 *
 * 锚点是「上一个已结束的分钟」而不是最新一行的分钟：这样采集停摆时周期会自然消失，
 * 不会把半小时前的数据当成「刚刚的一小时」。
 *
 * @param rows 该所的单分钟记录
 * @param venue 交易所
 * @param symbol 交易对
 * @param now 快照时刻
 * @returns 按周期从大到小排列的统计；没有可用行时为空
 */
function flowsFromMinutes(
  rows: readonly FlowMinuteRecord[],
  venue: OrderflowVenue,
  symbol: string,
  now: number,
): readonly FlowStats[] {
  if (rows.length === 0) return []
  const byMinute = new Map<number, FlowMinuteRecord>()
  for (const row of rows) byMinute.set(row.minuteStart, row)
  const lastFinished = minuteStartOf(now) - MINUTE_MS
  const flows: FlowStats[] = []

  for (const window of FLOW_WINDOWS) {
    const slots = window / 60
    let buy = 0
    let sell = 0
    let hits = 0
    for (let index = 0; index < slots; index += 1) {
      const row = byMinute.get(lastFinished - index * MINUTE_MS)
      // 缺行就停：往回跳过缺口继续累加，会把两段不相连的时间拼成一个周期
      if (row === undefined) break
      hits += 1
      buy += row.buy
      sell += row.sell
    }
    if (hits === 0) continue
    const total = buy + sell
    flows.push({
      venue,
      symbol,
      windowSeconds: window,
      timestamp: lastFinished,
      takerBuyNotional: buy,
      takerSellNotional: sell,
      takerBuyRatio: total > 0 ? buy / total : 0.5,
      netNotional: buy - sell,
      coverageSeconds: Math.min(window, hits * 60),
      granularity: 'self-aggregated',
    })
  }

  return flows
}

/**
 * 由单分钟记录生成 CVD 曲线。
 *
 * 锚点取「不晚于上一个已结束分钟的最新一行」，这样落盘晚一分钟不会把整条曲线清空；
 * 再从锚点往回走，遇到缺行就断开，只保留最新的一段连续区间。
 * 锚点比上一个已结束分钟旧太多时整条作废：把那时的 CVD 当成「现在」是伪精度。
 *
 * @param rows 该所的单分钟记录
 * @param now 快照时刻
 * @returns 按时间升序的点；没有可用连续段时为空
 */
function cvdFromMinutes(rows: readonly FlowMinuteRecord[], now: number): readonly FlowCvdPoint[] {
  if (rows.length === 0) return []
  const byMinute = new Map<number, FlowMinuteRecord>()
  for (const row of rows) byMinute.set(row.minuteStart, row)
  const lastFinished = minuteStartOf(now) - MINUTE_MS

  let anchor: number | undefined
  for (const minuteStart of byMinute.keys()) {
    if (minuteStart > lastFinished) continue
    if (anchor === undefined || minuteStart > anchor) anchor = minuteStart
  }
  if (anchor === undefined) return []
  if (lastFinished - anchor > CVD_STALE_MS) return []

  const run: FlowMinuteRecord[] = []
  for (let minuteStart = anchor; ; minuteStart -= MINUTE_MS) {
    const row = byMinute.get(minuteStart)
    if (row === undefined) break
    run.push(row)
    if (run.length >= CVD_MINUTES) break
  }

  const points: FlowCvdPoint[] = []
  let cumulative = 0
  for (const row of run.reverse()) {
    const delta = row.buy - row.sell
    cumulative += delta
    points.push({
      minuteStart: row.minuteStart,
      buy: row.buy,
      sell: row.sell,
      delta,
      cumulative,
    })
  }
  return points
}

/**
 * 合并官方聚合与自算周期，同一周期以官方为准。
 *
 * 官方按周期聚合的值就是交易所自己算的，比我们从逐笔重算更可信；
 * 自算只补官方没有的周期（15m/5m/1m）。
 *
 * @param official 官方聚合记录
 * @param selfAggregated 自算记录
 * @returns 按周期从大到小排列
 */
function mergeFlows(
  official: readonly FlowRecord[],
  selfAggregated: readonly FlowStats[],
): readonly FlowStats[] {
  const byWindow = new Map<number, FlowStats>()
  for (const flow of selfAggregated) byWindow.set(flow.windowSeconds, flow)
  for (const flow of official) {
    if (flow.granularity !== 'aggregated') continue
    // 官方聚合的定义就是整周期：早期落盘记录没有覆盖字段，按周期补齐而不是当成未知
    byWindow.set(flow.windowSeconds, { ...flow, coverageSeconds: flow.windowSeconds })
  }
  return [...byWindow.values()].sort((left, right) => right.windowSeconds - left.windowSeconds)
}

/**
 * 重建面板快照。
 *
 * @param records 五类记录
 * @param venues 参与的交易所（顺序即面板顺序）
 * @param timestamp 快照时刻
 * @returns 面板快照
 */
export function reassemblePanel(
  records: PanelRecords,
  venues: readonly OrderflowVenue[],
  timestamp: number,
): OrderflowPanel {
  const snapshots: VenueSnapshot[] = venues.map((venue) => {
    const depthRows = records.depth.filter((row) => row.venue === venue)
    const flowRows = records.flow.filter((row) => row.venue === venue)
    const minuteRows = records.flowMinutes.filter((row) => row.venue === venue)
    const positioningRows = records.positioning.filter((row) => row.venue === venue)

    const depth = lastOf(depthRows)
    const positioning = lastOf(positioningRows)
    const flows = mergeFlows(
      latestFlowBatch(flowRows),
      flowsFromMinutes(minuteRows, venue, records.symbol, timestamp),
    )
    const sealed = lastOf(records.largeOrders.filter((row) => row.venue === venue))

    const errors: VenueSnapshot['errors'][number][] = []
    if (depth === null) errors.push({ kind: 'depth', message: '该时段无深度记录' })
    if (flows.length === 0) errors.push({ kind: 'flow', message: '该时段无成交记录' })
    if (positioning === null) errors.push({ kind: 'positioning', message: '该时段无持仓记录' })

    return {
      venue,
      symbol: records.symbol,
      depth: depth === null ? null : { ...depth },
      flows: flows.map((row) => ({ ...row })),
      cvd: cvdFromMinutes(minuteRows, timestamp),
      // 钟级大单只有整点封存后才有值；未封存时段为 null，面板会说明「无」
      largeOrders: sealed === null ? null : { ...sealed },
      positioning: positioning === null ? null : { ...positioning },
      errors,
    }
  })

  const totals = buildTotals(snapshots)
  return {
    symbol: records.symbol,
    timestamp,
    venues: snapshots,
    totals,
    contradictions: detectContradictions(snapshots, totals),
  }
}
