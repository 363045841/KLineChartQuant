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
  type FlowRecord,
  type LargeOrderRecord,
  type OrderflowPanel,
  type OrderflowVenue,
  type PositioningRecord,
  type VenueSnapshot,
} from '../types'
import { buildTotals, detectContradictions } from './panel'

/** 重建所需的原始记录，已按时间升序。 */
export interface PanelRecords {
  /** 交易对 */
  readonly symbol: string
  /** 深度记录 */
  readonly depth: readonly DepthRecord[]
  /** 成交记录（同一时刻会有多个窗口） */
  readonly flow: readonly FlowRecord[]
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
 * 重建面板快照。
 *
 * @param records 三类记录
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
    const positioningRows = records.positioning.filter((row) => row.venue === venue)

    const depth = lastOf(depthRows)
    const positioning = lastOf(positioningRows)
    const flows = latestFlowBatch(flowRows)
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
