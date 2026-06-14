import type { KLineData } from '../types/price'
import type { ChartSettings } from '../config/chartSettings'
import { createSignal, computed, type Signal, type Computed } from '../reactivity/signal'
import type { SymbolSpec } from '../controllers/types'
import { getVisibleRange } from './viewport/viewport'
import { ChartDataManager, type DataDependencies } from './data/chartDataManager'
import { ChartPaneLayout } from './layout/chartPaneLayout'
import { UpdateLevel } from './layout/pane'
import type { VisibleRange } from './layout/pane'
import type { ScaleType } from './utils/tickPosition'
import { InteractionController, type InteractionSnapshot } from './controller/interaction'
export type { InteractionSnapshot }
import type { ChartDom, PaneSpec, ChartOptions, KLinePositions, Viewport, ViewportState, IndicatorInstance, SubPaneInfo, DrawingToolType } from './chartTypes'
import { PaneRenderer } from './paneRenderer'
import { SharedWebGLSurface } from './renderers/webgl/sharedWebGLSurface'
import { MarkerManager, type CustomMarkerEntity } from './marker/registry'
import { getPhysicalKLineConfig, calcKWidthPx } from './utils/klineConfig'
import { ChartZoomController } from './utils/chartZoomController'
import { ChartViewportManager, type ViewportDependencies } from './viewport/chartViewportManager'
import { IndicatorScheduler } from './indicators/scheduler'
import { getBuiltinIndicatorDefinitions } from './indicators/registerBuiltins'
import { getRegisteredIndicatorDefinitions } from './indicators/indicatorDefinitionRegistry'
import { SubPaneManager, type SubPaneEntry } from './subPaneManager'

import {
    createPluginHost,
    type PluginHostImpl,
    RendererPluginManager,
    type RendererPlugin,
    type RendererPluginWithHost,
    type RenderContext,
    wrapPaneInfo,
    type PaneRole,
    type YAxisLabel,
    type XAxisLabel,
    type YAxisRange,
    type XAxisRange,
} from '../plugin'
import { createSubIndicatorRenderer, type SubIndicatorType } from './renderers/Indicator'
import { createMainIndicatorLegendRendererPlugin } from './renderers/Indicator/mainIndicatorLegend'
import { DrawingStore } from './drawing'
import { createDrawingRendererPlugin, createDrawingLabelOverlayPlugin } from './drawing/plugin'
import { createGridLinesRendererPlugin } from './renderers/gridLines'
import { createCandleRenderer } from './renderers/candle'
import { createComparisonLineRenderer } from './renderers/comparisonLine'
import { createLastPriceLineRendererPlugin, createLastPriceLabelRegistrarPlugin } from './renderers/lastPrice'
import { createCustomMarkersRenderer } from './renderers/customMarkers'
import { createExtremaMarkersRendererPlugin } from './renderers/extremaMarkers'
import { createYAxisRendererPlugin } from './renderers/yAxis'
import { createCrosshairRendererPlugin } from './renderers/crosshair'
import { createTimeAxisRendererPlugin } from './renderers/timeAxis'


// 重新导出以保持向后兼容
export { getPhysicalKLineConfig, calcKWidthPx }
export type { ChartDom, PaneSpec, PaneRendererDom, ChartOptions, KLinePositions, Viewport, ViewportState, IndicatorRole, IndicatorInstance, SubPaneInfo, DrawingToolType, DrawingObject } from './chartTypes'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
    kWidth: number
    kGap: number
}

type FrameData = {
    vp: Viewport
    range: VisibleRange
    kLinePositions: KLinePositions
    kLineCenters: number[]
    kBarRects: Array<{ x: number; width: number }>
    kWidthPx: number
    useCachedFrame: boolean
}

/** 主图指标条目，存在 = 激活 */
interface MainIndicatorEntry {
    params: Record<string, number | boolean | string>
}

export class Chart {
    private dom: ChartDom
    private opt: ResolvedChartOptions
    private dataManager: ChartDataManager

    private raf: number | null = null
    private pendingUpdateLevel: UpdateLevel = UpdateLevel.All

    private viewportManager: ChartViewportManager
    private layoutManager: ChartPaneLayout
    private get paneRenderers(): PaneRenderer[] {
        return this.layoutManager.getPaneRenderers()
    }
    private markerManager: MarkerManager
    private drawingStore = new DrawingStore()
    readonly interaction: InteractionController

    /** 插件宿主 */
    private pluginHost: PluginHostImpl

    /** 渲染器插件管理器 */
    private rendererPluginManager: RendererPluginManager

    /** overlay 上一帧是否有十字线（用于判断何时需要清除） */
    private overlayHadCrosshair = false

    /** 用户设置配置（传递给渲染器） */
    private settings: ChartSettings = {}

    /** 共享 X 轴上下文缓存 */
    private xAxisCtx: CanvasRenderingContext2D | null = null

    /** Chart 级共享 WebGL canvas/context */
    private sharedWebGLSurface: SharedWebGLSurface

    /** 缩放控制器 */
    private zoomController: ChartZoomController

