import type { KLineData } from '../../foundation/types/price'

import {
  calcMAData,
  calcBOLLData,
  calcEXPMAData,
  calcENEData,
  calcRSIData,
  calcCCIData,
  calcSTOCHData,
  calcMOMData,
  calcWMSRData,
  calcKSTData,
  calcFASTKData,
  calcMACDData,
  calcATRData,
  calcWMAData,
  calcDEMAData,
  calcTEMAData,
  calcHMAData,
  calcKAMAData,
  calcSMMAData,
  calcTRIMAData,
  calcZLEMAData,
  calcVWMAData,
  calcALMAData,
  calcLSMAData,
  calcDMAData,
  calcGMMAData,
  calcSARData,
  calcSuperTrendData,
  calcKeltnerData,
  calcDonchianData,
  calcIchimokuData,
  calcROCData,
  calcTRIXData,
  calcHVData,
  calcParkinsonData,
  calcChaikinVolData,
  calcVMAData,
  calcOBVData,
  calcPVTData,
  calcVWAPData,
  calcCMFData,
  calcMFIData,
  calcPivotData,
  calcFibData,
  calcStructureData,
  calcZonesData,
  calcVolumeProfileData,
  calcT3Data,
  calcVIDYAData,
  calcFRAMAData,
  calcDPOData,
  calcAwesomeOscillatorData,
  calcUltimateOscillatorData,
  calcStochRSIData,
  calcFisherTransformData,
  calcSchaffTrendCycleData,
  DEFAULT_MA_PERIODS,
} from './calculators'
import type { IndicatorRuntimeDescriptor } from './indicatorMetadata'
import type {
  IndicatorConfig,
  IndicatorConfigSnapshot,
  IndicatorInstanceCalculationInput,
  IndicatorInstanceCalculationResult,
  IndicatorSeriesBundle,
} from './workerProtocol'

