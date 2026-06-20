import { CandleWebGLSurface, LineWebGLSurface } from './renderers/webgl/candleSurface'
import type { SharedWebGLSurface, WebGLRegion } from './renderers/webgl/sharedWebGLSurface'

export type PaneRendererDom = {
    mainCanvas: HTMLCanvasElement      // 主画布：K线、指标、网格
    overlayCanvas: HTMLCanvasElement   // 覆盖层：十字线、Tooltip（透明）
    yAxisCanvas: HTMLCanvasElement     // Y轴刻度
    leftYAxisCanvas?: HTMLCanvasElement // 左侧Y轴刻度
}

export type PaneRendererContexts = {
    mainCtx: CanvasRenderingContext2D | null
    overlayCtx: CanvasRenderingContext2D | null
    yAxisCtx: CanvasRenderingContext2D | null
    leftAxisCtx: CanvasRenderingContext2D | null
}

export type PaneRendererOptions = {
    rightAxisWidth: number
    leftAxisWidth: number
    yPaddingPx: number
    priceLabelWidth?: number
}

export type PaneRendererWebGLHandles = {
    candleSurface: CandleWebGLSurface | null
    lineSurface: LineWebGLSurface | null
}

/* PaneRenderer：负责单个 Pane 的 Canvas 管理与运行时状态持有
   创建并管理 mainCanvas / overlayCanvas / yAxisCanvas
   持有 Pane 实例（布局、Y 轴、价格范围）
   响应 Chart 的 resize / layout 信号
   渲染逻辑由 RendererPluginManager 统一调度 */
export class PaneRenderer {
    private dom: PaneRendererDom
    private pane: import('./layout/pane').Pane
    private opt: PaneRendererOptions
    private contexts: PaneRendererContexts | null = null
    private webgl: PaneRendererWebGLHandles

    constructor(
        dom: PaneRendererDom,
        pane: import('./layout/pane').Pane,
        opt: PaneRendererOptions,
        sharedWebGLSurface: SharedWebGLSurface,
    ) {
        this.dom = dom
        this.pane = pane
        this.opt = {
            ...opt,
            priceLabelWidth: opt.priceLabelWidth || 60,
        }
        this.webgl = {
            candleSurface: new CandleWebGLSurface(sharedWebGLSurface),
            lineSurface: new LineWebGLSurface(sharedWebGLSurface),
        }
    }

    /** 获取关联的 Pane 实例 */
    getPane(): import('./layout/pane').Pane {
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
                overlayCtx: this.dom.overlayCanvas.getContext('2d'),
                yAxisCtx: this.dom.yAxisCanvas.getContext('2d'),
                leftAxisCtx: this.dom.leftYAxisCanvas?.getContext('2d') ?? null,
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

    getWebGL(): PaneRendererWebGLHandles {
        return this.webgl
    }

    setWebGLRegion(region: WebGLRegion): void {
        this.webgl.candleSurface?.setRegion(region)
        this.webgl.lineSurface?.setRegion(region)
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

        // 先读取 parentClientWidth，避免在写入样式后读取触发强制回流
        const fallbackYAxisWidth = this.opt.rightAxisWidth + (this.opt.priceLabelWidth || 60)
        const parentClientWidth = yAxisCanvas.parentElement?.clientWidth ?? 0
        const canvasYAxisWidth = parentClientWidth > 0 ? parentClientWidth : fallbackYAxisWidth

        // Main Canvas
        const mainWidth = Math.round(width * dpr)
        const mainHeight = Math.round(height * dpr)
        PaneRenderer.resizeCanvas(mainCanvas, mainWidth, mainHeight, dpr)

        // Overlay Canvas - 与 Main Canvas 相同尺寸
        PaneRenderer.resizeCanvas(overlayCanvas, mainWidth, mainHeight, dpr)

        // YAxis Canvas
        const yAxisWidth = Math.round(canvasYAxisWidth * dpr)
        PaneRenderer.resizeCanvas(yAxisCanvas, yAxisWidth, Math.round(height * dpr), dpr)

        // Left YAxis Canvas
        const leftCanvas = this.dom.leftYAxisCanvas
        if (leftCanvas) {
            const fallbackLeftAxisWidth = this.opt.leftAxisWidth
            const leftParentWidth = leftCanvas.parentElement?.clientWidth ?? 0
            const canvasLeftAxisWidth = leftParentWidth > 0 ? leftParentWidth : fallbackLeftAxisWidth
            PaneRenderer.resizeCanvas(leftCanvas, Math.round(Math.max(canvasLeftAxisWidth, 0) * dpr), Math.round(height * dpr), dpr)
        }

        this.webgl.candleSurface?.resize(width, height, dpr)
        this.webgl.lineSurface?.resize(width, height, dpr)
    }

    /** 销毁 PaneRenderer 实例 */
    destroy() {
        this.contexts = null
        this.webgl.candleSurface?.destroy()
        this.webgl.lineSurface?.destroy()
    }
}
