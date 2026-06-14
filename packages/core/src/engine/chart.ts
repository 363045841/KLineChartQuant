import type { KLineData } from '../types/price'
import type { ChartSettings } from '../config/chartSettings'
import { createSignal, type Signal, type Computed } from '../reactivity/signal'
import type { SymbolSpec } from '../controllers/types'
import { ChartDataManager } from './data/chartDataManager'
import { ChartPaneLayout } from './layout/chartPaneLayout'
import { UpdateLevel } from './layout/pane'
import type { ScaleType } from './utils/tickPosition'
import { InteractionController, type InteractionSnapshot } from './controller/interaction'
export type { InteractionSnapshot }
import type { ChartDom, PaneSpec, ChartOptions, Viewport, ViewportState, IndicatorInstance, SubPaneInfo, DrawingToolType } from './chartTypes'
import { PaneRenderer } from './paneRenderer'
import { SharedWebGLSurface } from './renderers/webgl/sharedWebGLSurface'
import type { MarkerManager, CustomMarkerEntity } from './marker/registry'
import { getPhysicalKLineConfig } from './utils/klineConfig'
import { ChartZoomController } from './utils/chartZoomController'
import { ChartViewportManager } from './viewport/chartViewportManager'
import { ChartIndicatorManager } from './indicators/chartIndicatorManager'
import type { IndicatorScheduler } from './indicators/scheduler'
import type { SubPaneEntry } from './subPaneManager'
import { ChartRenderer } from './render/chartRenderer'

import {
    createPluginHost,
    type PluginHostImpl,
    RendererPluginManager,
    type RendererPlugin,
    type RendererPluginWithHost,
    wrapPaneInfo,
} from '../plugin'
import type { SubIndicatorType } from './renderers/Indicator'


// 重新导出以保持向后兼容
export { getPhysicalKLineConfig }
export type { ChartDom, PaneSpec, PaneRendererDom, ChartOptions, KLinePositions, Viewport, ViewportState, IndicatorRole, IndicatorInstance, SubPaneInfo, DrawingToolType, DrawingObject } from './chartTypes'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
    kWidth: number
    kGap: number
}

export class Chart {
    private dom: ChartDom
    private opt: ResolvedChartOptions
    private dataManager: ChartDataManager

    private viewportManager: ChartViewportManager
    private layoutManager: ChartPaneLayout
    private get paneRenderers(): PaneRenderer[] {
        return this.layoutManager.getPaneRenderers()
    }
    readonly interaction: InteractionController

    /** 插件宿主 */
    private pluginHost: PluginHostImpl

    /** 渲染器插件管理器 */
    private rendererPluginManager: RendererPluginManager

    /** Chart 级共享 WebGL canvas/context */
    private sharedWebGLSurface: SharedWebGLSurface

    /** 缩放控制器 */
    private zoomController: ChartZoomController

    /** 指标管理器 */
    private indicatorManager: ChartIndicatorManager

    /** 渲染器 */
    private renderer: ChartRenderer

    /**
     * 启用主图指标
     * @param indicatorId 指标ID
     * @param params 可选的指标参数
     * @returns 是否成功启用
     */
    enableMainIndicator(indicatorId: string, params?: Record<string, number | boolean | string>): boolean {
        return this.indicatorManager.enableMainIndicator(indicatorId, params)
    }

    disableMainIndicator(indicatorId: string): boolean {
        return this.indicatorManager.disableMainIndicator(indicatorId)
    }

    toggleMainIndicator(indicatorId: string, enabled: boolean): void {
        this.indicatorManager.toggleMainIndicator(indicatorId, enabled)
    }

    getActiveMainIndicators(): string[] {
        return this.indicatorManager.getActiveMainIndicators()
    }

    isMainIndicatorActive(indicatorId: string): boolean {
        return this.indicatorManager.isMainIndicatorActive(indicatorId)
    }

    updateMainIndicatorParams(indicatorId: string, params: Record<string, number | boolean | string>): void {
        this.indicatorManager.updateMainIndicatorParams(indicatorId, params)
    }

    getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null {
        return this.indicatorManager.getMainIndicatorParams(indicatorId)
    }

    clearMainIndicators(): void {
        this.indicatorManager.clearMainIndicators()
    }

    /**
     * @deprecated 使用 enableMainIndicator/disableMainIndicator 替代
     */
    setActiveMainIndicators(indicators: string[]): void {
        this.indicatorManager.setActiveMainIndicators(indicators)
    }

