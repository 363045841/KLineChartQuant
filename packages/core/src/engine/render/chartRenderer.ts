import type { ChartSettings } from '../../foundation/config/chartSettings'
import type { SymbolSpec } from '../../controllers/types'
import type {
  PluginHostImpl,
  RenderContext,
  YAxisLabel,
  XAxisLabel,
  YAxisRange,
  XAxisRange,
  YAxisTick,
} from '../../foundation/plugin/index'
import { RendererPluginManager, wrapPaneInfo } from '../../foundation/plugin/index'
import type { Renderer } from '../../rendering/render/Renderer'
import { createLayerFromPlugin } from '../../rendering/scene/createLayerFromPlugin'
import { createScene } from '../../rendering/scene/createScene'
import type { Scene, PaintContext, PaneRole, Layer } from '../../rendering/scene/types'
import type { KLineData } from '../../foundation/types/price'
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
import { DrawingStore, type DrawingStoreDeps } from '../drawing'
import { createDrawingRendererPlugin, createDrawingLabelOverlayPlugin } from '../drawing/plugin'
import { ChartIndicatorManager } from '../indicators/chartIndicatorManager'
import { UpdateLevel } from '../layout/pane'
import type { VisibleRange } from '../layout/pane'
import {
  MarkerManager,
  type CustomMarkerEntity,
  type MarkerManagerDeps,
} from '../marker/registry'
import type { ChartModeHandler } from '../modes/types'
import { PaneRenderer } from '../paneRenderer'
import { createTimeAxisRendererPlugin } from '../renderers/timeAxis'
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
import { batch, type ReadonlySignal } from '../../foundation/reactivity/signal'

type ResolvedChartOptions = Omit<ChartOptions, 'kWidth' | 'kGap'> & {
  kWidth: number
  kGap: number
}

/** 一帧的绘制数据 */
type FrameContext = {
  /** 视口（scrollLeft、plotWidth、dpr 等） */
  vp: Viewport
  /** 可见 K 线起止索引 */
  range: VisibleRange
  /** 每根 K 线在大图上的 x 坐标 */
  kLinePositions: KLinePositions
  /** 每根 K 线中心的 x 坐标（由物理像素回算逻辑值） */
  kLineCenters: number[]
  /** 每根 K 线实体的 x 和宽度 */
  kBarRects: Array<{ x: number; width: number }>
  /** K 线柱物理像素宽度 */
  kWidthPx: number
  /** Overlay 帧复用上一帧的几何缓存 */
  useCachedFrame: boolean
  /** 原始 K 线数据 */
  data: KLineData[]
  /** 当前缩放级别索引 */
  zoomLevel: number
  /** 缩放级别总数 */
  zoomLevelCount: number
}

export interface RendererDependencies {
  getDom: () => ChartDom
  getOption: () => ResolvedChartOptions
  getPaneRenderers: () => PaneRenderer[]
  getInteraction: () => InteractionController
  getSceneRenderer: () => Renderer
  getPluginHost: () => PluginHostImpl
  getRendererPluginManager: () => RendererPluginManager
  getTheme: () => 'light' | 'dark'
  getCurrentZoomLevel: () => number
  getZoomLevelCount: () => number
  getViewportManager: () => ChartViewportManager
  getDataManager: () => ChartDataManager
  getIndicatorManager: () => ChartIndicatorManager
  getActiveMode: () => ChartModeHandler
  settings$: ReadonlySignal<ChartSettings>
  customMarkers$: MarkerManagerDeps['customMarkers$']
  drawings$: DrawingStoreDeps['drawings$']
  selectedDrawingId$: DrawingStoreDeps['selectedDrawingId$']
}

export class ChartRenderer {
  /** 依赖注入容器，ChartRenderer 不直接持有状态，从 deps 接口读取，也便于测试 mock */
  private deps: RendererDependencies

  /** requestAnimationFrame id，不为 null 时触发 RAF 节流，取消被分配帧，确保展示最新帧 */
  private raf: number | null = null
  // 下一帧重绘级别
  private pendingUpdateLevel: UpdateLevel = UpdateLevel.All

