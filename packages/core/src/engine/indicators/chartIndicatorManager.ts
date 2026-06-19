import type { KLineData } from '../../types/price'
import { createSignal, computed, type Signal, type Computed } from '../../reactivity/signal'
import type { IndicatorInstance, SubPaneInfo, PaneSpec, ChartOptions } from '../chartTypes'
import type { VisibleRange } from '../layout/pane'
import { UpdateLevel } from '../layout/pane'
import { IndicatorScheduler } from './scheduler'
import { getBuiltinIndicatorDefinitions } from './registerBuiltins'
import { getRegisteredIndicatorDefinitions } from './indicatorDefinitionRegistry'
import { SubPaneManager, type SubPaneEntry, type SubPaneContext } from '../subPaneManager'
import { createSubIndicatorRenderer, type SubIndicatorType } from '../renderers/Indicator'
import { createMainIndicatorLegendRendererPlugin } from '../renderers/Indicator/mainIndicatorLegend'
import type {
    PluginHostImpl,
    RendererPlugin,
    RendererPluginWithHost,
} from '../../plugin'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
    kWidth: number
    kGap: number
}

/** 主图指标条目，存在 = 激活 */
interface MainIndicatorEntry {
    params: Record<string, number | boolean | string>
}

export interface IndicatorDependencies {
    getOption: () => ResolvedChartOptions
    getPluginHost: () => PluginHostImpl
    getRenderer: <T extends RendererPlugin = RendererPlugin>(name: string) => T | undefined
    useRenderer: (plugin: RendererPlugin | RendererPluginWithHost, config?: Record<string, unknown>) => void
    removeRenderer: (name: string) => void
    updateRendererConfig: (name: string, config: Record<string, unknown>) => void
    setRendererEnabled: (name: string, enabled: boolean) => void
    hasPane: (paneId: string) => boolean
    upsertPane: (def: PaneSpec) => void
    removePaneDefinition: (paneId: string) => void
    getPaneSpecs: () => PaneSpec[]
    getPaneRatiosSignal: () => Signal<Readonly<Record<string, number>>>
    getInternalPaneRatios: () => Map<string, number>
    setInternalPaneRatio: (paneId: string, ratio: number) => void
    deleteInternalPaneRatio: (paneId: string) => void
    applyPaneLayoutSpecs: (specs: PaneSpec[]) => void
    getLastVisibleRange: () => VisibleRange
    getCrosshairPos: () => { x: number; y: number } | null
    getCrosshairPrice: () => number | null
    getActivePaneId: () => string | null
    scheduleDraw: (level?: UpdateLevel) => void
    setPendingIndicatorDataUpdate: (v: boolean) => void
}

export class ChartIndicatorManager {
    private deps: IndicatorDependencies
    private indicatorScheduler: IndicatorScheduler
    private subPaneManager: SubPaneManager
    private _mainIndicatorsSignal: Signal<Map<string, MainIndicatorEntry>>
    private _indicatorsComputed: Computed<ReadonlyArray<IndicatorInstance>>
    private _subPanesComputed: Computed<ReadonlyArray<SubPaneInfo>>
    private subPaneCtx: SubPaneContext

    /** 主图指标默认参数（从注册表中懒加载） */
    private static _defaultMainParamsCache: Record<string, Record<string, number | boolean | string>> | null = null

    private static get DEFAULT_MAIN_PARAMS(): Record<string, Record<string, number | boolean | string>> {
        if (ChartIndicatorManager._defaultMainParamsCache === null) {
            ChartIndicatorManager._defaultMainParamsCache = {}
            for (const def of getRegisteredIndicatorDefinitions()) {
                if (def.category === 'main') {
                    const key = def.name.toUpperCase()
                    ChartIndicatorManager._defaultMainParamsCache[key] = (def.runtime?.defaultConfig ?? {}) as Record<string, number | boolean | string>
                }
            }
        }
        return ChartIndicatorManager._defaultMainParamsCache
    }

    /** 可启用的主图指标白名单（从注册表中懒加载） */
    private static _enableMainIndicatorsCache: string[] | null = null

    private static get ENABLE_MAIN_INDICATORS(): string[] {
        if (ChartIndicatorManager._enableMainIndicatorsCache === null) {
            ChartIndicatorManager._enableMainIndicatorsCache = getRegisteredIndicatorDefinitions()
                .filter(d => d.category === 'main')
                .map(d => d.name.toUpperCase())
        }
        return ChartIndicatorManager._enableMainIndicatorsCache
    }