    /**
     * 创建图表实例
     * @param dom 由 Vue 组件传入的 DOM 句柄
     * @param opt 初始配置
     */
    constructor(dom: ChartDom, opt: ChartOptions) {
        this.dom = dom
        const { kWidth: _kWidth, kGap: _kGap, ...restOpt } = opt
        // Chart 不持有业务 SSOT，kWidth/kGap/zoomLevel 由外部通过 applyRenderState() 传入
        this.opt = { ...restOpt, kWidth: _kWidth ?? 0, kGap: _kGap ?? 0 }
        this.interaction = new InteractionController(this)
        this.interaction.setOnInteractionChange((snapshot) => {
            this._interactionSignal.set(snapshot)
        })
        this.pluginHost = createPluginHost()
        this.rendererPluginManager = new RendererPluginManager()
        this.sharedWebGLSurface = new SharedWebGLSurface()

        // 注入依赖
        this.rendererPluginManager.setPluginHost(this.pluginHost)
        this.rendererPluginManager.setInvalidateCallback(() => this.scheduleDraw())

        this.viewportManager = new ChartViewportManager({
            getDom: () => this.dom,
            getBottomAxisHeight: () => this.opt.bottomAxisHeight,
            getLeftLoadBufferWidth: () => this.dataManager.getLeftLoadBufferWidth(),
            getZoomLevel: () => this.zoomController.currentZoomLevel,
            getLastVisibleRange: () => this.dataManager.lastVisibleRange,
            getKWidth: () => this.opt.kWidth,
            getKGap: () => this.opt.kGap,
            scheduleDraw: (level) => this.scheduleDraw(level),
            onResizeCompleted: () => { this.resize() },
            resizeSharedWebGLSurface: (plotWidth, plotHeight, dpr) => this.sharedWebGLSurface.resize(plotWidth, plotHeight, dpr),
        })

        this.layoutManager = new ChartPaneLayout(this.opt.panes, {
            getDom: () => this.dom,
            getOption: () => ({
                rightAxisWidth: this.opt.rightAxisWidth,
                yPaddingPx: this.opt.yPaddingPx,
                priceLabelWidth: this.opt.priceLabelWidth,
                paneGap: this.opt.paneGap,
                defaultPaneMinHeightPx: this.opt.defaultPaneMinHeightPx,
            }),
            getViewport: () => this.viewportManager.getViewport(),
            getSharedWebGLSurface: () => this.sharedWebGLSurface,
            setKnownPaneIds: (ids) => this.rendererPluginManager.setKnownPaneIds(ids),
            notifyPaneResize: (paneId, pane) => this.rendererPluginManager.notifyResize(paneId, wrapPaneInfo(pane)),
            scheduleDraw: (level) => this.scheduleDraw(level),
            onLayoutChange: (ratios, specs) => {
                this._paneRatiosSignal.set(ratios)
                this._paneLayoutSignal.set(specs)
                this.opt = { ...this.opt, panes: specs }
            },
        })

        this.dataManager = new ChartDataManager({
            getOption: () => this.opt,
            getEffectiveDpr: () => this.viewportManager.getEffectiveDpr(),
            getLogicalScrollLeft: () => this.viewportManager.getLogicalScrollLeft(),
            getCachedScrollLeft: () => this.viewportManager.getCachedScrollLeft(),
            setCachedScrollLeft: (v) => { this.viewportManager.setCachedScrollLeft(v) },
            setPendingScrollLeft: (v) => { this.viewportManager.setPendingScrollLeft(v) },
            getDom: () => this.dom,
            getObservedSize: () => this.viewportManager.getObservedSize(),
            getViewport: () => this.viewportManager.getViewport(),
            scheduleDraw: (level) => this.scheduleDraw(level),
            resetInteraction: () => this.interaction.reset(),
            getIndicatorScheduler: () => this.indicatorManager.indicatorSchedulerAccessor,
            setPendingIndicatorDataUpdate: (v) => { this.dataManager.pendingIndicatorDataUpdate = v },
            isPointerDown: () => this.interaction.isPointerDown(),
        })

        this.zoomController = new ChartZoomController({
            getLogicalScrollLeft: () => this.viewportManager.getLogicalScrollLeft(),
            getCurrentDpr: () => this.viewportManager.getEffectiveDpr(),
            getLeftLoadBufferWidth: () => this.dataManager.getLeftLoadBufferWidth(),
            setScrollLeft: (v) => { this.viewportManager.setScrollLeft(v) },
            onZoomCommitted: (result) => {
                this.opt = { ...this.opt, kWidth: result.kWidth, kGap: result.kGap }
                this.updateViewportSignal()
                this.scheduleDraw()
            },
            getKWidth: () => this.opt.kWidth,
            getKGap: () => this.opt.kGap,
            getMinKWidth: () => this.opt.minKWidth,
            getMaxKWidth: () => this.opt.maxKWidth,
            zoomLevelCount: Math.max(2, Math.round(this.opt.zoomLevels ?? 20)),
            initialZoomLevel: this.opt.initialZoomLevel ?? 1,
        })
        // 注意：初始 kWidth/kGap 应由外部通过 applyRenderState() 传入

        // 初始化指标管理器
        this.indicatorManager = new ChartIndicatorManager({
            getOption: () => this.opt,
            getPluginHost: () => this.pluginHost,
            getRenderer: (name) => this.getRenderer(name),
            useRenderer: (plugin, config) => this.useRenderer(plugin, config),
            removeRenderer: (name) => this.removeRenderer(name),
            updateRendererConfig: (name, config) => this.updateRendererConfig(name, config),
            setRendererEnabled: (name, enabled) => this.setRendererEnabled(name, enabled),
            hasPane: (paneId) => this.layoutManager.hasPane(paneId),
            upsertPane: (def) => this.layoutManager.upsertPane(def),
            removePaneDefinition: (paneId) => this.layoutManager.removePaneDefinition(paneId),
            getPaneSpecs: () => this.layoutManager.getPaneSpecs(),
            getPaneRatiosSignal: () => this._paneRatiosSignal,
            getInternalPaneRatios: () => this.layoutManager.getInternalPaneRatios(),
            setInternalPaneRatio: (paneId, ratio) => this.layoutManager.setInternalPaneRatio(paneId, ratio),
            deleteInternalPaneRatio: (paneId) => this.layoutManager.deleteInternalPaneRatio(paneId),
            applyPaneLayoutSpecs: (specs) => this.layoutManager.applyPaneLayoutSpecs(specs),
            getLastVisibleRange: () => this.dataManager.lastVisibleRange,
            getCrosshairPos: () => this.interaction.crosshairPos,
            getCrosshairPrice: () => this.interaction.crosshairPrice,
            getActivePaneId: () => this.interaction.activePaneId,
            scheduleDraw: (level) => this.scheduleDraw(level),
            setPendingIndicatorDataUpdate: (v) => { this.dataManager.pendingIndicatorDataUpdate = v },
        })

        // 初始化渲染器
        this.renderer = new ChartRenderer({
            getDom: () => this.dom,
            getOption: () => this.opt,
            getPaneRenderers: () => this.paneRenderers,
            getInteraction: () => this.interaction,
            getSharedWebGLSurface: () => this.sharedWebGLSurface,
            getPluginHost: () => this.pluginHost,
            getRendererPluginManager: () => this.rendererPluginManager,
            getTheme: () => this._themeSignal.peek(),
            getCurrentZoomLevel: () => this.zoomController.currentZoomLevel,
            getZoomLevelCount: () => this.zoomController.zoomLevelCount,
            getViewportManager: () => this.viewportManager,
            getDataManager: () => this.dataManager,
            getIndicatorManager: () => this.indicatorManager,
        })
        this.renderer.registerDrawingPlugins()
        this.renderer.initCoreRenderers()
        this.viewportManager.init()
    }


