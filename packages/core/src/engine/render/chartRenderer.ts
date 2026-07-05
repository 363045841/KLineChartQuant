import type { ChartSettings } from '../../config/chartSettings'
import type { SymbolSpec } from '../../controllers/types'
import type {
  PluginHostImpl,
  RenderContext,
  YAxisLabel,
  XAxisLabel,
  YAxisRange,
  XAxisRange,
  YAxisTick,
} from '../../plugin'
import { RendererPluginManager, wrapPaneInfo } from '../../plugin'
import { createWebGLRenderer, createWebGLSurfaceBackend } from '../../render'
import type { Renderer } from '../../render/Renderer'
import { createLayerFromPlugin } from '../../scene/createLayerFromPlugin'
import { createScene } from '../../scene/createScene'
import type { Scene, PaintContext, PaneRole, Layer } from '../../scene/types'
import type { KLineData } from '../../types/price'
import type {
  ChartDom,
  PaneSpec,
  ChartOptions,
  KLinePositions,
  Viewport,
  ViewportState,
} from '../chartTypes'
import { InteractionController } from '../controller/interaction'
import { ChartDataManager } from '../data/chartDataManager'
import { DrawingStore } from '../drawing'
import { createDrawingRendererPlugin, createDrawingLabelOverlayPlugin } from '../drawing/plugin'
import { ChartIndicatorManager } from '../indicators/chartIndicatorManager'
import { UpdateLevel } from '../layout/pane'
import type { VisibleRange } from '../layout/pane'
import { MarkerManager, type CustomMarkerEntity } from '../marker/registry'
import type { ChartModeHandler } from '../modes/types'
import { PaneRenderer } from '../paneRenderer'
import { createTimeAxisRendererPlugin } from '../renderers/timeAxis'
import { SharedWebGLSurface } from '../renderers/webgl/sharedWebGLSurface'
import { getPhysicalKLineConfig } from '../utils/klineConfig'
import { calculateTickCount } from '../utils/tickCount'
import { ChartViewportManager } from '../viewport/chartViewportManager'
import { getVisibleRange } from '../viewport/viewport'

import { createCandleLayer } from './layers/candleLayer'
import { createComparisonLineLayer } from './layers/comparisonLineLayer'
import { createCrosshairLayer } from './layers/crosshairLayer'
import { createCustomMarkersLayer } from './layers/customMarkersLayer'
import { createExtremaMarkersLayer } from './layers/extremaMarkersLayer'
import { createGridLinesLayer } from './layers/gridLinesLayer'
import { createLastPriceLabelLayer } from './layers/lastPriceLabelLayer'
import { createLastPriceLineLayer } from './layers/lastPriceLineLayer'
import { createLeftYAxisLayer } from './layers/leftYAxisLayer'
import { createMainIndicatorLegendLayer } from './layers/mainIndicatorLegendLayer'
import { createYAxisLayer } from './layers/yAxisLayer'
import { batch } from '../../reactivity/signal'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

type FrameContext = {
  vp: Viewport
  range: VisibleRange
  kLinePositions: KLinePositions
  kLineCenters: number[]
  kBarRects: Array<{ x: number; width: number }>
  kWidthPx: number
  useCachedFrame: boolean
  data: KLineData[]
  mainIndicatorRange: { min: number; max: number } | null
  hasCrosshair: boolean
  zoomLevel: number
  zoomLevelCount: number
}

export interface RendererDependencies {
  getDom: () => ChartDom
  getOption: () => ResolvedChartOptions
  getPaneRenderers: () => PaneRenderer[]
  getInteraction: () => InteractionController
  getSharedWebGLSurface: () => SharedWebGLSurface
  getPluginHost: () => PluginHostImpl
  getRendererPluginManager: () => RendererPluginManager
  getTheme: () => 'light' | 'dark'
  getCurrentZoomLevel: () => number
  getZoomLevelCount: () => number
  getViewportManager: () => ChartViewportManager
  getDataManager: () => ChartDataManager
  getIndicatorManager: () => ChartIndicatorManager
  getActiveMode: () => ChartModeHandler
}

export class ChartRenderer {
  private deps: RendererDependencies

