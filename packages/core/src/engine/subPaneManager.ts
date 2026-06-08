import type { Chart } from './chart'
import type { SubIndicatorType } from './renderers/Indicator'
import { createSignal, type Signal } from '../reactivity/signal'
import { createSubIndicatorRenderer } from './renderers/Indicator'
import { createPaneTitleRendererPlugin } from './renderers/paneTitle'
import { createIndicatorScaleRendererPlugin } from './renderers/Indicator/scale/indicator_scale'

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

        const scaleRendererName = `${indicatorId.toLowerCase()}_scale_${paneId}`
        const paneTitleRendererName = `paneTitle_${paneId}`
        const renderer = this.createIndicatorRenderer(chart, paneId, indicatorId, params)
        if (!renderer) return false
        const rendererName = renderer.name

        const paneExists = chart.hasPane(paneId)
        if (!paneExists) {
            chart.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const existingRenderer = chart.getRenderer(rendererName)
        if (!existingRenderer) {
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

        const newScaleRendererName = `${newIndicatorId.toLowerCase()}_scale_${paneId}`
        const newPaneTitleRendererName = `paneTitle_${paneId}`
        const renderer = this.createIndicatorRenderer(chart, paneId, newIndicatorId, newParams)
        if (!renderer) return
        const newRendererName = renderer.name

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

    private createIndicatorRenderer(
        chart: Chart,
        paneId: string,
        indicatorId: SubIndicatorType,
        params: Record<string, unknown>,
    ): import('../plugin').RendererPlugin {
        const definition = chart.getIndicatorScheduler().getIndicatorMetadata(indicatorId)
        if (!definition) {
            throw new Error(`[SubPaneManager] Unknown indicator: ${indicatorId}`)
        }
        return createSubIndicatorRenderer({ indicatorId, paneId, definition, params })
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
        const definition = scheduler.getIndicatorMetadata(indicatorId)
        definition?.updateConfig?.(scheduler, params, paneId)
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

        const definition = chart.getIndicatorScheduler().getIndicatorMetadata(indicatorId)
        if (definition?.scaleRendererFactory) {
            chart.useRenderer(definition.scaleRendererFactory({ ...opts, indicatorId }))
            return
        }

        if (definition?.scale) {
            chart.useRenderer(createIndicatorScaleRendererPlugin({
                ...opts,
                indicatorKey: definition.scale.indicatorKey ?? definition.name,
                label: definition.scale.label ?? definition.displayName,
                decimals: definition.scale.decimals,
            }))
            return
        }
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