    /** 副图渲染器名称前缀（保留向后兼容） */
    static readonly SUB_PANE_PREFIX = 'sub_'

    constructor(deps: IndicatorDependencies) {
        this.deps = deps

        // 初始化指标调度器
        this.indicatorScheduler = new IndicatorScheduler()
        this.indicatorScheduler.setPluginHost(deps.getPluginHost())
        for (const definition of getBuiltinIndicatorDefinitions()) {
            this.indicatorScheduler.registerIndicator(definition)
        }
        this.indicatorScheduler.setInvalidateCallback(() => {
            deps.setPendingIndicatorDataUpdate(false)
            deps.scheduleDraw()
        })

        // 初始化副图管理器
        this.subPaneManager = new SubPaneManager()
        this.subPaneCtx = this.createSubPaneContext()

        // 注册副图活跃列表提供者
        this.indicatorScheduler.setActiveSubPaneProvider(
            () => this.subPaneManager.getPaneIds(),
        )

        // 初始化主图指标信号
        this._mainIndicatorsSignal = createSignal<Map<string, MainIndicatorEntry>>(new Map())

        // 派生信号
        const mainSignal = this._mainIndicatorsSignal
        const subPaneManager = this.subPaneManager
        this._indicatorsComputed = computed<ReadonlyArray<IndicatorInstance>>(() => {
            const mainIndicators: IndicatorInstance[] = [...mainSignal().entries()].map(([id, entry]) => ({
                id,
                definitionId: id,
                label: id,
                name: id,
                role: 'main' as const,
                params: { ...entry.params },
            }))

            const subIndicators: IndicatorInstance[] = subPaneManager.entriesSignal().map(entry => ({
                id: entry.paneId,
                definitionId: entry.indicatorId,
                label: entry.indicatorId,
                name: entry.indicatorId,
                role: 'sub' as const,
                paneId: entry.paneId,
                params: { ...entry.params },
            }))

            return [...mainIndicators, ...subIndicators]
        })
        this._subPanesComputed = computed<ReadonlyArray<SubPaneInfo>>(() => {
            const ratios = deps.getPaneRatiosSignal()()
            return subPaneManager.entriesSignal().map(entry => ({
                paneId: entry.paneId,
                indicatorId: entry.indicatorId,
                params: { ...entry.params },
                ratio: ratios[entry.paneId] ?? 1,
            }))
        })

        // dev: 主副图状态变更日志
        if ((import.meta as any).env?.MODE !== 'production') {
            this._indicatorsComputed.subscribe(() => {
                const instances = this._indicatorsComputed.peek()
                console.log('[Chart] indicators signal changed:', instances)
            })
            this._subPanesComputed.subscribe(() => {
                const subPanes = this._subPanesComputed.peek()
                console.log('[Chart] subPanes signal changed:', subPanes)
            })
        }
    }

    get indicatorSchedulerAccessor(): IndicatorScheduler {
        return this.indicatorScheduler
    }

    get subPaneManagerAccessor(): SubPaneManager {
        return this.subPaneManager
    }

    get mainIndicatorsSignalPeek(): Map<string, MainIndicatorEntry> {
        return this._mainIndicatorsSignal.peek()
    }

    get indicatorsComputed(): Computed<ReadonlyArray<IndicatorInstance>> {
        return this._indicatorsComputed
    }

    get subPanesComputed(): Computed<ReadonlyArray<SubPaneInfo>> {
        return this._subPanesComputed
    }

    // ========== SubPaneContext factory ==========

    private createSubPaneContext(): SubPaneContext {
        const deps = this.deps
        const self = this
        return {
            getIndicatorScheduler: () => self.indicatorScheduler,
            hasPane: (paneId) => deps.hasPane(paneId),
            upsertPane: (def) => deps.upsertPane(def),
            getRenderer: <T extends RendererPlugin = RendererPlugin>(name: string) => deps.getRenderer<T>(name),
            useRenderer: (plugin, config) => deps.useRenderer(plugin, config),
            removeRenderer: (name) => deps.removeRenderer(name),
            removePaneDefinition: (paneId) => deps.removePaneDefinition(paneId),
            updateRendererConfig: (name, config) => deps.updateRendererConfig(name, config),
            getRightAxisWidth: () => deps.getOption().rightAxisWidth,
            getPriceLabelWidth: () => deps.getOption().priceLabelWidth ?? 60,
            getYPaddingPx: () => deps.getOption().yPaddingPx,
            getCrosshairPos: () => deps.getCrosshairPos(),
            getCrosshairPrice: () => deps.getCrosshairPrice(),
            getActivePaneId: () => deps.getActivePaneId(),
        }
    }

