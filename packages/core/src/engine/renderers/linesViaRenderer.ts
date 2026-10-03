import type { RenderContext } from '../../foundation/plugin/index.js'
import type { Renderer } from '../../rendering/render/Renderer.js'

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
 * 多条折线共用批量入口，减少 GPU 上传；清屏与 MSAA resolve 由帧生命周期负责。
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

/** GPU 后端走可见 DOM canvas，禁止 drawImage 回 2D。 */
export function shouldCompositeSceneRenderer(renderer: Renderer): boolean {
  return renderer.caps.name === 'canvas2d'
}

/**
 * Canvas2D 后端保留兼容入口；GPU 后端由 plot 区可见 canvas 直接显示。
 */
export function compositeSceneRenderer(context: {
  ctx: CanvasRenderingContext2D
  pane: { top: number; height: number }
  viewport: { plotWidth: number }
  paneWidth: number
  dpr: number
  sceneRenderer?: Renderer
}): void {
  const r = context.sceneRenderer
  if (!r || !shouldCompositeSceneRenderer(r)) return
  r.surface.compositeTo(
    context.ctx,
    {
      x: 0,
      y: context.pane.top,
      width: context.viewport.plotWidth,
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