  private raf: number | null = null
  private pendingUpdateLevel: UpdateLevel = UpdateLevel.All

  readonly markerManager: MarkerManager
  readonly drawingStore: DrawingStore
  private settings: ChartSettings = {}
  private overlayHadCrosshair = false
  private xAxisCtx: CanvasRenderingContext2D | null = null

  private cachedDrawFrame: {
    viewport: Viewport
    range: VisibleRange
    kLinePositions: KLinePositions
    kLineCenters: number[]
    kBarRects: Array<{ x: number; width: number }>
    kWidthPx: number
  } | null = null

  private scene: Scene
  private frameCount = 0
  private paneCtxMap = new Map<string, RenderContext>()
  private currentPaneId = 'main'
  private sceneRenderer: Renderer = {} as Renderer
  private timeAxisCtx: RenderContext | null = null
  private timeAxisLayer: Layer | null = null
  private _lastVisibleRange: VisibleRange = { start: 0, end: 0 }
  private _lastRawVisibleRange: VisibleRange = { start: 0, end: 0 }

  constructor(deps: RendererDependencies) {
    this.deps = deps
    this.markerManager = new MarkerManager()
    this.drawingStore = new DrawingStore()
    this.scene = createScene()
    const sharedSurface = deps.getSharedWebGLSurface()
    const surfaceBackend = createWebGLSurfaceBackend(sharedSurface)
    this.sceneRenderer = createWebGLRenderer(surfaceBackend, sharedSurface)
  }

  initCoreRenderers(): void {
    const opt = this.deps.getOption()
    const axisWidth = opt.rightAxisWidth + (opt.priceLabelWidth ?? 0)
    const interaction = this.deps.getInteraction()

    {
      const plugin = createTimeAxisRendererPlugin({
        height: opt.bottomAxisHeight,
        getCrosshair: () => {
          const pos = interaction.crosshairPos
          const idx = interaction.crosshairIndex
          if (pos && idx !== null) {
            return { x: pos.x, index: idx }
          }
          return null
        },
      })
      this.timeAxisLayer = createLayerFromPlugin(plugin, () => this.timeAxisCtx, 'global')
    }

    const getCtx = (paneId: string) => () => this.paneCtxMap.get(paneId) ?? null
    const getCtxForCurrentPane = () => this.paneCtxMap.get(this.currentPaneId) ?? null

    {
      const layer = createGridLinesLayer(getCtxForCurrentPane)
      this.scene.addLayer(layer)
    }
    {
      const layer = createCandleLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createLastPriceLabelLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createComparisonLineLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createLastPriceLineLayer(getCtx('main'))
      this.scene.addLayer(layer)
    }
    {
      const layer = createCustomMarkersLayer(getCtxForCurrentPane)
      this.scene.addLayer(layer)
    }
    {
      const layer = createExtremaMarkersLayer(getCtxForCurrentPane)
      this.scene.addLayer(layer)
    }
    {
      const layer = createMainIndicatorLegendLayer(
        { yPaddingPx: opt.yPaddingPx },
        getCtx('main'),
        this.deps.getPluginHost(),
      )
      this.scene.addLayer(layer)
    }
    {
      const layer = createCrosshairLayer(
        {
          getCrosshairState: () => ({
            pos: interaction.crosshairPos,
            activePaneId: interaction.activePaneId,
            isDragging: interaction.isDraggingState(),
            price: interaction.crosshairPrice,
          }),
        },
        getCtxForCurrentPane,
      )
      this.scene.addLayer(layer)
    }
    {
      const layer = createYAxisLayer(
        {
          axisWidth,
          yPaddingPx: opt.yPaddingPx,
          getCrosshair: () => {
            const pos = interaction.crosshairPos
            const price = interaction.crosshairPrice
            const activePaneId = interaction.activePaneId
            if (pos && price !== null) {
              return { y: pos.y, price, activePaneId }
            }
            return null
          },
        },
        getCtxForCurrentPane,
      )
      this.scene.addLayer(layer)
    }
    {
      const layer = createLeftYAxisLayer(
        {
          axisWidth: opt.leftAxisWidth,
          yPaddingPx: opt.yPaddingPx,
          getCrosshair: () => {
            const pos = interaction.crosshairPos
            const price = interaction.crosshairPrice
            const activePaneId = interaction.activePaneId
            if (pos && price !== null) {
              return { y: pos.y, price, activePaneId }
            }
            return null
          },
        },
        getCtxForCurrentPane,
      )
      this.scene.addLayer(layer)
    }
  }