  readonly markerManager: MarkerManager
  readonly drawingStore: DrawingStore
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
  private timeAxisCtx: RenderContext | null = null
  private timeAxisLayer: Layer | null = null
  private _prevFrameRange: { visible: VisibleRange; raw: VisibleRange } | null = null

  constructor(deps: RendererDependencies) {
    this.deps = deps
    this.markerManager = new MarkerManager({ customMarkers$: deps.customMarkers$ })
    this.drawingStore = new DrawingStore({
      drawings$: deps.drawings$,
      selectedDrawingId$: deps.selectedDrawingId$,
    })
    this.scene = createScene()
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
      const layer = createLayerFromPlugin(plugin, getCtxForCurrentPane, 'global')
      this.scene.addLayer(layer)
    }
    {
      const plugin = createDrawingLabelOverlayPlugin({ store: this.drawingStore })
      this.deps.getRendererPluginManager().register(plugin)
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

  getCurrentPaneId(): string {
    return this.currentPaneId
  }

  getMarkerManager(): MarkerManager {
    return this.markerManager
  }

  getDrawingStore(): DrawingStore {
    return this.drawingStore
  }

  getSettings(): ChartSettings {
    return this.deps.settings$.peek()
  }

  private get settings(): ChartSettings {
    return this.deps.settings$.peek()
  }

  /**
   * 申请绘制，把绘制元数据配置合并到下一帧 requestAnimationFrame，避免同帧多次重绘。
   *
   * 已有 rAF 在等时只更新 pendingUpdateLevel，不重复注册。如果
   * pending 和 level 分别是 Main 和 Overlay，合并成 All。
   *
   * @param level - Main 只画主层，Overlay 只画覆盖层（crosshair 等），All 全画
   */
  scheduleDraw(level: UpdateLevel = UpdateLevel.All): void {
    // 已经有下一帧 raf 被申请，只改下一个申请帧的重绘级别
    if (this.raf !== null) {
      // pending 已是最全，新请求不论什么级别都不影响
      if (this.pendingUpdateLevel === UpdateLevel.All) return
      // 新请求要全画，升 pending
      if (level === UpdateLevel.All) {
        this.pendingUpdateLevel = UpdateLevel.All
        return
      }
      // Main 和 Overlay 各来一次后合并成全画
      if (
        (this.pendingUpdateLevel === UpdateLevel.Main && level === UpdateLevel.Overlay) ||
        (this.pendingUpdateLevel === UpdateLevel.Overlay && level === UpdateLevel.Main)
      ) {
        this.pendingUpdateLevel = UpdateLevel.All
        return
      }
      // 同级别重复请求，pending 不变
      return
    }

    this.pendingUpdateLevel = level
    this.raf = requestAnimationFrame(() => {
      // 取出本次要画的级别，pending 改回 All 表示「没有挂起的请求了」
      const levelToDraw = this.pendingUpdateLevel
      this.pendingUpdateLevel = UpdateLevel.All

      // 准备帧绘制数据
      const frame = this.prepareFrameData(levelToDraw)
      if (frame) {
        // 把 K 线位置写入 interaction state，供十字线等模块读取
        this.writeFramePositionsFromFrame(frame)
      }
      // 清屏、组 context、遍历 pane 调 Scene.paintPane、画时间轴
      this.drawWithFrame(levelToDraw, frame)

      this.raf = null
      // 如果刚才画的过程中又有 scheduleDraw 写过 pending，补一帧
      if (this.pendingUpdateLevel !== UpdateLevel.All) {
        this.scheduleDraw(this.pendingUpdateLevel)
      }
    })
  }

  /**
   * 同步绘制一帧，不经 rAF 合并。测试与必须立刻出图的路径使用。
   *
   * @param level - 同 scheduleDraw
   */
  draw(level: UpdateLevel = UpdateLevel.All): void {
    this.drawWithFrame(level, this.prepareFrameData(level))
  }

  private drawWithFrame(level: UpdateLevel, frame: FrameContext | null): void {
    this.markerManager.clear()

    if (!frame) {
      const dataManager = this.deps.getDataManager()
      if (dataManager.getInternalData().length === 0 && dataManager.getTimeShareData().length === 0)
        this.clearAllCanvases()
      return
    }

    const { vp, range, kLinePositions, kLineCenters, kBarRects, kWidthPx, useCachedFrame } = frame

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

    const renderData = frame.data

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
      renderData,
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
      renderData,
    )
  }