    // ========== 主图指标 API ==========

    enableMainIndicator(indicatorId: string, params?: Record<string, number | boolean | string>): boolean {
        const id = indicatorId.toUpperCase()
        if (!ChartIndicatorManager.ENABLE_MAIN_INDICATORS.includes(id)) {
            console.warn(`[Chart] 未知的主图指标: ${indicatorId}`)
            return false
        }

        const map = this._mainIndicatorsSignal.peek()
        const existing = map.get(id)

        if (existing) {
            if (params) {
                const next = new Map(map)
                next.set(id, { params: { ...existing.params, ...params } })
                this._mainIndicatorsSignal.set(next)
                this.updateIndicatorSchedulerConfig(id)
            }
            return true
        }

        const defaults = ChartIndicatorManager.DEFAULT_MAIN_PARAMS[id] ?? {}
        const merged = params ? { ...defaults, ...params } : defaults
        const next = new Map(map)
        next.set(id, { params: merged })
        this._mainIndicatorsSignal.set(next)

        this.enableMainIndicatorRenderer(id)

        this.updateIndicatorSchedulerConfig(id)

        this.indicatorScheduler.updateVisibleRange(this.deps.getLastVisibleRange())

        this.deps.scheduleDraw()
        return true
    }

    disableMainIndicator(indicatorId: string): boolean {
        const id = indicatorId.toUpperCase()
        const map = this._mainIndicatorsSignal.peek()
        if (!map.has(id)) return false

        const next = new Map(map)
        next.delete(id)
        this._mainIndicatorsSignal.set(next)

        this.disableMainIndicatorRenderer(id)

        this.updateIndicatorSchedulerConfig(id)

        this.deps.scheduleDraw()
        return true
    }

    toggleMainIndicator(indicatorId: string, enabled: boolean): void {
        if (enabled) {
            this.enableMainIndicator(indicatorId)
        } else {
            this.disableMainIndicator(indicatorId)
        }
    }

    getActiveMainIndicators(): string[] {
        return [...this._mainIndicatorsSignal.peek().keys()]
    }

    isMainIndicatorActive(indicatorId: string): boolean {
        return this._mainIndicatorsSignal.peek().has(indicatorId.toUpperCase())
    }

    updateMainIndicatorParams(indicatorId: string, params: Record<string, number | boolean | string>): void {
        const id = indicatorId.toUpperCase()
        const map = this._mainIndicatorsSignal.peek()
        const entry = map.get(id)
        if (!entry) return

        const merged = { ...entry.params, ...params }
        const next = new Map(map)
        next.set(id, { params: merged })
        this._mainIndicatorsSignal.set(next)

        const rendererName = id.toLowerCase()
        const renderer = this.deps.getRenderer(rendererName)
        if (renderer && (renderer as any).setConfig) {
            ;(renderer as any).setConfig(merged)
        }

        this.updateIndicatorSchedulerConfig(id)
        this.deps.scheduleDraw()
    }

    getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null {
        return this._mainIndicatorsSignal.peek().get(indicatorId.toUpperCase())?.params ?? null
    }

    clearMainIndicators(): void {
        const map = this._mainIndicatorsSignal.peek()
        for (const id of map.keys()) {
            this.disableMainIndicatorRenderer(id)
        }
        this._mainIndicatorsSignal.set(new Map())
        this.deps.scheduleDraw()
    }

    private enableMainIndicatorRenderer(indicatorId: string): void {
        const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
        const mainPane = definition?.mainPane
        if (!definition || !mainPane) return

        if (!this.deps.getRenderer(mainPane.rendererName)) {
            this.deps.useRenderer(definition.rendererFactory({ paneId: 'main', indicatorId }))
        }

        this.deps.setRendererEnabled(mainPane.rendererName, true)

        if (!this.deps.getRenderer('mainIndicatorLegend')) {
            this.deps.useRenderer(createMainIndicatorLegendRendererPlugin({ yPaddingPx: this.deps.getOption().yPaddingPx }))
        }
    }

    private disableMainIndicatorRenderer(indicatorId: string): void {
        const rendererName = this.indicatorScheduler.getIndicatorMetadata(indicatorId)?.mainPane?.rendererName
        if (rendererName) {
            this.deps.setRendererEnabled(rendererName, false)
        }
    }

