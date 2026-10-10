/** 管理单个 Pane 的画布分配、尺寸、上下文和运行时状态。 */
import {
  DEFAULT_PRICE_LABEL_WIDTH,
  type PaneRendererContexts,
  type PaneRendererDom,
  type PaneRendererOptions,
  type PaneSurfaceFactory,
  type ResolvedPaneRendererOptions,
} from '../types.js'

/** 最近一次布局给出的逻辑尺寸；按需创建的表面据此写入后备存储尺寸。 */
interface PaneMetrics {
  width: number
  height: number
  dpr: number
  top: number
}

/** 释放后备存储：移出 DOM 并把像素缓冲归零，浏览器即可回收显存。 */
function releaseCanvas(canvas: HTMLCanvasElement | undefined): void {
  if (!canvas) return
  canvas.remove()
  canvas.width = 0
  canvas.height = 0
}

/* PaneRenderer：负责单个 Pane 的 Canvas 管理与运行时状态持有
   管理 main/drawing/overlay/yAxis/yAxisOverlay canvas，价格轴与左右摆放位置无关
   正式图元与左轴表面按需创建；隐藏 pane 的后备存储归零
   持有 Pane 实例（布局、Y 轴、价格范围）
   响应 Chart 的 resize / layout 信号
   GPU 绘制经 ChartRenderer.sceneRenderer（SharedWebGLSurface），本类不再持有 per-pane surface */
export class PaneRenderer {
  private dom: PaneRendererDom
  private pane: import('./layout/pane.js').Pane
  private opt: ResolvedPaneRendererOptions
  private readonly surfaces: PaneSurfaceFactory | undefined
  private contexts: PaneRendererContexts | null = null
  private metrics: PaneMetrics | null = null
  private visible = true

  constructor(
    dom: PaneRendererDom,
    pane: import('./layout/pane.js').Pane,
    opt: PaneRendererOptions,
    surfaces?: PaneSurfaceFactory,
  ) {
    this.dom = dom
    this.pane = pane
    this.surfaces = surfaces
    this.opt = {
      ...opt,
      priceLabelWidth: opt.priceLabelWidth ?? DEFAULT_PRICE_LABEL_WIDTH,
    }
  }

  /** 获取关联的 Pane 实例 */
  getPane(): import('./layout/pane.js').Pane {
    return this.pane
  }

  /** 获取 DOM 元素 */
  getDom(): PaneRendererDom {
    return this.dom
  }

  getContexts(): PaneRendererContexts {
    if (!this.contexts) {
      this.contexts = {
        mainCtx: this.dom.mainCanvas.getContext('2d'),
        drawingCtx: this.dom.drawingCanvas?.getContext('2d') ?? null,
        overlayCtx: this.dom.overlayCanvas.getContext('2d'),
        yAxisCtx: this.dom.yAxisCanvas.getContext('2d'),
        yAxisOverlayCtx: this.dom.yAxisOverlayCanvas.getContext('2d'),
        leftAxisCtx: this.dom.leftYAxisCanvas?.getContext('2d') ?? null,
        leftAxisOverlayCtx: this.dom.leftYAxisOverlayCanvas?.getContext('2d') ?? null,
      }
    }
    return this.contexts
  }

  /**
   * 返回正式图元表面的上下文，首次需要时创建并按当前布局定尺寸。
   * 无工厂（调用方自带 DOM）或 pane 隐藏时只返回已有上下文。
   */
  ensureDrawingContext(): CanvasRenderingContext2D | null {
    if (!this.dom.drawingCanvas && this.surfaces && this.visible) {
      this.dom = { ...this.dom, drawingCanvas: this.surfaces.createDrawingCanvas() }
      this.contexts = null
      this.applyMetrics()
    }
    return this.getContexts().drawingCtx
  }

  /**
   * 同步左轴表面：可见时创建并定尺寸，不可见时释放后备存储。
   * 无工厂（调用方自带 DOM）时保持调用方给定的表面不变。
   */
  setLeftAxisVisible(visible: boolean): void {
    if (!this.surfaces) return
    const allocated = this.dom.leftYAxisCanvas !== undefined
    const wanted = visible && this.visible
    if (wanted === allocated) return
    if (wanted) {
      const { base, overlay } = this.surfaces.createLeftAxisCanvases()
      this.dom = { ...this.dom, leftYAxisCanvas: base, leftYAxisOverlayCanvas: overlay }
      this.applyMetrics()
    } else {
      releaseCanvas(this.dom.leftYAxisCanvas)
      releaseCanvas(this.dom.leftYAxisOverlayCanvas)
      this.dom = { ...this.dom, leftYAxisCanvas: undefined, leftYAxisOverlayCanvas: undefined }
    }
    this.contexts = null
  }

