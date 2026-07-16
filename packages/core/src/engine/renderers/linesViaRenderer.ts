import type { RenderContext } from '../../foundation/plugin/index'
import type { Renderer } from '../../rendering/render/Renderer'

export type LinePoint = { x: number; y: number }

export type ColoredLineStrip = {
  points: LinePoint[]
  color: string
  width?: number
}

type LineGpuCache = {
  pipeline: ReturnType<Renderer['createPipeline']>
}

const lineCacheByRenderer = new WeakMap<Renderer, LineGpuCache>()

function ensureLineCache(renderer: Renderer): LineGpuCache {
  let cache = lineCacheByRenderer.get(renderer)
  if (!cache) {
    cache = { pipeline: renderer.createPipeline({ type: 'line' }) }
    lineCacheByRenderer.set(renderer, cache)
  }
  return cache
}

/**
 * 经 Renderer.drawLines 一次提交多条折线（strips 批量）。
 * 禁止 per-strip 循环 drawLines：LineWebGLSurface MSAA 每次 clear 会盖掉前一条。
 * 不负责 composite。pipeline 按 renderer 缓存。
 */
export function drawLinesViaRenderer(
  renderer: Renderer,
  lines: ReadonlyArray<ColoredLineStrip>,
  scrollLeft: number,
): boolean {
  if (!renderer.surface.isAvailable()) return false
  const drawable = lines.filter((l) => l.points.length >= 2)
  if (drawable.length === 0) return true

  try {
    const cache = ensureLineCache(renderer)
    return renderer.drawLines({
      pipeline: cache.pipeline,
      strips: drawable.map((l) => ({
        points: l.points,
        color: l.color,
        width: l.width ?? 1,
      })),
      uniforms: { scrollLeft },
    })
  } catch {
    return false
  }
}

/**
 * 将 sceneRenderer 输出合成到主 canvas。
 * 注意：candle 与 line 共用 SharedWebGLSurface；MSAA resolve 会覆盖 shared 上前序 GPU 内容，
 * 因此各业务在本层 GPU 画完后应立即 composite 到 2D（先 candle 后 line），不能只 end-of-pane 合成一次。
 */
export function compositeSceneRenderer(context: {
  ctx: CanvasRenderingContext2D
  pane: { top: number; height: number }
  viewport?: { plotWidth: number }
  paneWidth: number
  dpr: number
  sceneRenderer?: Renderer
}): void {
  const r = context.sceneRenderer
  if (!r) return
  r.surface.compositeTo(
    context.ctx,
    {
      x: 0,
      y: context.pane.top,
      width: context.viewport?.plotWidth ?? context.paneWidth,
      height: context.pane.height,
      dpr: context.dpr,
    },
    { imageSmoothingEnabled: false },
  )
}

/**
 * 折线 GPU：仅 sceneRenderer；失败返回 false（调用方 2D）。
 * 指标 draw 内：if (tryDrawLinesGpu(context, lines, scrollLeft)) return
 */
export function tryDrawLinesGpu(
  context: RenderContext,
  lines: ReadonlyArray<ColoredLineStrip>,
  scrollLeft: number,
): boolean {
  const drawable = lines.filter((l) => l.points.length >= 2)
  if (drawable.length === 0) return false

  if (!context.sceneRenderer) return false
  if (drawLinesViaRenderer(context.sceneRenderer, drawable, scrollLeft)) {
    compositeSceneRenderer(context)
    return true
  }
  return false
}

type FillGpuCache = {
  pipeline: ReturnType<Renderer['createPipeline']>
  vertices: ReturnType<Renderer['createBuffer']> | null
  capacity: number
}

const fillCacheByRenderer = new WeakMap<Renderer, FillGpuCache>()

function ensureFillCache(renderer: Renderer): FillGpuCache {
  let cache = fillCacheByRenderer.get(renderer)
  if (!cache) {
    cache = {
      pipeline: renderer.createPipeline({ type: 'fill' }),
      vertices: null,
      capacity: 0,
    }
    fillCacheByRenderer.set(renderer, cache)
  }
  return cache
}

/**
 * 经 Renderer fill pipeline 画上下轨填充带（BOLL/ENE）。
 * 顶点布局与 createWebGLRenderer fill 一致：每点 upper.x,y + lower.x,y。
 * vertex buffer 按 renderer 缓存扩容，不每帧 destroy。
 */
export function drawFilledBandViaRenderer(
  renderer: Renderer,
  upperPoints: ReadonlyArray<LinePoint>,
  lowerPoints: ReadonlyArray<LinePoint>,
  color: string,
  scrollLeft: number,
): boolean {
  if (!renderer.surface.isAvailable()) return false
  const n = Math.min(upperPoints.length, lowerPoints.length)
  if (n < 2) return false

  try {
    const cache = ensureFillCache(renderer)
    // vertexCount = n*2（上轨 n + 下轨 n 交错为 n 组 4 floats）
    const floats = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const o = i * 4
      floats[o] = upperPoints[i]!.x
      floats[o + 1] = upperPoints[i]!.y
      floats[o + 2] = lowerPoints[i]!.x
      floats[o + 3] = lowerPoints[i]!.y
    }
    if (!cache.vertices || cache.capacity < floats.byteLength) {
      if (cache.vertices) renderer.destroyBuffer(cache.vertices)
      cache.vertices = renderer.createBuffer('vertex', floats.byteLength)
      cache.capacity = floats.byteLength
    }
    renderer.writeBuffer(cache.vertices, floats)
    return renderer.drawLines({
      pipeline: cache.pipeline,
      vertices: cache.vertices,
      vertexCount: n * 2,
      uniforms: { color, scrollLeft },
    })
  } catch {
    return false
  }
}

/**
 * 填充带 GPU：仅 sceneRenderer fill；失败返回 false。
 * @param alpha composite 时的全局透明度（半透明 bandFill）
 */
export function tryDrawFilledBandGpu(
  context: RenderContext,
  upperPoints: ReadonlyArray<LinePoint>,
  lowerPoints: ReadonlyArray<LinePoint>,
  color: string,
  scrollLeft: number,
  alpha = 1,
): boolean {
  if (Math.min(upperPoints.length, lowerPoints.length) < 2) return false

  if (!context.sceneRenderer) return false
  if (
    drawFilledBandViaRenderer(
      context.sceneRenderer,
      upperPoints,
      lowerPoints,
      color,
      scrollLeft,
    )
  ) {
    const r = context.sceneRenderer
    r.surface.compositeTo(
      context.ctx,
      {
        x: 0,
        y: context.pane.top,
        width: context.viewport?.plotWidth ?? context.paneWidth,
        height: context.pane.height,
        dpr: context.dpr,
      },
      { imageSmoothingEnabled: false, alpha },
    )
    return true
  }
  return false
}