    getViewport(): Viewport | null {
        return this.viewportManager.getViewport()
    }

    getCurrentDpr(): number {
        return this.viewportManager.getEffectiveDpr()
    }

    /** 获取缓存的 scrollLeft（避免读取 DOM 触发强制回流） */
    getCachedScrollLeft(): number {
        return this.viewportManager.getCachedScrollLeft()
    }

    /** 获取逻辑 scrollLeft（减去左侧加载缓冲宽度，可为负值） */
    getLogicalScrollLeft(): number {
        return this.viewportManager.getLogicalScrollLeft()
    }

    /** 获取插件宿主 */
    get plugin(): PluginHostImpl {
        return this.pluginHost
    }

    // ========== 渲染器插件 API ==========

    /** 安装渲染器插件 */
    useRenderer(plugin: RendererPlugin | RendererPluginWithHost, config?: Record<string, unknown>): void {
        this.rendererPluginManager.register(plugin)
        if (config && plugin.setConfig) {
            plugin.setConfig(config)
        }
    }

    /** 移除渲染器插件 */
    removeRenderer(name: string): void {
        this.rendererPluginManager.unregister(name)
    }

    /** 获取渲染器插件 */
    getRenderer<T extends RendererPlugin = RendererPlugin>(name: string): T | undefined {
        return this.rendererPluginManager.getPlugin<T>(name)
    }

