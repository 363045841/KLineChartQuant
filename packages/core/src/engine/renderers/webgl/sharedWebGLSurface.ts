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
 *   1. 一个可见 canvas 持有唯一的 WebGL2 上下文
 *   2. beginFrame() 绑定并清空整图 MSAA target
 *   3. 每个 pane 通过 bindRegion() 设置独立 viewport + scissor
 *   4. endFrame() 以全图状态一次 resolve 到可见 canvas
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

type MsaaTargets = {
  samples: number
  widthPx: number
  heightPx: number
  framebuffer: WebGLFramebuffer
  colorBuffer: WebGLRenderbuffer
}

export class SharedWebGLSurface {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null = null
  private msaaTargets: MsaaTargets | null = null
  private frameActive = false

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

    const resized = this.canvas.width !== nextWidth || this.canvas.height !== nextHeight
    if (resized) this.destroyMsaaTargets()
    if (this.canvas.width !== nextWidth) {
      this.canvas.width = nextWidth
    }
    if (this.canvas.height !== nextHeight) {
      this.canvas.height = nextHeight
    }
    // CSS 尺寸由物理 buffer 反算，避免非整数 DPR 下浏览器二次缩放引入重采样模糊。
    this.canvas.style.width = `${nextWidth / dpr}px`
    this.canvas.style.height = `${nextHeight / dpr}px`
  }

  getPhysicalRegion(region: WebGLRegion): PhysicalRegion | null {
    return this.toPhysicalRegion(region)
  }

  /** 开始一帧绘制，并可选清空整张共享绘制目标。 */
  beginFrame(options: { clear: boolean }): boolean {
    const gl = this.gl
    if (!gl) return false

    const targets = this.ensureMsaaTargets()
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets?.framebuffer ?? null)
    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    if (options.clear) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    this.frameActive = true
    return true
  }

  /** 将后续绘制限制在一个 pane 的物理区域内。 */
  bindRegion(region: WebGLRegion): boolean {
    const gl = this.gl
    const physical = this.toPhysicalRegion(region)
    if (!gl || !physical || !this.frameActive) return false

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.msaaTargets?.framebuffer ?? null)
    const viewportY = this.canvas.height - physical.sourceY - physical.heightPx
    gl.enable(gl.SCISSOR_TEST)
    gl.viewport(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
    gl.scissor(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
    return true
  }

  /** 清空指定区域的 MSAA target 与可见 canvas，供无数据帧使用。 */
  clearRegion(region: WebGLRegion): void {
    const gl = this.gl
    const physical = this.toPhysicalRegion(region)
    if (!gl || !physical) return

    const targets = this.ensureMsaaTargets()
    this.clearPhysicalRegion(gl, targets?.framebuffer ?? null, physical)
    if (targets) this.clearPhysicalRegion(gl, null, physical)
    this.resetFramebufferState(gl)
  }

  /** 结束一帧绘制，并将完整 MSAA target resolve 到可见 canvas。 */
  endFrame(): void {
    const gl = this.gl
    if (!gl || !this.frameActive) return
    const targets = this.msaaTargets
    if (targets) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets.framebuffer)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
      gl.disable(gl.SCISSOR_TEST)
      gl.blitFramebuffer(
        0,
        0,
        targets.widthPx,
        targets.heightPx,
        0,
        0,
        targets.widthPx,
        targets.heightPx,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      )
    }
    this.frameActive = false
    this.resetFramebufferState(gl)
  }

  /** 在指定 framebuffer 内清空 pane 区域。 */
  private clearPhysicalRegion(
    gl: WebGL2RenderingContext,
    framebuffer: WebGLFramebuffer | null,
    physical: PhysicalRegion,
  ): void {
    const viewportY = this.canvas.height - physical.sourceY - physical.heightPx
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.enable(gl.SCISSOR_TEST)
    gl.viewport(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
    gl.scissor(physical.sourceX, viewportY, physical.widthPx, physical.heightPx)
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
    this.destroyMsaaTargets()
    this.canvas.width = 1
    this.canvas.height = 1
    this.frameActive = false
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

  /** 为整张共享画布创建尽可能高的 MSAA color buffer。 */
  private ensureMsaaTargets(): MsaaTargets | null {
    const gl = this.gl
    if (!gl || this.canvas.width <= 0 || this.canvas.height <= 0) return null

    const samples = Math.min(4, Number(gl.getParameter(gl.MAX_SAMPLES)) || 0)
    if (samples < 2) return null
    const existing = this.msaaTargets
    if (
      existing &&
      existing.widthPx === this.canvas.width &&
      existing.heightPx === this.canvas.height &&
      existing.samples === samples
    ) {
      return existing
    }

    this.destroyMsaaTargets()
    const framebuffer = gl.createFramebuffer()
    const colorBuffer = gl.createRenderbuffer()
    if (!framebuffer || !colorBuffer) {
      if (framebuffer) gl.deleteFramebuffer(framebuffer)
      if (colorBuffer) gl.deleteRenderbuffer(colorBuffer)
      return null
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.bindRenderbuffer(gl.RENDERBUFFER, colorBuffer)
    gl.renderbufferStorageMultisample(
      gl.RENDERBUFFER,
      samples,
      gl.RGBA8,
      this.canvas.width,
      this.canvas.height,
    )
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorBuffer)
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    if (!complete) {
      gl.deleteFramebuffer(framebuffer)
      gl.deleteRenderbuffer(colorBuffer)
      return null
    }

    const targets = {
      samples,
      widthPx: this.canvas.width,
      heightPx: this.canvas.height,
      framebuffer,
      colorBuffer,
    }
    this.msaaTargets = targets
    return targets
  }

  /** 释放尺寸变化后失效的 MSAA 资源。 */
  private destroyMsaaTargets(): void {
    const gl = this.gl
    const targets = this.msaaTargets
    if (gl && targets) {
      gl.deleteFramebuffer(targets.framebuffer)
      gl.deleteRenderbuffer(targets.colorBuffer)
    }
    this.msaaTargets = null
  }

  /** 恢复帧边界的中性状态，禁止 pane 状态泄漏到下一帧。 */
  private resetFramebufferState(gl: WebGL2RenderingContext): void {
    gl.disable(gl.SCISSOR_TEST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
}
