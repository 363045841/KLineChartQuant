import type { KLineData } from '../types/price'
import type { ChartSettings } from '../config/chartSettings'
import { createSignal, computed, type Signal, type Computed } from '../reactivity/signal'
import { getVisibleRange } from './viewport/viewport'
import { Pane, type VisibleRange, UpdateLevel } from './layout/pane'
import { InteractionController, type InteractionSnapshot } from './controller/interaction'
export type { InteractionSnapshot }
import { PaneRenderer } from './paneRenderer'
import { SharedWebGLSurface } from './renderers/webgl/sharedWebGLSurface'
import { MarkerManager, type CustomMarkerEntity } from './marker/registry'
import { getPhysicalKLineConfig, calcKWidthPx } from './utils/klineConfig'
import { computeContentWidth } from './chart-store'
import { computeZoom, computeZoomToLevel, type ZoomConfig } from './utils/zoom'
import { IndicatorScheduler } from './indicators/scheduler'
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
    type PaneCapabilities,
    type YAxisLabel,
    type XAxisLabel,
    type YAxisRange,
    type XAxisRange,
} from '../plugin'
import { createSubIndicatorRenderer, type SubIndicatorType } from './renderers/Indicator'
import { createMARendererPlugin } from './renderers/Indicator/ma'
import { createBOLLRendererPlugin } from './renderers/Indicator/boll'
import { createEXPMARendererPlugin } from './renderers/Indicator/expma'
import { createENERendererPlugin } from './renderers/Indicator/ene'
import { createWMARendererPlugin } from './renderers/Indicator/wma'
import { createDEMARendererPlugin } from './renderers/Indicator/dema'
import { createTEMARendererPlugin } from './renderers/Indicator/tema'
import { createHMARendererPlugin } from './renderers/Indicator/hma'
import { createKAMARendererPlugin } from './renderers/Indicator/kama'
import { createSARRendererPlugin } from './renderers/Indicator/sar'
import { createSuperTrendRendererPlugin } from './renderers/Indicator/supertrend'
import { createKeltnerRendererPlugin } from './renderers/Indicator/keltner'
import { createDonchianRendererPlugin } from './renderers/Indicator/donchian'
import { createIchimokuRendererPlugin } from './renderers/Indicator/ichimoku'
import { createPivotRendererPlugin } from './renderers/Indicator/pivot'
import { createFibRendererPlugin } from './renderers/Indicator/fib'
import { createStructureRendererPlugin } from './renderers/Indicator/structure'
import { createZonesRendererPlugin } from './renderers/Indicator/zones'
import { createMainIndicatorLegendRendererPlugin } from './renderers/Indicator/mainIndicatorLegend'
import { DrawingStore } from './drawing'
import { createDrawingRendererPlugin, createDrawingLabelOverlayPlugin } from './drawing/plugin'
import { createGridLinesRendererPlugin } from './renderers/gridLines'
import { createCandleRenderer } from './renderers/candle'
import { createLastPriceLineRendererPlugin, createLastPriceLabelRegistrarPlugin } from './renderers/lastPrice'
import { createCustomMarkersRenderer } from './renderers/customMarkers'
import { createYAxisRendererPlugin } from './renderers/yAxis'
import { createCrosshairRendererPlugin } from './renderers/crosshair'
import { createTimeAxisRendererPlugin } from './renderers/timeAxis'
import type { BOLLSchedulerConfig, EXPMASchedulerConfig, ENESchedulerConfig, WMASchedulerConfig, DEMASchedulerConfig, TEMASchedulerConfig, HMASchedulerConfig, KAMASchedulerConfig, SARSchedulerConfig, SuperTrendSchedulerConfig, KeltnerSchedulerConfig, DonchianSchedulerConfig, IchimokuSchedulerConfig, PivotSchedulerConfig, FibSchedulerConfig, StructureSchedulerConfig, ZonesSchedulerConfig } from './indicators/scheduler'

// 重新导出以保持向后兼容
export { getPhysicalKLineConfig, calcKWidthPx }

/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 */
/**
 * 图表 DOM 元素引用
 * @property container 图表容器 div
 * @property canvasLayer Canvas 层容器 div（包含所有绘制 canvas）
 * @property xAxisCanvas X 轴时间轴 canvas
 */
export type ChartDom = {
    container: HTMLDivElement
    canvasLayer: HTMLDivElement
    rightAxisLayer: HTMLDivElement
    xAxisCanvas: HTMLCanvasElement
}

/**
 * Pane 面板配置
 * @property id Pane 标识符
 * @property ratio Pane 高度占比
 * @property visible 是否可见（默认 true）
 */
export type PaneSpec = {
    id: string
    ratio: number
    visible?: boolean
    minHeightPx?: number
    role?: PaneRole
    capabilities?: Partial<PaneCapabilities>
}

export type PaneRendererDom = {
    mainCanvas: HTMLCanvasElement
    overlayCanvas: HTMLCanvasElement
    yAxisCanvas: HTMLCanvasElement
}

export type ChartOptions = {
    /** K 线宽度（可选，由 zoomLevel 派生） */
    kWidth?: number
    /** K 线间隙（可选，由 DPR 计算） */
    kGap?: number
    yPaddingPx: number
    rightAxisWidth: number
    bottomAxisHeight: number
    minKWidth: number
    maxKWidth: number
    panes: PaneSpec[]

    /** pane 之间的真实分隔空隙（逻辑像素） */
    paneGap?: number

    /** 价格标签额外宽度（用于显示涨跌幅，默认 60px） */
    priceLabelWidth?: number

    /** pane 最小高度（逻辑像素，默认 60） */
    defaultPaneMinHeightPx?: number

    /**
     * 缩放级别数量（默认 10）
     * - 将 minKWidth ~ maxKWidth 划分为多少个离散级别
     * - 例如 10 表示有 10 个缩放级别（1-10）
     */
    zoomLevels?: number

    /**
     * 初始缩放级别（1 ~ zoomLevels，默认 1）
     * 未指定时默认为最小级别
     */
    initialZoomLevel?: number
}

/** K 线起始 x 坐标数组，positions[i] 表示第 i 根 K 线的起始 x 坐标（逻辑像素） */
export type KLinePositions = number[]