export const CALCULATOR_MAP: Record<string, (data: KLineData[], config: any) => unknown> = {
  calcCCIData: (data, c) => calcCCIData(data, c.period),
  calcMACDData: (data, c) => calcMACDData(data, c.fastPeriod, c.slowPeriod, c.signalPeriod),
  calcMAData: (data, c) => {
    const r: Record<number, (number | undefined)[]> = {}
    for (const p of DEFAULT_MA_PERIODS) {
      if ((c as any)['ma' + p]) r[p] = calcMAData(data, p)
    }
    return r
  },
  calcRSIData: (data, c) => {
    const p = [c.period1, c.period2, c.period3]
    const s = [c.showRSI1, c.showRSI2, c.showRSI3]
    const r: Record<number, (number | undefined)[]> = {}
    for (let i = 0; i < 3; i++) {
      if (s[i]) r[p[i]] = calcRSIData(data, p[i])
    }
    return r
  },
  calcTRIXData: (data, c) => calcTRIXData(data, c.period, c.signalPeriod),
  calcBOLLData: (data, c) => calcBOLLData(data, c.period, c.multiplier),
  calcEXPMAData: (data, c) => calcEXPMAData(data, c.fastPeriod, c.slowPeriod),
  calcENEData: (data, c) => calcENEData(data, c.period, c.deviation),
  calcSTOCHData: (data, c) => calcSTOCHData(data, c.n, c.m),
  calcMOMData: (data, c) => calcMOMData(data, c.period),
  calcWMSRData: (data, c) => calcWMSRData(data, c.period),
  calcKSTData: (data, c) => calcKSTData(data, c.roc1, c.roc2, c.roc3, c.roc4, c.signalPeriod),
  calcFASTKData: (data, c) => calcFASTKData(data, c.period),
  calcATRData: (data, c) => calcATRData(data, c.period),
  calcWMAData: (data, c) => calcWMAData(data, c.period),
  calcDEMAData: (data, c) => calcDEMAData(data, c.period),
  calcTEMAData: (data, c) => calcTEMAData(data, c.period),
  calcHMAData: (data, c) => calcHMAData(data, c.period),
  calcKAMAData: (data, c) => calcKAMAData(data, c.period, c.fastPeriod, c.slowPeriod),
  calcSMMAData: (data, c) => calcSMMAData(data, c.period),
  calcTRIMAData: (data, c) => calcTRIMAData(data, c.period),
  calcZLEMAData: (data, c) => calcZLEMAData(data, c.period),
  calcVWMAData: (data, c) => calcVWMAData(data, c.period),
  calcALMAData: (data, c) => calcALMAData(data, c.period, c.offset, c.sigma),
  calcLSMAData: (data, c) => calcLSMAData(data, c.period),
  calcDMAData: (data, c) => calcDMAData(data, c.p1, c.p2, c.p3),
  calcGMMAData: (data) => calcGMMAData(data),
  calcSARData: (data, c) => calcSARData(data, c.step, c.maxStep),
  calcSuperTrendData: (data, c) => calcSuperTrendData(data, c.atrPeriod, c.multiplier),
  calcKeltnerData: (data, c) => calcKeltnerData(data, c.emaPeriod, c.atrPeriod, c.multiplier),
  calcDonchianData: (data, c) => calcDonchianData(data, c.period),
  calcIchimokuData: (data, c) =>
    calcIchimokuData(data, c.tenkanPeriod, c.kijunPeriod, c.spanBPeriod, c.displacement),
  calcROCData: (data, c) => calcROCData(data, c.period),
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
  calcAwesomeOscillatorData: (data, c) => calcAwesomeOscillatorData(data, c.fast, c.slow),
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

export class IndicatorRuntime {
  private currentData: KLineData[] = []
  private dataVersion = 0
  private configVersion = 0
  private dataDirty = true
  private configMap = new Map<string, IndicatorConfig>()
  private seriesMap = new Map<string, unknown>()
  private dirtyFlags = new Map<string, boolean>()
  private descriptorMap = new Map<string, IndicatorRuntimeDescriptor>()

  constructor(descriptors: IndicatorRuntimeDescriptor[] = []) {
    for (const d of descriptors) {
      this.addDescriptor(d)
    }
  }

  addDescriptor(d: IndicatorRuntimeDescriptor): void {
    const configKey = d.configKey ?? 'unknown'
    if (this.descriptorMap.has(configKey)) return
    this.descriptorMap.set(configKey, d)
    const defaultConfig =
      typeof d.defaultConfig === 'function' ? (d.defaultConfig as () => any)() : d.defaultConfig
    this.configMap.set(configKey, { ...(defaultConfig as IndicatorConfig) })
    this.dirtyFlags.set(configKey, true)
  }

  setData(data: KLineData[], version: number): void {
    if (this.dataVersion === version && !this.dataDirty) return
    this.currentData = data
    this.dataVersion = version
    this.dataDirty = true
  }

  private shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (a[key] !== b[key]) return false
    }
    return true
  }

  setConfig(config: IndicatorConfigSnapshot, version: number): void {
    for (const [key, value] of Object.entries(config)) {
      if (value === undefined) continue
      const desc = this.descriptorMap.get(key)
      if (desc) {
        const current = this.configMap.get(key)
        if (
          !current ||
          !this.shallowEqual(value, current)
        ) {
          this.configMap.set(key, { ...(current ?? {}), ...value })
          this.dirtyFlags.set(key, true)
        }
        continue
      }
    }
    this.configVersion = version
  }

  forceDirty(): void {
    this.dataDirty = true
    for (const key of this.dirtyFlags.keys()) {
      this.dirtyFlags.set(key, true)
    }
  }

  getDataVersion(): number {
    return this.dataVersion
  }

  getConfigVersion(): number {
    return this.configVersion
  }

  /** 查找嵌套序列中第一个有定义值的下标，用于表达 warm-up 边界。 */
  private findFirstReadyIndex(value: unknown, dataLength: number): number | null {
    if (Array.isArray(value)) {
      if (value.length !== dataLength) return null
      for (let index = 0; index < value.length; index++) {
        if (value[index] !== undefined && value[index] !== null) return index
      }
      return null
    }
    if (value !== null && typeof value === 'object') {
      let first: number | null = null
      for (const nested of Object.values(value as Record<string, unknown>)) {
        const index = this.findFirstReadyIndex(nested, dataLength)
        if (index !== null && (first === null || index < first)) first = index
      }
      return first
    }
    return null
  }

  /** 按实例参数独立计算结果，不复用按指标类型保存的配置槽位。 */
  computeInstanceSeries(
    instances: ReadonlyArray<IndicatorInstanceCalculationInput>,
  ): IndicatorInstanceCalculationResult[] {
    const results: IndicatorInstanceCalculationResult[] = []
    for (const instance of instances) {
      const descriptor = this.descriptorMap.get(instance.configKey)
      if (!descriptor) continue
      const params = { ...instance.params }
      const series = descriptor.compute(this.currentData, params)
      results.push({
        instanceId: instance.instanceId,
        definitionId: instance.definitionId,
        paneId: instance.paneId,
        params,
        series,
        firstReadyIndex:
          descriptor.outputAlignment === 'aggregate'
            ? null
            : this.findFirstReadyIndex(series, this.currentData.length),
      })
    }
    return results
  }

  computeSeries(): IndicatorSeriesBundle {
    const data = this.currentData
    const changed: string[] = []

    for (const [configKey, desc] of this.descriptorMap) {
      if (this.dataDirty || this.dirtyFlags.get(configKey)) {
        const config = this.configMap.get(configKey)
        this.seriesMap.set(configKey, desc.compute(data, config))
        changed.push(configKey)
      }
    }

    this.dataDirty = false
    for (const key of this.dirtyFlags.keys()) {
      this.dirtyFlags.set(key, false)
    }

    const bundle: Record<string, unknown> & { _changed: string[] } = { _changed: changed }
    for (const [configKey] of this.descriptorMap) {
      const raw = this.seriesMap.get(configKey)
      const params = { ...(this.configMap.get(configKey) ?? {}) }
      const entry: Record<string, unknown> = {}

      if (raw && typeof raw === 'object' && 'series' in (raw as Record<string, unknown>)) {
        Object.assign(entry, raw as Record<string, unknown>)
      } else {
        entry.series = raw
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          entry.enabledPeriods = Object.keys(raw).map(Number)
        }
      }
      entry.params = params
      bundle[configKey] = entry
    }

    return bundle
  }
}