    private updateIndicatorSchedulerConfig(indicatorId: string): void {
        const entry = this._mainIndicatorsSignal.peek().get(indicatorId)
        const isActive = entry !== undefined
        const params = entry?.params ?? {}

        const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
        const toActiveConfig = definition?.mainPane?.toActiveConfig
        if (!definition?.updateConfig || !toActiveConfig) return

        const config = toActiveConfig(params, isActive)
        if (config !== null) {
            definition.updateConfig(this.indicatorScheduler, config, 'main')
        }
    }

    /**
     * @deprecated 使用 enableMainIndicator/disableMainIndicator 替代
     */
    setActiveMainIndicators(indicators: string[]): void {
        const newSet = new Set(indicators.map(i => i.toUpperCase()))
        const currentSet = new Set(this._mainIndicatorsSignal.peek().keys())

        for (const id of currentSet) {
            if (!newSet.has(id)) {
                this.disableMainIndicator(id)
            }
        }

        for (const id of newSet) {
            if (!currentSet.has(id)) {
                this.enableMainIndicator(id)
            }
        }
    }

    // ========== 副图管理 API ==========

    bindIndicatorToPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void {
        if (!this.deps.hasPane(paneId)) {
            this.deps.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
        if (!definition) {
            throw new Error(`[Chart] Unknown indicator: ${indicatorId}`)
        }
        const renderer = createSubIndicatorRenderer({ indicatorId, paneId, definition, params })
        const rendererName = renderer.name
        const existing = this.deps.getRenderer(rendererName)
        if (existing) {
            if (params) this.deps.updateRendererConfig(rendererName, params)
            return
        }

        this.deps.useRenderer(renderer, params)
    }

    createSubPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): boolean {
        const paneSpecs = this.deps.getPaneSpecs()
        const visibleSpecs = paneSpecs.filter((pane) => pane.visible !== false)
        const pricePanes = visibleSpecs.filter((pane) => pane.role === 'price')
        const indicatorPanes = visibleSpecs.filter((pane) => pane.role === 'indicator')

        if (pricePanes.length === 1) {
            const pricePane = pricePanes[0]
            if (pricePane) {
                this.deps.setInternalPaneRatio(pricePane.id, 3)
            }
            for (const pane of indicatorPanes) {
                this.deps.setInternalPaneRatio(pane.id, 1)
            }
            this.deps.setInternalPaneRatio(paneId, 1)
        } else {
            this.deps.setInternalPaneRatio(paneId, 1)
        }

        this.deps.upsertPane({ id: paneId, ratio: this.deps.getInternalPaneRatios().get(paneId) ?? 1, visible: true, role: 'indicator' })

        const success = this.subPaneManager.create(this.subPaneCtx, paneId, indicatorId, params ?? this.getDefaultSubPaneParams(indicatorId))
        return success
    }

    removeSubPane(paneId: string): void {
        this.subPaneManager.remove(this.subPaneCtx, paneId)
    }

