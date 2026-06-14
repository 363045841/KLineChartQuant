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

  /** 仅设置缓存 scrollLeft（由 DataManager 内部使用） */
  setCachedScrollLeft(v: number): void {
    this.cachedScrollLeft = v
  }

  /** 仅设置待写入 scrollLeft（由 DataManager 内部使用） */
  setPendingScrollLeft(v: number): void {
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
   * 计算视口
   */
  computeViewport(): Viewport | null {
    const container = this.deps.getDom().container
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
    const plotHeight = Math.round(viewHeight - this.deps.getBottomAxisHeight())

    let dpr = this.getEffectiveDpr()

    const MAX_CANVAS_PIXELS = 16 * 1024 * 1024
    const requestedPixels = viewWidth * dpr * (viewHeight * dpr)
    if (requestedPixels > MAX_CANVAS_PIXELS) {
      dpr = Math.sqrt(MAX_CANVAS_PIXELS / (viewWidth * viewHeight))
    }

    // 对齐 scrollLeft，消除 translate 亚像素偏移
    const scrollLeft = Math.round(this.getLogicalScrollLeft() * dpr) / dpr

    const dom = this.deps.getDom()

    const canvasLayerWidth = `${viewWidth}px`
    if (dom.canvasLayer.style.width !== canvasLayerWidth) {
      dom.canvasLayer.style.width = canvasLayerWidth
    }

    const canvasLayerHeight = `${viewHeight}px`
    if (dom.canvasLayer.style.height !== canvasLayerHeight) {
      dom.canvasLayer.style.height = canvasLayerHeight
    }

    const xAxisWidth = Math.round(plotWidth * dpr)
    if (dom.xAxisCanvas.width !== xAxisWidth) {
      dom.xAxisCanvas.width = xAxisWidth
    }

    const xAxisHeight = Math.round(this.deps.getBottomAxisHeight() * dpr)
    if (dom.xAxisCanvas.height !== xAxisHeight) {
      dom.xAxisCanvas.height = xAxisHeight
    }

    const xAxisCssWidth = `${xAxisWidth / dpr}px`
    if (dom.xAxisCanvas.style.width !== xAxisCssWidth) {
      dom.xAxisCanvas.style.width = xAxisCssWidth
    }

    const xAxisCssHeight = `${xAxisHeight / dpr}px`
    if (dom.xAxisCanvas.style.height !== xAxisCssHeight) {
      dom.xAxisCanvas.style.height = xAxisCssHeight
    }

    this.deps.resizeSharedWebGLSurface(plotWidth, plotHeight, dpr)

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
    return vp
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
