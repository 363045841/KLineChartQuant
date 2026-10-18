/**
 * 指标计算函数映射。
 *
 * Worker 通过 computeKey 解析到具体 calculator；inline 路径直接使用各指标
 * metadata 的 runtime.compute，不经过本模块。
 */

import type { KLineData } from '../../foundation/types/price.js'

import {
  calcALMAData,
  calcChaikinVolData,
  calcCMFData,
  calcFibData,
  calcFisherTransformData,
  calcFRAMAData,
  calcHVData,
  calcKAMAData,
  calcLSMAData,
  calcMFIData,
  calcOBVData,
  calcParkinsonData,
  calcPVTData,
  calcSARData,
  calcSchaffTrendCycleData,
  calcSMMAData,
  calcStochRSIData,
  calcStructureData,
  calcTRIXData,
  calcUltimateOscillatorData,
  calcVIDYAData,
  calcVolumeProfileData,
  calcVWAPData,
  calcZLEMAData,
  calcZonesData,
} from './calculators/index.js'

/** Worker 端 computeKey → calculator 的映射。 */
const CALCULATOR_MAP: Record<string, (data: KLineData[], config: any) => unknown> = {
  calcTRIXData: (data, c) => calcTRIXData(data, c.period, c.signalPeriod),
  calcKAMAData: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  calcSMMAData: (data, c) => calcSMMAData(data, c.period),
  calcZLEMAData: (data, c) => calcZLEMAData(data, c.period),
  calcALMAData: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  calcLSMAData: (data, c) => calcLSMAData(data, c.period),
  calcSARData: (data, c) => calcSARData(data, c.step, c.maxStep),
  calcHVData: (data, c) => calcHVData(data, c.period, c.annualizationFactor),
  calcParkinsonData: (data, c) => calcParkinsonData(data, c.period, c.annualizationFactor),
  calcChaikinVolData: (data, c) => calcChaikinVolData(data, c.emaPeriod, c.rocPeriod),
  calcOBVData: (data, c) => calcOBVData(data),
  calcPVTData: (data, c) => calcPVTData(data),
  calcVWAPData: (data, c) => calcVWAPData(data, c.sessionResetGapMs),
  calcCMFData: (data, c) => calcCMFData(data, c.period),
  calcMFIData: (data, c) => calcMFIData(data, c.period),
  calcFibData: (data, c) => calcFibData(data, c.period),
  calcStructureData: (data, c) =>
    calcStructureData(data, c.leftWindow, c.rightWindow, c.breakoutSource),
  calcZonesData: (data, c) => calcZonesData(data, c.obLookback, 5, 2, 'close'),
  calcVolumeProfileData: (data, c) =>
    calcVolumeProfileData(data, c.bins, c.lookback, c.valueAreaPercent),
  calcVIDYAData: (data, c) => calcVIDYAData(data, c.period, c.cmoPeriod),
  calcFRAMAData: (data, c) => calcFRAMAData(data, c.period),
  calcUltimateOscillatorData: (data, c) => calcUltimateOscillatorData(data, c.p1, c.p2, c.p3),
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