    replaceSubPaneIndicator(paneId: string, newIndicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void {
        this.subPaneManager.replaceIndicator(this.subPaneCtx, paneId, newIndicatorId, params ?? this.getDefaultSubPaneParams(newIndicatorId))
    }

    updateSubPaneParams(paneId: string, params: Record<string, unknown>): void {
        this.subPaneManager.updateParams(this.subPaneCtx, paneId, params)
    }

    clearSubPanes(): void {
        const subPaneIds = this.subPaneManager.getPaneIds()

        if (subPaneIds.length === 0) return

        this.subPaneManager.clear(this.subPaneCtx)

        for (const paneId of subPaneIds) {
            this.deps.deleteInternalPaneRatio(paneId)
        }

        this.deps.applyPaneLayoutSpecs(this.deps.getPaneSpecs().filter((spec) => !subPaneIds.includes(spec.id)))
    }

    /**
     * @deprecated 使用 getSubPaneEntries 获取完整信息
     */
    getSubPaneIndicators(): SubIndicatorType[] {
        return this.subPaneManager.getAll().map((entry) => entry.indicatorId)
    }

    getSubPaneEntries(): SubPaneEntry[] {
        return this.subPaneManager.getAll()
    }

    getSubPaneEntry(paneId: string): SubPaneEntry | undefined {
        return this.subPaneManager.getByPaneId(paneId)
    }

    private getDefaultSubPaneParams(indicatorId: SubIndicatorType): Record<string, unknown> {
        const defaults: Record<string, Record<string, unknown>> = {
            VOLUME: {},
            MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
            RSI: { period1: 6, period2: 12, period3: 24 },
            CCI: { period: 14, showCCI: true },
            STOCH: { n: 9, m: 3, showK: true, showD: true },
            MOM: { period: 10, showMOM: true },
            WMSR: { period: 14, showWMSR: true },
            KST: { roc1: 10, roc2: 15, roc3: 20, roc4: 30, signalPeriod: 9, showKST: true, showSignal: true },
            FASTK: { period: 9, showFASTK: true },
            ATR: { period: 14, showATR: true },
            WMA: { period: 10, showWMA: true },
            DEMA: { period: 14, showDEMA: true },
            TEMA: { period: 14, showTEMA: true },
            HMA: { period: 14, showHMA: true },
            KAMA: { period: 10, fastPeriod: 2, slowPeriod: 30, showKAMA: true },
            SAR: { step: 0.02, maxStep: 0.2, showSAR: true },
            SUPERTREND: { atrPeriod: 10, multiplier: 3, showSuperTrend: true },
            KELTNER: { emaPeriod: 20, atrPeriod: 10, multiplier: 2, showUpper: true, showMiddle: true, showLower: true },
            DONCHIAN: { period: 20, showUpper: true, showMiddle: true, showLower: true },
            ICHIMOKU: { tenkanPeriod: 9, kijunPeriod: 26, spanBPeriod: 52, displacement: 26, showTenkan: true, showKijun: true, showSpanA: true, showSpanB: true, showChikou: true, showCloud: true },
            ROC: { period: 12, showROC: true },
            TRIX: { period: 15, signalPeriod: 9, showTRIX: true, showSignal: true },
            HV: { period: 20, annualizationFactor: 252, showHV: true },
            PARKINSON: { period: 20, annualizationFactor: 252, showParkinson: true },
            CHAIKIN_VOL: { emaPeriod: 10, rocPeriod: 10, showChaikinVol: true },
            VMA: { period: 5, showVMA: true },
            OBV: { showOBV: true },
            PVT: { showPVT: true },
            VWAP: { sessionResetGapMs: 0, showVWAP: true },
            CMF: { period: 20, showCMF: true },
            MFI: { period: 14, showMFI: true },
            PIVOT: { showPP: true, showR1: true, showR2: true, showR3: false, showS1: true, showS2: true, showS3: false },
            FIB: { period: 50, showLevels: true },
            STRUCTURE: { leftWindow: 2, rightWindow: 2, breakoutSource: 'close', showSwingLabels: true, showBOS: true, showCHOCH: true, showProvisional: false },
            ZONES: { showFVG: true, showOB: true, showFilledZones: true, obLookback: 5 },
            VOLUME_PROFILE: { bins: 24, lookback: 0, valueAreaPercent: 0.7, showVolumeProfile: true },
        }
        return { ...(defaults[indicatorId] ?? {}) }
    }

    // ========== 高层指标 API ==========

    addIndicator(
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ): string | null {
        if (role === 'main') {
            const success = this.enableMainIndicator(definitionId, params as Record<string, number | boolean | string>)
            if (!success) return null
            return definitionId.toUpperCase()
        } else {
            const paneId = `${definitionId.toUpperCase()}_${Date.now()}`
            const success = this.createSubPane(
                paneId,
                definitionId as SubIndicatorType,
                params as Record<string, number | boolean | string>,
            )
            if (!success) return null
            return paneId
        }
    }

    removeIndicator(instanceId: string): boolean {
        const id = instanceId.toUpperCase()

        if (this._mainIndicatorsSignal.peek().has(id)) {
            return this.disableMainIndicator(instanceId)
        }

        const subPaneEntry = this.getSubPaneEntry(instanceId)
        if (subPaneEntry) {
            this.removeSubPane(instanceId)
            return true
        }

        return false
    }

    updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
        const id = instanceId.toUpperCase()

        if (this._mainIndicatorsSignal.peek().has(id)) {
            this.updateMainIndicatorParams(instanceId, params as Record<string, number | boolean | string>)
            return true
        }

        const subPaneEntry = this.getSubPaneEntry(instanceId)
        if (subPaneEntry) {
            this.updateSubPaneParams(instanceId, params)
            return true
        }

        return false
    }

    reorderIndicators(orderedInstanceIds: string[]): boolean {
        console.warn('[Chart] reorderIndicators not fully implemented yet')
        return false
    }

    destroy(): void {
        this.indicatorScheduler.destroy()
    }
}
