import type { RenderContext } from '../../foundation/plugin/index'
import type { Renderer } from '../../rendering/render/Renderer'

export type LinePoint = { x: number; y: number }

export type ColoredLineStrip = {
  points: LinePoint[]
  color: string
  width?: number
}

/**
 * 经 Renderer.drawLines 一次提交多条折线（strips 批量）。
 * 禁止 per-strip 循环 drawLines：LineWebGLSurface MSAA 每次 clear 会盖掉前一条。
 * 不负责 composite。
 */
export function drawLinesViaRenderer(
  renderer: Renderer,
  lines: ReadonlyArray<ColoredLineStrip>,
  scrollLeft: number,
): boolean {
  if (!renderer.surface.isAvailable()) return false
  const drawable = lines.filter((l) => l.points.length >= 2)
  if (drawable.length === 0) return true

  let pipeline: ReturnType<Renderer['createPipeline']> | null = null
  try {
    pipeline = renderer.createPipeline({ type: 'line' })
    return renderer.drawLines({
      pipeline,
      strips: drawable.map((l) => ({
        points: l.points,
        color: l.color,
        width: l.width ?? 1,
      })),
      uniforms: { scrollLeft },
    })
  } catch {
    return false
  } finally {
    if (pipeline) renderer.destroyPipeline(pipeline)
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
 * 折线 GPU 阶梯：sceneRenderer → legacy lineWebGLSurface → false（调用方 2D）。
 * 指标 draw 内：if (tryDrawLinesGpu(context, lines, scrollLeft)) return
 */
export function tryDrawLinesGpu(
  context: RenderContext,
  lines: ReadonlyArray<ColoredLineStrip>,
  scrollLeft: number,
): boolean {
  const enableWebGL = context.settings?.enableWebGLRendering !== false
  if (!enableWebGL) return false
  const drawable = lines.filter((l) => l.points.length >= 2)
  if (drawable.length === 0) return false

  if (context.sceneRenderer) {
    if (drawLinesViaRenderer(context.sceneRenderer, drawable, scrollLeft)) {
      compositeSceneRenderer(context)
      return true
    }
  }

  const surface = context.lineWebGLSurface
  if (surface?.isAvailable()) {
    const ok = surface.drawLineStrips(
      drawable.map((l) => ({
        points: l.points,
        color: l.color,
        width: l.width ?? 1,
      })),
      scrollLeft,
    )
    if (ok) {
      surface.compositeTo(context.ctx, { imageSmoothingEnabled: false })
      return true
    }
  }
  return false
}
