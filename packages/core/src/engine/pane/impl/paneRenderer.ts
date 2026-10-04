/** 管理单个 Pane 的画布尺寸、上下文和运行时状态。 */
import type { PaneRendererContexts, PaneRendererDom, PaneRendererOptions } from '../types.js'

/* PaneRenderer：负责单个 Pane 的 Canvas 管理与运行时状态持有
   管理 main/drawing/overlay/yAxis/yAxisOverlay canvas，价格轴与左右摆放位置无关
   持有 Pane 实例（布局、Y 轴、价格范围）
   响应 Chart 的 resize / layout 信号
   GPU 绘制经 ChartRenderer.sceneRenderer（SharedWebGLSurface），本类不再持有 per-pane surface */
export class PaneRenderer {
  private dom: PaneRendererDom
  private pane: import('../../layout/pane.js').Pane
  private opt: PaneRendererOptions
  private contexts: PaneRendererContexts | null = null

  constructor(
    dom: PaneRendererDom,
    pane: import('../../layout/pane.js').Pane,
    opt: PaneRendererOptions,
  ) {
    this.dom = dom
    this.pane = pane
    this.opt = {
      ...opt,
      priceLabelWidth: opt.priceLabelWidth || 60,
    }
  }

  /** 获取关联的 Pane 实例 */
  getPane(): import('../../layout/pane.js').Pane {
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
        drawingCtx: this.dom.drawingCanvas.getContext('2d'),
        overlayCtx: this.dom.overlayCanvas.getContext('2d'),
        yAxisCtx: this.dom.yAxisCanvas.getContext('2d'),
        yAxisOverlayCtx: this.dom.yAxisOverlayCanvas.getContext('2d'),
        leftAxisCtx: this.dom.leftYAxisCanvas?.getContext('2d') ?? null,
        leftAxisOverlayCtx: this.dom.leftYAxisOverlayCanvas?.getContext('2d') ?? null,
      }
    }
    return this.contexts
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
   * 调整 Canvas 尺寸
   * @param width pane 宽度（逻辑像素）
   * @param height pane 高度（逻辑像素）
   * @param dpr 设备像素比
   */
  resize(width: number, height: number, dpr: number) {
    const mainCanvas = this.dom.mainCanvas
    const overlayCanvas = this.dom.overlayCanvas
    const yAxisCanvas = this.dom.yAxisCanvas
    const yAxisOverlayCanvas = this.dom.yAxisOverlayCanvas

    // 先读取 parentClientWidth，避免在写入样式后读取触发强制回流
    const fallbackYAxisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
    const parentClientWidth = yAxisCanvas.parentElement?.clientWidth ?? 0
    const canvasYAxisWidth = parentClientWidth > 0 ? parentClientWidth : fallbackYAxisWidth

    // Main Canvas
    const mainWidth = Math.round(width * dpr)
    const mainHeight = Math.round(height * dpr)
    PaneRenderer.resizeCanvas(mainCanvas, mainWidth, mainHeight, dpr)
    PaneRenderer.resizeCanvas(this.dom.drawingCanvas, mainWidth, mainHeight, dpr)

    // Overlay Canvas - 与 Main Canvas 相同尺寸
    PaneRenderer.resizeCanvas(overlayCanvas, mainWidth, mainHeight, dpr)

    // YAxis Canvas + overlay 轴（同尺寸）
    const yAxisWidth = Math.round(canvasYAxisWidth * dpr)
    const yAxisHeight = Math.round(height * dpr)
    PaneRenderer.resizeCanvas(yAxisCanvas, yAxisWidth, yAxisHeight, dpr)
    PaneRenderer.resizeCanvas(yAxisOverlayCanvas, yAxisWidth, yAxisHeight, dpr)

    // rightAxisWidth 可为 0；价格标签宽度仍需计入左轴的默认宽度。
    const leftParentWidth = this.dom.leftYAxisCanvas?.parentElement?.clientWidth ?? 0
    const leftWidth = Math.round(
      (leftParentWidth > 0 ? leftParentWidth : this.opt.leftAxisWidth || fallbackYAxisWidth) * dpr,
    )
    for (const canvas of [this.dom.leftYAxisCanvas, this.dom.leftYAxisOverlayCanvas]) {
      if (canvas) PaneRenderer.resizeCanvas(canvas, leftWidth, yAxisHeight, dpr)
    }
  }

  /** 销毁 PaneRenderer 实例 */
  destroy() {
    this.contexts = null
  }
}