    /** 指标调度器（负责计算 MA 等指标并写入 StateStore）
     * TODO: 阶段5迁移为插件注册，Scheduler 通过事件监听 data/viewport 变更，Chart 不直接持有
     */
    private indicatorScheduler: IndicatorScheduler

    /** Overlay 帧复用的最近主渲染结果 */
    private cachedDrawFrame: {
        viewport: Viewport
        range: VisibleRange
        kLinePositions: KLinePositions
        kLineCenters: number[]
        kBarRects: Array<{ x: number; width: number }>
        kWidthPx: number
    } | null = null

    /** 副图管理器 */
    private subPaneManager = new SubPaneManager()

    /** 主图指标激活状态与参数（存在即激活，默认参数在 enable 时初始化） */
    private _mainIndicatorsSignal: Signal<Map<string, MainIndicatorEntry>> = createSignal<Map<string, MainIndicatorEntry>>(new Map())

    /** 主图指标默认参数（从注册表中懒加载） */
    private static _defaultMainParamsCache: Record<string, Record<string, number | boolean | string>> | null = null

    private static get DEFAULT_MAIN_PARAMS(): Record<string, Record<string, number | boolean | string>> {
        if (Chart._defaultMainParamsCache === null) {
            Chart._defaultMainParamsCache = {}
            for (const def of getRegisteredIndicatorDefinitions()) {
                if (def.category === 'main') {
                    Chart._defaultMainParamsCache[def.displayName.toUpperCase()] = (def.runtime?.defaultConfig ?? {}) as Record<string, number | boolean | string>
                }
            }
        }
        return Chart._defaultMainParamsCache
    }

    /** 可启用的主图指标白名单（从注册表中懒加载） */
    private static _enableMainIndicatorsCache: string[] | null = null

    private static get ENABLE_MAIN_INDICATORS(): string[] {
        if (Chart._enableMainIndicatorsCache === null) {
            Chart._enableMainIndicatorsCache = getRegisteredIndicatorDefinitions()
                .filter(d => d.category === 'main')
                .map(d => d.displayName.toUpperCase())
        }
        return Chart._enableMainIndicatorsCache
    }

    /**
     * 启用主图指标
     * @param indicatorId 指标ID
     * @param params 可选的指标参数
     * @returns 是否成功启用
     */
    enableMainIndicator(indicatorId: string, params?: Record<string, number | boolean | string>): boolean {
        const id = indicatorId.toUpperCase()
        if (!Chart.ENABLE_MAIN_INDICATORS.includes(id)) {
            console.warn(`[Chart] 未知的主图指标: ${indicatorId}`)
            return false
        }

        const map = this._mainIndicatorsSignal.peek()
        const existing = map.get(id)

        if (existing) {
            // 已启用，更新参数
            if (params) {
                const next = new Map(map)
                next.set(id, { params: { ...existing.params, ...params } })
                this._mainIndicatorsSignal.set(next)
                this.updateIndicatorSchedulerConfig(id)
            }
            return true
        }

        // 合并默认参数和传入参数
        const defaults = Chart.DEFAULT_MAIN_PARAMS[id] ?? {}
        const merged = params ? { ...defaults, ...params } : defaults
        const next = new Map(map)
        next.set(id, { params: merged })
        this._mainIndicatorsSignal.set(next)

        // 启用对应的渲染器
        this.enableMainIndicatorRenderer(id)

        // 更新调度器配置（触发异步重算）
        this.updateIndicatorSchedulerConfig(id)

        // 同步重算主图状态：latestResult 已有该指标的 series，只是没注册到 registry
        // 补调 updateVisibleRange 使其走 updateVisibleStatesOnly，立即从 latestResult 合成极值
        this.indicatorScheduler.updateVisibleRange(this.dataManager.lastVisibleRange)

        this.scheduleDraw()
        return true
    }

    /**
     * 禁用主图指标
     * @param indicatorId 指标ID
     * @returns 是否成功禁用
     */
    disableMainIndicator(indicatorId: string): boolean {
        const id = indicatorId.toUpperCase()
        const map = this._mainIndicatorsSignal.peek()
        if (!map.has(id)) return false

        const next = new Map(map)
        next.delete(id)
        this._mainIndicatorsSignal.set(next)

        // 禁用对应的渲染器
        this.disableMainIndicatorRenderer(id)

        // 更新调度器配置
        this.updateIndicatorSchedulerConfig(id)

        this.scheduleDraw()
        return true
    }

    /**
     * 切换主图指标启用状态
     * @param indicatorId 指标ID
     * @param enabled 是否启用
     */
    toggleMainIndicator(indicatorId: string, enabled: boolean): void {
        if (enabled) {
            this.enableMainIndicator(indicatorId)
        } else {
            this.disableMainIndicator(indicatorId)
        }
    }

    /**
     * 获取当前激活的主图指标列表
     * @returns 激活的指标ID数组
     */
    getActiveMainIndicators(): string[] {
        return [...this._mainIndicatorsSignal.peek().keys()]
    }

    /**
     * 检查主图指标是否激活
     * @param indicatorId 指标ID
     */
    isMainIndicatorActive(indicatorId: string): boolean {
        return this._mainIndicatorsSignal.peek().has(indicatorId.toUpperCase())
    }

