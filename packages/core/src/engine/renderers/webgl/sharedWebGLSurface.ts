import { toPhysicalRegion } from '../../../rendering/render/physicalRegion'

/**
 * SharedWebGLSurface — 单 WebGL canvas 共享后端
 *
 * 设计动机：浏览器对 WebGL context 数量有限制（通常 16 个），
 * 每个 pane 独立创建 canvas → getContext('webgl2') 会快速耗尽限制。
 * 此模块在整个 chart 实例内共享单个 WebGL canvas，所有 pane
 * 通过 bindRegion(scissor+viewport) 在其中划分子区域绘制。
 *
 * 工作方式：
 *   1. 一个隐藏 canvas 持有唯一的 WebGL2 上下文
 *   2. 每个 pane 在共享 canvas 上绑定自己的逻辑区域
 *   3. 绘制完成后通过 compositeRegionTo() 将共享 canvas 的
 *      对应区域合成到 2D overlay canvas（DOM 可见层）
 *
 * 典型流程：
 *   resize(paneWidth, paneHeight, dpr)    ← 不分配新 context
 *   bindRegion({ x, y, width, height })   ← scissor + viewport
 *   clearRegion(...) + 外部绘制调用         ← pane 内的 GL 命令
 *   compositeRegionTo(ctx, region)        ← drawImage 到 2D canvas
 */

export type WebGLRegion = {
  x: number
  y: number
  width: number
  height: number
  dpr: number
}

export type WebGLCompositeOptions = {
  alpha?: number
  imageSmoothingEnabled?: boolean
}

export type PhysicalRegion = {
  sourceX: number
  sourceY: number
  widthPx: number
  heightPx: number
}

export class SharedWebGLSurface {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null = null

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? document.createElement('canvas')
    this.gl = this.initContext()
  }

  isAvailable(): boolean {
    return this.gl !== null
  }

  getGL(): WebGL2RenderingContext | null {
    return this.gl
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas
  }

  resize(width: number, height: number, dpr: number): void {
    const nextWidth = Math.max(1, Math.round(width * dpr))
    const nextHeight = Math.max(1, Math.round(height * dpr))

    if (this.canvas.width !== nextWidth) {
      this.canvas.width = nextWidth
    }
    if (this.canvas.height !== nextHeight) {
      this.canvas.height = nextHeight
    }
  }

  getPhysicalRegion(region: WebGLRegion): PhysicalRegion | null {
    return this.toPhysicalRegion(region)
  }

  bindRegion(region: WebGLRegion): boolean {
    const gl = this.gl
    const physical = this.toPhysicalRegion(region)
    if (!gl || !physical) return false

    const viewportY = this.canvas.height - physical.sourceY - physical.heightPx
    gl.enable(gl.SCISSOR_TEST)
    gl.viewport(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
    gl.scissor(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
    return true
  }

  clearRegion(region: WebGLRegion): void {
    const gl = this.gl
    if (!gl || !this.bindRegion(region)) return

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  compositeRegionTo(
    ctx: CanvasRenderingContext2D,
    region: WebGLRegion,
    options: WebGLCompositeOptions = {},
  ): void {
    const physical = this.toPhysicalRegion(region)
    if (!physical || physical.widthPx <= 0 || physical.heightPx <= 0) return

    const prevImageSmoothingEnabled = ctx.imageSmoothingEnabled
    const prevGlobalAlpha = ctx.globalAlpha
    const prevTransform = ctx.getTransform()

    if (options.imageSmoothingEnabled !== undefined) {
      ctx.imageSmoothingEnabled = options.imageSmoothingEnabled
    }
    if (options.alpha !== undefined) {
      ctx.globalAlpha = prevGlobalAlpha * options.alpha
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(
      this.canvas,
      physical.sourceX,
      physical.sourceY,
      physical.widthPx,
      physical.heightPx,
      0,
      0,
      physical.widthPx,
      physical.heightPx,
    )
    ctx.setTransform(prevTransform)

    ctx.globalAlpha = prevGlobalAlpha
    ctx.imageSmoothingEnabled = prevImageSmoothingEnabled
  }

  private getPhysicalBounds(): { width: number; height: number } {
    return { width: this.canvas.width, height: this.canvas.height }
  }

  destroy(): void {
    this.canvas.width = 1
    this.canvas.height = 1
    this.gl = null
  }

  private toPhysicalRegion(region: WebGLRegion): PhysicalRegion | null {
    const bounds = this.getPhysicalBounds()
    const physical = toPhysicalRegion(region, bounds)
    if (physical.width <= 0 || physical.height <= 0) return null
    return {
      sourceX: physical.x,
      sourceY: physical.y,
      widthPx: physical.width,
      heightPx: physical.height,
    }
  }

  private initContext(): WebGL2RenderingContext | null {
    try {
      return this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      })
    } catch {
      return null
    }
  }
}
