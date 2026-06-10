import type { KLineData } from '../../types/price'
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
    DEFAULT_MA_PERIODS,
} from './calculators'
import type { IndicatorRuntimeDescriptor } from './indicatorMetadata'
import type { IndicatorConfigSnapshot, IndicatorSeriesBundle } from './workerProtocol'

export const CALCULATOR_MAP: Record<string, (data: KLineData[], config: any) => unknown> = {
    calcCCIData: (data, c) => calcCCIData(data, c.period),
    calcMACDData: (data, c) => calcMACDData(data, c.fastPeriod, c.slowPeriod, c.signalPeriod),
    calcMAData: (data, c) => {
        const r: Record<number, (number | undefined)[]> = {}
        for (const p of DEFAULT_MA_PERIODS) {
            if ((c as any)['ma' + p]) r[p] = calcMAData(data, p)
        }
        return { series: r, enabledPeriods: Object.keys(r).map(Number) }
    },
    calcRSIData: (data, c) => {
        const p = [c.period1, c.period2, c.period3]
        const s = [c.showRSI1, c.showRSI2, c.showRSI3]
        const r: Record<number, (number | undefined)[]> = {}
        for (let i = 0; i < 3; i++) {
            if (s[i]) r[p[i]] = calcRSIData(data, p[i])
        }
        return { series: r, enabledPeriods: Object.keys(r).map(Number) }
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
    calcSARData: (data, c) => calcSARData(data, c.step, c.maxStep),
    calcSuperTrendData: (data, c) => calcSuperTrendData(data, c.atrPeriod, c.multiplier),
    calcKeltnerData: (data, c) => calcKeltnerData(data, c.emaPeriod, c.atrPeriod, c.multiplier),
    calcDonchianData: (data, c) => calcDonchianData(data, c.period),
    calcIchimokuData: (data, c) => calcIchimokuData(data, c.tenkanPeriod, c.kijunPeriod, c.spanBPeriod, c.displacement),
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
    calcStructureData: (data, c) => calcStructureData(data, c.leftWindow, c.rightWindow, c.breakoutSource),
    calcZonesData: (data, c) => calcZonesData(data, c.obLookback, 5, 2, 'close'),
    calcVolumeProfileData: (data, c) => calcVolumeProfileData(data, c.bins, c.lookback, c.valueAreaPercent),
}

export function createWorkerCompute(descriptor: { computeKey: string }): (data: KLineData[], config: any) => unknown {
    return CALCULATOR_MAP[descriptor.computeKey] ?? ((_data: KLineData[], _config: any) => {
        console.warn(`[IndicatorRuntime] Unknown computeKey: ${descriptor.computeKey}`)
        return []
    })
}

export class IndicatorRuntime {
    private currentData: KLineData[] = []
    private dataVersion = 0
    private configVersion = 0
    private dataDirty = true
    private configMap = new Map<string, any>()
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
        const def = typeof d.defaultConfig === 'function'
            ? (d.defaultConfig as () => any)()
            : d.defaultConfig
        this.configMap.set(configKey, { ...def })
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

    setConfig(config: Partial<IndicatorConfigSnapshot>, version: number): void {
        for (const [key, value] of Object.entries(config)) {
            if (value === undefined) continue
            const desc = this.descriptorMap.get(key)
            if (desc) {
                const current = this.configMap.get(key)
                if (!current || !this.shallowEqual(value as Record<string, unknown>, current as Record<string, unknown>)) {
                    this.configMap.set(key, { ...(current ?? {}), ...(value as any) })
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

        const bundle: Record<string, unknown> = { _changed: changed }
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

        return bundle as unknown as IndicatorSeriesBundle
    }
}
