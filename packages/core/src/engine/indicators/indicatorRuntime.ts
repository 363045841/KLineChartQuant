/**
 * 指标计算函数映射。
 *
 * Worker 通过 computeKey 解析到具体 calculator；inline 路径直接使用各指标
 * metadata 的 runtime.compute，不经过本模块。
 */

import type { KLineData } from '../../foundation/types/price.js'

import {
  calcALMAData,
  calcFibData,
  calcFisherTransformData,
  calcFRAMAData,
  calcKAMAData,
  calcLSMAData,
  calcSchaffTrendCycleData,
  calcSMMAData,
  calcStochRSIData,
  calcStructureData,
  calcVIDYAData,
  calcVolumeProfileData,
  calcZLEMAData,
  calcZonesData,
} from './calculators/index.js'

/** Worker 端 computeKey → calculator 的映射。 */
const CALCULATOR_MAP: Record<string, (data: KLineData[], config: any) => unknown> = {
  calcKAMAData: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  calcSMMAData: (data, c) => calcSMMAData(data, c.period),
  calcZLEMAData: (data, c) => calcZLEMAData(data, c.period),
  calcALMAData: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  calcLSMAData: (data, c) => calcLSMAData(data, c.period),
  calcFibData: (data, c) => calcFibData(data, c.period),
  calcStructureData: (data, c) =>
    calcStructureData(data, c.leftWindow, c.rightWindow, c.breakoutSource),
  calcZonesData: (data, c) => calcZonesData(data, c.obLookback, 5, 2, 'close'),
  calcVolumeProfileData: (data, c) =>
    calcVolumeProfileData(data, c.bins, c.lookback, c.valueAreaPercent),
  calcVIDYAData: (data, c) => calcVIDYAData(data, c.period, c.cmoPeriod),
  calcFRAMAData: (data, c) => calcFRAMAData(data, c.period),
  calcStochRSIData: (data, c) => calcStochRSIData(data, c.period, c.kPeriod, c.dPeriod),
  calcFisherTransformData: (data, c) => calcFisherTransformData(data, c.period),
  calcSchaffTrendCycleData: (data, c) =>
    calcSchaffTrendCycleData(data, c.fast, c.slow, c.cycle, c.factor),
}

export function createWorkerCompute(descriptor: {
  computeKey: string
}): (data: KLineData[], config: any) => unknown {
  return (
    CALCULATOR_MAP[descriptor.computeKey] ??
    ((_data: KLineData[], _config: any) => {
      console.warn(`[IndicatorRuntime] Unknown computeKey: ${descriptor.computeKey}`)
      return []
    })
  )
}