  /**
   * 隐藏 pane 不参与布局：常驻表面的后备存储归零，按需表面直接释放；
   * 再次可见时由下一次 resize 恢复常驻表面尺寸，按需表面在需要时重新创建。
   */
  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    if (visible) return
    this.metrics = null
    if (this.surfaces) {
      releaseCanvas(this.dom.drawingCanvas)
      releaseCanvas(this.dom.leftYAxisCanvas)
      releaseCanvas(this.dom.leftYAxisOverlayCanvas)
      this.dom = {
        ...this.dom,
        drawingCanvas: undefined,
        leftYAxisCanvas: undefined,
        leftYAxisOverlayCanvas: undefined,
      }
    }
    for (const canvas of this.residentCanvases()) {
      PaneRenderer.resizeCanvas(canvas, 0, 0, 1)
    }
    this.contexts = null
  }

  /** 当前存在的全部表面（常驻 + 已创建的按需表面），供释放、定位与诊断使用。 */
  getAllocatedCanvases(): HTMLCanvasElement[] {
    const { drawingCanvas, leftYAxisCanvas, leftYAxisOverlayCanvas } = this.dom
    return [
      ...this.residentCanvases(),
      ...[drawingCanvas, leftYAxisCanvas, leftYAxisOverlayCanvas].filter(
        (canvas): canvas is HTMLCanvasElement => canvas !== undefined,
      ),
    ]
  }

  /** 每个 pane 恒定持有的表面。 */
  private residentCanvases(): HTMLCanvasElement[] {
    const { mainCanvas, overlayCanvas, yAxisCanvas, yAxisOverlayCanvas } = this.dom
    return [mainCanvas, overlayCanvas, yAxisCanvas, yAxisOverlayCanvas]
  }

  private static resizeCanvas(
    canvas: HTMLCanvasElement,
    widthPx: number,
    heightPx: number,
    dpr: number,
  ): void {
    if (canvas.width !== widthPx) {
      canvas.width = widthPx
    }
    if (canvas.height !== heightPx) {
      canvas.height = heightPx
    }
    const cssW = `${widthPx / dpr}px`
    if (canvas.style.width !== cssW) {
      canvas.style.width = cssW
    }
    const cssH = `${heightPx / dpr}px`
    if (canvas.style.height !== cssH) {
      canvas.style.height = cssH
    }
  }

  /**
   * 调整 Canvas 尺寸与纵向位置
   * @param width pane 宽度（逻辑像素）
   * @param height pane 高度（逻辑像素）
   * @param dpr 设备像素比
   * @param top pane 在绘图区内的纵向偏移（逻辑像素）；省略时不改写位置
   */
  resize(width: number, height: number, dpr: number, top?: number) {
    this.visible = true
    this.metrics = { width, height, dpr, top: top ?? this.metrics?.top ?? Number.NaN }
    this.applyMetrics()
  }

  /** 把最近一次布局尺寸写入当前存在的全部表面。 */
  private applyMetrics(): void {
    const metrics = this.metrics
    if (!metrics) return
    const { width, height, dpr, top } = metrics
    const mainCanvas = this.dom.mainCanvas
    const overlayCanvas = this.dom.overlayCanvas
    const yAxisCanvas = this.dom.yAxisCanvas
    const yAxisOverlayCanvas = this.dom.yAxisOverlayCanvas

    // 先读取 parentClientWidth，避免在写入样式后读取触发强制回流
    const fallbackYAxisWidth = this.opt.rightAxisWidth + this.opt.priceLabelWidth
    const parentClientWidth = yAxisCanvas.parentElement?.clientWidth ?? 0
    const canvasYAxisWidth = parentClientWidth > 0 ? parentClientWidth : fallbackYAxisWidth
    // 只有专用左轴宿主的宽度代表轴宽；回退挂到绘图层时按轴宽分配，避免整幅后备存储。
    const leftParent = this.dom.leftYAxisCanvas?.parentElement
    const leftParentWidth =
      leftParent && (this.surfaces?.leftAxisHostMeasurable ?? true) ? leftParent.clientWidth : 0

    // Main Canvas
    const mainWidth = Math.round(width * dpr)
    const mainHeight = Math.round(height * dpr)
    PaneRenderer.resizeCanvas(mainCanvas, mainWidth, mainHeight, dpr)
    if (this.dom.drawingCanvas) {
      PaneRenderer.resizeCanvas(this.dom.drawingCanvas, mainWidth, mainHeight, dpr)
    }

    // Overlay Canvas - 与 Main Canvas 相同尺寸
    PaneRenderer.resizeCanvas(overlayCanvas, mainWidth, mainHeight, dpr)

    // YAxis Canvas + overlay 轴（同尺寸）
    const yAxisWidth = Math.round(canvasYAxisWidth * dpr)
    const yAxisHeight = Math.round(height * dpr)
    PaneRenderer.resizeCanvas(yAxisCanvas, yAxisWidth, yAxisHeight, dpr)
    PaneRenderer.resizeCanvas(yAxisOverlayCanvas, yAxisWidth, yAxisHeight, dpr)

    // rightAxisWidth 可为 0；价格标签宽度仍需计入左轴的默认宽度。
    const leftWidth = Math.round(
      (leftParentWidth > 0 ? leftParentWidth : this.opt.leftAxisWidth || fallbackYAxisWidth) * dpr,
    )
    for (const canvas of [this.dom.leftYAxisCanvas, this.dom.leftYAxisOverlayCanvas]) {
      if (canvas) PaneRenderer.resizeCanvas(canvas, leftWidth, yAxisHeight, dpr)
    }

    // 纵向位置随布局写入，按需创建的表面与常驻表面保持对齐。
    if (Number.isNaN(top)) return
    const topPx = `${top}px`
    for (const canvas of this.getAllocatedCanvases()) {
      if (canvas.style.top !== topPx) canvas.style.top = topPx
    }
  }

  /** 销毁 PaneRenderer 实例：移除全部表面并归零后备存储。 */
  destroy() {
    for (const canvas of this.getAllocatedCanvases()) releaseCanvas(canvas)
    this.contexts = null
  }
}
