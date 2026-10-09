/** 按真实 K 线边界增量聚合成交；每个计算身份独立缓存批次，避免逐笔重建全部柱子。 */

import {
  decimalUnits,
  formatDecimal,
  multiplyDecimal,
  parseDecimal,
} from '../../../data/trades/impl/decimal.js'
import { EMPTY_TRADE_SNAPSHOT, type TradeSnapshot } from '../../../data/trades/types.js'
import { FOOTPRINT_ERROR_CODES, KLineChartError } from '../../../errors.js'
import type { KLineData } from '../../../foundation/types/price.js'
import {
  FOOTPRINT_METRICS,
  type FootprintBar,
  type FootprintMetric,
  type FootprintParams,
  type FootprintSeries,
} from '../types.js'
import { resolveRowTicks } from './resolveRowTicks.js'

/** 单档同时保留成交量和成交额：成交量用于不平衡判定，成交额仅供成交额口径展示。 */
interface Cell {
  bidVolume: bigint
  askVolume: bigint
  bidTurnover: bigint
  askTurnover: bigint
}
interface Bucket {
  volumeScale: number
  turnoverScale: number
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
  let lastMetric: FootprintMetric | null = null

  return (
    data: KLineData[],
    params: FootprintParams,
    input: TradeSnapshot = EMPTY_TRADE_SNAPSHOT,
  ): FootprintSeries => {
    if (!Number.isSafeInteger(params.imbalanceRatio) || params.imbalanceRatio < 1)
      throw new KLineChartError(FOOTPRINT_ERROR_CODES.RATIO_INVALID, '不平衡倍数必须是正整数')
    const tick = parseDecimal(input.tickSize)
    if (tick.units === 0n)
      return {
        rowSize: '0',
        latestTimestamp: 0,
        bars: data.map(() => undefined),
        status: input.status,
        message: input.message,
      }
    const rowTicks = resolveRowTicks(data, params, Number(input.tickSize))
    const rowUnits = tick.units * BigInt(rowTicks)
    // K 线身份只需检测有序唯一时间戳序列的变化：长度 + 首尾时间戳即可唯一确定。
    // 聚合同时保留成交量与成交额，展示口径不影响缓存，故身份不含 metric。
    const nextIdentity = [
      data.length,
      data[0]?.timestamp,
      data[data.length - 1]?.timestamp,
      input.tickSize,
      rowTicks,
    ].join('|')
    // 成交批次身份只含数量与首尾 tradeId，覆盖状态独立消费，避免逐笔序列化。
    const nextBatchKeys = input.batches.map((batch) =>
      [
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
        // 同时累加成交量和成交额：不平衡固定看成交量，展示口径可切换而不重建聚合。
        const size = parseDecimal(trade.size)
        const turnover = multiplyDecimal(price, size)
        let bucket = buckets.get(bar.timestamp)
        if (!bucket) {
          bucket = { volumeScale: size.scale, turnoverScale: turnover.scale, cells: new Map() }
          buckets.set(bar.timestamp, bucket)
        }
        if (size.scale > bucket.volumeScale) {
          const factor = 10n ** BigInt(size.scale - bucket.volumeScale)
          for (const cell of bucket.cells.values()) {
            cell.bidVolume *= factor
            cell.askVolume *= factor
          }
          bucket.volumeScale = size.scale
        }
        if (turnover.scale > bucket.turnoverScale) {
          const factor = 10n ** BigInt(turnover.scale - bucket.turnoverScale)
          for (const cell of bucket.cells.values()) {
            cell.bidTurnover *= factor
            cell.askTurnover *= factor
          }
          bucket.turnoverScale = turnover.scale
        }
        const cell = bucket.cells.get(key) ?? {
          bidVolume: 0n,
          askVolume: 0n,
          bidTurnover: 0n,
          askTurnover: 0n,
        }
        const volumeUnits = decimalUnits(size, bucket.volumeScale)
        const turnoverUnits = decimalUnits(turnover, bucket.turnoverScale)
        if (trade.side === 'buy') {
          cell.askVolume += volumeUnits
          cell.askTurnover += turnoverUnits
        } else {
          cell.bidVolume += volumeUnits
          cell.bidTurnover += turnoverUnits
        }
        bucket.cells.set(key, cell)
      }
    }
    consumed = input.batches.length
    batchKeys = nextBatchKeys
    const ratio = BigInt(params.imbalanceRatio)
    // 展示口径与不平衡倍数只影响已渲染柱子，成交量与成交额聚合缓存继续复用。
    if (lastRatio !== params.imbalanceRatio || lastMetric !== params.metric) materialized.clear()
    lastRatio = params.imbalanceRatio
    lastMetric = params.metric
    const coverage = input.coverage
    const latestTimestamp = input.latestTimestamp
    const bars = data.map((bar, index): FootprintBar | undefined => {
      const bucket = buckets.get(bar.timestamp)
      const end = data[index + 1]?.timestamp ?? latestTimestamp
      // 覆盖区间不能跨越缺口；只有连续完整批次才能宣称整柱完整。
      let covered = bar.timestamp
      for (const range of coverage) {
        if (range.from <= covered && range.to > covered) covered = range.to
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
      const isVolume = params.metric === FOOTPRINT_METRICS.Volume
      const displayScale = bucket ? (isVolume ? bucket.volumeScale : bucket.turnoverScale) : 0
      let bid = 0n
      let ask = 0n
      const cells = [...(bucket?.cells ?? [])]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, cell]) => {
          const cellBid = isVolume ? cell.bidVolume : cell.bidTurnover
          const cellAsk = isVolume ? cell.askVolume : cell.askTurnover
          bid += cellBid
          ask += cellAsk
          // 不平衡固定按成交量与相邻档比较，与成交额展示口径无关。
          const lowerVolume = bucket?.cells.get(key - 1n)?.bidVolume ?? 0n
          const upperVolume = bucket?.cells.get(key + 1n)?.askVolume ?? 0n
          return {
            price: formatDecimal(key * rowUnits, tick.scale),
            bid: formatDecimal(cellBid, displayScale),
            ask: formatDecimal(cellAsk, displayScale),
            askImbalance: lowerVolume > 0n && cell.askVolume >= lowerVolume * ratio,
            bidImbalance: upperVolume > 0n && cell.bidVolume >= upperVolume * ratio,
          }
        })
      const result: FootprintBar = {
        timestamp: bar.timestamp,
        cells,
        delta: formatDecimal(ask - bid, displayScale),
        total: formatDecimal(ask + bid, displayScale),
        complete,
      }
      materialized.set(bar.timestamp, result)
      return result
    })
    return {
      rowSize: formatDecimal(rowUnits, tick.scale),
      latestTimestamp,
      bars,
      status: input.status,
      message: input.message,
    }
  }
}