  registerDrawingPlugins(): void {
    const getCtxForCurrentPane = () => this.paneCtxMap.get(this.currentPaneId) ?? null

    {
      const plugin = createDrawingRendererPlugin({ store: this.drawingStore })
      this.deps.getRendererPluginManager().register(plugin)
      this.deps.getRendererPluginManager().setEnabled(plugin.name, false)
      const layer = createLayerFromPlugin(plugin, getCtxForCurrentPane, 'global')
      this.scene.addLayer(layer)
    }
    {
      const plugin = createDrawingLabelOverlayPlugin({ store: this.drawingStore })
      this.deps.getRendererPluginManager().register(plugin)
      this.deps.getRendererPluginManager().setEnabled(plugin.name, false)
      const layer = createLayerFromPlugin(plugin, getCtxForCurrentPane, 'global')
      this.scene.addLayer(layer)
    }
  }

  getScene(): Scene {
    return this.scene
  }

  getPaneCtxMap(): Map<string, RenderContext> {
    return this.paneCtxMap
  }

  getMarkerManager(): MarkerManager {
    return this.markerManager
  }

  getDrawingStore(): DrawingStore {
    return this.drawingStore
  }

  getSettings(): ChartSettings {
    return this.settings
  }

  updateSettings(settings: ChartSettings): void {
    this.settings = { ...settings }
  }

  scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
    if (this.raf !== null) {
      if (this.pendingUpdateLevel === UpdateLevel.All) return
      if (level === UpdateLevel.All) {
        this.pendingUpdateLevel = UpdateLevel.All
        return
      }
      if (
        (this.pendingUpdateLevel === UpdateLevel.Main && level === UpdateLevel.Overlay) ||
        (this.pendingUpdateLevel === UpdateLevel.Overlay && level === UpdateLevel.Main)
      ) {
        this.pendingUpdateLevel = UpdateLevel.All
        return
      }
      return
    }

