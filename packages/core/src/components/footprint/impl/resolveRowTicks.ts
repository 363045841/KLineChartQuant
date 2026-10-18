/** 从已收盘 K 线振幅推导足迹图统一行高，输出最小价格跳动的整数倍。 */
import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { KLineData } from '@/foundation/types/price.js'
import { FOOTPRINT_DEFAULT_PARAMS, FOOTPRINT_ROW_MODES, type FootprintParams } from '../types.js'

/** 固定模式使用指定跳数；自动模式排除最后一根未收盘柱，并按目标行数取整。 */
export function resolveRowTicks(
  data: KLineData[],
  params: FootprintParams,
  tickSize: number,
): number {
  if (params.rowMode === undefined || params.rowMode === FOOTPRINT_ROW_MODES.Fixed) {
    if (!Number.isSafeInteger(params.ticksPerRow) || params.ticksPerRow < 1) {
      throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '每行价格跳数必须是正整数')
    }
    return params.ticksPerRow
  }
  const period = params.rowPeriod ?? FOOTPRINT_DEFAULT_PARAMS.rowPeriod
  const targetRows = params.targetRows ?? FOOTPRINT_DEFAULT_PARAMS.targetRows
  if (!Number.isSafeInteger(period) || period < 1) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '振幅统计根数必须是正整数')
  }
  if (!Number.isSafeInteger(targetRows) || targetRows < 10 || targetRows > 20) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '目标行数必须是 10 到 20 的整数')
  }
  const closed = data.slice(0, -1)
  if (closed.length === 0) return 1
  const samplePeriod = Math.min(period, closed.length)
  let amplitude: number
  if (params.rowMode === FOOTPRINT_ROW_MODES.ATR) {
    amplitude = averageTrueRange(closed, samplePeriod)
  } else if (params.rowMode === FOOTPRINT_ROW_MODES.AverageRange) {
    const sample = closed.slice(-samplePeriod)
    amplitude = sample.reduce((sum, bar) => sum + bar.high - bar.low, 0) / samplePeriod
  } else {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '无效的足迹图分行方式')
  }
  const ticks = Math.max(1, Math.round(amplitude / targetRows / tickSize))
  if (!Number.isSafeInteger(ticks)) {
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, '自动行高超出有效价格跳数范围')
  }
  return ticks
}

/** 足迹分行只需要已收盘行情的末端 Wilder 振幅，不创建指标序列或依赖指标目录。 */
function averageTrueRange(data: readonly KLineData[], period: number): number {
  const first = data[0]!
  let previousClose = first.close
  let total = 0
  let average = 0
  for (let index = 0; index < data.length; index++) {
    const bar = data[index]!
    const range = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    )
    if (index < period) {
      total += range
      if (index === period - 1) average = total / period
    } else {
      average = (average * (period - 1) + range) / period
    }
    previousClose = bar.close
  }
  return average
}
