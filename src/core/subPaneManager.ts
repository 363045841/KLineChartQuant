import type { Chart } from './chart'
import type { SubIndicatorType } from '@/core/renderers/Indicator'
import { createSubIndicatorRenderer } from '@/core/renderers/Indicator'
import { createVolumeScaleRendererPlugin } from '@/core/renderers/Indicator/scale/volume_scale'
import { createMacdScaleRendererPlugin } from '@/core/renderers/Indicator/scale/macd_scale'
import { createRsiScaleRendererPlugin } from '@/core/renderers/Indicator/scale/rsi_scale'
import { createCciScaleRendererPlugin } from '@/core/renderers/Indicator/scale/cci_scale'
import { createStochScaleRendererPlugin } from '@/core/renderers/Indicator/scale/stoch_scale'
import { createMomScaleRendererPlugin } from '@/core/renderers/Indicator/scale/mom_scale'
import { createWmsrScaleRendererPlugin } from '@/core/renderers/Indicator/scale/wmsr_scale'
import { createKstScaleRendererPlugin } from '@/core/renderers/Indicator/scale/kst_scale'
import { createFastkScaleRendererPlugin } from '@/core/renderers/Indicator/scale/fastk_scale'
import { createAtrScaleRendererPlugin } from '@/core/renderers/Indicator/scale/atr_scale'
import type {
    RSISchedulerConfig,
    CCISchedulerConfig,
    STOCHSchedulerConfig,
    MOMSchedulerConfig,
    WMSRSchedulerConfig,
    KSTSchedulerConfig,
    FASTKSchedulerConfig,
    ATRSchedulerConfig,
} from '@/core/indicators/scheduler'
import type { MACDSchedulerConfig } from '@/core/indicators/macdState'

export interface SubPaneEntry {
    paneId: string
    indicatorId: SubIndicatorType
    params: Record<string, unknown>
    rendererName: string
    scaleRendererName: string
}

export class SubPaneManager {
    private entries = new Map<string, SubPaneEntry>()

    create(chart: Chart, paneId: string, indicatorId: SubIndicatorType, params: Record<string, unknown>): boolean {
        if (this.entries.has(paneId)) {
            return true
        }

        const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
        const scaleRendererName = `${indicatorId.toLowerCase()}_scale_${paneId}`

        const paneExists = chart.hasPane(paneId)
        if (!paneExists) {
            chart.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const existingRenderer = chart.getRenderer(rendererName)
        if (!existingRenderer) {
            const renderer = createSubIndicatorRenderer({ indicatorId, paneId })
            chart.useRenderer(renderer, params as Record<string, number | boolean>)
        }

        this.mountScaleRenderer(chart, paneId, indicatorId, scaleRendererName)

        // 必须在 syncSchedulerConfig 之前注册 entry，
        // 否则 scheduler 的 buildActiveConfig 读不到新 paneId，会将新指标的 show* 标志置为 false
        this.entries.set(paneId, { paneId, indicatorId, params, rendererName, scaleRendererName })

        this.syncSchedulerConfig(chart, paneId, indicatorId, params)

        chart.getIndicatorScheduler().onSubPaneChanged()

        return true
    }

    remove(chart: Chart, paneId: string): void {
        const entry = this.entries.get(paneId)
        if (!entry) return

        chart.removeRenderer(entry.rendererName)
        chart.removeRenderer(entry.scaleRendererName)

        this.entries.delete(paneId)

        if (chart.hasPane(paneId)) {
            chart.removePaneDefinition(paneId)
        }

        chart.getIndicatorScheduler().onSubPaneChanged()
    }

    replaceIndicator(chart: Chart, paneId: string, newIndicatorId: SubIndicatorType, newParams: Record<string, unknown>): void {
        const entry = this.entries.get(paneId)
        if (!entry) return

        const oldIndicatorId = entry.indicatorId

        chart.removeRenderer(entry.rendererName)
        chart.removeRenderer(entry.scaleRendererName)

        const newRendererName = `${newIndicatorId.toLowerCase()}_${paneId}`
        const newScaleRendererName = `${newIndicatorId.toLowerCase()}_scale_${paneId}`

        const renderer = createSubIndicatorRenderer({ indicatorId: newIndicatorId, paneId })
        chart.useRenderer(renderer, newParams as Record<string, number | boolean>)

        this.mountScaleRenderer(chart, paneId, newIndicatorId, newScaleRendererName)

        this.syncSchedulerConfig(chart, paneId, newIndicatorId, newParams)

        this.entries.set(paneId, {
            paneId,
            indicatorId: newIndicatorId,
            params: newParams,
            rendererName: newRendererName,
            scaleRendererName: newScaleRendererName,
        })

        chart.getIndicatorScheduler().onSubPaneChanged()
    }

    updateParams(chart: Chart, paneId: string, params: Record<string, unknown>): void {
        const entry = this.entries.get(paneId)
        if (!entry) return

        entry.params = { ...params }

        chart.updateRendererConfig(entry.rendererName, params)

        this.syncSchedulerConfig(chart, paneId, entry.indicatorId, entry.params)
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
        }
        this.entries.clear()
        chart.getIndicatorScheduler().onSubPaneChanged()
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

        let renderer: import('@/plugin').RendererPluginWithHost
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
            default:
                return
        }

        chart.useRenderer(renderer)
    }
}