    /** 更新渲染器配置（自动重绘） */
    updateRendererConfig(name: string, config: Record<string, unknown>): void {
        this.rendererPluginManager.updateConfig(name, config)
    }

    /** 启用/禁用渲染器 */
    setRendererEnabled(name: string, enabled: boolean): void {
        this.rendererPluginManager.setEnabled(name, enabled)
    }

    /** 获取所有渲染器 */
    getAllRenderers(): RendererPlugin[] {
        return this.rendererPluginManager.getAllPlugins()
    }

    /** 更新用户设置（触发重绘） */
    updateSettings(settings: ChartSettings): void {
        this.renderer.updateSettings(settings)
        this.interaction.updateSettings(settings)

        // 同步刻度类型设置到所有 pane（百分比仅用于主图）
        const axisType = (settings.axisType as ScaleType) ?? 'linear'
        for (const renderer of this.paneRenderers) {
            const pane = renderer.getPane()
            const scaleType = axisType === 'percent' && pane.role !== 'price' ? 'linear' : axisType
            pane.yAxis.setScaleType(scaleType)
        }

        this.scheduleDraw()
    }

    /**
     * 绘制一帧
     * @param level 更新级别，决定渲染哪些层
     */
    draw(level: UpdateLevel = UpdateLevel.All) {
        this.renderer.draw(level)
    }



    // ========== Render State API (Vue SSOT) ==========

    /**
     * 应用渲染状态（由 Vue/Store 层在状态更新后调用）
     * Chart 不拥有业务 SSOT，只负责接收参数并渲染
     * 这是写入 opt.kWidth/kGap 和 currentZoomLevel 的唯一入口
     */
    applyRenderState(kWidth: number, kGap: number, zoomLevel?: number): void {
        const nextZoomLevel = zoomLevel !== undefined
            ? Math.max(1, Math.min(this.zoomController.zoomLevelCount, zoomLevel))
            : this.zoomController.currentZoomLevel
        const renderStateChanged = this.opt.kWidth !== kWidth
            || this.opt.kGap !== kGap
            || this.zoomController.currentZoomLevel !== nextZoomLevel

        if (!renderStateChanged) {
            return
        }

        this.opt = { ...this.opt, kWidth, kGap }
        if (zoomLevel !== undefined) {
            this.zoomController.setZoomLevel(nextZoomLevel)
        }
        this.updateViewportSignal()
        this.scheduleDraw()
    }

    /** 获取总缩放级别数 */
    getZoomLevelCount(): number {
        return this.zoomController.zoomLevelCount
    }

    /** 获取所有 PaneRenderer */
    getPaneRenderers(): PaneRenderer[] {
        return this.paneRenderers
    }

    /** 获取 MarkerManager（供 InteractionController 使用） */
    getMarkerManager(): MarkerManager {
        return this.renderer.getMarkerManager()
    }

    /** 更新自定义标记 */
    updateCustomMarkers(markers: CustomMarkerEntity[]): void {
        this.renderer.getMarkerManager().setCustomMarkers(markers)
        this.scheduleDraw()
    }

    /** 清除自定义标记 */
    clearCustomMarkers(): void {
        this.renderer.getMarkerManager().clearCustomMarkers()
        this.scheduleDraw()
    }

    /** 获取 ChartDom（供 InteractionController 使用） */
    getDom() {
        return this.dom
    }

    /** 获取当前 ChartOptions（返回内部当前快照） */
    getOption() {
        return this.opt
    }

