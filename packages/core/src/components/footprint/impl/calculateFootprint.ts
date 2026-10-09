/** 按真实 K 线边界增量聚合成交；每个计算身份独立缓存批次，避免逐笔重建全部柱子。 */

import {
  decimalUnits,
  formatDecimal,
  multiplyDecimal,
  parseDecimal,
} from '../../../data/trades/impl/decimal.js'
import { EMPTY_TRADE_SNAPSHOT, type TradeSnapshot } from '../../../data/trades/types.js'
import { FOOTPRINT_ERROR_CODES, GENERIC_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { KLineData } from '../../../foundation/types/price.js'
import {
  FOOTPRINT_METRICS,
  type FootprintBar,
  type FootprintParams,
  type FootprintSeries,
} from '../types.js'

interface Cell {
  bid: bigint
  ask: bigint
}
interface Bucket {
  scale: number
  cells: Map<bigint, Cell>
}

/** 创建一个由执行器拥有的 calculator；不持有网络或图表状态。 */
export function createFootprintCalculator() {
  let identity = ''
  let consumed = 0
  let batchKeys: readonly string[] = []
  let buckets = new Map<number, Bucket>()
  let materialized = new Map<number, FootprintBar>()
  let lastRatio = 0

  return (
    data: KLineData[],
    params: FootprintParams,
    input: TradeSnapshot = EMPTY_TRADE_SNAPSHOT,
  ): FootprintSeries => {
    if (!Number.isSafeInteger(params.ticksPerRow) || params.ticksPerRow < 1)
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '每行价格跳数必须是正整数')
    if (!Number.isSafeInteger(params.imbalanceRatio) || params.imbalanceRatio < 1)
      throw new KLineChartError(FOOTPRINT_ERROR_CODES.RATIO_INVALID, '不平衡倍数必须是正整数')
    const tick = parseDecimal(input.tickSize)
    if (tick.units === 0n)
      return {
        rowSize: '0',
        asOf: 0,
        bars: data.map(() => undefined),
        status: input.status,
        message: input.message,
      }
    const rowUnits = tick.units * BigInt(params.ticksPerRow)
    // K 线身份只需检测有序唯一时间戳序列的变化：长度 + 首尾时间戳即可唯一确定。
    const nextIdentity = [
      data.length,
      data[0]?.timestamp,
      data[data.length - 1]?.timestamp,
      input.tickSize,
      params.ticksPerRow,
      params.metric,
    ].join('|')
    // 批次身份用范围、完整性、数量与首尾 tradeId 组合，避免逐笔序列化。
    const nextBatchKeys = input.batches.map((batch) =>
      [
        batch.range.from,
        batch.range.to,
        batch.complete,
        batch.items.length,
        batch.items[0]?.tradeId,
        batch.items[batch.items.length - 1]?.tradeId,
      ].join('|'),
    )
    if (
      identity !== nextIdentity ||
      batchKeys.length > nextBatchKeys.length ||
      batchKeys.some((key, index) => key !== nextBatchKeys[index])
    ) {
      buckets = new Map()
      materialized = new Map()
      consumed = 0
      identity = nextIdentity
    }
    const dirty = new Set<number>()
    // 对单批成交二分查找实际柱边界；头部插入后重新建立时间映射。
    for (const batch of input.batches.slice(consumed)) {
      for (const trade of batch.items) {
        let low = 0
        let high = data.length
        while (low < high) {
          const middle = (low + high) >>> 1
          if (data[middle]!.timestamp <= trade.timestamp) low = middle + 1
          else high = middle
        }
        const index = low - 1
        if (index < 0) continue
        const bar = data[index]!
        dirty.add(bar.timestamp)
        const price = parseDecimal(trade.price)
        const scale = Math.max(price.scale, tick.scale)
        const key = decimalUnits(price, scale) / (rowUnits * 10n ** BigInt(scale - tick.scale))
        // 按口径取量：成交量直接用 size，成交额用价 × 量，定点相乘避免浮点误差。
        const size = parseDecimal(trade.size)
        const quantity =
          params.metric === FOOTPRINT_METRICS.Volume ? size : multiplyDecimal(price, size)
        let bucket = buckets.get(bar.timestamp)
        if (!bucket) {
          bucket = { scale: quantity.scale, cells: new Map() }
          buckets.set(bar.timestamp, bucket)
        }
        if (quantity.scale > bucket.scale) {
          const factor = 10n ** BigInt(quantity.scale - bucket.scale)
          for (const cell of bucket.cells.values()) {
            cell.bid *= factor
            cell.ask *= factor
          }
          bucket.scale = quantity.scale
        }
        const cell = bucket.cells.get(key) ?? { bid: 0n, ask: 0n }
        const units = decimalUnits(quantity, bucket.scale)
        if (trade.side === 'buy') cell.ask += units
        else cell.bid += units
        bucket.cells.set(key, cell)
      }
    }
    consumed = input.batches.length
    batchKeys = nextBatchKeys
    const ratio = BigInt(params.imbalanceRatio)
    if (lastRatio !== params.imbalanceRatio) materialized.clear()
    lastRatio = params.imbalanceRatio
    const coverage = input.batches
      .filter((batch) => batch.complete)
      .sort((a, b) => a.range.from - b.range.from)
    const asOf = input.batches.reduce((latest, batch) => Math.max(latest, batch.range.to), 0)
    const bars = data.map((bar, index): FootprintBar | undefined => {
      const bucket = buckets.get(bar.timestamp)
      const end = data[index + 1]?.timestamp ?? asOf
      // 覆盖区间不能跨越缺口；只有连续完整批次才能宣称整柱完整。
      let covered = bar.timestamp
      for (const batch of coverage) {
        if (batch.range.from <= covered && batch.range.to > covered) covered = batch.range.to
      }
      if (!bucket && (covered < end || end <= bar.timestamp)) return undefined
      const complete = covered >= end && end > bar.timestamp
      const previous = materialized.get(bar.timestamp)
      if (previous && !dirty.has(bar.timestamp)) {
        if (previous.complete === complete) return previous
        const updated = { ...previous, complete }
        materialized.set(bar.timestamp, updated)
        return updated
      }
      const scale = bucket?.scale ?? 0
      let bid = 0n
      let ask = 0n
      const cells = [...(bucket?.cells ?? [])]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, cell]) => {
          bid += cell.bid
          ask += cell.ask
          const lower = bucket?.cells.get(key - 1n)?.bid ?? 0n
          const upper = bucket?.cells.get(key + 1n)?.ask ?? 0n
          return {
            price: formatDecimal(key * rowUnits, tick.scale),
            bid: formatDecimal(cell.bid, scale),
            ask: formatDecimal(cell.ask, scale),
            askImbalance: lower > 0n && cell.ask >= lower * ratio,
            bidImbalance: upper > 0n && cell.bid >= upper * ratio,
          }
        })
      const result: FootprintBar = {
        timestamp: bar.timestamp,
        cells,
        delta: formatDecimal(ask - bid, scale),
        total: formatDecimal(ask + bid, scale),
        complete,
      }
      materialized.set(bar.timestamp, result)
      return result
    })
    return {
      rowSize: formatDecimal(rowUnits, tick.scale),
      asOf,
      bars,
      status: input.status,
      message: input.message,
    }
  }
}
