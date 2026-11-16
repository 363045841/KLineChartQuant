// 价格分布查询：把 K 线成交量按价格分桶，给出 POC 与价值区（VAH / VAL）。
//
// 与脚本包里的 SVP / PVP 指标相互独立：这里用核心 components/volumeProfile 的
// 纯函数做一次性计算，不关心画图，也不依赖指标实例。数据只有 K 线高低区间，
// 所以按比例摊量（proportional）是估计值，不是逐笔成交的真实分布。

import {
  type BinningMode,
  binBarToBuckets,
  computeValueArea,
  findPOCIndex,
} from '@/components/volumeProfile/index.js'
import { CHART_AGENT_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { KLineData } from '@/foundation/types/price.js'

/** 一次查询的输入；字段已由工具 Schema 约束，这里只做默认值收敛。 */
export interface VolumeProfileQueryInput {
  /** 参与统计的最近 K 线根数 */
  readonly bars: number
  /** 价格分桶数 */
  readonly binCount: number
  /** 价值区占比，0–1 */
  readonly valueAreaPercent: number
  /** 分桶摊量方式 */
  readonly mode: BinningMode
}

/** 查询结果；价格均为绝对价格。 */
export interface VolumeProfileSummary {
  /** 实际参与统计的根数 */
  readonly bars: number
  /** 范围起点时间戳（毫秒） */
  readonly from: number
  /** 范围终点时间戳（毫秒） */
  readonly to: number
  /** 分桶数 */
  readonly binCount: number
  /** 每个桶覆盖的价格宽度 */
  readonly binSize: number
  /** 摊量方式 */
  readonly mode: BinningMode
  /** 控制点：成交量最大的价格 */
  readonly poc: number
  /** 价值区上沿 */
  readonly vah: number
  /** 价值区下沿 */
  readonly val: number
  /** 价值区实际占比 */
  readonly valueAreaRatio: number
  /** 区间最低价 */
  readonly low: number
  /** 区间最高价 */
  readonly high: number
  /** 最新收盘价 */
  readonly close: number
  /** 区间总成交量 */
  readonly totalVolume: number
}

/**
 * 单根 K 线可用的成交量。
 *
 * 缺失、非有限值或负值都按 0 计，不参与摊量：数据源不提供成交量时，
 * 分布会退化成空直方图，由调用方按总量为 0 处理，而不是算出 NaN。
 *
 * @param bar 一根 K 线
 * @returns 非负成交量
 */
function volumeOf(bar: KLineData): number {
  const volume = bar.volume
  return volume === undefined || !Number.isFinite(volume) || volume < 0 ? 0 : volume
}

/** 价格文本：千分位两位小数，避免浮点噪声。 */
function price(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** 带符号的百分比文本。 */
function signedPercent(value: number): string {
  const text = value.toFixed(2)
  return value > 0 ? `+${text}%` : `${text}%`
}

/**
 * 计算价格分布摘要。
 *
 * @param data 图表当前 K 线，按时间升序
 * @param input 查询输入
 * @returns 价格分布摘要
 */
export function computeVolumeProfileSummary(
  data: readonly KLineData[],
  input: VolumeProfileQueryInput,
): VolumeProfileSummary {
  if (data.length === 0) {
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.NO_DATA,
      '价格分布查询需要图表已有 K 线数据',
    )
  }
  const window = data.slice(Math.max(0, data.length - input.bars))
  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  let totalVolume = 0
  for (const bar of window) {
    if (bar.low < low) low = bar.low
    if (bar.high > high) high = bar.high
    totalVolume += volumeOf(bar)
  }
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.OUT_OF_RANGE,
      '价格分布查询的区间没有有效高低价，无法分桶',
    )
  }
  const binSize = (high - low) / input.binCount
  const buckets = new Float64Array(input.binCount)
  for (const bar of window) {
    binBarToBuckets(
      { high: bar.high, low: bar.low, close: bar.close, volume: volumeOf(bar) },
      buckets,
      low,
      binSize,
      input.binCount,
      input.mode,
    )
  }
  const pocIndex = findPOCIndex(buckets)
  const area = computeValueArea(buckets, pocIndex, input.valueAreaPercent)
  const priceAt = (index: number): number => low + (index + 0.5) * binSize
  const last = window[window.length - 1]
  const first = window[0]
  if (last === undefined || first === undefined) {
    throw new KLineChartError(
      CHART_AGENT_ERROR_CODES.NO_DATA,
      '价格分布查询没有可用的 K 线',
    )
  }
  return {
    bars: window.length,
    from: first.timestamp,
    to: last.timestamp,
    binCount: input.binCount,
    binSize,
    mode: input.mode,
    poc: priceAt(pocIndex),
    vah: priceAt(area.vahIndex),
    val: priceAt(area.valIndex),
    valueAreaRatio: area.vaPercent,
    low,
    high,
    close: last.close,
    totalVolume,
  }
}

/**
 * 把摘要转成 Agent 可读的紧凑文本。
 *
 * @param summary 价格分布摘要
 * @returns 多行文本
 */
export function formatVolumeProfileSummary(summary: VolumeProfileSummary): string {
  const inside = summary.close >= summary.val && summary.close <= summary.vah
  const position =
    summary.poc > 0 ? ((summary.close - summary.poc) / summary.poc) * 100 : Number.NaN
  const zone = inside ? '在价值区内' : summary.close > summary.vah ? '在价值区上方' : '在价值区下方'
  const relative = Number.isFinite(position) ? `，相对 POC ${signedPercent(position)}` : ''
  return [
    `价格分布（K 线成交量按价格分桶，${summary.mode}）`,
    `范围：最近 ${summary.bars} 根（${new Date(summary.from).toISOString()} → ` +
      `${new Date(summary.to).toISOString()}），分桶 ${summary.binCount}（每桶 ${price(summary.binSize)}）`,
    `POC ${price(summary.poc)} | VAH ${price(summary.vah)} | VAL ${price(summary.val)}` +
      `（价值区实际 ${(summary.valueAreaRatio * 100).toFixed(1)}%）`,
    `现价 ${price(summary.close)}：${zone}${relative}`,
    `区间 ${price(summary.low)}–${price(summary.high)}，总量 ${price(summary.totalVolume)}`,
    '口径：由 K 线高低区间摊量得到，不是逐笔成交；与 SVP / PVP 脚本指标各自独立。',
  ].join('\n')
}