    /**
     * 更新配置并触发布局/重绘
     * @param partial 部分配置项
     */
    updateOptions(partial: Partial<ChartOptions>) {
        // 缩放参数由 zoomLevel 派生，不允许直接修改
        if (partial.kWidth !== undefined) {
            console.warn('[Chart] kWidth cannot be set directly. Use applyRenderState() instead.')
            delete partial.kWidth
        }
        if (partial.kGap !== undefined) {
            delete partial.kGap
        }

        if (partial.panes) {
            const nextPanes = partial.panes.map((pane) => ({ ...pane }))
            this.opt = { ...this.opt, ...partial, panes: nextPanes }
            this.layoutManager.applyPaneLayoutSpecs(nextPanes)
            return
        }

        this.opt = { ...this.opt, ...partial }
        this.resize()
    }

    updatePaneLayout(panes: PaneSpec[]): void {
        this.layoutManager.updatePaneLayout(panes)
    }

    setPaneDefinitions(defs: PaneSpec[]): void {
        this.layoutManager.setPaneDefinitions(defs)
    }

    upsertPane(def: PaneSpec): void {
        this.layoutManager.upsertPane(def)
    }

    removePaneDefinition(paneId: string): void {
        this.layoutManager.removePaneDefinition(paneId)
    }

    bindIndicatorToPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void {
        this.indicatorManager.bindIndicatorToPane(paneId, indicatorId, params)
    }

    /** 更新绘图对象 */
    setDrawings(drawings: import('../plugin').DrawingObject[]): void {
        this.renderer.getDrawingStore().setAll(drawings)
        this._drawingsSignal.set(drawings)
        this.scheduleDraw()
    }

    /** 更新选中的绘图 ID */
    setSelectedDrawingId(id: string | null): void {
        const store = this.renderer.getDrawingStore()
        if (store.getSelectedId() === id) return
        store.setSelectedId(id)
        this.scheduleDraw()
    }

    getPaneLayoutSpecs(): PaneSpec[] {
        return this.layoutManager.getPaneLayoutSpecs()
    }

    resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
        return this.layoutManager.resizePaneBoundary(upperPaneId, deltaY)
    }

    addPane(paneId: string): void {
        this.layoutManager.addPane(paneId)
    }

    removePane(paneId: string): void {
        this.layoutManager.removePane(paneId)
    }

    hasPane(paneId: string): boolean {
        return this.layoutManager.hasPane(paneId)
    }

    // ========== 副图管理 API ==========

    createSubPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): boolean {
        return this.indicatorManager.createSubPane(paneId, indicatorId, params)
    }

    removeSubPane(paneId: string): void {
        this.indicatorManager.removeSubPane(paneId)
    }

    replaceSubPaneIndicator(paneId: string, newIndicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void {
        this.indicatorManager.replaceSubPaneIndicator(paneId, newIndicatorId, params)
    }

    updateSubPaneParams(paneId: string, params: Record<string, unknown>): void {
        this.indicatorManager.updateSubPaneParams(paneId, params)
    }

    clearSubPanes(): void {
        this.indicatorManager.clearSubPanes()
    }

    getSubPaneIndicators(): SubIndicatorType[] {
        return this.indicatorManager.getSubPaneIndicators()
    }

    getSubPaneEntries(): SubPaneEntry[] {
        return this.indicatorManager.getSubPaneEntries()
    }

    getSubPaneEntry(paneId: string): SubPaneEntry | undefined {
        return this.indicatorManager.getSubPaneEntry(paneId)
    }

    private getDefaultSubPaneParams(indicatorId: SubIndicatorType): Record<string, unknown> {
        // 默认参数定义在 SubPaneManager 中，这里导入使用
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



    /**
     * 平移价格轴（用于主图区域上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（正数向下拖动）
     */
    translatePrice(paneId: string, deltaY: number): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return

        const pane = renderer.getPane()
        if (!pane.capabilities.supportsPriceTranslate) return

        const priceOffset = pane.yAxis.deltaYToPriceOffset(deltaY)
        const currentOffset = pane.yAxis.getPriceOffset()
        pane.yAxis.setPriceOffset(currentOffset + priceOffset)
        this.scheduleDraw()
    }

    /**
     * 重置价格轴垂直偏移
     * @param paneId 目标 pane ID
     */
    resetPriceOffset(paneId: string): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return
        renderer.getPane().yAxis.resetPriceOffset()
        this.scheduleDraw()
    }

    resetPriceTransform(paneId: string): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return
        renderer.getPane().yAxis.resetTransform()
        this.scheduleDraw()
    }

    /**
     * 缩放价格轴（用于右侧刻度栏上下拖动）
     * @param paneId 目标 pane ID
     * @param deltaY Y轴像素偏移（向上拖动放大，向下拖动缩小）
     */
    scalePrice(paneId: string, deltaY: number): void {
        const renderer = this.paneRenderers.find(r => r.getPane().id === paneId)
        if (!renderer) return

        const pane = renderer.getPane()
        if (!pane.capabilities.supportsPriceTranslate) return

        pane.yAxis.scaleByDelta(deltaY)
        this.scheduleDraw()
    }
    /**
     * 更新数据并请求重绘
     * @param data K 线数据数组
     */
    updateData(data: KLineData[]) {
        this.dataManager.updateData(data)
    }

    /** 获取当前数据源（供 renderers 和 interaction 使用） */
    getData(): KLineData[] {
        return this.dataManager.getData()
    }

    /** 获取指标调度器（供外部控制器更新指标配置） */
    getIndicatorScheduler(): IndicatorScheduler {
        return this.indicatorManager.indicatorSchedulerAccessor
    }

    getLogicalSlotCount(): number {
        return this.dataManager.getLogicalSlotCount()
    }

    getTimestampAtLogicalIndex(index: number): number | null {
        return this.dataManager.getTimestampAtLogicalIndex(index)
    }

    /** 根据视口内 X 坐标反查逻辑索引（允许超出最后一根 K 线） */
    getLogicalIndexAtX(mouseX: number): number | null {
        return this.dataManager.getLogicalIndexAtX(mouseX)
    }

    /** 根据视口内 X 坐标反查数据索引（用于绘图落点） */
    getDataIndexAtX(mouseX: number): number | null {
        return this.dataManager.getDataIndexAtX(mouseX)
    }


    /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
    getContentWidth(): number {
        return this.dataManager.getContentWidth()
    }

    /** 滚动到最右侧（最新数据位置） */
    scrollToRight(): void {
        this.dataManager.scrollToRight()
    }

    /** 容器尺寸变化时调用 */
    resize() {
        const vp = this.viewportManager.computeViewport()
        // 防御性检查：容器尺寸无效时跳过布局
        if (!vp || vp.viewWidth < 10 || vp.viewHeight < 10) {
            return
        }
        this.renderer.clearCachedFrame()
        this.layoutManager.layoutPanes()
        this.viewportManager.updateViewportSignal()
        this.scheduleDraw()
    }

    /**
     * 请求下一帧重绘（RAF 合并，支持分层更新）
     * @param level 更新级别，默认为 All
     */
    scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
        this.renderer.scheduleDraw(level)
    }

    /** 销毁图表实例 */
    async destroy() {
        this.renderer.destroy()
        this.dataManager.destroy()
        this.viewportManager.destroy()
        this.layoutManager.destroy()
        this.sharedWebGLSurface.destroy()
        this.indicatorManager.destroy()
        await this.pluginHost.destroy()
    }


    private computeViewport(): Viewport | null {
        return this.viewportManager.computeViewport()
    }

    // ==================== Facade API (High-level interface for adapters) ====================

    private _themeSignal = createSignal<'light' | 'dark'>('light')
    private _drawingToolSignal = createSignal<DrawingToolType | null>(null)
    private _drawingsSignal = createSignal<ReadonlyArray<import('../plugin').DrawingObject>>([])
    private _paneRatiosSignal = createSignal<Readonly<Record<string, number>>>({})
    private _paneLayoutSignal = createSignal<PaneSpec[]>([])
    private _interactionSignal = createSignal<InteractionSnapshot>({
        crosshairPos: null,
        crosshairIndex: null,
        crosshairPrice: null,
        hoveredIndex: null,
        activePaneId: null,
        tooltipPos: { x: 0, y: 0 },
        tooltipAnchorPlacement: 'right-bottom',
        hoveredMarkerData: null,
        hoveredCustomMarker: null,
        isDragging: false,
        isResizingPaneBoundary: false,
        isHoveringPaneBoundary: false,
        hoveredPaneBoundaryId: null,
        isHoveringRightAxis: false,
    })

    /** 视口状态信号 */
    get viewport(): Signal<ViewportState> {
        return this.viewportManager.viewportSignal
    }

    /** 数据信号 */
    get data(): Signal<ReadonlyArray<KLineData>> {
        return this.dataManager.data
    }

    /** 符号信号 */
    get symbols(): Signal<ReadonlyArray<SymbolSpec>> {
        return this.dataManager.symbols
    }

    /** 主题信号 */
    get theme(): Signal<'light' | 'dark'> {
        return this._themeSignal
    }

    /** 指标实例列表信号（派生信号，自动随主/副图状态更新） */
    get indicators(): Computed<ReadonlyArray<IndicatorInstance>> {
        return this.indicatorManager.indicatorsComputed
    }

    /** 子图信息信号（派生信号，自动随副图条目/比例更新） */
    get subPanes(): Computed<ReadonlyArray<SubPaneInfo>> {
        return this.indicatorManager.subPanesComputed
    }

    /** 当前绘图工具信号 */
    get drawingTool(): Signal<DrawingToolType | null> {
        return this._drawingToolSignal
    }

    /** 绘图对象列表信号 */
    get drawings(): Signal<ReadonlyArray<import('../plugin').DrawingObject>> {
        return this._drawingsSignal
    }

    /** 面板比例信号 */
    get paneRatios(): Signal<Readonly<Record<string, number>>> {
        return this._paneRatiosSignal
    }

    get paneLayout(): Signal<PaneSpec[]> {
        return this._paneLayoutSignal
    }

    /** 交互状态信号 */
    get interactionState(): Signal<InteractionSnapshot> {
        return this._interactionSignal
    }

    // ---------- Data ----------

    setData(data: KLineData[]): void {
        this.dataManager.setData(data)
    }

    appendData(newData: KLineData[]): void {
        this.dataManager.appendData(newData)
    }

    setDataFetcher(fetcher: import('../controllers/types').DataFetcher | null): void {
        this.dataManager.setDataFetcher(fetcher)
    }

    get dataBuffer(): import('../data-fetchers/dataBuffer').DataBuffer {
        return this.dataManager.dataBuffer
    }

    checkVisibleRangeGap(): void {
        this.dataManager.checkVisibleRangeGap()
    }

    setSymbols(specs: ReadonlyArray<SymbolSpec>): void {
        this.dataManager.setSymbols(specs)
    }

    // ---------- Theme ----------

    /**
     * 设置主题（高层 API）
     */
    setTheme(theme: 'light' | 'dark'): void {
        this._themeSignal.set(theme)
        this.scheduleDraw()
    }

    // ---------- Zoom ----------

    /**
     * 缩放到指定级别（高层 API）
     * 计算并应用新的 render state，更新 viewport signal
     */
    zoomToLevel(level: number, anchorX?: number): void {
        this.zoomController.zoomToLevel(level, anchorX)
    }

    /**
     * 放大（高层 API）
     */
    zoomIn(anchorX?: number): void {
        this.zoomController.zoomIn(anchorX)
    }

    /**
     * 缩小（高层 API）
     */
    zoomOut(anchorX?: number): void {
        this.zoomController.zoomOut(anchorX)
    }

    // ---------- Interaction (Zero-config unified entry) ----------

    /**
     * 统一指针事件处理（零配置）
     * 自动判断区域并分发给 interaction controller
     * 
     * @param e 指针事件
     * @param drawingController 可选的绘图控制器，如果提供，会优先让绘图控制器处理事件
     * @returns 是否被处理（如果 drawingController 处理了返回 true，否则返回 false）
     */
    handlePointerEvent(e: PointerEvent, drawingController?: {
        onPointerDown?: (e: PointerEvent, container: HTMLElement) => boolean
        onPointerMove?: (e: PointerEvent, container: HTMLElement) => boolean
        onPointerUp?: (e: PointerEvent, container: HTMLElement) => boolean
    }): boolean {
        // 判断事件目标是否在右轴区域
        const isRightAxis = this.dom.rightAxisLayer.contains(e.target as Node)

        switch (e.type) {
            case 'pointerdown':
                // 优先让绘图控制器处理
                if (drawingController?.onPointerDown) {
                    const handled = drawingController.onPointerDown(e, this.dom.container)
                    if (handled) return true
                }
                if (isRightAxis) {
                    this.interaction.onRightAxisPointerDown(e)
                } else {
                    this.interaction.onPointerDown(e)
                }
                return false
            case 'pointermove':
                // 优先让绘图控制器处理
                if (drawingController?.onPointerMove) {
                    const handled = drawingController.onPointerMove(e, this.dom.container)
                    if (handled) return true
                }
                if (isRightAxis) {
                    this.interaction.onRightAxisPointerMove(e)
                } else {
                    this.interaction.onPointerMove(e)
                }
                return false
            case 'pointerup':
                // 优先让绘图控制器处理
                if (drawingController?.onPointerUp) {
                    const handled = drawingController.onPointerUp(e, this.dom.container)
                    if (handled) return true
                }
                if (isRightAxis) {
                    this.interaction.onRightAxisPointerUp(e)
                } else {
                    this.interaction.onPointerUp(e)
                }
                return false
            case 'pointerleave':
                // pointerleave 通常不用于绘图，直接交给 interaction
                if (isRightAxis) {
                    this.interaction.onRightAxisPointerLeave(e)
                } else {
                    this.interaction.onPointerLeave(e)
                }
                return false
            default:
                return false
        }
    }

    /**
     * 滚轮事件处理（高层 API）
     * 使用 computeZoom 计算精确的 scrollLeft，更新 viewport signal
     */
    handleWheelEvent(e: WheelEvent): void {
        const rect = this.dom.container.getBoundingClientRect()
        this.zoomController.handleWheel(e.deltaY, e.clientX - rect.left)
    }

    /**
     * 滚动事件处理（高层 API）
     * 更新缓存的 scrollLeft 并触发交互 controller
     */
    handleScrollEvent(): void {
        this.interaction.onScroll({ scheduleDraw: !this.dataManager.pendingIndicatorDataUpdate })
        // 更新 viewport signal 中的 visible range
        this.updateViewportSignal()
    }

    /**
     * 双指捏合缩放处理（高层 API）
     * @param delta 缩放增量（+1 放大 / -1 缩小）
     * @param centerClientX 捏合中心在视口中的 X 坐标
     */
    handlePinchZoom(delta: number, centerClientX: number): void {
        this.zoomController.handlePinch(delta, centerClientX)
    }

    /**
     * 更新 viewport signal（用于滚动事件）
     */
    private updateViewportSignal(): void {
        this.viewportManager.updateViewportSignal()
    }

    // ---------- Indicators (Explicit role) ----------

    /**
     * 添加指标（高层 API，显式指定 role）
     * @param definitionId 指标定义 ID（如 'MA', 'MACD'）
     * @param role 'main' 主图指标 或 'sub' 副图指标
     * @param params 指标参数
     * @returns 实例 ID（成功）或 null（失败）
     */
    addIndicator(
        definitionId: string,
        role: 'main' | 'sub',
        params?: Record<string, unknown>,
    ): string | null {
        return this.indicatorManager.addIndicator(definitionId, role, params)
    }

    removeIndicator(instanceId: string): boolean {
        return this.indicatorManager.removeIndicator(instanceId)
    }

    updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
        return this.indicatorManager.updateIndicatorParams(instanceId, params)
    }

    reorderIndicators(orderedInstanceIds: string[]): boolean {
        return this.indicatorManager.reorderIndicators(orderedInstanceIds)
    }



    // ---------- Sub Panes ----------

    /**
     * 调整子图大小（高层 API）
     * @param paneId 面板 ID
     * @param deltaY 垂直偏移量
     * @returns 是否成功
     */
    resizeSubPane(paneId: string, deltaY: number): boolean {
        return this.resizePaneBoundary(paneId, deltaY)
    }

    // ---------- Drawings ----------

    /**
     * 设置当前绘图工具（高层 API）
     * @param tool 工具类型或 null 取消选择
     */
    setDrawingTool(tool: DrawingToolType | null): void {
        this._drawingToolSignal.set(tool)
        // TODO: 当 Chart 支持绘图工具切换时，在这里调用相应方法
    }

    /**
     * 移除绘图（高层 API）
     * @param drawingId 绘图 ID
     */
    removeDrawing(drawingId: string): void {
        // TODO: 实现绘图移除
        console.warn('[Chart] removeDrawing not fully implemented yet')
    }

    /**
     * 清除所有绘图（高层 API）
     */
    clearDrawings(): void {
        this.setDrawings([])
    }

    // ---------- Settings ----------

    /**
     * 更新设置（高层 API）
     * 代理到现有的 updateSettings
     */
    updateSettingsFacade(settings: Record<string, unknown>): void {
        this.updateSettings(settings as ChartSettings)
    }

    /**
     * 更新选项（高层 API）
     * 代理到现有的 updateOptions
     */
    updateOptionsFacade(options: Partial<ChartOptions>): void {
        this.updateOptions(options)
    }

    // ---------- Lifecycle hooks ----------

    /**
     * 销毁图表实例
     */
}