  /**
   * 把 K 线位置写入 interaction state。
   * setKLinePositions 会更新多个 signal（位置、区间、宽度、中心点），
   * batch 确保这组写入完成后才通知订阅者，不会让十字线等读到一半的新数据。
   */
  private writeFramePositionsFromFrame(frame: FrameContext): void {
    batch(() => {
      this.deps.getInteraction().setKLinePositions(frame.kLinePositions, frame.range, frame.kWidthPx, frame.kLineCenters)
    })
  }

  /**
   * 准备一帧的绘制数据：viewport、可见区间、K 线位置。
   *
   * Overlay 且上次画完没清缓存时，直接复用 cachedDrawFrame，不重复
   * 算 viewport 和 bar 位置。非缓存路径会刷新 cachedDrawFrame。
   * range 变了会调用 checkVisibleRangeGapWhenIdle，方便空闲时补数据。
   * TimeShare 模式按 plotWidth 平分 bar，不走 K 线物理宽度那套。
   *
   * @param level - Overlay 可走缓存，Main/All 强制重算
   * @returns 无 viewport 或无数据时返回 null，调用方自己清屏或跳过
   */
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
      (!this._prevFrameRange ||
        range.start !== this._prevFrameRange.visible.start ||
        range.end !== this._prevFrameRange.visible.end ||
        rawRange.start !== this._prevFrameRange.raw.start ||
        rawRange.end !== this._prevFrameRange.raw.end)
    ) {
      this._prevFrameRange = { visible: range, raw: rawRange }
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
    renderData: unknown[],
  ): { sharedXAxisLabels: XAxisLabel[]; sharedXAxisRanges: XAxisRange[] } {
    const sharedYAxisLabels: YAxisLabel[] = []
    const sharedXAxisLabels: XAxisLabel[] = []
    const sharedYAxisRanges: YAxisRange[] = []
    const sharedXAxisRanges: XAxisRange[] = []

    const dataManager = this.deps.getDataManager()
    const mode = this.deps.getActiveMode()

    for (const renderer of this.deps.getPaneRenderers()) {
      const pane = renderer.getPane()
      const { mainCtx, overlayCtx, yAxisCtx, leftAxisCtx } = renderer.getContexts()

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
        data: renderData,
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

      const region = { x: 0, y: pane.top, width: vp.plotWidth, height: pane.height, dpr: vp.dpr }
      const sceneRenderer = this.deps.getSceneRenderer()
      if (shouldUpdateMain) {
        sceneRenderer.beginFrame(region)
        this.scene.paintPane({
          renderer: sceneRenderer,
          region,
          paneRole: (pane.id === 'main' ? 'main' : 'sub') as PaneRole,
          paneId: pane.id,
          frameNumber: this.frameCount++,
          deltaMs: 0,
        })
      }
      if (shouldUpdateOverlay && !shouldUpdateMain) {
        sceneRenderer.beginFrame(region)
        this.scene.paintPane(
          {
            renderer: sceneRenderer,
            region,
            paneRole: (pane.id === 'main' ? 'main' : 'sub') as PaneRole,
            paneId: pane.id,
            frameNumber: this.frameCount++,
            deltaMs: 0,
          },
          ['overlay'],
        )
      }
    }

    // WebGPU: one submit after all panes recorded draws
    this.deps.getSceneRenderer().endFrame()

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
    renderData: unknown[],
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
        data: renderData,
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
        renderer: this.deps.getSceneRenderer(),
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
    this.scene.dispose()
    this.paneCtxMap.clear()
  }
}
