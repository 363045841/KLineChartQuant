/**
 * 底层 GPU surface 后端接口。
 *
 * 抽象 canvas 与 context 的生命周期、viewport/scissor 区域、清屏、合成到 2D overlay
 * canvas，以及销毁。当前 WebGL 实现通过 `createWebGLSurfaceBackend` 包装
 * SharedWebGLSurface；P1 的 WebGPU 将实现同一契约。
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
 * - `compositeTo` 接收 2D `CanvasRenderingContext2D`，因为图表的最终合成目标是
 *   2D overlay canvas——WebGL/WebGPU 像素通过 `drawImage` 写入 overlay。未来
 *   绕过 2D overlay 的路径（WebGPU 直接上屏）可将 `compositeTo` 留空。
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
   * Bind a region for subsequent draw commands.
   * Activates scissor + viewport sized to `region`. Returns false if the
   * region is empty or the backend is unavailable.
   */
  bindRegion(region: SurfaceRegion): boolean

  /**
   * Clear the most recently bound region to transparent black.
   * Must be called after `bindRegion`. Backends MAY no-op if no region
   * is currently bound.
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
