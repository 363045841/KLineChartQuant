import type { ChartDom, Viewport, ViewportState } from '../chartTypes'
import type { VisibleRange, UpdateLevel } from '../layout/pane'
import { createSignal, type Signal } from '../../reactivity/signal'

export interface ViewportDependencies {
  getDom: () => ChartDom
  getBottomAxisHeight: () => number
  getLeftLoadBufferWidth: () => number
  getZoomLevel: () => number
  getLastVisibleRange: () => VisibleRange
  getKWidth: () => number
  getKGap: () => number
  scheduleDraw: (level?: UpdateLevel) => void
  onResizeCompleted: () => void
  resizeSharedWebGLSurface: (plotWidth: number, plotHeight: number, dpr: number) => void
}

export class ChartViewportManager {
  private deps: ViewportDependencies

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

  /** 待写入 DOM 的 scrollLeft（在 RAF 回调中应用，确保 Vue 已完成 DOM 更新） */
  private _pendingScrollLeft: number | null = null

  /** 内部视口状态 */
  private _internalViewport: Viewport | null = null

  /** 视口状态信号 */
  private _viewportSignal = createSignal<ViewportState>({
    zoomLevel: 1,
    plotWidth: 0,
    plotHeight: 0,
    dpr: 1,
    visibleFrom: 0,
    visibleTo: 0,
    kWidth: 0,
    kGap: 1,
  })

  constructor(deps: ViewportDependencies) {
    this.deps = deps
  }

  /** 视口状态信号 */
  get viewportSignal(): Signal<ViewportState> {
    return this._viewportSignal
  }

  /** 获取缓存的 scrollLeft（避免读取 DOM 触发强制回流） */
  getCachedScrollLeft(): number {
    return this.cachedScrollLeft
  }

  /** 获取逻辑 scrollLeft（减去左侧加载缓冲宽度，可为负值） */
  getLogicalScrollLeft(): number {
    return this.cachedScrollLeft - this.deps.getLeftLoadBufferWidth()
  }

  /** 获取当前视口 */
  getViewport(): Viewport | null {
    return this._internalViewport
  }

  /** 获取有效 DPR */
  getEffectiveDpr(): number {
    let dpr = this.preciseDpr > 0
      ? this.preciseDpr
      : Math.round((window.devicePixelRatio || 1) * 64) / 64
    if (dpr < 1) dpr = 1
    return dpr
  }

  /** 获取观测到的容器尺寸 */
  getObservedSize(): { width: number; height: number } {
    return this.observedSize
  }

  /** 设置滚动位置（缓存 + 待写入） */
  setScrollLeft(v: number): void {
    this.cachedScrollLeft = v
    this._pendingScrollLeft = v
  }

  /** 在 RAF 回调中应用待写入的 scrollLeft */
  applyPendingScrollLeft(container: HTMLElement): void {
    if (this._pendingScrollLeft !== null) {
      container.scrollLeft = this._pendingScrollLeft
      this.cachedScrollLeft = container.scrollLeft
      this._pendingScrollLeft = null
    }
  }

