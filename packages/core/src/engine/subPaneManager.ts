import type { Chart } from './chart'
import type { SubIndicatorType } from './renderers/Indicator'
import { createSignal, type Signal } from '../reactivity/signal'
import { createSubIndicatorRenderer } from './renderers/Indicator'
import { createPaneTitleRendererPlugin } from './renderers/paneTitle'
import { createVolumeScaleRendererPlugin } from './renderers/Indicator/scale/volume_scale'
import { createMacdScaleRendererPlugin } from './renderers/Indicator/scale/macd_scale'
import { createRsiScaleRendererPlugin } from './renderers/Indicator/scale/rsi_scale'
import { createCciScaleRendererPlugin } from './renderers/Indicator/scale/cci_scale'
import { createStochScaleRendererPlugin } from './renderers/Indicator/scale/stoch_scale'
import { createMomScaleRendererPlugin } from './renderers/Indicator/scale/mom_scale'
import { createWmsrScaleRendererPlugin } from './renderers/Indicator/scale/wmsr_scale'
import { createKstScaleRendererPlugin } from './renderers/Indicator/scale/kst_scale'
import { createFastkScaleRendererPlugin } from './renderers/Indicator/scale/fastk_scale'
import { createAtrScaleRendererPlugin } from './renderers/Indicator/scale/atr_scale'
import { createIndicatorScaleRendererPlugin } from './renderers/Indicator/scale/indicator_scale'
import type {
    RSISchedulerConfig,
    CCISchedulerConfig,
    STOCHSchedulerConfig,
    MOMSchedulerConfig,
    WMSRSchedulerConfig,
    KSTSchedulerConfig,
    FASTKSchedulerConfig,
    ATRSchedulerConfig,
    WMASchedulerConfig,
    DEMASchedulerConfig,
    TEMASchedulerConfig,
    HMASchedulerConfig,
    KAMASchedulerConfig,
    SARSchedulerConfig,
    SuperTrendSchedulerConfig,
    KeltnerSchedulerConfig,
    DonchianSchedulerConfig,
    IchimokuSchedulerConfig,
    ROCSchedulerConfig,
    TRIXSchedulerConfig,
    HVSchedulerConfig,
    ParkinsonSchedulerConfig,
    ChaikinVolSchedulerConfig,
    VMASchedulerConfig,
    OBVSchedulerConfig,
    PVTSchedulerConfig,
    VWAPSchedulerConfig,
    CMFSchedulerConfig,
    MFISchedulerConfig,
    PivotSchedulerConfig,
    FibSchedulerConfig,
    StructureSchedulerConfig,
    ZonesSchedulerConfig,
    VolumeProfileSchedulerConfig,
} from './indicators/scheduler'
import type { MACDSchedulerConfig } from './indicators/macdState'

export interface SubPaneEntry {
    paneId: string
    indicatorId: SubIndicatorType
    params: Record<string, unknown>
    rendererName: string
    scaleRendererName: string
    paneTitleRendererName: string
}

export class SubPaneManager {
    private entries = new Map<string, SubPaneEntry>()
    private _entriesSignal = createSignal<ReadonlyArray<SubPaneEntry>>([])

    get entriesSignal(): Signal<ReadonlyArray<SubPaneEntry>> {
        return this._entriesSignal
    }

    private syncEntriesSignal(): void {
        this._entriesSignal.set(this.getAll())
    }