    /**
     * 更新主图指标参数
     * @param indicatorId 指标ID
     * @param params 参数对象
     */
    updateMainIndicatorParams(indicatorId: string, params: Record<string, number | boolean | string>): void {
        const id = indicatorId.toUpperCase()
        const map = this._mainIndicatorsSignal.peek()
        const entry = map.get(id)
        if (!entry) return

        const merged = { ...entry.params, ...params }
        const next = new Map(map)
        next.set(id, { params: merged })
        this._mainIndicatorsSignal.set(next)

        // 同步更新渲染器配置
        const rendererName = id.toLowerCase()
        const renderer = this.getRenderer(rendererName)
        if (renderer && renderer.setConfig) {
            renderer.setConfig(merged)
        }

        // 更新调度器
        this.updateIndicatorSchedulerConfig(id)
        this.scheduleDraw()
    }

    /**
     * 获取主图指标参数
     * @param indicatorId 指标ID
     */
    getMainIndicatorParams(indicatorId: string): Record<string, number | boolean | string> | null {
        return this._mainIndicatorsSignal.peek().get(indicatorId.toUpperCase())?.params ?? null
    }

    /**
     * 清除所有主图指标
     */
    clearMainIndicators(): void {
        const map = this._mainIndicatorsSignal.peek()
        for (const id of map.keys()) {
            this.disableMainIndicatorRenderer(id)
        }
        this._mainIndicatorsSignal.set(new Map())
        this.scheduleDraw()
    }

    /**
     * 启用主图指标渲染器（内部方法）
     */
    private enableMainIndicatorRenderer(indicatorId: string): void {
        const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
        const mainPane = definition?.mainPane
        if (!definition || !mainPane) return

        if (!this.getRenderer(mainPane.rendererName)) {
            this.useRenderer(definition.rendererFactory({ paneId: 'main', indicatorId }))
        }

        this.setRendererEnabled(mainPane.rendererName, true)

        if (!this.getRenderer('mainIndicatorLegend')) {
            this.useRenderer(createMainIndicatorLegendRendererPlugin({ yPaddingPx: this.opt.yPaddingPx }))
        }
    }

    /**
     * 禁用主图指标渲染器（内部方法）
     */
    private disableMainIndicatorRenderer(indicatorId: string): void {
        const rendererName = this.indicatorScheduler.getIndicatorMetadata(indicatorId)?.mainPane?.rendererName
        if (rendererName) {
            this.setRendererEnabled(rendererName, false)
        }
    }

    /**
     * 更新调度器配置（内部方法）
     */
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
        // 计算需要启用和禁用的指标
        const newSet = new Set(indicators.map(i => i.toUpperCase()))
        const currentSet = new Set(this._mainIndicatorsSignal.peek().keys())

        // 禁用不再激活的
        for (const id of currentSet) {
            if (!newSet.has(id)) {
                this.disableMainIndicator(id)
            }
        }

        // 启用新激活的
        for (const id of newSet) {
            if (!currentSet.has(id)) {
                this.enableMainIndicator(id)
            }
        }
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
        this.markerManager = new MarkerManager()
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
            getIndicatorScheduler: () => this.indicatorScheduler,
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

        // 初始化指标调度器
        this.indicatorScheduler = new IndicatorScheduler()
        this.indicatorScheduler.setPluginHost(this.pluginHost)
        for (const definition of getBuiltinIndicatorDefinitions()) {
            this.indicatorScheduler.registerIndicator(definition)
        }
        this.indicatorScheduler.setInvalidateCallback(() => {
            this.dataManager.pendingIndicatorDataUpdate = false
            this.scheduleDraw()
        })

        // 注册副图活跃列表提供者，调度器据此只计算启用的副图
        this.indicatorScheduler.setActiveSubPaneProvider(
            () => this.subPaneManager.getPaneIds(),
        )

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

