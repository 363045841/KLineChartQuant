/**
 * 指标计算函数映射。
 *
 * Worker 通过 computeKey 解析到具体 calculator；inline 路径直接使用各指标
 * metadata 的 runtime.compute，不经过本模块。
 */

import type { KLineData } from '../../foundation/types/price.js'

import {
  calcALMAData,
  calcATRData,
  calcChaikinVolData,
  calcCMFData,
  calcDEMAData,
  calcDPOData,
  calcENEData,
  calcEXPMAData,
  calcFibData,
  calcFisherTransformData,
  calcFRAMAData,
  calcGMMAData,
  calcHVData,
  calcIchimokuData,
  calcKAMAData,
  calcKeltnerData,
  calcLSMAData,
  calcMAData,
  calcMFIData,
  calcOBVData,
  calcParkinsonData,
  calcPivotData,
  calcPVTData,
  calcSARData,
  calcSchaffTrendCycleData,
  calcSMMAData,
  calcStochRSIData,
  calcStructureData,
  calcT3Data,
  calcTEMAData,
  calcTRIMAData,
  calcTRIXData,
  calcUltimateOscillatorData,
  calcVIDYAData,
  calcVMAData,
  calcVolumeProfileData,
  calcVWAPData,
  calcVWMAData,
  calcZLEMAData,
  calcZonesData,
  DEFAULT_MA_PERIODS,
} from './calculators/index.js'

/** Worker 端 computeKey → calculator 的映射。 */
const CALCULATOR_MAP: Record<string, (data: KLineData[], config: any) => unknown> = {
  calcMAData: (data, c) => {
    const r: Record<number, (number | undefined)[]> = {}
    const periods = Object.values(c).filter(
      (period): period is number => typeof period === 'number',
    )
    for (const period of periods.length > 0 ? periods : DEFAULT_MA_PERIODS) {
      r[period] = calcMAData(data, period)
    }
    return r
  },
  calcTRIXData: (data, c) => calcTRIXData(data, c.period, c.signalPeriod),
  calcEXPMAData: (data, c) => calcEXPMAData(data, c.fastPeriod, c.slowPeriod),
  calcENEData: (data, c) => calcENEData(data, c.period, c.deviation),
  calcATRData: (data, c) => calcATRData(data, c.period),
  calcDEMAData: (data, c) => calcDEMAData(data, c.period),
  calcTEMAData: (data, c) => calcTEMAData(data, c.period),
  calcKAMAData: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  calcSMMAData: (data, c) => calcSMMAData(data, c.period),
  calcTRIMAData: (data, c) => calcTRIMAData(data, c.period),
  calcZLEMAData: (data, c) => calcZLEMAData(data, c.period),
  calcVWMAData: (data, c) => calcVWMAData(data, c.period),
  calcALMAData: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  calcLSMAData: (data, c) => calcLSMAData(data, c.period),
  calcGMMAData: (data) => calcGMMAData(data),
  calcSARData: (data, c) => calcSARData(data, c.step, c.maxStep),
  calcKeltnerData: (data, c) => calcKeltnerData(data, c.emaPeriod, c.atrPeriod, c.multiplier),
  calcIchimokuData: (data, c) =>
    calcIchimokuData(data, c.tenkanPeriod, c.kijunPeriod, c.spanBPeriod, c.displacement),
  calcHVData: (data, c) => calcHVData(data, c.period, c.annualizationFactor),
  calcParkinsonData: (data, c) => calcParkinsonData(data, c.period, c.annualizationFactor),
  calcChaikinVolData: (data, c) => calcChaikinVolData(data, c.emaPeriod, c.rocPeriod),
  calcVMAData: (data, c) => calcVMAData(data, c.period),
  calcOBVData: (data, c) => calcOBVData(data),
  calcPVTData: (data, c) => calcPVTData(data),
  calcVWAPData: (data, c) => calcVWAPData(data, c.sessionResetGapMs),
  calcCMFData: (data, c) => calcCMFData(data, c.period),
  calcMFIData: (data, c) => calcMFIData(data, c.period),
  calcPivotData: (data, c) => calcPivotData(data),
  calcFibData: (data, c) => calcFibData(data, c.period),
  calcStructureData: (data, c) =>
    calcStructureData(data, c.leftWindow, c.rightWindow, c.breakoutSource),
  calcZonesData: (data, c) => calcZonesData(data, c.obLookback, 5, 2, 'close'),
  calcVolumeProfileData: (data, c) =>
    calcVolumeProfileData(data, c.bins, c.lookback, c.valueAreaPercent),
  calcT3Data: (data, c) => calcT3Data(data, c.period, c.volumeFactor),
  calcVIDYAData: (data, c) => calcVIDYAData(data, c.period, c.cmoPeriod),
  calcFRAMAData: (data, c) => calcFRAMAData(data, c.period),
  calcDPOData: (data, c) => calcDPOData(data, c.period),
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