  /** 初始化 ResizeObserver 和 scroll 监听 */
  init(): void {
    if (typeof ResizeObserver === 'undefined') return

    const target = this.deps.getDom().container
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
        this.deps.onResizeCompleted()
      }
    })

    try {
      this.resizeObserver.observe(target, { box: 'device-pixel-content-box' as ResizeObserverBoxOptions })
    } catch {
      this.resizeObserver.observe(target)
    }
  }

  /** 销毁 */
  destroy(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.preciseDpr = 0
    this.observedSize = { width: 0, height: 0 }

    if (this.onScroll) {
      this.deps.getDom().container?.removeEventListener('scroll', this.onScroll)
      this.onScroll = undefined
    }

    this._internalViewport = null
  }

  /**
   * 计算视口（coordinator）
   *
   * 协调 4 个步骤：尺寸解析 → DPR 计算 → DOM 同步 → 状态推送。
   * 每一子步骤均可独立测试。
   */
  computeViewport(): Viewport | null {
    const dims = this.resolveViewportDimensions()
    if (!dims) return null
    const { viewWidth, viewHeight, plotWidth, plotHeight } = dims

    const dpr = this.clampDpr(viewWidth, viewHeight)
    const scrollLeft = Math.round(this.getLogicalScrollLeft() * dpr) / dpr

    this.syncCanvasDom(dpr, viewWidth, viewHeight)
    this.deps.resizeSharedWebGLSurface(plotWidth, plotHeight, dpr)

    const vp: Viewport = { viewWidth, viewHeight, plotWidth, plotHeight, scrollLeft, dpr }
    this.applyViewportState(vp)
    return vp
  }

  /**
   * 解析容器尺寸
   *
   * 优先使用 ResizeObserver 上报的 observedSize，
   * fallback 到 DOM clientWidth/clientHeight。
   * plotHeight 为 viewHeight 扣除底部轴高度。
   */
  private resolveViewportDimensions(): { viewWidth: number; viewHeight: number; plotWidth: number; plotHeight: number } | null {
    const container = this.deps.getDom().container
    if (!container) return null

    const viewWidth = this.observedSize.width > 0
      ? this.observedSize.width
      : Math.max(1, Math.round(container.clientWidth))
    const viewHeight = this.observedSize.height > 0
      ? this.observedSize.height
      : Math.max(1, Math.round(container.clientHeight))
    const plotWidth = Math.round(viewWidth)
    const plotHeight = Math.round(viewHeight - this.deps.getBottomAxisHeight())

    return { viewWidth, viewHeight, plotWidth, plotHeight }
  }

  /**
   * DPR 计算与封顶
   *
   * 取 effectiveDpr，若总像素超 MAX_CANVAS_PIXELS（16M）则降级 dpr
   * 以避免浏览器 canvas 创建失败。
   */
  private clampDpr(viewWidth: number, viewHeight: number): number {
    const MAX_CANVAS_PIXELS = 16 * 1024 * 1024
    let dpr = this.getEffectiveDpr()
    if (viewWidth * dpr * (viewHeight * dpr) > MAX_CANVAS_PIXELS) {
      dpr = Math.sqrt(MAX_CANVAS_PIXELS / (viewWidth * viewHeight))
    }
    return dpr
  }

  /**
   * 同步 DOM canvas 尺寸
   *
   * 更新 canvasLayer 和 xAxisCanvas 的 width/height 属性与 CSS 尺寸，
   * 确保物理像素与逻辑像素一致，消除亚像素偏移。
   * 仅在实际值变化时写入，避免无意义回流。
   */
  private syncCanvasDom(dpr: number, viewWidth: number, viewHeight: number): void {
    const dom = this.deps.getDom()
    const dprRoundedViewWidth = Math.round(viewWidth * dpr) / dpr

    const canvasLayerWidth = `${dprRoundedViewWidth}px`
    if (dom.canvasLayer.style.width !== canvasLayerWidth) {
      dom.canvasLayer.style.width = canvasLayerWidth
    }

    const canvasLayerHeight = `${viewHeight}px`
    if (dom.canvasLayer.style.height !== canvasLayerHeight) {
      dom.canvasLayer.style.height = canvasLayerHeight
    }

    const xAxisWidthPx = Math.round(dprRoundedViewWidth * dpr)
    if (dom.xAxisCanvas.width !== xAxisWidthPx) {
      dom.xAxisCanvas.width = xAxisWidthPx
    }

    const xAxisHeight = Math.round(this.deps.getBottomAxisHeight() * dpr)
    if (dom.xAxisCanvas.height !== xAxisHeight) {
      dom.xAxisCanvas.height = xAxisHeight
    }

    const xAxisCssWidth = `${dprRoundedViewWidth}px`
    if (dom.xAxisCanvas.style.width !== xAxisCssWidth) {
      dom.xAxisCanvas.style.width = xAxisCssWidth
    }

    const xAxisCssHeight = `${xAxisHeight / dpr}px`
    if (dom.xAxisCanvas.style.height !== xAxisCssHeight) {
      dom.xAxisCanvas.style.height = xAxisCssHeight
    }
  }

  /**
   * 应用视口状态
   *
   * 缓存 Viewport 对象并检测字段是否变化，
   * 有变化时才写入 _viewportSignal 避免触发无关重绘。
   */
  private applyViewportState(vp: Viewport): void {
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
      const current = this._viewportSignal.peek()
      this._viewportSignal.set({
        zoomLevel: current.zoomLevel,
        plotWidth: vp.plotWidth,
        plotHeight: vp.plotHeight,
        dpr: vp.dpr > 0 ? vp.dpr : current.dpr,
        visibleFrom: current.visibleFrom,
        visibleTo: current.visibleTo,
        kWidth: current.kWidth,
        kGap: current.kGap,
      })
    }
  }

  /**
   * 更新 viewport signal（用于滚动事件/缩放后的信号同步）
   */
  updateViewportSignal(): void {
    const vp = this._internalViewport
    if (!vp) return

    this._viewportSignal.set({
      zoomLevel: this.deps.getZoomLevel(),
      plotWidth: vp.plotWidth,
      plotHeight: vp.plotHeight,
      dpr: vp.dpr,
      visibleFrom: this.deps.getLastVisibleRange().start,
      visibleTo: this.deps.getLastVisibleRange().end,
      kWidth: this.deps.getKWidth(),
      kGap: this.deps.getKGap(),
    })
  }

  private updateObservedMetrics(entry: ResizeObserverEntry) {
    const cssWidth = Math.max(1, Math.round(entry.contentRect.width))
    const cssHeight = Math.max(1, Math.round(entry.contentRect.height))
    this.observedSize.width = cssWidth
    this.observedSize.height = cssHeight

    if (this.cachedScrollLeft === 0 && cssWidth > 0) {
      this.cachedScrollLeft = cssWidth
      this._pendingScrollLeft = cssWidth
    }

    const pixelSize = entry.devicePixelContentBoxSize?.[0]
    const cssSize = entry.contentBoxSize?.[0]
    if (!pixelSize || !cssSize || cssSize.inlineSize <= 0) {
      this.preciseDpr = 0
      return
    }

    const raw = pixelSize.inlineSize / cssSize.inlineSize
    this.preciseDpr = Math.round(raw * 64) / 64
  }
}