export type Viewport = {
    viewWidth: number
    viewHeight: number
    plotWidth: number
    plotHeight: number
    scrollLeft: number
    dpr: number
}

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
    private _internalData: KLineData[] = []

    private raf: number | null = null
    private pendingUpdateLevel: UpdateLevel = UpdateLevel.All
    private _internalViewport: Viewport | null = null

    private paneRenderers: PaneRenderer[] = []
    private markerManager: MarkerManager
    private drawingStore = new DrawingStore()
    readonly interaction: InteractionController

    /** 插件宿主 */
    private pluginHost: PluginHostImpl

    /** 渲染器插件管理器 */
    private rendererPluginManager: RendererPluginManager

    /** 精确 DPR（来自 ResizeObserver 的 devicePixelContentBoxSize） */
    private preciseDpr = 0

    /** 统一监听容器尺寸与 DPR 变化 */
    private resizeObserver?: ResizeObserver

    /** scroll 事件处理器引用（用于 cleanup） */
    private onScroll?: () => void

    /** 最近一次观测到的容器尺寸 */
    private observedSize = { width: 0, height: 0 }

    /** 缓存的 scrollLeft（通过 scroll 事件同步，避免每帧读取 DOM 触发强制回流） */
    private cachedScrollLeft = 0

    /** overlay 上一帧是否有十字线（用于判断何时需要清除） */
    private overlayHadCrosshair = false

    /** 用户设置配置（传递给渲染器） */
    private settings: ChartSettings = {}

    /** pane ratio 状态（按 paneId 维护，sum=1 仅对可见 pane） */
    private _internalPaneRatios: Map<string, number> = new Map()

    /** 视口变化回调（供外部同步 DPR/尺寸） */
    private onViewportChange?: (viewport: Viewport) => void

    /** 共享 X 轴上下文缓存 */
    private xAxisCtx: CanvasRenderingContext2D | null = null

    /** Chart 级共享 WebGL canvas/context */
    private sharedWebGLSurface: SharedWebGLSurface

    /** pane 布局回流回调（Chart -> UI 单向） */
    private onPaneLayoutChange?: (panes: PaneSpec[]) => void

    /** 数据变化回调（供外部同步 dataLength） */
    private onDataChange?: (data: KLineData[]) => void

    /** 当前缩放级别（1 ~ zoomLevelCount） */
    private currentZoomLevel: number = 1

    /** 缩放级别总数 */
    private readonly zoomLevelCount: number

    /** 指标调度器（负责计算 MA 等指标并写入 StateStore）
     * TODO: 阶段5迁移为插件注册，Scheduler 通过事件监听 data/viewport 变更，Chart 不直接持有
     */
    private indicatorScheduler: IndicatorScheduler

    /** 上次可见范围（用于检测视口变化） */
    private lastVisibleRange: VisibleRange = { start: 0, end: 0 }

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

    /** 主图指标默认参数 */
    private static DEFAULT_MAIN_PARAMS: Record<string, Record<string, number | boolean | string>> = {
        MA: { ma5: true, ma10: true, ma20: true, ma30: true, ma60: true },
        BOLL: { period: 20, multiplier: 2, showUpper: true, showMiddle: true, showLower: true, showBand: true },
        EXPMA: { fastPeriod: 12, slowPeriod: 50 },
        ENE: { period: 10, deviation: 11 },
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
        PIVOT: { showPP: true, showR1: true, showR2: true, showR3: false, showS1: true, showS2: true, showS3: false },
        FIB: { period: 50, showLevels: true },
        STRUCTURE: { leftWindow: 2, rightWindow: 2, breakoutSource: 'close', showSwingLabels: true, showBOS: true, showCHOCH: true, showProvisional: false },
        ZONES: { showFVG: true, showOB: true, showFilledZones: false, obLookback: 5 },
    }

    /**
     * 启用主图指标
     * @param indicatorId 指标ID
     * @param params 可选的指标参数
     * @returns 是否成功启用
     */
    enableMainIndicator(indicatorId: string, params?: Record<string, number | boolean | string>): boolean {
        const id = indicatorId.toUpperCase()
        if (!['MA', 'BOLL', 'EXPMA', 'ENE', 'WMA', 'DEMA', 'TEMA', 'HMA', 'KAMA', 'SAR', 'SUPERTREND', 'KELTNER', 'DONCHIAN', 'ICHIMOKU', 'PIVOT', 'FIB', 'STRUCTURE', 'ZONES'].includes(id)) {
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

        // 更新调度器配置
        this.updateIndicatorSchedulerConfig(id)

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
        const rendererMap: Record<string, () => void> = {
            'MA': () => {
                if (!this.getRenderer('ma')) {
                    this.useRenderer(createMARendererPlugin())
                }
                this.setRendererEnabled('ma', true)
            },
            'BOLL': () => {
                if (!this.getRenderer('boll')) {
                    this.useRenderer(createBOLLRendererPlugin())
                }
                this.setRendererEnabled('boll', true)
            },
            'EXPMA': () => {
                if (!this.getRenderer('expma')) {
                    this.useRenderer(createEXPMARendererPlugin())
                }
                this.setRendererEnabled('expma', true)
            },
            'ENE': () => {
                if (!this.getRenderer('ene')) {
                    this.useRenderer(createENERendererPlugin())
                }
                this.setRendererEnabled('ene', true)
            },
            'WMA': () => {
                if (!this.getRenderer('wma_main')) {
                    this.useRenderer(createWMARendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('wma_main', true)
            },
            'DEMA': () => {
                if (!this.getRenderer('dema_main')) {
                    this.useRenderer(createDEMARendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('dema_main', true)
            },
            'TEMA': () => {
                if (!this.getRenderer('tema_main')) {
                    this.useRenderer(createTEMARendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('tema_main', true)
            },
            'HMA': () => {
                if (!this.getRenderer('hma_main')) {
                    this.useRenderer(createHMARendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('hma_main', true)
            },
            'KAMA': () => {
                if (!this.getRenderer('kama_main')) {
                    this.useRenderer(createKAMARendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('kama_main', true)
            },
            'SAR': () => {
                if (!this.getRenderer('sar_main')) {
                    this.useRenderer(createSARRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('sar_main', true)
            },
            'SUPERTREND': () => {
                if (!this.getRenderer('supertrend_main')) {
                    this.useRenderer(createSuperTrendRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('supertrend_main', true)
            },
            'KELTNER': () => {
                if (!this.getRenderer('keltner_main')) {
                    this.useRenderer(createKeltnerRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('keltner_main', true)
            },
            'DONCHIAN': () => {
                if (!this.getRenderer('donchian_main')) {
                    this.useRenderer(createDonchianRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('donchian_main', true)
            },
            'ICHIMOKU': () => {
                if (!this.getRenderer('ichimoku_main')) {
                    this.useRenderer(createIchimokuRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('ichimoku_main', true)
            },
            'PIVOT': () => {
                if (!this.getRenderer('pivot_main')) {
                    this.useRenderer(createPivotRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('pivot_main', true)
            },
            'FIB': () => {
                if (!this.getRenderer('fib_main')) {
                    this.useRenderer(createFibRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('fib_main', true)
            },
            'STRUCTURE': () => {
                if (!this.getRenderer('structure_main')) {
                    this.useRenderer(createStructureRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('structure_main', true)
            },
            'ZONES': () => {
                if (!this.getRenderer('zones_main')) {
                    this.useRenderer(createZonesRendererPlugin({ paneId: 'main' }))
                }
                this.setRendererEnabled('zones_main', true)
            },
        }

        const fn = rendererMap[indicatorId]
        if (fn) fn()

        // 确保图例渲染器已注册
        if (!this.getRenderer('mainIndicatorLegend')) {
            this.useRenderer(createMainIndicatorLegendRendererPlugin({ yPaddingPx: this.opt.yPaddingPx }))
        }
    }

    /**
     * 禁用主图指标渲染器（内部方法）
     */
    private disableMainIndicatorRenderer(indicatorId: string): void {
        const rendererMap: Record<string, string> = {
            'MA': 'ma',
            'BOLL': 'boll',
            'EXPMA': 'expma',
            'ENE': 'ene',
            'WMA': 'wma_main',
            'DEMA': 'dema_main',
            'TEMA': 'tema_main',
            'HMA': 'hma_main',
            'KAMA': 'kama_main',
            'SAR': 'sar_main',
            'SUPERTREND': 'supertrend_main',
            'KELTNER': 'keltner_main',
            'DONCHIAN': 'donchian_main',
            'ICHIMOKU': 'ichimoku_main',
            'PIVOT': 'pivot_main',
            'FIB': 'fib_main',
            'STRUCTURE': 'structure_main',
            'ZONES': 'zones_main',
        }

        const rendererName = rendererMap[indicatorId]
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

        switch (indicatorId) {
            case 'MA':
                this.indicatorScheduler.updateMAConfig({
                    ma5: isActive,
                    ma10: isActive,
                    ma20: isActive,
                    ma30: isActive,
                    ma60: isActive,
                })
                break
            case 'BOLL':
                if (isActive) {
                    this.indicatorScheduler.updateBOLLConfig(params as unknown as BOLLSchedulerConfig)
                } else {
                    this.indicatorScheduler.updateBOLLConfig({ ...params, showUpper: false, showMiddle: false, showLower: false, showBand: false } as unknown as BOLLSchedulerConfig)
                }
                break
            case 'EXPMA':
                if (isActive) {
                    this.indicatorScheduler.updateEXPMAConfig(params as unknown as EXPMASchedulerConfig)
                }
                break
            case 'ENE':
                if (isActive) {
                    this.indicatorScheduler.updateENEConfig(params as unknown as ENESchedulerConfig)
                }
                break
            case 'WMA':
                this.indicatorScheduler.updateWMAConfig({ ...params, showWMA: isActive } as unknown as WMASchedulerConfig, 'main')
                break
            case 'DEMA':
                this.indicatorScheduler.updateDEMAConfig({ ...params, showDEMA: isActive } as unknown as DEMASchedulerConfig, 'main')
                break
            case 'TEMA':
                this.indicatorScheduler.updateTEMAConfig({ ...params, showTEMA: isActive } as unknown as TEMASchedulerConfig, 'main')
                break
            case 'HMA':
                this.indicatorScheduler.updateHMAConfig({ ...params, showHMA: isActive } as unknown as HMASchedulerConfig, 'main')
                break
            case 'KAMA':
                this.indicatorScheduler.updateKAMAConfig({ ...params, showKAMA: isActive } as unknown as KAMASchedulerConfig, 'main')
                break
            case 'SAR':
                this.indicatorScheduler.updateSARConfig({ ...params, showSAR: isActive } as unknown as SARSchedulerConfig, 'main')
                break
            case 'SUPERTREND':
                this.indicatorScheduler.updateSuperTrendConfig({ ...params, showSuperTrend: isActive } as unknown as SuperTrendSchedulerConfig, 'main')
                break
            case 'KELTNER':
                this.indicatorScheduler.updateKeltnerConfig({ ...params, showUpper: isActive, showMiddle: isActive, showLower: isActive } as unknown as KeltnerSchedulerConfig, 'main')
                break
            case 'DONCHIAN':
                this.indicatorScheduler.updateDonchianConfig({ ...params, showUpper: isActive, showMiddle: isActive, showLower: isActive } as unknown as DonchianSchedulerConfig, 'main')
                break
            case 'ICHIMOKU':
                this.indicatorScheduler.updateIchimokuConfig({ ...params, showTenkan: isActive, showKijun: isActive, showSpanA: isActive, showSpanB: isActive, showChikou: isActive, showCloud: isActive } as unknown as IchimokuSchedulerConfig, 'main')
                break
            case 'PIVOT':
                this.indicatorScheduler.updatePivotConfig({ ...params, showPP: isActive, showR1: isActive, showR2: isActive, showR3: isActive, showS1: isActive, showS2: isActive, showS3: isActive } as unknown as PivotSchedulerConfig, 'main')
                break
            case 'FIB':
                this.indicatorScheduler.updateFibConfig({ ...params, showLevels: isActive } as unknown as FibSchedulerConfig, 'main')
                break
            case 'STRUCTURE':
                this.indicatorScheduler.updateStructureConfig({ ...params, showSwingLabels: isActive, showBOS: isActive, showCHOCH: isActive } as unknown as StructureSchedulerConfig, 'main')
                break
            case 'ZONES':
                this.indicatorScheduler.updateZonesConfig({ ...params, showFVG: isActive, showOB: isActive, showFilledZones: isActive } as unknown as ZonesSchedulerConfig, 'main')
                break
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

        this.syncPaneRatiosFromSpecs(this.opt.panes)

        // 缩放级别由外部 SSOT 管理，Chart 只接收不计算
        this.zoomLevelCount = Math.max(2, Math.round(this.opt.zoomLevels ?? 20))
        this.currentZoomLevel = this.opt.initialZoomLevel ?? 1
        this.currentZoomLevel = Math.max(1, Math.min(this.zoomLevelCount, this.currentZoomLevel))
        // 注意：初始 kWidth/kGap 应由外部通过 applyRenderState() 传入

        // 初始化指标调度器
        this.indicatorScheduler = new IndicatorScheduler()
        this.indicatorScheduler.setPluginHost(this.pluginHost)
        for (const definition of getRegisteredIndicatorDefinitions()) {
            this.indicatorScheduler.registerIndicator(definition)
        }
        this.indicatorScheduler.setInvalidateCallback(() => this.scheduleDraw())

        // 注册副图活跃列表提供者，调度器据此只计算启用的副图
        this.indicatorScheduler.setActiveSubPaneProvider(
            () => this.subPaneManager.getPaneIds(),
        )

        this.initPanes()

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
        this.initResizeObserver()
    }


    private initCoreRenderers(): void {
        const axisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth ?? 0)

        this.useRenderer(createGridLinesRendererPlugin())
        this.useRenderer(createCandleRenderer())
        this.useRenderer(createLastPriceLineRendererPlugin())
        this.useRenderer(createLastPriceLabelRegistrarPlugin())
        this.useRenderer(createCustomMarkersRenderer())
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


    private initResizeObserver() {
        if (typeof ResizeObserver === 'undefined') return

        const target = this.dom.container
        if (!target) return

        // 初始化 scrollLeft 缓存
        this.cachedScrollLeft = target.scrollLeft
        this.onScroll = () => { this.cachedScrollLeft = target.scrollLeft }
        target.addEventListener('scroll', this.onScroll, { passive: true })

        this.resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (!entry) return

            const prevWidth = this.observedSize.width
            const prevHeight = this.observedSize.height
            const prevDpr = this.preciseDpr

            this.updateObservedMetrics(entry)

            const widthChanged = this.observedSize.width !== prevWidth
            const heightChanged = this.observedSize.height !== prevHeight
            const dprChanged = this.preciseDpr !== prevDpr
            if ((import.meta as any).env?.MODE !== 'production') {
                console.log(
                    `[Chart] resize observer: ` +
                    `size ${prevWidth}x${prevHeight} -> ${this.observedSize.width}x${this.observedSize.height} ` +
                    `dpr ${prevDpr} -> ${this.preciseDpr} ` +
                    `changed: ${widthChanged || heightChanged ? 'size' : ''}${widthChanged || heightChanged && dprChanged ? '+' : ''}${dprChanged ? 'dpr' : ''}`
                )
            }
            if (widthChanged || heightChanged || dprChanged) {
                this.resize()
            }
        })

        try {
            this.resizeObserver.observe(target, { box: 'device-pixel-content-box' as ResizeObserverBoxOptions })
        } catch {
            this.resizeObserver.observe(target)
        }
    }



    private updateObservedMetrics(entry: ResizeObserverEntry) {
        const cssWidth = Math.max(1, Math.round(entry.contentRect.width))
        const cssHeight = Math.max(1, Math.round(entry.contentRect.height))
        this.observedSize.width = cssWidth
        this.observedSize.height = cssHeight

        const pixelSize = entry.devicePixelContentBoxSize?.[0]
        const cssSize = entry.contentBoxSize?.[0]
        if (!pixelSize || !cssSize || cssSize.inlineSize <= 0) {
            this.preciseDpr = 0
            return
        }

        const raw = pixelSize.inlineSize / cssSize.inlineSize
        this.preciseDpr = Math.round(raw * 64) / 64
    }

    private getEffectiveDpr(): number {
        let dpr = this.preciseDpr > 0
            ? this.preciseDpr
            : Math.round((window.devicePixelRatio || 1) * 64) / 64
        if (dpr < 1) dpr = 1
        return dpr
    }

    getViewport(): Viewport | null {
        return this._internalViewport
    }

    getCurrentDpr(): number {
        return this.getEffectiveDpr()
    }

    /** 获取缓存的 scrollLeft（避免读取 DOM 触发强制回流） */
    getCachedScrollLeft(): number {
        return this.cachedScrollLeft
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

        // 同步对数刻度设置到所有 pane
        const scaleType = settings.logarithmicScale ? 'log' : 'linear'
        for (const renderer of this.paneRenderers) {
            renderer.getPane().yAxis.setScaleType(scaleType)
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
        if (!frame) return

        const { vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx, useCachedFrame } = frame

        // 3. 更新交互控制器坐标映射
        this.interaction.setKLinePositions(kLinePositions, range, kWidthPx)

        // 4. 通知调度器当前活跃主图指标 + 获取价格范围
        this.indicatorScheduler.setActiveMainIndicators([...this._mainIndicatorsSignal.peek().keys()])
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

        if (this._internalData.length === 0) return null

        const range = useCachedFrame
            ? this.cachedDrawFrame!.range
            : (() => {
                const { start, end } = getVisibleRange(
                    vp.scrollLeft,
                    vp.plotWidth,
                    this.opt.kWidth,
                    this.opt.kGap,
                    this._internalData.length,
                    vp.dpr
                )
                return { start, end }
            })()

        if (!useCachedFrame && (range.start !== this.lastVisibleRange.start || range.end !== this.lastVisibleRange.end)) {
            this.indicatorScheduler.updateVisibleRange(range)
            this.lastVisibleRange = range
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
                pane.updateRange(this._internalData, range, indicatorRange)
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
                data: this._internalData,
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
                zoomLevel: this.currentZoomLevel,
                zoomLevelCount: this.zoomLevelCount,
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
                    },
                    priceRange: { maxPrice: 0, minPrice: 0 },
                },
                data: this._internalData,
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
            ? Math.max(1, Math.min(this.zoomLevelCount, zoomLevel))
            : this.currentZoomLevel
        const renderStateChanged = this.opt.kWidth !== kWidth
            || this.opt.kGap !== kGap
            || this.currentZoomLevel !== nextZoomLevel

        if (!renderStateChanged) {
            return
        }

        this.opt = { ...this.opt, kWidth, kGap }
        if (zoomLevel !== undefined) {
            this.currentZoomLevel = nextZoomLevel
        }
        this.updateViewportSignal()
        this.scheduleDraw()
    }

    /** 获取总缩放级别数 */
    getZoomLevelCount(): number {
        return this.zoomLevelCount
    }

    /** 注册视口变化回调 */
    setOnViewportChange(cb: (viewport: Viewport) => void) {
        this.onViewportChange = cb
    }

    /** 注册 pane 布局回流回调 */
    setOnPaneLayoutChange(cb: (panes: PaneSpec[]) => void) {
        this.onPaneLayoutChange = cb
    }

    /** 注册数据变化回调 */
    setOnDataChange(cb: (data: KLineData[]) => void) {
        this.onDataChange = cb
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

        const dpr = this.getEffectiveDpr()

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
            this.applyPaneLayoutSpecs(nextPanes)
            return
        }

        this.opt = { ...this.opt, ...partial }
        this.resize()
    }

    /** 更新 pane 布局配置
     * @param panes 新的 pane 配置数组
     *
     * 显式整盘替换：清空之前 user-resize 留下的 paneRatios 缓存，让 spec 中的 ratio
     * 真正生效。`addPane`/`upsertPane`/`removePaneDefinition` 走 `applyPaneLayoutSpecs`
     * 时仍保留 prev 值以记住用户拖拽过的高度——只有显式的 layout replacement 才重置。
     */
    updatePaneLayout(panes: PaneSpec[]): void {
        this._internalPaneRatios.clear()
        this.applyPaneLayoutSpecs(panes)
    }

    setPaneDefinitions(defs: PaneSpec[]): void {
        this.applyPaneLayoutSpecs(defs)
    }

    upsertPane(def: PaneSpec): void {
        const idx = this.opt.panes.findIndex((pane) => pane.id === def.id)
        if (idx === -1) {
            this.applyPaneLayoutSpecs([...this.opt.panes, { ...def }])
            return
        }

        const next = [...this.opt.panes]
        next[idx] = { ...next[idx], ...def }
        this.applyPaneLayoutSpecs(next)
    }

    removePaneDefinition(paneId: string): void {
        if (!this.opt.panes.some((pane) => pane.id === paneId)) return
        this._internalPaneRatios.delete(paneId)
        this.applyPaneLayoutSpecs(this.opt.panes.filter((pane) => pane.id !== paneId))
    }

    bindIndicatorToPane(paneId: string, indicatorId: SubIndicatorType, params?: Record<string, number | boolean | string>): void {
        const paneExists = this.opt.panes.some((pane) => pane.id === paneId)
        if (!paneExists) {
            this.upsertPane({ id: paneId, ratio: 1, visible: true, role: 'indicator' })
        }

        const rendererName = `${indicatorId.toLowerCase()}_${paneId}`
        const existing = this.getRenderer(rendererName)
        if (existing) {
            if (params) this.updateRendererConfig(rendererName, params)
            return
        }

        const renderer = createSubIndicatorRenderer({ indicatorId, paneId })
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

    /** 获取当前 pane 布局快照（含 ratio） */
    getPaneLayoutSpecs(): PaneSpec[] {
        const visible = this.opt.panes.filter(p => p.visible !== false)
        const sum = visible.reduce((s, p) => s + (this._internalPaneRatios.get(p.id) ?? p.ratio ?? 0), 0)
        const safeSum = sum > 0 ? sum : 1
        return this.opt.panes.map((spec) => {
            const base = this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0
            const ratio = spec.visible === false ? base : base / safeSum
            const pane = this.paneRenderers.find((r) => r.getPane().id === spec.id)?.getPane()
            return {
                ...spec,
                ratio,
                role: pane?.role ?? spec.role,
                capabilities: pane ? { ...pane.capabilities } : spec.capabilities,
            }
        })
    }

    private emitPaneLayoutChange(): void {
        // 同步 pane ratios 到 signal
        const ratios: Record<string, number> = {}
        this._internalPaneRatios.forEach((ratio, id) => {
            ratios[id] = ratio
        })
        this._paneRatiosSignal.set(ratios)

        this.onPaneLayoutChange?.(this.getPaneLayoutSpecs())
    }

    private applyPaneLayoutSpecs(panes: PaneSpec[]): void {
        this.opt.panes = panes.map((spec) => ({ ...spec }))
        this.syncPaneRatiosFromSpecs(this.opt.panes)
        this.initPanes()
        this.layoutPanes()
        this.emitPaneLayoutChange()
        this.scheduleDraw()
    }

    /**
     * 调整相邻 pane 边界（支持连锁挤压）
     * @param upperPaneId 上方 pane ID（边界位于此 pane 与其下方邻居之间）
     * @param deltaY Y 方向位移（逻辑像素，正数表示边界向下，upper 增大；负数表示向上，upper 减小）
     */
    resizePaneBoundary(upperPaneId: string, deltaY: number): boolean {
        // === 1. 参数校验 ===
        if (!Number.isFinite(deltaY) || deltaY === 0) return false
        const vp = this._internalViewport
        if (!vp) return false

        // === 2. 定位相邻 pane 对（边界两侧） ===
        const visibleSpecs = this.opt.panes.filter(p => p.visible !== false)
        const boundaryIndex = visibleSpecs.findIndex(p => p.id === upperPaneId)
        if (boundaryIndex < 0 || boundaryIndex >= visibleSpecs.length - 1) return false

        const upperSpec = visibleSpecs[boundaryIndex]
        const lowerSpec = visibleSpecs[boundaryIndex + 1]
        if (!upperSpec || !lowerSpec) return false

        // === 3. 收集所有 pane 当前高度 ===
        const heights = new Map<string, number>()
        for (const spec of visibleSpecs) {
            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (renderer) {
                heights.set(spec.id, renderer.getPane().height)
            }
        }

        // === 4. 连锁挤压/扩展 ===
        // deltaY > 0: 边界下移，upper expand，lower shrink
        // deltaY < 0: 边界上移，upper shrink，lower expand
        const expandIdx = deltaY > 0 ? boundaryIndex : boundaryIndex + 1
        const shrinkIdx = deltaY > 0 ? boundaryIndex + 1 : boundaryIndex
        const expandDir = deltaY > 0 ? -1 : 1  // expand 方向（向边界方向找）
        const shrinkDir = deltaY > 0 ? 1 : -1  // shrink 方向（远离边界方向找）

        let remaining = Math.abs(deltaY)

        // 先尝试 shrink（从 shrinkIdx 开始，沿 shrinkDir 方向连锁）
        let shrinkCursor = shrinkIdx
        while (remaining > 0 && shrinkCursor >= 0 && shrinkCursor < visibleSpecs.length) {
            const spec = visibleSpecs[shrinkCursor]
            if (!spec) break

            const currentH = heights.get(spec.id) ?? 0
            const minH = this.getPaneMinHeight(spec, vp.plotHeight)
            const canShrink = Math.max(0, currentH - minH)

            if (canShrink > 0) {
                const shrink = Math.min(canShrink, remaining)
                heights.set(spec.id, currentH - shrink)
                remaining -= shrink
            }

            // 继续向 shrinkDir 方向找下一个可 shrink 的 pane
            if (remaining > 0) {
                shrinkCursor += shrinkDir
            }
        }

        // 如果还有剩余（无法完全 shrink），说明拖拽无效
        if (remaining > 0) return false

        // 将节省的高度全部加到 expand 方
        const expandSpec = visibleSpecs[expandIdx]
        if (!expandSpec) return false
        const expandCurrentH = heights.get(expandSpec.id) ?? 0
        heights.set(expandSpec.id, expandCurrentH + Math.abs(deltaY))

        // === 5. 将像素高度转换为 ratio ===
        const gap = Math.max(0, this.opt.paneGap ?? 0)
        const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)

        for (const spec of visibleSpecs) {
            const h = heights.get(spec.id) ?? 0
            this._internalPaneRatios.set(spec.id, h / availableH)
        }

        // === 6. 归一化并同步 ===
        this.normalizeVisiblePaneRatios(visibleSpecs)
        this.syncPaneRatiosToSpecs()

        // === 7. 应用布局 ===
        this.layoutPanes()
        this.emitPaneLayoutChange()
        this.scheduleDraw()
        return true
    }

    private resolvePaneRole(spec: PaneSpec, index: number): PaneRole {
        if (spec.role) return spec.role
        return index === 0 ? 'price' : 'indicator'
    }


    addPane(paneId: string): void {
        if (this.opt.panes.some((spec) => spec.id === paneId)) {
            console.warn(`Pane "${paneId}" already exists`)
            return
        }

        const hasPricePane = this.opt.panes.some((spec, index) => this.resolvePaneRole(spec, index) === 'price')
        const role: PaneRole = hasPricePane ? 'indicator' : 'price'
        this.applyPaneLayoutSpecs([
            ...this.opt.panes,
            { id: paneId, ratio: 1, visible: true, role },
        ])
    }

    /**
     * 动态移除 pane
     * @param paneId pane 标识符
     */
    removePane(paneId: string): void {
        if (!this.opt.panes.some((spec) => spec.id === paneId)) return

        const next = this.opt.panes.filter((spec) => spec.id !== paneId)
        this._internalPaneRatios.delete(paneId)
        this.applyPaneLayoutSpecs(next)
    }

    /**
     * 检查 pane 是否存在
     * @param paneId pane 标识符
     */
    hasPane(paneId: string): boolean {
        return this.opt.panes.some((spec) => spec.id === paneId)
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
        // 调整 pane ratios：主图占 3，副图各占 1
        const visibleSpecs = this.opt.panes.filter((pane) => pane.visible !== false)
        const pricePanes = visibleSpecs.filter((pane, index) => this.resolvePaneRole(pane, index) === 'price')
        const indicatorPanes = visibleSpecs.filter((pane, index) => this.resolvePaneRole(pane, index) === 'indicator')

        if (pricePanes.length === 1) {
            const pricePane = pricePanes[0]
            if (pricePane) {
                this._internalPaneRatios.set(pricePane.id, 3)
            }
            for (const pane of indicatorPanes) {
                this._internalPaneRatios.set(pane.id, 1)
            }
            this._internalPaneRatios.set(paneId, 1)
        } else {
            this._internalPaneRatios.set(paneId, 1)
        }

        this.upsertPane({ id: paneId, ratio: this._internalPaneRatios.get(paneId) ?? 1, visible: true, role: 'indicator' })

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
            this._internalPaneRatios.delete(paneId)
        }

        // 更新布局，移除所有副图 pane
        this.applyPaneLayoutSpecs(this.opt.panes.filter((spec) => !subPaneIds.includes(spec.id)))
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
        const defaults: Record<SubIndicatorType, Record<string, unknown>> = {
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
        return { ...defaults[indicatorId] }
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
        this._internalData = data ?? []
        this._dataSignal.set([...this._internalData])
        this.onDataChange?.(this._internalData)

        // 重算 DOM scrollLeft 状态, 防止左右滚动超出数据长度范围
        const container = this.dom.container
        if (container) {
            const contentWidth = this.getContentWidth()
            const maxScrollLeft = Math.max(0, contentWidth - container.clientWidth)
            if (this.cachedScrollLeft > maxScrollLeft) {
                container.scrollLeft = maxScrollLeft
                this.cachedScrollLeft = maxScrollLeft
            }
        }

        // 重置交互状态
        this.interaction.reset()

        // 触发指标计算（在 scheduleDraw 之前，确保渲染器读到最新状态）
        this.indicatorScheduler.update(this._internalData, this.lastVisibleRange)

        this.scheduleDraw()
    }

    /** 获取当前数据源（供 renderers 和 interaction 使用） */
    getData(): KLineData[] {
        return this._internalData
    }

    /** 获取指标调度器（供外部控制器更新指标配置） */
    getIndicatorScheduler(): IndicatorScheduler {
        return this.indicatorScheduler
    }

    private getTrailingSlotCount(): number {
        return 24
    }

    getLogicalSlotCount(): number {
        return this._internalData.length + this.getTrailingSlotCount()
    }

    getTimestampAtLogicalIndex(index: number): number | null {
        if (!Number.isInteger(index) || index < 0 || index >= this._internalData.length) return null
        return this._internalData[index]?.timestamp ?? null
    }

    /** 根据视口内 X 坐标反查逻辑索引（允许超出最后一根 K 线） */
    getLogicalIndexAtX(mouseX: number): number | null {
        const vp = this._internalViewport
        if (!vp || this._internalData.length === 0) return null
        const dpr = this.getEffectiveDpr()
        const { startXPx, unitPx } = getPhysicalKLineConfig(this.opt.kWidth, this.opt.kGap, dpr)
        const worldX = Math.round((vp.scrollLeft + mouseX) * dpr)
        const index = Math.floor((worldX - startXPx) / unitPx)
        if (index < 0) return null
        return index
    }

    /** 根据视口内 X 坐标反查数据索引（用于绘图落点） */
    getDataIndexAtX(mouseX: number): number | null {
        const index = this.getLogicalIndexAtX(mouseX)
        if (index === null || index >= this._internalData.length) return null
        return index
    }


    /** 获取内容总宽度（用于外部 scroll-content 撑开 scrollWidth） */
    getContentWidth(): number {
        return computeContentWidth({
            dataLength: this._internalData.length,
            kWidth: this.opt.kWidth,
            kGap: this.opt.kGap,
            viewWidth: this._internalViewport?.plotWidth ?? 0,
            viewportDpr: this.getEffectiveDpr(),
        })
    }


    /** 容器尺寸变化时调用 */
    resize() {
        const vp = this.computeViewport()
        // 防御性检查：容器尺寸无效时跳过布局
        if (!vp || vp.viewWidth < 10 || vp.viewHeight < 10) {
            return
        }
        this.cachedDrawFrame = null
        this.layoutPanes()
        this.emitPaneLayoutChange()
        this.updateViewportSignal()
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
        })
    }

    /** 销毁图表实例 */
    async destroy() {
        if (this.raf !== null) {
            cancelAnimationFrame(this.raf)
            this.raf = null
        }

        // 清理尺寸观察器
        this.resizeObserver?.disconnect()
        this.resizeObserver = undefined
        this.preciseDpr = 0
        this.observedSize = { width: 0, height: 0 }

        // 清理 scroll 监听
        if (this.onScroll) {
            this.dom.container?.removeEventListener('scroll', this.onScroll)
            this.onScroll = undefined
        }

        this._internalViewport = null
        this.cachedDrawFrame = null
        this.xAxisCtx = null
        this.paneRenderers.forEach((r) => r.destroy())
        this.paneRenderers = []
        this.sharedWebGLSurface.destroy()

        // 清理渲染器插件管理器（会调用所有 onUninstall）
        this.rendererPluginManager.clear()

        this.onViewportChange = undefined
        this.onPaneLayoutChange = undefined
        this.indicatorScheduler.destroy()
        await this.pluginHost.destroy()
    }

    /** 初始化所有 pane */
    private initPanes() {
        this.paneRenderers = this.opt.panes.map((spec, index) => {
            const pane = new Pane(spec.id, {
                role: this.resolvePaneRole(spec, index),
                capabilities: spec.capabilities,
            })

            const mainCanvas = document.createElement('canvas')
            const overlayCanvas = document.createElement('canvas')
            const yAxisCanvas = document.createElement('canvas')

            const isMain = pane.role === 'price'

            // Main Canvas - K线、指标、网格
            mainCanvas.id = `${spec.id}-main`
            mainCanvas.className = isMain ? 'main-canvas main' : 'main-canvas sub'
            mainCanvas.style.position = 'absolute'
            mainCanvas.style.left = '0'
            mainCanvas.style.top = '0'

            // Overlay Canvas - 十字线、Tooltip（透明，事件穿透）
            overlayCanvas.id = `${spec.id}-overlay`
            overlayCanvas.className = 'overlay-canvas'
            overlayCanvas.style.position = 'absolute'
            overlayCanvas.style.left = '0'
            overlayCanvas.style.top = '0'
            overlayCanvas.style.pointerEvents = 'none'  // 事件穿透到 mainCanvas
            overlayCanvas.style.backgroundColor = 'transparent'

            yAxisCanvas.id = `${spec.id}-yAxis`
            yAxisCanvas.className = 'right-axis'
            yAxisCanvas.style.position = 'absolute'
            yAxisCanvas.style.left = '0'

            const renderer = new PaneRenderer(
                { mainCanvas, overlayCanvas, yAxisCanvas },
                pane,
                {
                    rightAxisWidth: this.opt.rightAxisWidth,
                    yPaddingPx: this.opt.yPaddingPx,
                    priceLabelWidth: this.opt.priceLabelWidth,
                },
                this.sharedWebGLSurface,
            )

            return renderer
        })

        const canvasLayer = this.dom.canvasLayer
        const rightAxisLayer = this.dom.rightAxisLayer
        if (canvasLayer) {
            const existingCanvases = canvasLayer.querySelectorAll('canvas:not(.x-axis-canvas)')
            existingCanvases.forEach((canvas) => canvas.remove())
        }
        if (rightAxisLayer) {
            const existingAxisCanvases = rightAxisLayer.querySelectorAll('canvas.right-axis')
            existingAxisCanvases.forEach((canvas) => canvas.remove())
        }

        this.paneRenderers.forEach((renderer) => {
            const dom = renderer.getDom()
            // 先添加 mainCanvas，再添加 overlayCanvas（overlay 在上层）
            canvasLayer.appendChild(dom.mainCanvas)
            canvasLayer.appendChild(dom.overlayCanvas)
            rightAxisLayer.appendChild(dom.yAxisCanvas)
        })

        this.rendererPluginManager.setKnownPaneIds(this.paneRenderers.map((renderer) => renderer.getPane().id))
    }


    private syncPaneRatiosFromSpecs(specs: PaneSpec[]): void {
        const next = new Map<string, number>()
        for (const spec of specs) {
            const prev = this._internalPaneRatios.get(spec.id)
            const incoming = Number.isFinite(spec.ratio) ? spec.ratio : 0
            const ratio = prev !== undefined ? prev : (incoming > 0 ? incoming : 1)
            next.set(spec.id, ratio)
        }
        this._internalPaneRatios = next
        this.normalizeVisiblePaneRatios(specs)
        this.syncPaneRatiosToSpecs()
    }

    private syncPaneRatiosToSpecs(): void {
        const visible = this.opt.panes.filter(p => p.visible !== false)
        const visibleSum = visible.reduce((s, p) => s + (this._internalPaneRatios.get(p.id) ?? p.ratio ?? 0), 0)
        const safeVisibleSum = visibleSum > 0 ? visibleSum : 1

        this.opt.panes = this.opt.panes.map((spec) => {
            const ratio = this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0
            if (spec.visible === false) {
                return { ...spec, ratio }
            }
            return { ...spec, ratio: ratio / safeVisibleSum }
        })
    }

    private normalizeVisiblePaneRatios(specs: PaneSpec[]): void {
        const visible = specs.filter(p => p.visible !== false)
        if (visible.length === 0) return

        let sum = 0
        for (const spec of visible) {
            const raw = this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0
            const safe = Number.isFinite(raw) && raw > 0 ? raw : 0
            this._internalPaneRatios.set(spec.id, safe)
            sum += safe
        }

        if (sum <= 0) {
            const equal = 1 / visible.length
            for (const spec of visible) {
                this._internalPaneRatios.set(spec.id, equal)
            }
            return
        }

        for (const spec of visible) {
            const v = this._internalPaneRatios.get(spec.id) ?? 0
            this._internalPaneRatios.set(spec.id, v / sum)
        }
    }

    private getPaneMinHeight(spec: PaneSpec, plotHeight: number): number {
        const fallback = this.opt.defaultPaneMinHeightPx ?? 120 // 最小高度
        const raw = spec.minHeightPx ?? fallback
        return Math.max(1, Math.min(Math.round(raw), Math.max(1, plotHeight)))
    }

    private computePaneHeightsByRatio(visibleSpecs: PaneSpec[], availableH: number): number[] {
        if (visibleSpecs.length === 0) return []

        const ratios = visibleSpecs.map(spec => this._internalPaneRatios.get(spec.id) ?? spec.ratio ?? 0)
        const ratioSum = ratios.reduce((s, r) => s + (r > 0 ? r : 0), 0)
        const safeRatios = ratioSum > 0
            ? ratios.map(r => (r > 0 ? r : 0) / ratioSum)
            : visibleSpecs.map(() => 1 / visibleSpecs.length)

        const heights = safeRatios.map(r => Math.max(1, Math.round(availableH * r)))
        const mins = visibleSpecs.map(spec => this.getPaneMinHeight(spec, availableH))

        for (let i = 0; i < heights.length; i++) {
            heights[i] = Math.max(heights[i]!, Math.min(mins[i]!, availableH))
        }

        let total = heights.reduce((s, h) => s + h, 0)

        if (total > availableH) {
            let overflow = total - availableH
            while (overflow > 0) {
                let shrunk = false
                for (let i = heights.length - 1; i >= 0 && overflow > 0; i--) {
                    const minH = Math.max(1, Math.min(mins[i]!, availableH))
                    const h = heights[i]!
                    if (h > minH) {
                        heights[i] = h - 1
                        overflow--
                        shrunk = true
                    }
                }
                if (!shrunk) break
            }
        } else if (total < availableH) {
            heights[heights.length - 1] = (heights[heights.length - 1] ?? 1) + (availableH - total)
        }

        total = heights.reduce((s, h) => s + h, 0)
        if (total !== availableH && heights.length > 0) {
            heights[heights.length - 1] = Math.max(1, (heights[heights.length - 1] ?? 1) + (availableH - total))
        }

        return heights
    }

    /** 计算每个 pane 的布局（top 和 height） */
    private layoutPanes() {
        const vp = this._internalViewport
        if (!vp) return

        const visibleSpecs = this.opt.panes.filter(p => p.visible !== false)
        if (visibleSpecs.length === 0) return

        const gap = Math.max(0, this.opt.paneGap ?? 0)
        let y = 0

        const totalGaps = gap * Math.max(0, visibleSpecs.length - 1)
        const availableH = Math.max(1, vp.plotHeight - totalGaps)

        this.normalizeVisiblePaneRatios(visibleSpecs)
        const paneHeights = this.computePaneHeightsByRatio(visibleSpecs, availableH)

        for (let i = 0; i < visibleSpecs.length; i++) {
            const spec = visibleSpecs[i]
            if (!spec) continue

            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (!renderer) continue

            const pane = renderer.getPane()
            const h = paneHeights[i] ?? 1

            pane.setLayout(y, h)
            pane.setPadding(this.opt.yPaddingPx, this.opt.yPaddingPx)

            renderer.resize(vp.plotWidth, h, vp.dpr)
            renderer.setWebGLRegion({
                x: 0,
                y,
                width: vp.plotWidth,
                height: h,
                dpr: vp.dpr,
            })
            this.rendererPluginManager.notifyResize(pane.id, wrapPaneInfo(pane))
            const dom = renderer.getDom()
            dom.mainCanvas.style.top = `${y}px`
            dom.overlayCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.top = `${y}px`
            dom.yAxisCanvas.style.left = '0px'

            y += h + gap
        }

        // 按实际像素高度回写 ratio，确保后续 resize 视觉比例稳定
        const finalAvailable = Math.max(1, availableH)
        for (const spec of visibleSpecs) {
            const renderer = this.paneRenderers.find(r => r.getPane().id === spec.id)
            if (!renderer) continue
            const h = renderer.getPane().height
            this._internalPaneRatios.set(spec.id, h / finalAvailable)
        }
        this.normalizeVisiblePaneRatios(visibleSpecs)
        this.syncPaneRatiosToSpecs()
    }
    private computeViewport(): Viewport | null {
        const container = this.dom.container
        if (!container) return null

        const observedWidth = this.observedSize.width
        const observedHeight = this.observedSize.height
        const viewWidth = observedWidth > 0
            ? observedWidth
            : Math.max(1, Math.round(container.clientWidth))
        const viewHeight = observedHeight > 0
            ? observedHeight
            : Math.max(1, Math.round(container.clientHeight))

        const plotWidth = Math.round(viewWidth)
        const plotHeight = Math.round(viewHeight - this.opt.bottomAxisHeight)

        let dpr = this.getEffectiveDpr()

        const MAX_CANVAS_PIXELS = 16 * 1024 * 1024
        const requestedPixels = viewWidth * dpr * (viewHeight * dpr)
        if (requestedPixels > MAX_CANVAS_PIXELS) {
            dpr = Math.sqrt(MAX_CANVAS_PIXELS / (viewWidth * viewHeight))
        }

        // 对齐 scrollLeft，消除 translate 亚像素偏移
        const scrollLeft = Math.round(this.cachedScrollLeft * dpr) / dpr

        const canvasLayerWidth = `${viewWidth}px`
        if (this.dom.canvasLayer.style.width !== canvasLayerWidth) {
            this.dom.canvasLayer.style.width = canvasLayerWidth
        }

        const canvasLayerHeight = `${viewHeight}px`
        if (this.dom.canvasLayer.style.height !== canvasLayerHeight) {
            this.dom.canvasLayer.style.height = canvasLayerHeight
        }

        const xAxisWidth = Math.round(plotWidth * dpr)
        if (this.dom.xAxisCanvas.width !== xAxisWidth) {
            this.dom.xAxisCanvas.width = xAxisWidth
        }

        const xAxisHeight = Math.round(this.opt.bottomAxisHeight * dpr)
        if (this.dom.xAxisCanvas.height !== xAxisHeight) {
            this.dom.xAxisCanvas.height = xAxisHeight
        }

        const xAxisCssWidth = `${xAxisWidth / dpr}px`
        if (this.dom.xAxisCanvas.style.width !== xAxisCssWidth) {
            this.dom.xAxisCanvas.style.width = xAxisCssWidth
        }

        const xAxisCssHeight = `${xAxisHeight / dpr}px`
        if (this.dom.xAxisCanvas.style.height !== xAxisCssHeight) {
            this.dom.xAxisCanvas.style.height = xAxisCssHeight
        }

        this.sharedWebGLSurface.resize(plotWidth, plotHeight, dpr)

        const vp: Viewport = {
            viewWidth,
            viewHeight,
            plotWidth,
            plotHeight,
            scrollLeft,
            dpr,
        }
        const prevViewport = this._internalViewport
        const viewportChanged = !prevViewport
            || prevViewport.viewWidth !== vp.viewWidth
            || prevViewport.viewHeight !== vp.viewHeight
            || prevViewport.plotWidth !== vp.plotWidth
            || prevViewport.plotHeight !== vp.plotHeight
            || prevViewport.scrollLeft !== vp.scrollLeft
            || prevViewport.dpr !== vp.dpr

        this._internalViewport = vp
        if (viewportChanged) {
            this.onViewportChange?.(vp)
        }
        return vp
    }

    // ==================== Facade API (High-level interface for adapters) ====================

    // ---------- Signals ----------
    private _viewportSignal = createSignal<ViewportState>({
        zoomLevel: 1,
        plotWidth: 0,
        plotHeight: 0,
        dpr: 1,
        visibleFrom: 0,
        visibleTo: 0,
        desiredScrollLeft: undefined,
        kWidth: 0,
        kGap: 1,
    })

    private _dataSignal = createSignal<ReadonlyArray<KLineData>>([])
    private _themeSignal = createSignal<'light' | 'dark'>('light')
    private _drawingToolSignal = createSignal<DrawingToolType | null>(null)
    private _drawingsSignal = createSignal<ReadonlyArray<import('../plugin').DrawingObject>>([])
    private _paneRatiosSignal = createSignal<Readonly<Record<string, number>>>({})
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
        return this._viewportSignal
    }

    /** 数据信号 */
    get data(): Signal<ReadonlyArray<KLineData>> {
        return this._dataSignal
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

    /** 交互状态信号 */
    get interactionState(): Signal<InteractionSnapshot> {
        return this._interactionSignal
    }

    // ---------- Data ----------

    /**
     * 设置数据（高层 API）
     * 内部调用 updateData，并更新 data signal
     */
    setData(data: KLineData[]): void {
        this.updateData(data)
    }

    /**
     * 追加数据（高层 API）
     * 合并现有数据并更新
     */
    appendData(newData: KLineData[]): void {
        const merged = [...this._internalData, ...newData]
        this.setData(merged)
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
        const clamped = Math.max(1, Math.min(this.zoomLevelCount, Math.round(level)))
        this.applyZoom(clamped, anchorX)
    }

    /**
     * 放大（高层 API）
     */
    zoomIn(anchorX?: number): void {
        this.zoomToLevel(this.currentZoomLevel + 1, anchorX)
    }

    /**
     * 缩小（高层 API）
     */
    zoomOut(anchorX?: number): void {
        this.zoomToLevel(this.currentZoomLevel - 1, anchorX)
    }

    /**
     * 内部缩放实现
     * 使用 computeZoom 纯函数计算精确的 scrollLeft
     */
    private applyZoom(targetLevel: number, anchorViewportX?: number): void {
        if (targetLevel === this.currentZoomLevel) return

        const delta = targetLevel - this.currentZoomLevel
        const scrollLeft = this.getCachedScrollLeft()
        const dpr = this.getCurrentDpr()

        const result = computeZoom(
            delta,
            anchorViewportX ?? 0,
            scrollLeft,
            this.currentZoomLevel,
            this.opt.kWidth,
            this.opt.kGap,
            {
                minKWidth: this.opt.minKWidth,
                maxKWidth: this.opt.maxKWidth,
                zoomLevelCount: this.zoomLevelCount,
                dpr,
            },
        )

        if (!result) return

        // 应用 render state
        this.currentZoomLevel = result.targetLevel
        this.applyRenderState(result.newKWidth, result.newKGap, result.targetLevel)

        // 更新 viewport signal
        this._viewportSignal.set({
            zoomLevel: result.targetLevel,
            plotWidth: this._internalViewport?.plotWidth ?? 0,
            plotHeight: this._internalViewport?.plotHeight ?? 0,
            dpr,
            visibleFrom: this.lastVisibleRange.start,
            visibleTo: this.lastVisibleRange.end,
            desiredScrollLeft: result.newScrollLeft,
            kWidth: result.newKWidth,
            kGap: result.newKGap,
        })
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
        const delta = e.deltaY > 0 ? -1 : 1
        const targetLevel = Math.max(1, Math.min(this.zoomLevelCount, this.currentZoomLevel + delta))

        if (targetLevel === this.currentZoomLevel) return

        // 获取鼠标在视口中的位置作为缩放锚点（视口局部坐标）
        const rect = this.dom.container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left

        this.applyZoom(targetLevel, mouseX)
    }

    /**
     * 滚动事件处理（高层 API）
     * 更新缓存的 scrollLeft 并触发交互 controller
     */
    handleScrollEvent(): void {
        this.interaction.onScroll()
        // 更新 viewport signal 中的 visible range
        this.updateViewportSignal()
    }

    /**
     * 双指捏合缩放处理（高层 API）
     * @param delta 缩放增量（+1 放大 / -1 缩小）
     * @param centerClientX 捏合中心在视口中的 X 坐标
     */
    handlePinchZoom(delta: number, centerClientX: number): void {
        const targetLevel = Math.max(1, Math.min(this.zoomLevelCount, this.currentZoomLevel + delta))
        if (targetLevel === this.currentZoomLevel) return

        // centerClientX 已经是视口局部坐标，直接使用
        this.applyZoom(targetLevel, centerClientX)
    }

    /**
     * 更新 viewport signal（用于滚动事件，不更新 desiredScrollLeft）
     */
    private updateViewportSignal(): void {
        const vp = this._internalViewport
        if (!vp) return

        this._viewportSignal.set({
            zoomLevel: this.currentZoomLevel,
            plotWidth: vp.plotWidth,
            plotHeight: vp.plotHeight,
            dpr: vp.dpr,
            visibleFrom: this.lastVisibleRange.start,
            visibleTo: this.lastVisibleRange.end,
            // 滚动事件不设置 desiredScrollLeft
            desiredScrollLeft: undefined,
            kWidth: this.opt.kWidth,
            kGap: this.opt.kGap,
        })
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

// ==================== Type definitions for Facade ====================

export type ViewportState = {
    zoomLevel: number
    plotWidth: number
    plotHeight: number
    dpr: number
    visibleFrom: number
    visibleTo: number
    desiredScrollLeft: number | undefined
    kWidth: number
    kGap: number
}

export type IndicatorRole = 'main' | 'sub'

export interface IndicatorInstance {
    id: string
    definitionId: string
    label: string
    name: string
    role: IndicatorRole
    paneId?: string
    params: Record<string, unknown>
}

export interface SubPaneInfo {
    paneId: string
    indicatorId: string
    params: Record<string, unknown>
    ratio: number
}

export type DrawingToolType = 'trendline' | 'horizontal' | 'fib' | 'rectangle' | 'arrow'

export interface DrawingObject {
    id: string
    type: DrawingToolType
}