        // 注册绘图主插件（负责绘制 shape，layer: 'main'）
        this.useRenderer(createDrawingRendererPlugin({ store: this.drawingStore }))
        // 注册绘图标签插件（负责推送选中绘图的轴标签，layer: 'overlay'）
        // 注意：此插件依赖 overlay 更新级别，若将来添加 Main 级别需调整
        this.useRenderer(createDrawingLabelOverlayPlugin({ store: this.drawingStore }))
        this.initCoreRenderers()
        this.viewportManager.init()
    }


    private initCoreRenderers(): void {
        const axisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth ?? 0)

        this.useRenderer(createGridLinesRendererPlugin())
        this.useRenderer(createCandleRenderer())
        this.useRenderer(createComparisonLineRenderer())
        this.useRenderer(createLastPriceLineRendererPlugin())
        this.useRenderer(createLastPriceLabelRegistrarPlugin())
        this.useRenderer(createCustomMarkersRenderer())
        this.useRenderer(createExtremaMarkersRendererPlugin())
        this.useRenderer(createMainIndicatorLegendRendererPlugin({
            yPaddingPx: this.opt.yPaddingPx,
        }))
        this.useRenderer(createYAxisRendererPlugin({
            axisWidth,
            yPaddingPx: this.opt.yPaddingPx,
            getCrosshair: () => {
                const pos = this.interaction.crosshairPos
                const price = this.interaction.crosshairPrice
                const activePaneId = this.interaction.activePaneId
                if (pos && price !== null) {
                    return { y: pos.y, price, activePaneId }
                }
                return null
            },
        }))
        this.useRenderer(createCrosshairRendererPlugin({
            getCrosshairState: () => ({
                pos: this.interaction.crosshairPos,
                activePaneId: this.interaction.activePaneId,
                isDragging: this.interaction.isDraggingState(),
                price: this.interaction.crosshairPrice,
            }),
        }))
        this.useRenderer(createTimeAxisRendererPlugin({
            height: this.opt.bottomAxisHeight,
            getCrosshair: () => {
                const pos = this.interaction.crosshairPos
                const idx = this.interaction.crosshairIndex
                if (pos && idx !== null) {
                    return { x: pos.x, index: idx }
                }
                return null
            },
        }))
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
        this.settings = { ...settings }
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
        // 1. 重置 Marker 标记
        this.markerManager.clear()

        // 2. 准备帧数据（视口 / 可见范围 / K 线坐标，优先走缓存）
        const frame = this.prepareFrameData(level)
        if (!frame) {
            if (this.dataManager.getInternalData().length === 0) this.clearAllCanvases()
            return
        }

        const { vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx, useCachedFrame } = frame

        // 3. 更新交互控制器坐标映射
        this.interaction.setKLinePositions(kLinePositions, range, kWidthPx)

        // 4. 通知调度器当前活跃主图指标 + 获取价格范围
        this.indicatorScheduler.setActiveMainIndicators(
            [...this._mainIndicatorsSignal.peek().entries()].map(([id, entry]) => ({ id, params: entry.params })),
        )
        const mainIndicatorRange = useCachedFrame ? null : this.indicatorScheduler.getMainIndicatorPriceRange()
        const hasCrosshair = this.interaction.getCrosshairIndex() !== null

        // 5. 遍历所有 Pane 渲染主层 / overlay / Y 轴
        const { sharedXAxisLabels, sharedXAxisRanges } = this.renderPanes(
            vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx,
            mainIndicatorRange, hasCrosshair, useCachedFrame, level,
        )

        // 6. 持久化十字线状态供下帧判断清除
        this.overlayHadCrosshair = hasCrosshair

        // 7. 渲染 X 轴时间轴
        this.renderXAxis(vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx, sharedXAxisLabels, sharedXAxisRanges)
    }

    private prepareFrameData(level: UpdateLevel): FrameData | null {
        const useCachedFrame = level === UpdateLevel.Overlay && this.cachedDrawFrame !== null

        const vp = useCachedFrame ? this.cachedDrawFrame!.viewport : this.computeViewport()
        if (!vp) return null

        const internalData = this.dataManager.getInternalData()
        if (internalData.length === 0) return null

        const rawRange = useCachedFrame
            ? this.cachedDrawFrame!.range
            : (() => {
                const { start, end } = getVisibleRange(
                    vp.scrollLeft,
                    vp.plotWidth,
                    this.opt.kWidth,
                    this.opt.kGap,
                    internalData.length,
                    vp.dpr
                )
                return { start, end }
            })()
        const range = { start: Math.max(0, rawRange.start), end: rawRange.end }

        if (!useCachedFrame && (
            range.start !== this.dataManager.lastVisibleRange.start
            || range.end !== this.dataManager.lastVisibleRange.end
            || rawRange.start !== this.dataManager.lastRawVisibleRange.start
            || rawRange.end !== this.dataManager.lastRawVisibleRange.end
        )) {
            this.indicatorScheduler.updateVisibleRange(range)
            this.dataManager.lastVisibleRange = range
            this.dataManager.lastRawVisibleRange = rawRange
            this.checkVisibleRangeGapWhenIdle()
        }

        const kLinePositions = useCachedFrame
            ? this.cachedDrawFrame!.kLinePositions
            : this.calcKLinePositions(range)

        let kLineCenters: number[]
        let kBarRects: Array<{ x: number; width: number }>
        let kWidthPx: number

        if (useCachedFrame) {
            kLineCenters = this.cachedDrawFrame!.kLineCenters
            kBarRects = this.cachedDrawFrame!.kBarRects
            kWidthPx = this.cachedDrawFrame!.kWidthPx
        } else {
            const physConfig = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, vp.dpr)
            let barWidthPx = Math.max(1, physConfig.unitPx - 1)
            if (barWidthPx % 2 === 0) barWidthPx -= 1

            kLineCenters = new Array(kLinePositions.length)
            kBarRects = new Array(kLinePositions.length)

            for (let i = 0; i < kLinePositions.length; i++) {
                const x = kLinePositions[i]!
                const leftPx = Math.round(x * vp.dpr)
                const wickXPx = leftPx + (physConfig.kWidthPx - 1) / 2
                kLineCenters[i] = wickXPx / vp.dpr

                const barLeftPx = wickXPx - (barWidthPx - 1) / 2
                kBarRects[i] = { x: barLeftPx / vp.dpr, width: barWidthPx / vp.dpr }
            }

            kWidthPx = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, vp.dpr).kWidthPx
            this.cachedDrawFrame = {
                viewport: { ...vp },
                range: { ...range },
                kLinePositions,
                kLineCenters,
                kBarRects,
                kWidthPx,
            }
        }

        return { vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx, useCachedFrame }
    }

    private clearAllCanvases() {
        const vp = this.computeViewport()
        if (!vp) return
        for (const r of this.paneRenderers) {
            const { mainCtx, overlayCtx, yAxisCtx } = r.getContexts()
            const pane = r.getPane()
            mainCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
            overlayCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
            yAxisCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
        }
        const xCtx = this.xAxisCtx
        if (xCtx) {
            const xW = xCtx.canvas.width
            const xH = xCtx.canvas.height
            xCtx.clearRect(0, 0, xW, xH)
        }
    }

    private renderPanes(
        vp: Viewport,
        range: VisibleRange,
        kLinePositions: KLinePositions,
        kLineCenters: number[],
        kBarRects: Array<{ x: number; width: number }>,
        kWidthPx: number,
        mainIndicatorRange: { min: number; max: number } | null,
        hasCrosshair: boolean,
        useCachedFrame: boolean,
        level: UpdateLevel,
    ): { sharedXAxisLabels: XAxisLabel[]; sharedXAxisRanges: XAxisRange[] } {
        const sharedYAxisLabels: YAxisLabel[] = []
        const sharedXAxisLabels: XAxisLabel[] = []
        const sharedYAxisRanges: YAxisRange[] = []
        const sharedXAxisRanges: XAxisRange[] = []

        for (const renderer of this.paneRenderers) {
            const pane = renderer.getPane()
            const { mainCtx, overlayCtx, yAxisCtx } = renderer.getContexts()
            const { candleSurface, lineSurface } = renderer.getWebGL()

            if (!useCachedFrame) {
                const indicatorRange = pane.role === 'price' ? mainIndicatorRange : null
                const comparisonRange = pane.id === 'main' ? this.dataManager.getComparisonEquivalentPriceRange(range) : null
                const mergedRange = this.mergeNumericRanges(indicatorRange, comparisonRange)
                pane.updateRange(this.dataManager.getInternalData(), range, mergedRange)
                if (pane.id === 'main' && this.settings.disableMainPaneVerticalScroll) {
                    pane.yAxis.resetTransform()
                }
            }

            const shouldUpdateMain = level === UpdateLevel.Main || level === UpdateLevel.All
            const shouldUpdateOverlay = level === UpdateLevel.All || (level === UpdateLevel.Overlay && (hasCrosshair || this.overlayHadCrosshair))

            if (shouldUpdateMain && mainCtx) {
                mainCtx.setTransform(1, 0, 0, 1, 0, 0)
                mainCtx.scale(vp.dpr, vp.dpr)
                mainCtx.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
                candleSurface?.clear()
                lineSurface?.clear()
            }

            if (shouldUpdateOverlay && overlayCtx) {
                const overlayWidth = overlayCtx.canvas.width / vp.dpr
                overlayCtx.setTransform(1, 0, 0, 1, 0, 0)
                overlayCtx.scale(vp.dpr, vp.dpr)
                overlayCtx.clearRect(0, 0, overlayWidth + 1, pane.height + 2 / vp.dpr)
            }

            if (yAxisCtx && !useCachedFrame) {
                const yAxisWidth = yAxisCtx.canvas.width / vp.dpr
                yAxisCtx.setTransform(1, 0, 0, 1, 0, 0)
                yAxisCtx.scale(vp.dpr, vp.dpr)
                yAxisCtx.clearRect(0, 0, yAxisWidth, pane.height + 2 / vp.dpr)
            }

            const context: RenderContext = {
                ctx: mainCtx!,
                overlayCtx: overlayCtx ?? undefined,
                pane: wrapPaneInfo(pane),
                data: this.dataManager.getInternalData(),
                comparisonData: this.dataManager.getComparisonData(),
                comparisonSymbols: this.dataManager.getComparisonSpecs(),
                range,
                scrollLeft: vp.scrollLeft,
                kWidth: this.opt.kWidth,
                kGap: this.opt.kGap,
                dpr: vp.dpr,
                paneWidth: vp.plotWidth,
                kLinePositions,
                kLineCenters,
                kBarRects,
                markerManager: this.markerManager,
                crosshairIndex: this.interaction.getCrosshairIndex(),
                yAxisCtx: yAxisCtx ?? undefined,
                candleWebGLSurface: candleSurface ?? undefined,
                lineWebGLSurface: lineSurface ?? undefined,
                zoomLevel: this.zoomController.currentZoomLevel,
                zoomLevelCount: this.zoomController.zoomLevelCount,
                viewport: {
                    scrollLeft: vp.scrollLeft,
                    plotWidth: vp.plotWidth,
                    plotHeight: vp.plotHeight,
                },
                settings: this.settings,
                yAxisLabels: sharedYAxisLabels,
                xAxisLabels: sharedXAxisLabels,
                yAxisRanges: sharedYAxisRanges,
                xAxisRanges: sharedXAxisRanges,
                theme: this._themeSignal.peek(),
                isAsiaMarket: this.settings.isAsiaMarket as boolean,
                colorPresetSettings: this.settings.colorPresetSettings,
            }

            if (shouldUpdateMain || shouldUpdateOverlay) {
                const errors = this.rendererPluginManager.render(pane.id, context, level)
                if (errors.length > 0) {
                    this.pluginHost.events.emit('renderer:error', { paneId: pane.id, errors })
                }

                const yAxisErrors = this.rendererPluginManager.renderPlugin('yAxis', context)
                if (yAxisErrors.length > 0) {
                    this.pluginHost.events.emit('renderer:error', { paneId: pane.id, errors: yAxisErrors })
                }
            }
        }

        return { sharedXAxisLabels, sharedXAxisRanges }
    }

    private renderXAxis(
        vp: Viewport,
        range: VisibleRange,
        kLinePositions: KLinePositions,
        kLineCenters: number[],
        kBarRects: Array<{ x: number; width: number }>,
        kWidthPx: number,
        sharedXAxisLabels: XAxisLabel[],
        sharedXAxisRanges: XAxisRange[],
    ): void {
        const xAxisCtx = this.xAxisCtx ?? this.dom.xAxisCanvas.getContext('2d')
        if (!this.xAxisCtx) {
            this.xAxisCtx = xAxisCtx
        }
        if (xAxisCtx) {
            const timeAxisContext: RenderContext = {
                ctx: xAxisCtx,
                pane: {
                    id: 'xAxis',
                    role: 'auxiliary',
                    capabilities: {
                        showPriceAxisTicks: false,
                        showCrosshairPriceLabel: false,
                        candleHitTest: false,
                        supportsPriceTranslate: false,
                    },
                    top: 0,
                    height: this.opt.bottomAxisHeight,
                    yAxis: {
                        priceToY: () => 0,
                        yToPrice: () => 0,
                        getPaddingTop: () => 0,
                        getPaddingBottom: () => 0,
                        getPriceOffset: () => 0,
                        getDisplayRange: (baseRange) => baseRange ?? { maxPrice: 0, minPrice: 0 },
                        getScaleType: () => 'linear' as const,
                        getBasePrice: () => null,
                        toPercent: () => 0,
                        fromPercent: () => 0,
                        getDisplayPercentRange: () => ({ minPct: 0, maxPct: 0 }),
                    },
                    priceRange: { maxPrice: 0, minPrice: 0 },
                },
                data: this.dataManager.getInternalData(),
                range,
                scrollLeft: vp.scrollLeft,
                kWidth: this.opt.kWidth,
                kGap: this.opt.kGap,
                dpr: vp.dpr,
                paneWidth: vp.plotWidth,
                kLinePositions,
                kLineCenters,
                kBarRects,
                xAxisCtx,
                viewport: {
                    scrollLeft: vp.scrollLeft,
                    plotWidth: vp.plotWidth,
                    plotHeight: vp.plotHeight,
                },
                yAxisLabels: [],
                xAxisLabels: sharedXAxisLabels,
                xAxisRanges: sharedXAxisRanges,
                theme: this._themeSignal.peek(),
                isAsiaMarket: this.settings.isAsiaMarket as boolean,
                colorPresetSettings: this.settings.colorPresetSettings,
            }
            const errors = this.rendererPluginManager.renderPlugin('timeAxis', timeAxisContext)
            if (errors.length > 0) {
                this.pluginHost.events.emit('renderer:error', { paneId: 'timeAxis', errors })
            }
        }
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
        return this.markerManager
    }

    /** 更新自定义标记 */
    updateCustomMarkers(markers: CustomMarkerEntity[]): void {
        this.markerManager.setCustomMarkers(markers)
        this.scheduleDraw()
    }

    /** 清除自定义标记 */
    clearCustomMarkers(): void {
        this.markerManager.clearCustomMarkers()
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
     * 计算 K 线起始 x 坐标数组，与 candle.ts 的像素对齐方式保持一致
     * @param range 可见 K 线索引范围
     * @returns x 坐标数组（逻辑像素，经过物理像素对齐）
     */
    calcKLinePositions(range: VisibleRange): KLinePositions {
        const { start, end } = range
        const count = end - start

        // 边界检查：防止负数或零长度数组
        if (count <= 0) {
            return []
        }

        const dpr = this.viewportManager.getEffectiveDpr()

        // 统一使用 getPhysicalKLineConfig，确保与渲染完全一致
        const { unitPx, startXPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)

        const positions: number[] = new Array(count)

        for (let i = 0; i < count; i++) {
            const dataIndex = start + i
            const leftPx = startXPx + dataIndex * unitPx
            positions[i] = leftPx / dpr
        }

        return positions
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
        if (!this.layoutManager.hasPane(paneId)) {
            this.layoutManager.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const definition = this.indicatorScheduler.getIndicatorMetadata(indicatorId)
        if (!definition) {
            throw new Error(`[Chart] Unknown indicator: ${indicatorId}`)
        }
        const renderer = createSubIndicatorRenderer({ indicatorId, paneId, definition, params })
        const rendererName = renderer.name
        const existing = this.getRenderer(rendererName)
        if (existing) {
            if (params) this.updateRendererConfig(rendererName, params)
            return
        }

        this.useRenderer(renderer, params)
    }

    /** 更新绘图对象 */
    setDrawings(drawings: import('../plugin').DrawingObject[]): void {
        this.drawingStore.setAll(drawings)
        this._drawingsSignal.set(drawings)
        this.scheduleDraw()
    }

    /** 更新选中的绘图 ID */
    setSelectedDrawingId(id: string | null): void {
        if (this.drawingStore.getSelectedId() === id) return
        this.drawingStore.setSelectedId(id)
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

    /**
     * 创建副图面板并注册指标渲染器
     * @param paneId 副图实例标识符（如 'RSI_0', 'MACD_0'）
     * @param indicatorId 指标类型
     * @param params 指标参数
     * @returns 是否创建成功
     */
    createSubPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): boolean {
        const paneSpecs = this.layoutManager.getPaneSpecs()
        const visibleSpecs = paneSpecs.filter((pane) => pane.visible !== false)
        const pricePanes = visibleSpecs.filter((pane) => pane.role === 'price')
        const indicatorPanes = visibleSpecs.filter((pane) => pane.role === 'indicator')

        if (pricePanes.length === 1) {
            const pricePane = pricePanes[0]
            if (pricePane) {
                this.layoutManager.setInternalPaneRatio(pricePane.id, 3)
            }
            for (const pane of indicatorPanes) {
                this.layoutManager.setInternalPaneRatio(pane.id, 1)
            }
            this.layoutManager.setInternalPaneRatio(paneId, 1)
        } else {
            this.layoutManager.setInternalPaneRatio(paneId, 1)
        }

        this.upsertPane({ id: paneId, ratio: this.layoutManager.getInternalPaneRatios().get(paneId) ?? 1, visible: true, role: 'indicator' })

        const success = this.subPaneManager.create(this, paneId, indicatorId, params ?? this.getDefaultSubPaneParams(indicatorId))
        return success
    }

    /**
     * 移除副图面板及其渲染器
     * @param paneId 副图实例标识符
     */
    removeSubPane(paneId: string): void {
        this.subPaneManager.remove(this, paneId)
    }

    /**
     * 替换副图的指标类型
     * @param paneId 副图实例标识符
     * @param newIndicatorId 新的指标类型
     * @param params 新指标参数
     */
    replaceSubPaneIndicator(paneId: string, newIndicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void {
        this.subPaneManager.replaceIndicator(this, paneId, newIndicatorId, params ?? this.getDefaultSubPaneParams(newIndicatorId))
    }

    /**
     * 更新副图指标参数
     * @param paneId 副图实例标识符
     * @param params 新参数
     */
    updateSubPaneParams(paneId: string, params: Record<string, unknown>): void {
        this.subPaneManager.updateParams(this, paneId, params)
    }

    /**
     * 清除所有副图面板
     */
    clearSubPanes(): void {
        // 获取所有副图 paneId
        const subPaneIds = this.subPaneManager.getPaneIds()

        if (subPaneIds.length === 0) return

        // 移除所有副图
        this.subPaneManager.clear(this)

        // 清理 pane ratios
        for (const paneId of subPaneIds) {
            this.layoutManager.deleteInternalPaneRatio(paneId)
        }

        // 更新布局，移除所有副图 pane
        this.layoutManager.applyPaneLayoutSpecs(this.layoutManager.getPaneSpecs().filter((spec) => !subPaneIds.includes(spec.id)))
    }

    /**
     * 获取当前所有副图指标类型
     * @deprecated 使用 getSubPaneEntries 获取完整信息
     */
    getSubPaneIndicators(): SubIndicatorType[] {
        return this.subPaneManager.getAll().map((entry) => entry.indicatorId)
    }

    /**
     * 获取所有副图条目
     */
    getSubPaneEntries(): SubPaneEntry[] {
        return this.subPaneManager.getAll()
    }

    /**
     * 根据 paneId 获取副图条目
     * @param paneId 副图实例标识符
     */
    getSubPaneEntry(paneId: string): SubPaneEntry | undefined {
        return this.subPaneManager.getByPaneId(paneId)
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

    /** 副图渲染器名称前缀（保留向后兼容） */
    private static readonly SUB_PANE_PREFIX = 'sub_'

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
        return this.indicatorScheduler
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
        this.cachedDrawFrame = null
        this.layoutManager.layoutPanes()
        this.viewportManager.updateViewportSignal()
        this.scheduleDraw()
    }

    /**
     * 请求下一帧重绘（RAF 合并，支持分层更新）
     * @param level 更新级别，默认为 All
     */
    scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
        // 合并更新级别：如果已有更高级别的调度，保持高级别
        if (this.raf !== null) {
            // 已有 All 级别调度，任何新请求都忽略
            if (this.pendingUpdateLevel === UpdateLevel.All) return
            // 新请求是 All，覆盖之前的 Main/Overlay
            if (level === UpdateLevel.All) {
                this.pendingUpdateLevel = UpdateLevel.All
                return
            }
            // Main + Overlay = All
            if (
                (this.pendingUpdateLevel === UpdateLevel.Main && level === UpdateLevel.Overlay) ||
                (this.pendingUpdateLevel === UpdateLevel.Overlay && level === UpdateLevel.Main)
            ) {
                this.pendingUpdateLevel = UpdateLevel.All
                return
            }
            // 同级别或更低级别，忽略
            return
        }

        this.pendingUpdateLevel = level
        this.raf = requestAnimationFrame(() => {
            this.raf = null
            const levelToDraw = this.pendingUpdateLevel
            this.pendingUpdateLevel = UpdateLevel.All  // 重置为默认值
            this.draw(levelToDraw)
            const c = this.dom.container
            if (c) {
                this.viewportManager.applyPendingScrollLeft(c)
            }
        })
    }

    /** 销毁图表实例 */
    async destroy() {
        if (this.raf !== null) {
            cancelAnimationFrame(this.raf)
            this.raf = null
        }

        this.dataManager.destroy()
        this.viewportManager.destroy()
        this.cachedDrawFrame = null
        this.xAxisCtx = null
        this.layoutManager.destroy()
        this.sharedWebGLSurface.destroy()

        // 清理渲染器插件管理器（会调用所有 onUninstall）
        this.rendererPluginManager.clear()

        this.indicatorScheduler.destroy()
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

    private _indicatorsComputed = computed<ReadonlyArray<IndicatorInstance>>(() => {
        const mainIndicators: IndicatorInstance[] = [...this._mainIndicatorsSignal().entries()].map(([id, entry]) => ({
            id,
            definitionId: id,
            label: id,
            name: id,
            role: 'main' as const,
            params: { ...entry.params },
        }))

        const subIndicators: IndicatorInstance[] = this.subPaneManager.entriesSignal().map(entry => ({
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
    private _subPanesComputed = computed<ReadonlyArray<SubPaneInfo>>(() => {
        const ratios = this._paneRatiosSignal()
        return this.subPaneManager.entriesSignal().map(entry => ({
            paneId: entry.paneId,
            indicatorId: entry.indicatorId,
            params: { ...entry.params },
            ratio: ratios[entry.paneId] ?? 1,
        }))
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
        return this._indicatorsComputed
    }

    /** 子图信息信号（派生信号，自动随副图条目/比例更新） */
    get subPanes(): Computed<ReadonlyArray<SubPaneInfo>> {
        return this._subPanesComputed
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

    private checkVisibleRangeGapWhenIdle(): void {
        if (this.interaction.isPointerDown()) return
        this.dataManager.checkVisibleRangeGap()
    }

    private mergeNumericRanges(
        left: { min: number; max: number } | null | undefined,
        right: { min: number; max: number } | null | undefined,
    ): { min: number; max: number } | null {
        if (!left) return right ?? null
        if (!right) return left
        return {
            min: Math.min(left.min, right.min),
            max: Math.max(left.max, right.max),
        }
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
        if (role === 'main') {
            const success = this.enableMainIndicator(definitionId, params as Record<string, number | boolean | string>)
            if (!success) return null
            return definitionId.toUpperCase()
        } else {
            // 副图指标
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

    /**
     * 移除指标（高层 API）
     * @param instanceId 指标实例 ID
     * @returns 是否成功移除
     */
    removeIndicator(instanceId: string): boolean {
        const id = instanceId.toUpperCase()

        // 先尝试作为主图指标移除
        if (this._mainIndicatorsSignal.peek().has(id)) {
            return this.disableMainIndicator(instanceId)
        }

        // 再尝试作为副图指标移除
        const subPaneEntry = this.getSubPaneEntry(instanceId)
        if (subPaneEntry) {
            this.removeSubPane(instanceId)
            return true
        }

        return false
    }

    /**
     * 更新指标参数（高层 API）
     * @param instanceId 指标实例 ID
     * @param params 新参数
     * @returns 是否成功更新
     */
    updateIndicatorParams(instanceId: string, params: Record<string, unknown>): boolean {
        const id = instanceId.toUpperCase()

        // 先尝试作为主图指标更新
        if (this._mainIndicatorsSignal.peek().has(id)) {
            this.updateMainIndicatorParams(instanceId, params as Record<string, number | boolean | string>)
            return true
        }

        // 再尝试作为副图指标更新
        const subPaneEntry = this.getSubPaneEntry(instanceId)
        if (subPaneEntry) {
            this.updateSubPaneParams(instanceId, params)
            return true
        }

        return false
    }

    /**
     * 重新排序指标（高层 API）
     * @param orderedInstanceIds 排序后的指标实例 ID 数组
     * @returns 是否成功
     */
    reorderIndicators(orderedInstanceIds: string[]): boolean {
        // TODO: 实现副图指标的重新排序
        // 需要调用 updatePaneLayout 来调整 pane 顺序
        console.warn('[Chart] reorderIndicators not fully implemented yet')
        return false
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