    create(chart: Chart, paneId: string, indicatorId: SubIndicatorType, params: Record<string, unknown>): boolean {
        if (this.entries.has(paneId)) {
            return true
        }

        const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
        const scaleRendererName = `${indicatorId.toLowerCase()}_scale_${paneId}`
        const paneTitleRendererName = `paneTitle_${paneId}`

        const paneExists = chart.hasPane(paneId)
        if (!paneExists) {
            chart.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const existingRenderer = chart.getRenderer(rendererName)
        if (!existingRenderer) {
            const renderer = createSubIndicatorRenderer({ indicatorId, paneId })
            chart.useRenderer(renderer, params as Record<string, number | boolean | string>)
        }

        this.mountScaleRenderer(chart, paneId, indicatorId, scaleRendererName)
        this.mountPaneTitleRenderer(chart, paneId, indicatorId, params)

        // 必须在 syncSchedulerConfig 之前注册 entry，
        // 否则 scheduler 的 buildActiveConfig 读不到新 paneId，会将新指标的 show* 标志置为 false
        this.entries.set(paneId, { paneId, indicatorId, params, rendererName, scaleRendererName, paneTitleRendererName })

        this.syncSchedulerConfig(chart, paneId, indicatorId, params)

        chart.getIndicatorScheduler().onSubPaneChanged()

        this.syncEntriesSignal()
        return true
    }

    remove(chart: Chart, paneId: string): void {
        const entry = this.entries.get(paneId)
        if (!entry) return

        chart.removeRenderer(entry.rendererName)
        chart.removeRenderer(entry.scaleRendererName)
        chart.removeRenderer(entry.paneTitleRendererName)

        this.entries.delete(paneId)

        if (chart.hasPane(paneId)) {
            chart.removePaneDefinition(paneId)
        }

        chart.getIndicatorScheduler().onSubPaneChanged()
        this.syncEntriesSignal()
    }

    replaceIndicator(chart: Chart, paneId: string, newIndicatorId: SubIndicatorType, newParams: Record<string, unknown>): void {
        const entry = this.entries.get(paneId)
        if (!entry) return

        const oldIndicatorId = entry.indicatorId

        chart.removeRenderer(entry.rendererName)
        chart.removeRenderer(entry.scaleRendererName)
        chart.removeRenderer(entry.paneTitleRendererName)

        const newRendererName = `${newIndicatorId.toLowerCase()}_${paneId}`
        const newScaleRendererName = `${newIndicatorId.toLowerCase()}_scale_${paneId}`
        const newPaneTitleRendererName = `paneTitle_${paneId}`

        const renderer = createSubIndicatorRenderer({ indicatorId: newIndicatorId, paneId })
        chart.useRenderer(renderer, newParams as Record<string, number | boolean | string>)

        this.mountScaleRenderer(chart, paneId, newIndicatorId, newScaleRendererName)
        this.mountPaneTitleRenderer(chart, paneId, newIndicatorId, newParams)

        this.syncSchedulerConfig(chart, paneId, newIndicatorId, newParams)

        this.entries.set(paneId, {
            paneId,
            indicatorId: newIndicatorId,
            params: newParams,
            rendererName: newRendererName,
            scaleRendererName: newScaleRendererName,
            paneTitleRendererName: newPaneTitleRendererName,
        })

        chart.getIndicatorScheduler().onSubPaneChanged()
        this.syncEntriesSignal()
    }

    updateParams(chart: Chart, paneId: string, params: Record<string, unknown>): void {
        const entry = this.entries.get(paneId)
        if (!entry) return

        entry.params = { ...params }

        chart.updateRendererConfig(entry.rendererName, params)

        this.syncSchedulerConfig(chart, paneId, entry.indicatorId, entry.params)
        this.syncEntriesSignal()
    }

    getByPaneId(paneId: string): SubPaneEntry | undefined {
        return this.entries.get(paneId)
    }

    getAll(): SubPaneEntry[] {
        return Array.from(this.entries.values())
    }

    getPaneIds(): string[] {
        return Array.from(this.entries.keys())
    }

    clear(chart: Chart): void {
        for (const entry of this.entries.values()) {
            chart.removeRenderer(entry.rendererName)
            chart.removeRenderer(entry.scaleRendererName)
            chart.removeRenderer(entry.paneTitleRendererName)
        }
        this.entries.clear()
        chart.getIndicatorScheduler().onSubPaneChanged()
        this.syncEntriesSignal()
    }

    private syncSchedulerConfig(
        chart: Chart,
        paneId: string,
        indicatorId: SubIndicatorType,
        params: Record<string, unknown>,
    ): void {
        const scheduler = chart.getIndicatorScheduler()
        switch (indicatorId) {
            case 'MACD':
                scheduler.updateMACDConfig(params as Partial<MACDSchedulerConfig>, paneId)
                break
            case 'RSI':
                scheduler.updateRSIConfig(params as Partial<RSISchedulerConfig>, paneId)
                break
            case 'CCI':
                scheduler.updateCCIConfig(params as Partial<CCISchedulerConfig>, paneId)
                break
            case 'STOCH':
                scheduler.updateSTOCHConfig(params as Partial<STOCHSchedulerConfig>, paneId)
                break
            case 'MOM':
                scheduler.updateMOMConfig(params as Partial<MOMSchedulerConfig>, paneId)
                break
            case 'WMSR':
                scheduler.updateWMSRConfig(params as Partial<WMSRSchedulerConfig>, paneId)
                break
            case 'KST':
                scheduler.updateKSTConfig(params as Partial<KSTSchedulerConfig>, paneId)
                break
            case 'FASTK':
                scheduler.updateFASTKConfig(params as Partial<FASTKSchedulerConfig>, paneId)
                break
            case 'ATR':
                console.log(`[ATR-SubPane] syncSchedulerConfig: paneId=${paneId} params=${JSON.stringify(params)}`)
                scheduler.updateATRConfig(params as Partial<ATRSchedulerConfig>, paneId)
                break
            case 'WMA':
                scheduler.updateWMAConfig(params as Partial<WMASchedulerConfig>, paneId)
                break
            case 'DEMA':
                scheduler.updateDEMAConfig(params as Partial<DEMASchedulerConfig>, paneId)
                break
            case 'TEMA':
                scheduler.updateTEMAConfig(params as Partial<TEMASchedulerConfig>, paneId)
                break
            case 'HMA':
                scheduler.updateHMAConfig(params as Partial<HMASchedulerConfig>, paneId)
                break
            case 'KAMA':
                scheduler.updateKAMAConfig(params as Partial<KAMASchedulerConfig>, paneId)
                break
            case 'SAR':
                scheduler.updateSARConfig(params as Partial<SARSchedulerConfig>, paneId)
                break
            case 'SUPERTREND':
                scheduler.updateSuperTrendConfig(params as Partial<SuperTrendSchedulerConfig>, paneId)
                break
            case 'KELTNER':
                scheduler.updateKeltnerConfig(params as Partial<KeltnerSchedulerConfig>, paneId)
                break
            case 'DONCHIAN':
                scheduler.updateDonchianConfig(params as Partial<DonchianSchedulerConfig>, paneId)
                break
            case 'ICHIMOKU':
                scheduler.updateIchimokuConfig(params as Partial<IchimokuSchedulerConfig>, paneId)
                break
            case 'ROC':
                scheduler.updateROCConfig(params as Partial<ROCSchedulerConfig>, paneId)
                break
            case 'TRIX':
                scheduler.updateTRIXConfig(params as Partial<TRIXSchedulerConfig>, paneId)
                break
            case 'HV':
                scheduler.updateHVConfig(params as Partial<HVSchedulerConfig>, paneId)
                break
            case 'PARKINSON':
                scheduler.updateParkinsonConfig(params as Partial<ParkinsonSchedulerConfig>, paneId)
                break
            case 'CHAIKIN_VOL':
                scheduler.updateChaikinVolConfig(params as Partial<ChaikinVolSchedulerConfig>, paneId)
                break
            case 'VMA':
                scheduler.updateVMAConfig(params as Partial<VMASchedulerConfig>, paneId)
                break
            case 'OBV':
                scheduler.updateOBVConfig(params as Partial<OBVSchedulerConfig>, paneId)
                break
            case 'PVT':
                scheduler.updatePVTConfig(params as Partial<PVTSchedulerConfig>, paneId)
                break
            case 'VWAP':
                scheduler.updateVWAPConfig(params as Partial<VWAPSchedulerConfig>, paneId)
                break
            case 'CMF':
                scheduler.updateCMFConfig(params as Partial<CMFSchedulerConfig>, paneId)
                break
            case 'MFI':
                scheduler.updateMFIConfig(params as Partial<MFISchedulerConfig>, paneId)
                break
            case 'PIVOT':
                scheduler.updatePivotConfig(params as Partial<PivotSchedulerConfig>, paneId)
                break
            case 'FIB':
                scheduler.updateFibConfig(params as Partial<FibSchedulerConfig>, paneId)
                break
            case 'STRUCTURE':
                scheduler.updateStructureConfig(params as Partial<StructureSchedulerConfig>, paneId)
                break
            case 'ZONES':
                scheduler.updateZonesConfig(params as Partial<ZonesSchedulerConfig>, paneId)
                break
            case 'VOLUME_PROFILE':
                scheduler.updateVolumeProfileConfig(params as Partial<VolumeProfileSchedulerConfig>, paneId)
                break
            case 'VOLUME':
                break
        }
    }

    private mountScaleRenderer(chart: Chart, paneId: string, indicatorId: SubIndicatorType, scaleRendererName: string): void {
        const existing = chart.getRenderer(scaleRendererName)
        if (existing) return

        const axisWidth = chart.getOption().rightAxisWidth + (chart.getOption().priceLabelWidth ?? 60)
        const yPaddingPx = chart.getOption().yPaddingPx
        const getCrosshair = () => {
            const pos = chart.interaction.crosshairPos
            const price = chart.interaction.crosshairPrice
            const activePaneId = chart.interaction.activePaneId
            if (pos && price !== null) {
                return { y: pos.y, price, activePaneId }
            }
            return null
        }

        const opts = { axisWidth, paneId, yPaddingPx, getCrosshair }

        let renderer: import('../plugin').RendererPluginWithHost
        switch (indicatorId) {
            case 'VOLUME':
                renderer = createVolumeScaleRendererPlugin(opts)
                break
            case 'MACD':
                renderer = createMacdScaleRendererPlugin(opts)
                break
            case 'RSI':
                renderer = createRsiScaleRendererPlugin(opts)
                break
            case 'CCI':
                renderer = createCciScaleRendererPlugin(opts)
                break
            case 'STOCH':
                renderer = createStochScaleRendererPlugin(opts)
                break
            case 'MOM':
                renderer = createMomScaleRendererPlugin(opts)
                break
            case 'WMSR':
                renderer = createWmsrScaleRendererPlugin(opts)
                break
            case 'KST':
                renderer = createKstScaleRendererPlugin(opts)
                break
            case 'FASTK':
                renderer = createFastkScaleRendererPlugin(opts)
                break
            case 'ATR':
                renderer = createAtrScaleRendererPlugin(opts)
                break
            case 'WMA':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'wma', label: 'WMA', decimals: 2 })
                break
            case 'DEMA':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'dema', label: 'DEMA', decimals: 2 })
                break
            case 'TEMA':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'tema', label: 'TEMA', decimals: 2 })
                break
            case 'HMA':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'hma', label: 'HMA', decimals: 2 })
                break
            case 'KAMA':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'kama', label: 'KAMA', decimals: 2 })
                break
            case 'SAR':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'sar', label: 'SAR', decimals: 4 })
                break
            case 'SUPERTREND':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'supertrend', label: 'SuperTrend', decimals: 2 })
                break
            case 'KELTNER':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'keltner', label: 'Keltner', decimals: 2 })
                break
            case 'DONCHIAN':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'donchian', label: 'Donchian', decimals: 2 })
                break
            case 'ICHIMOKU':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'ichimoku', label: 'Ichimoku', decimals: 2 })
                break
            case 'ROC':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'roc', label: 'ROC', decimals: 2 })
                break
            case 'TRIX':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'trix', label: 'TRIX', decimals: 6 })
                break
            case 'HV':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'hv', label: 'HV', decimals: 2 })
                break
            case 'PARKINSON':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'parkinson', label: 'Parkinson', decimals: 2 })
                break
            case 'CHAIKIN_VOL':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'chaikinVol', label: 'ChaikinVol', decimals: 2 })
                break
            case 'VMA':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'vma', label: 'VMA', decimals: 0 })
                break
            case 'OBV':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'obv', label: 'OBV', decimals: 0 })
                break
            case 'PVT':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'pvt', label: 'PVT', decimals: 0 })
                break
            case 'VWAP':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'vwap', label: 'VWAP', decimals: 2 })
                break
            case 'CMF':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'cmf', label: 'CMF', decimals: 4 })
                break
            case 'MFI':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'mfi', label: 'MFI', decimals: 2 })
                break
            case 'PIVOT':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'pivot', label: 'Pivot', decimals: 2 })
                break
            case 'FIB':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'fib', label: 'Fib', decimals: 4 })
                break
            case 'STRUCTURE':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'structure', label: 'Structure', decimals: 2 })
                break
            case 'ZONES':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'zones', label: 'Zones', decimals: 2 })
                break
            case 'VOLUME_PROFILE':
                renderer = createIndicatorScaleRendererPlugin({ ...opts, indicatorKey: 'volumeProfile', label: 'VP', decimals: 0 })
                break
            default:
                return
        }

        chart.useRenderer(renderer)
    }

    private mountPaneTitleRenderer(chart: Chart, paneId: string, indicatorId: SubIndicatorType, params: Record<string, unknown>): void {
        const rendererName = `paneTitle_${paneId}`
        const existing = chart.getRenderer(rendererName)
        if (existing) {
            chart.updateRendererConfig(rendererName, { params, indicatorId })
            return
        }

        const renderer = createPaneTitleRendererPlugin({
            paneId,
            title: indicatorId,
            indicatorId,
            params,
        })
        chart.useRenderer(renderer)
    }
}
