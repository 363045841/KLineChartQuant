/**
 * Low-level GPU surface backend.
 *
 * Abstracts canvas + context lifecycle, viewport / scissor regions, clear,
 * compositing into a 2D canvas overlay, and teardown. Both the existing
 * WebGL surface (`src/core/renderers/webgl/sharedWebGLSurface.ts`) and the
 * P1 WebGPU surface implement this contract.
 *
 * This file is **pure interface** — no implementation. It exists so that:
 *
 * 1. Existing WebGL code can declare conformance via a one-line adapter
 *    (see `createLegacyWebGLBackend` below) without changing any behaviour.
 * 2. P1's WebGPU implementation has a fixed target to write against.
 * 3. The higher-level `Renderer` (`./Renderer.ts`) can compose a backend
 *    without knowing which GPU API it sits on.
 *
 * Design notes:
 * - All region coordinates are in **logical pixels** with the surface
 *   responsible for DPR scaling internally. This matches the existing
 *   `WebGLRegion` semantics so the legacy adapter is a transparent pass-through.
 * - `compositeTo` takes a 2D `CanvasRenderingContext2D` because the chart's
 *   final composition target is a 2D overlay canvas — WebGL/WebGPU pixels
 *   are drawn into the overlay via `drawImage`. Future paths that bypass
 *   the 2D overlay (direct-to-screen WebGPU) can leave `compositeTo` as a no-op.
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
