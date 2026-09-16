/**
 * 底层 GPU surface 后端接口。
 *
 * 抽象 canvas 与 context 的生命周期、viewport/scissor 区域、清屏、可选合成到 2D
 * canvas，以及销毁。WebGL / WebGPU canvas 均可直接作为可见 DOM 图层。
 *
 * 本文件是**纯接口**，不含实现，目的是：
 *
 * 1. 让 WebGL 能以稳定的契约适配 SharedWebGLSurface。
 * 2. 给 P1 WebGPU 实现一个固定的编写目标。
 * 3. 让上层 `Renderer`（`./Renderer.ts`）无需感知底层 GPU API 即可组合后端。
 *
 * 设计说明：
 * - 所有 region 坐标都是**逻辑像素**，DPR 缩放由 surface 内部处理（与
 *   WebGLRegion 语义一致）。
 * - `compositeTo` 是兼容入口；可见 GPU canvas 路径不调用它。
 */

export type SurfaceRegion = {
  /** logical-pixel X of the region's top-left within the surface */
  x: number
  /** logical-pixel Y of the region's top-left within the surface */
  y: number
  /** logical-pixel width */
  width: number
  /** logical-pixel height */
  height: number
  /** device pixel ratio used to convert logical → physical */
  dpr: number
}

export type CompositeOptions = {
  /** multiplied into the destination context's globalAlpha (0..1) */
  alpha?: number
  /** if false, blocks `imageSmoothingEnabled` during the drawImage */
  imageSmoothingEnabled?: boolean
}

/**
 * One GPU surface (WebGL2 today, WebGPU in P1). Stateless w.r.t. drawing
 * primitives — those belong to `Renderer`.
 */
export interface SurfaceBackend {
  /** Returns false if the underlying context could not be initialised. */
  isAvailable(): boolean

  /**
   * Resize the underlying canvas's physical (DPR-scaled) drawing buffer.
   * Idempotent when called with the same arguments.
   */
  resize(widthLogical: number, heightLogical: number, dpr: number): void

  /**
   * 在活动帧内绑定一个区域，供后续 draw commands 使用。
   * Activates scissor + viewport sized to `region`. Returns false if the
   * region is empty, backend is unavailable, or no frame is active.
   */
  bindRegion(region: SurfaceRegion): boolean

  /**
   * 清空指定区域到透明黑色。实现可同时清空离屏 target 和可见 surface。
   */
  clearRegion(region: SurfaceRegion): void

  /**
   * Copy the contents of `region` (in surface coordinates) onto the
   * provided 2D context at its current origin. Used to composite GPU
   * output into the final 2D overlay canvas the user sees.
   *
   * Implementations MUST restore any context state they mutate
   * (`globalAlpha`, `imageSmoothingEnabled`, transform).
   */
  compositeTo(
    targetCtx: CanvasRenderingContext2D,
    region: SurfaceRegion,
    options?: CompositeOptions,
  ): void

  /**
   * Tear down GPU resources. After dispose, all other methods become no-ops.
   * Idempotent.
   */
  dispose(): void
}

/**
 * 可见表面契约：暴露底层 canvas，供图表直接叠放到 2D 层下方。
 * 只有 GPU 后端（WebGL / WebGPU）实现；Canvas2D 后端没有独立可见 canvas。
 */
export interface VisibleSurface extends SurfaceBackend {
  /** 直接参与 DOM 分层的可见 canvas。 */
  readonly canvas: HTMLCanvasElement
}

/**
 * 判定 surface 是否暴露可见 canvas。
 * 以是否持有 `canvas` 字段作为结构判别，不依赖 DOM 全局对象。
 *
 * @param surface - 任意绘制表面后端
 * @returns 暴露 canvas 时为 true，并收窄为 VisibleSurface
 */
export function isVisibleSurface(surface: SurfaceBackend): surface is VisibleSurface {
  return 'canvas' in surface
}

/**
 * 返回 surface 的可见 canvas。
 * 分层挂载统一经此函数取 canvas，禁止消费方对 surface 强转。
 *
 * @param surface - 任意绘制表面后端
 * @returns 可见 canvas；后端不提供时返回 null
 */
export function getVisibleCanvas(surface: SurfaceBackend): HTMLCanvasElement | null {
  return isVisibleSurface(surface) ? surface.canvas : null
}
