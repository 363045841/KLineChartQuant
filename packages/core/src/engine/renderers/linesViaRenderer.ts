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

/**
 * 经 Renderer fill pipeline 画上下轨填充带（BOLL/ENE）。
 * 顶点布局与 createWebGLRenderer fill 一致：每点 upper.x,y + lower.x,y。
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

  let pipeline: ReturnType<Renderer['createPipeline']> | null = null
  let vertices: ReturnType<Renderer['createBuffer']> | null = null
  try {
    pipeline = renderer.createPipeline({ type: 'fill' })
    // vertexCount = n*2（上轨 n + 下轨 n 交错为 n 组 4 floats）
    const floats = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) {
      const o = i * 4
      floats[o] = upperPoints[i]!.x
      floats[o + 1] = upperPoints[i]!.y
      floats[o + 2] = lowerPoints[i]!.x
      floats[o + 3] = lowerPoints[i]!.y
    }
    vertices = renderer.createBuffer('vertex', floats.byteLength)
    renderer.writeBuffer(vertices, floats)
    return renderer.drawLines({
      pipeline,
      vertices,
      vertexCount: n * 2,
      uniforms: { color, scrollLeft },
    })
  } catch {
    return false
  } finally {
    if (vertices) renderer.destroyBuffer(vertices)
    if (pipeline) renderer.destroyPipeline(pipeline)
  }
}

/**
 * 填充带 GPU 阶梯：sceneRenderer fill → legacy drawFilledBand → false。
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
  const enableWebGL = context.settings?.enableWebGLRendering !== false
  if (!enableWebGL) return false
  if (Math.min(upperPoints.length, lowerPoints.length) < 2) return false

  if (context.sceneRenderer) {
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
  }

  const surface = context.lineWebGLSurface
  if (surface?.isAvailable()) {
    const ok = surface.drawFilledBand(
      {
        upperPoints: upperPoints.map((p) => ({ x: p.x, y: p.y })),
        lowerPoints: lowerPoints.map((p) => ({ x: p.x, y: p.y })),
      },
      color,
      scrollLeft,
    )
    if (ok) {
      surface.compositeTo(context.ctx, { imageSmoothingEnabled: false, alpha })
      return true
    }
  }
  return false
}