    this.pendingUpdateLevel = level
    this.raf = requestAnimationFrame(() => {
      this.raf = null
      const levelToDraw = this.pendingUpdateLevel
      this.pendingUpdateLevel = UpdateLevel.All

      const dom = this.deps.getDom()
      const c = dom.container
      if (c) {
        const scrollContent = dom.scrollContent
        if (scrollContent) {
          const dataManager = this.deps.getDataManager()
          const w =
            Math.max(dataManager.getContentWidth(), dataManager.getLeftLoadBufferWidth()) + 'px'
          if (scrollContent.style.width !== w) scrollContent.style.width = w
        }
      }

      this.draw(levelToDraw)
    })
  }

  draw(level: UpdateLevel = UpdateLevel.All): void {
    this.markerManager.clear()

    const frame = this.prepareFrameData(level)
    if (!frame) {
      const dataManager = this.deps.getDataManager()
      if (dataManager.getInternalData().length === 0 && dataManager.getTimeShareData().length === 0)
        this.clearAllCanvases()
      return
    }

    const { vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx, useCachedFrame } = frame

    batch(() => {
      this.deps.getInteraction().setKLinePositions(kLinePositions, range, kWidthPx, kLineCenters)
      this.deps.getViewportManager().updateViewportSignal()
    })

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()
    if (mode.useIndicatorScheduler) {
      const indicatorManager = this.deps.getIndicatorManager()
      indicatorManager.indicatorSchedulerAccessor.setActiveMainIndicators(
        [...indicatorManager.mainIndicatorsSignalPeek.entries()].map(([id, entry]) => ({
          id,
          params: entry.params,
        })),
      )
    }
    const mainIndicatorRange = useCachedFrame
      ? null
      : this.deps.getIndicatorManager().indicatorSchedulerAccessor.getMainIndicatorPriceRange()
    const hasCrosshair = this.deps.getInteraction().getCrosshairIndex() !== null

    const { sharedXAxisLabels, sharedXAxisRanges } = this.renderPanes(
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      mainIndicatorRange,
      hasCrosshair,
      useCachedFrame,
      level,
    )

    this.overlayHadCrosshair = hasCrosshair
    this.renderXAxis(
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      sharedXAxisLabels,
      sharedXAxisRanges,
    )
  }

  private prepareFrameData(level: UpdateLevel): FrameContext | null {
    const useCachedFrame = level === UpdateLevel.Overlay && this.cachedDrawFrame !== null

    const vp = useCachedFrame
      ? this.cachedDrawFrame!.viewport
      : this.deps.getViewportManager().computeViewport()
    if (!vp) return null

    const internalData = this.deps.getDataManager().getRenderData() as KLineData[]
    if (internalData.length === 0) return null

    const opt = this.deps.getOption()
    const rawRange = useCachedFrame
      ? this.cachedDrawFrame!.range
      : (() => {
          const { start, end } = getVisibleRange(
            vp.scrollLeft,
            vp.plotWidth,
            opt.kWidth,
            opt.kGap,
            internalData.length,
            vp.dpr,
          )
          return { start, end }
        })()
    const range = { start: Math.max(0, rawRange.start), end: rawRange.end }

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()
    if (
      !useCachedFrame &&
      (range.start !== this._lastVisibleRange.start ||
        range.end !== this._lastVisibleRange.end ||
        rawRange.start !== this._lastRawVisibleRange.start ||
        rawRange.end !== this._lastRawVisibleRange.end)
    ) {
      if (mode.useIndicatorScheduler) {
        this.deps.getIndicatorManager().indicatorSchedulerAccessor.updateVisibleRange(range)
      }
      this._lastVisibleRange = range
      this._lastRawVisibleRange = rawRange
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
      const physConfig = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr)
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

      if (mode.debugName === 'TimeShare') {
        const totalWidth = vp.plotWidth
        const count = kLineCenters.length
        if (count > 0) {
          const dpr = vp.dpr
          const step = totalWidth / count
          for (let i = 0; i < count; i++) {
            kLineCenters[i] = Math.round((i + 0.5) * step * dpr) / dpr
            kLinePositions[i] = Math.round(i * step * dpr) / dpr
          }
          kWidthPx = Math.round((totalWidth * dpr) / count)

          const logicalBarWidth = Math.max(1, step * 0.6)
          const barWidthPx = Math.round(logicalBarWidth * dpr)
          const halfBarPx = Math.floor(barWidthPx / 2)
          for (let i = 0; i < count; i++) {
            const centerPx = Math.round(kLineCenters[i] * dpr)
            kBarRects[i] = {
              x: (centerPx - halfBarPx) / dpr,
              width: barWidthPx / dpr,
            }
          }
        } else {
          kWidthPx = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr).kWidthPx
        }
      } else {
        kWidthPx = getPhysicalKLineConfig(opt.kWidth, opt.kGap, vp.dpr).kWidthPx
      }
      this.cachedDrawFrame = {
        viewport: { ...vp },
        range: { ...range },
        kLinePositions,
        kLineCenters,
        kBarRects,
        kWidthPx,
      }
    }

    return {
      vp,
      range,
      kLinePositions,
      kLineCenters,
      kBarRects,
      kWidthPx,
      useCachedFrame,
      data: internalData,
      mainIndicatorRange: null,
      hasCrosshair: false,
      zoomLevel: this.deps.getCurrentZoomLevel(),
      zoomLevelCount: this.deps.getZoomLevelCount(),
    }
  }

  private clearAxisCtx(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    width: number,
    height: number,
  ): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height + 2 / dpr)
  }

  clearAllCanvases(): void {
    const vp = this.deps.getViewportManager().computeViewport()
    if (!vp) return
    for (const r of this.deps.getPaneRenderers()) {
      const { mainCtx, overlayCtx, yAxisCtx, leftAxisCtx } = r.getContexts()
      const pane = r.getPane()
      mainCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      overlayCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      yAxisCtx?.clearRect(0, 0, vp.plotWidth + 1, pane.height + 2 / vp.dpr)
      if (leftAxisCtx) {
        const leftCanvas = leftAxisCtx.canvas
        if (leftCanvas) {
          const laW = leftCanvas.width / vp.dpr
          leftAxisCtx.clearRect(0, 0, laW, pane.height + 2 / vp.dpr)
        }
      }
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

    const dataManager = this.deps.getDataManager()
    const rendererPluginManager = this.deps.getRendererPluginManager()
    const pluginHost = this.deps.getPluginHost()
    const mode = this.deps.getActiveMode()

    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const { mainCtx, overlayCtx, yAxisCtx, leftAxisCtx } = renderer.getContexts()
      const { candleSurface, lineSurface } = renderer.getWebGL()

      if (!useCachedFrame) {
        const indicatorRange =
          pane.role === 'price' && mode.useIndicatorScheduler ? mainIndicatorRange : null
        const comparisonRange =
          pane.id === 'main' ? dataManager.getComparisonEquivalentPriceRange(range) : null
        const mergedRange = this.mergeNumericRanges(indicatorRange, comparisonRange)
        mode.updatePaneRange(pane as any, range, dataManager, mergedRange)
        if (pane.id === 'main' && this.settings.disableMainPaneVerticalScroll) {
          pane.yAxis.resetTransform()
        }
      }

      const shouldUpdateMain = level === UpdateLevel.Main || level === UpdateLevel.All
      const shouldUpdateOverlay =
        level === UpdateLevel.All ||
        (level === UpdateLevel.Overlay && (hasCrosshair || this.overlayHadCrosshair))

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
        this.clearAxisCtx(yAxisCtx, vp.dpr, yAxisWidth, pane.height)
      }
      if (leftAxisCtx && !useCachedFrame) {
        const leftAxisWidth = leftAxisCtx.canvas.width / vp.dpr
        this.clearAxisCtx(leftAxisCtx, vp.dpr, leftAxisWidth, pane.height)
      }

      const opt = this.deps.getOption()
      const context: RenderContext = {
        ctx: mainCtx!,
        overlayCtx: overlayCtx ?? undefined,
        pane: wrapPaneInfo(pane),
        data: dataManager.getRenderData(),
        period: dataManager.currentPeriod,
        comparisonData: dataManager.getComparisonData(),
        comparisonSymbols: dataManager.getComparisonSpecs(),
        comparisonColors: dataManager.getComparisonColors(),
        range,
        scrollLeft: vp.scrollLeft,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
        dpr: vp.dpr,
        paneWidth: vp.plotWidth,
        kLinePositions,
        kLineCenters,
        kBarRects,
        markerManager: this.markerManager,
        crosshairIndex: this.deps.getInteraction().getCrosshairIndex(),
        yAxisCtx: yAxisCtx ?? undefined,
        leftAxisCtx: leftAxisCtx ?? undefined,
        candleWebGLSurface: candleSurface ?? undefined,
        lineWebGLSurface: lineSurface ?? undefined,
        zoomLevel: this.deps.getCurrentZoomLevel(),
        zoomLevelCount: this.deps.getZoomLevelCount(),
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
        theme: this.deps.getTheme(),
        isAsiaMarket: this.settings.isAsiaMarket as boolean,
        colorPresetSettings: this.settings.colorPresetSettings,
        monthKeys: dataManager.getMonthKeys() ?? undefined,
        dayKeys: dataManager.getDayKeys() ?? undefined,
      }

      {
        const pt = pane.yAxis.getPaddingTop()
        const pb = pane.yAxis.getPaddingBottom()
        const yStart = pt
        const yEnd = Math.max(pt, pane.height - pb)
        const viewH = Math.max(0, yEnd - yStart)
        const tickCount = Math.max(2, calculateTickCount(pane.height, pane.role === 'price'))
        const yAxisTicks: YAxisTick[] = []
        for (let i = 0; i < tickCount; i++) {
          const t = tickCount <= 1 ? 0 : i / (tickCount - 1)
          const y = yStart + t * viewH
          const value = pane.yAxis.yToPrice(y)
          yAxisTicks.push({ y, value })
        }
        context.yAxisTicks = yAxisTicks
      }

      this.paneCtxMap.set(pane.id, context)
      this.currentPaneId = pane.id

      if (shouldUpdateMain || shouldUpdateOverlay) {
        const errors = rendererPluginManager.render(pane.id, context, level)
        if (errors.length > 0) {
          pluginHost.events.emit('renderer:error', { paneId: pane.id, errors })
        }
      }

      const region = { x: 0, y: pane.top, width: vp.plotWidth, height: pane.height, dpr: vp.dpr }
      if (shouldUpdateMain) {
        this.sceneRenderer.beginFrame(region)
        ;(this.sceneRenderer as any).setFallbackContext(overlayCtx ?? null, vp.dpr)
        this.scene.paintPane({
          renderer: this.sceneRenderer,
          region,
          paneRole: (pane.id === 'main' ? 'main' : 'sub') as PaneRole,
          paneId: pane.id,
          frameNumber: this.frameCount++,
          deltaMs: 0,
        })
        this.sceneRenderer.endFrame()
      }
      if (shouldUpdateOverlay && !shouldUpdateMain) {
        this.sceneRenderer.beginFrame(region)
        ;(this.sceneRenderer as any).setFallbackContext(overlayCtx ?? null, vp.dpr)
        this.scene.paintPane(
          {
            renderer: this.sceneRenderer,
            region,
            paneRole: (pane.id === 'main' ? 'main' : 'sub') as PaneRole,
            paneId: pane.id,
            frameNumber: this.frameCount++,
            deltaMs: 0,
          },
          ['overlay'],
        )
        this.sceneRenderer.endFrame()
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
    const dom = this.deps.getDom()
    const xAxisCtx = this.xAxisCtx ?? dom.xAxisCanvas.getContext('2d')
    if (!this.xAxisCtx) {
      this.xAxisCtx = xAxisCtx
    }
    if (xAxisCtx && this.timeAxisLayer) {
      const opt = this.deps.getOption()
      const dataManager = this.deps.getDataManager()
      this.timeAxisCtx = {
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
          height: opt.bottomAxisHeight,
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
        period: dataManager.currentPeriod,
        data: dataManager.getRenderData(),
        range,
        scrollLeft: vp.scrollLeft,
        kWidth: opt.kWidth,
        kGap: opt.kGap,
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
        theme: this.deps.getTheme(),
        isAsiaMarket: this.settings.isAsiaMarket as boolean,
        colorPresetSettings: this.settings.colorPresetSettings,
        monthKeys: dataManager.getMonthKeys() ?? undefined,
        dayKeys: dataManager.getDayKeys() ?? undefined,
      }
      const paintCtx: PaintContext = {
        renderer: this.sceneRenderer,
        region: { x: 0, y: 0, width: vp.plotWidth, height: opt.bottomAxisHeight, dpr: vp.dpr },
        paneRole: 'global',
        paneId: 'xAxis',
        frameNumber: this.frameCount++,
        deltaMs: 0,
      }
      this.timeAxisLayer.paint(paintCtx)
    }
  }

  private calcKLinePositions(range: VisibleRange): KLinePositions {
    const { start, end } = range
    const count = end - start

    if (count <= 0) return []

    const dpr = this.deps.getViewportManager().getEffectiveDpr()
    const opt = this.deps.getOption()
    const { unitPx, startXPx } = getPhysicalKLineConfig(opt.kWidth, opt.kGap, dpr)

    const positions: number[] = new Array(count)

    for (let i = 0; i < count; i++) {
      const dataIndex = start + i
      const leftPx = startXPx + dataIndex * unitPx
      positions[i] = leftPx / dpr
    }

    return positions
  }

  private checkVisibleRangeGapWhenIdle(): void {
    if (this.deps.getInteraction().isPointerDown()) return
    this.deps.getDataManager().checkVisibleRangeGap()
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

  clearCachedFrame(): void {
    this.cachedDrawFrame = null
  }

  destroy(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
    this.cachedDrawFrame = null
    this.xAxisCtx = null
    this.sceneRenderer.dispose()
    this.scene.dispose()
    this.paneCtxMap.clear()
  }
}
