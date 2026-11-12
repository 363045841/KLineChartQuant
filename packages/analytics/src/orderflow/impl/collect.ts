/**
 * 订单流采集编排：拉快照 → 按天落盘 → 读回校验。
 *
 * 落盘口径（与 docs/design/data/orderflow-panel.md 一致）：
 * - 只存**聚合后的快照**，不存原始档位。Binance 一次 5000 档约 200 KB，
 *   每天 1440 次就是 280 MB/币/所；而面板与研究用到的都是区间金额、失衡度、价格墙。
 * - 三类数据各自成流：`orderflow/{depth|flow|positioning}/{venue}/{symbol}`。
 *   流名带交易所与币种，回读时不需要再过滤。
 * - 去重键用「时间戳 + 类别内序号」：同一秒内多次采集不会互相覆盖，
 *   而重复跑同一时刻（网络重试）也不会写重。
 *
 * 刻意不做的事：
 * - 不在这里判断「数据是否异常」。采集器只负责如实记录，异常留给分析层判断——
 *   采集阶段做业务判断会让历史数据带上当时的规则，无法回溯。
 * - 不在采集失败时用上一次的快照填充。缺数据必须缺着，否则「OI 突然持平」
 *   这类结论会被伪造的数据污染。
 */
import type { DayAppendResult, DayShardStore } from '../../storage/types'
import type {
  DepthRecord,
  FlowRecord,
  OrderflowPanel,
  OrderflowVenue,
  PositioningRecord,
  VenueSnapshot,
} from '../types'

/** 落盘流前缀。 */
export const ORDERFLOW_STREAM_PREFIX = 'orderflow'

/** 单个交易所的写入结果。 */
export interface VenueAppendSummary {
  /** 交易所 */
  readonly venue: OrderflowVenue
  /** 深度记录写入条数 */
  readonly depthRows: number
  /** 成交记录写入条数 */
  readonly flowRows: number
  /** 持仓记录写入条数 */
  readonly positioningRows: number
  /** 各类的失败原因（采集阶段已记录，这里只做汇总展示） */
  readonly errors: readonly string[]
}

/** 一次采集的落盘结果。 */
export interface CollectedOrderflow {
  /** 交易对 */
  readonly symbol: string
  /** 采集时刻 */
  readonly timestamp: number
  /** 各所写入明细 */
  readonly venues: readonly VenueAppendSummary[]
  /** 全部写入的分片 */
  readonly appends: readonly DayAppendResult[]
  /** 本次检出的矛盾数量（只用于日志，不落盘） */
  readonly contradictions: number
}

/**
 * 生成某一类数据的流标识。
 *
 * @param kind 数据类别
 * @param venue 交易所
 * @param symbol 交易对
 * @returns 流标识
 */
export function orderflowStream(
  kind: 'depth' | 'flow' | 'positioning' | 'large-orders',
  venue: OrderflowVenue,
  symbol: string,
): string {
  return `${ORDERFLOW_STREAM_PREFIX}/${kind}/${venue}/${symbol}`
}

/**
 * 把一次面板快照拆成三类记录并落盘。
 *
 * @param store 分片存储
 * @param panel 面板快照
 * @returns 落盘结果
 */
export function persistOrderflowPanel(
  store: DayShardStore,
  panel: OrderflowPanel,
): CollectedOrderflow {
  const appends: DayAppendResult[] = []
  const summaries: VenueAppendSummary[] = []

  for (const venue of panel.venues) {
    const depthRecords: DepthRecord[] = []
    if (venue.depth !== null) {
      depthRecords.push({ ...venue.depth, schemaVersion: 1 })
    }

    const flowRecords: FlowRecord[] = venue.flows.map((flow) => ({ ...flow, schemaVersion: 1 }))

    const positioningRecords: PositioningRecord[] = []
    if (venue.positioning !== null) {
      positioningRecords.push({ ...venue.positioning, schemaVersion: 1 })
    }

    const depthAppends = appendRecords(store, 'depth', venue, depthRecords)
    const flowAppends = appendRecords(store, 'flow', venue, flowRecords)
    const positioningAppends = appendRecords(store, 'positioning', venue, positioningRecords)
    appends.push(...depthAppends, ...flowAppends, ...positioningAppends)

    summaries.push({
      venue: venue.venue,
      depthRows: depthRecords.length,
      flowRows: flowRecords.length,
      positioningRows: positioningRecords.length,
      errors: venue.errors.map((item) => `${item.kind}: ${item.message}`),
    })
  }

  return {
    symbol: panel.symbol,
    timestamp: panel.timestamp,
    venues: summaries,
    appends,
    contradictions: panel.contradictions.length,
  }
}

/**
 * 写入一类记录。
 *
 * @param store 分片存储
 * @param kind 数据类别
 * @param venue 单所快照
 * @param records 记录
 * @returns 写入的分片
 */
function appendRecords<T extends { readonly timestamp: number }>(
  store: DayShardStore,
  kind: 'depth' | 'flow' | 'positioning',
  venue: VenueSnapshot,
  records: readonly T[],
): readonly DayAppendResult[] {
  if (records.length === 0) return []
  const stream = orderflowStream(kind, venue.venue, venue.symbol)
  // 同一秒内可能有多条（成交有多个周期），用「时间戳:序号」保证互不覆盖且可重跑
  const seen = new Map<number, number>()
  return store.append({
    stream,
    rows: records,
    dayOf: (row) => row.timestamp,
    dedupeKey: (row) => {
      const order = seen.get(row.timestamp) ?? 0
      seen.set(row.timestamp, order + 1)
      return `${row.timestamp}:${order}`
    },
  })
}
