/**
 * 浏览器端渲染基准：在真实绘制路径下比较 Canvas2D、WebGL 与 WebGPU。
 *
 * 场景固定为「滚动一帧」：蜡烛按屏幕坐标重算，指标线保留数据空间坐标，
 * 由 DataTransform（滚动偏移 + 价格轴映射）在绘制时还原。
 * GPU 后端走可见表面直出（应用当前使用的主图路径），Canvas2D 走它自己的 2D 目标。
 * 页面只暴露确定性的测试 API，编排、硬件采样与落盘由 run.mjs 完成。
 */

import type {
  PaintPrimitive,
  PrimitiveBackend,
} from '../../packages/core/src/rendering/primitives/types'
import { createCanvas2DRenderer } from '../../packages/core/src/rendering/render/backend/createCanvas2DRenderer'
import { createWebGLRenderer } from '../../packages/core/src/rendering/render/backend/createWebGLRenderer'
import { createWebGPURenderer } from '../../packages/core/src/rendering/render/backend/createWebGPURenderer'
import type { Renderer } from '../../packages/core/src/rendering/render/Renderer'

type BackendName = 'canvas2d' | 'webgl2' | 'webgpu'
type LineProfile = 'lines3' | 'lines12' | 'ichimoku'

type ScenarioOptions = {
  backend: BackendName
  lineProfile: LineProfile
  visibleBars: number
  /** 分辨率预设名，原样回写到结果行，便于按档位分组。 */
  resolution: string
  width: number
  height: number
  dpr: number
  warmupFrames: number
  sampleFrames: number
}

type ScenarioResult = {
  backend: BackendName
  effectiveBackend: string
  lineProfile: LineProfile
  visibleBars: number
  resolution: string
  width: number
  height: number
  dpr: number
  warmupFrames: number
  sampleFrames: number
  initializationMs: number
  cpuFramePreparationMs: number[]
  cpuFrameMs: number[]
  frameIntervalsMs: number[]
  gpuFrameMs: number[]
  drawCallsPerFrame: number
  queueSubmitsPerFrame: number
  uploadsPerFrame: number
  uploadedBytesPerFrame: number
  jsHeapUsedBytes: number | null
  webglRenderer: string | null
}

declare global {
  interface Window {
    renderBench: {
      inspectGpu: () => Promise<Record<string, unknown>>
      measureRefreshIntervals: (frames: number) => Promise<number[]>
      runScenario: (options: ScenarioOptions) => Promise<ScenarioResult>
    }
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!

/** 一根 bar 的世界宽度与槽位步长；数据量按 bar 数定义，不按像素摊点。 */
const BAR_STEP = 8
const BAR_WIDTH = 6
const TOTAL_BARS = 20_000
const PADDING = 8

/** 固定种子的价格序列，保证每次运行的几何一致。 */
function priceAt(index: number): number {
  return 100 + 7 * Math.sin(index / 41) + 3.5 * Math.sin(index / 13) + index * 0.006
}

function highAt(index: number): number {
  return priceAt(index) + 0.6
}

function lowAt(index: number): number {
  return priceAt(index) - 0.6
}

/** 窗口中点序列，用于 Ichimoku 的转换线/基准线/先行带。 */
function midSeries(period: number): Array<number | undefined> {
  const values: Array<number | undefined> = new Array(TOTAL_BARS)
  for (let index = period - 1; index < TOTAL_BARS; index += 1) {
    let high = -Infinity
    let low = Infinity
    for (let offset = index - period + 1; offset <= index; offset += 1) {
      high = Math.max(high, highAt(offset))
      low = Math.min(low, lowAt(offset))
    }
    values[index] = (high + low) / 2
  }
  return values
}

/** 价格轴映射：与应用线性轴一致，priceToY = padding + h * (1 - ratio)。 */
function priceMapping(height: number): { yScale: number; yOffset: number } {
  let min = Infinity
  let max = -Infinity
  for (let index = 0; index < TOTAL_BARS; index += 1) {
    const value = priceAt(index)
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  const viewHeight = height - PADDING * 2
  const yScale = -viewHeight / (max - min)
  return { yScale, yOffset: PADDING + viewHeight }
}

/** 数据空间序列：世界 x + 价格 y，与应用 Plot 层输出的原语一致。 */
type Series = {
  value: (index: number) => number | undefined
  color: string
}

/** Ichimoku 的先行带位移。 */
const ICHIMOKU_SHIFT = 26

/** 按 profile 构造序列；Ichimoku 的位移在取值时处理，而不是移动点。 */
function seriesFor(
  profile: LineProfile,
  colors: readonly string[],
): {
  series: Series[]
  cloud?: { spanA: Array<number | undefined>; spanB: Array<number | undefined> }
} {
  if (profile !== 'ichimoku') {
    const count = profile === 'lines3' ? 3 : 12
    return {
      series: Array.from({ length: count }, (_, line) => {
        const period = 18 + line * 6
        const phase = line * 0.9
        return {
          value: (index: number) =>
            priceAt(index) + Math.sin(index / period + phase) * (1.6 + line * 0.15),
          color: colors[line % colors.length]!,
        }
      }),
    }
  }
  const tenkan = midSeries(9)
  const kijun = midSeries(26)
  const spanB = midSeries(52)
  const spanA: Array<number | undefined> = new Array(TOTAL_BARS)
  for (let index = 0; index < TOTAL_BARS; index += 1) {
    const a = tenkan[index]
    const b = kijun[index]
    spanA[index] = a === undefined || b === undefined ? undefined : (a + b) / 2
  }
  return {
    series: [
      { value: (index) => tenkan[index], color: colors[0]! },
      { value: (index) => kijun[index], color: colors[1]! },
      { value: (index) => spanA[index - ICHIMOKU_SHIFT], color: colors[2]! },
      { value: (index) => spanB[index - ICHIMOKU_SHIFT], color: colors[3]! },
      { value: (index) => priceAt(index + ICHIMOKU_SHIFT), color: colors[0]! },
    ],
    cloud: { spanA, spanB },
  }
}

/** 当前场景的序列缓存：同一 profile 反复运行时不再重建几十万个点对象，避免 GC 污染样本。 */
const seriesCache = new Map<LineProfile, ReturnType<typeof seriesFor>>()

function cachedSeries(
  profile: LineProfile,
  colors: readonly string[],
): ReturnType<typeof seriesFor> {
  let cached = seriesCache.get(profile)
  if (!cached) {
    cached = seriesFor(profile, colors)
    seriesCache.set(profile, cached)
  }
  return cached
}

/** 只投影可见窗口 + 半屏余量，和应用的分桶投影一致。 */
function buildStrokes(series: readonly Series[], start: number, end: number): PaintPrimitive[] {
  return series.map(({ value, color }) => {
    const points: Array<{ x: number; y: number }> = []
    for (let index = Math.max(0, start); index < Math.min(TOTAL_BARS, end); index += 1) {
      const price = value(index)
      if (price === undefined) continue
      points.push({ x: index * BAR_STEP + BAR_STEP / 2, y: price })
    }
    return {
      kind: 'stroke',
      paths: [points],
      color,
      width: 1,
      cap: 'round',
      join: 'round',
      dataSpace: true,
    } satisfies PaintPrimitive
  })
}

/** 云层几何：与应用一致的填充带，一个颜色一条闭合带子，保留价格坐标。 */
function cloudPath(
  spanA: Array<number | undefined>,
  spanB: Array<number | undefined>,
  startBar: number,
  bars: number,
): Array<{ x: number; y: number }> {
  const top: Array<{ x: number; y: number }> = []
  const bottom: Array<{ x: number; y: number }> = []
  const end = Math.min(TOTAL_BARS - 1, startBar + bars)
  for (let index = startBar; index < end; index += 1) {
    const a1 = spanA[index]
    const b1 = spanB[index]
    const a2 = spanA[index + 1]
    const b2 = spanB[index + 1]
    if (a1 === undefined || b1 === undefined || a2 === undefined || b2 === undefined) continue
    const x1 = (index + ICHIMOKU_SHIFT) * BAR_STEP + BAR_STEP / 2
    const x2 = (index + 1 + ICHIMOKU_SHIFT) * BAR_STEP + BAR_STEP / 2
    if (top.length === 0) top.push({ x: x1, y: a1 })
    top.push({ x: x2, y: a2 })
    bottom.push({ x: x1, y: b1 })
    bottom.push({ x: x2, y: b2 })
  }
  return [...top, ...bottom.reverse()]
}

type CandleBuffers = {
  body: Float64Array
  wick: Float64Array
}

/** 世界矩形按当前滚动量写入屏幕缓冲；与应用柱体投影的量化方式一致。 */
function writeCandles(
  buffers: CandleBuffers,
  scrollPx: number,
  dpr: number,
  visibleBars: number,
  height: number,
  mapping: { yScale: number; yOffset: number },
): void {
  const body = buffers.body
  const wick = buffers.wick
  for (let index = 0; index < visibleBars; index += 1) {
    const worldX = index * BAR_STEP
    const open = priceAt(index)
    const close = priceAt(index + 1)
    const high = Math.max(open, close) + 0.6
    const low = Math.min(open, close) - 0.6
    const x = Math.round(worldX * dpr) - scrollPx
    const center = x + Math.round((BAR_WIDTH * dpr) / 2)
    const yTop = Math.round((high * mapping.yScale + mapping.yOffset) * dpr)
    const yBottom = Math.round((low * mapping.yScale + mapping.yOffset) * dpr)
    const openY = Math.round((open * mapping.yScale + mapping.yOffset) * dpr)
    const closeY = Math.round((close * mapping.yScale + mapping.yOffset) * dpr)
    const bodyTop = Math.min(openY, closeY)
    const bodyBottom = Math.max(openY, closeY)
    const offset = index * 4
    body[offset] = (center - Math.round((BAR_WIDTH * dpr) / 2)) / dpr
    body[offset + 1] = Math.min(bodyBottom, height * dpr) / dpr
    body[offset + 2] = Math.max(1, Math.round(BAR_WIDTH * dpr)) / dpr
    body[offset + 3] = Math.max(1, bodyBottom - bodyTop) / dpr
    wick[offset] = center / dpr
    wick[offset + 1] = yTop / dpr
    wick[offset + 2] = 1 / dpr
    wick[offset + 3] = Math.max(1, yBottom - yTop) / dpr
  }
}

/** 在当前容器的 2D 画布上绘制；GPU 直出路径不会创建 2D 上下文。 */
function mountCanvas(width: number, height: number, dpr: number): HTMLCanvasElement {
  app.replaceChildren()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  app.appendChild(canvas)
  return canvas
}

/** 读取 WebGL 实例 renderer 字符串，用于拒绝软件光栅。 */
function inspectWebGlRenderer(canvas: HTMLCanvasElement): string | null {
  const gl = canvas.getContext('webgl2')
  if (!gl) return null
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  if (!extension) return gl.getParameter(gl.RENDERER) as string
  return gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string
}

/** 等待下一帧 rAF 回调时间。 */
function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

/** 读取页面当前 JS heap；Chrome 之外返回 null。 */
function jsHeapUsed(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory?.usedJSHeapSize ?? null
}

/** 创建指定后端；WebGPU 使用项目自己的渲染器与默认设备。 */
async function createRenderer(backend: BackendName): Promise<Renderer> {
  if (backend === 'webgpu') {
    if (!navigator.gpu) throw new Error('WebGPU unavailable')
    return createWebGPURenderer()
  }
  return backend === 'webgl2' ? createWebGLRenderer() : createCanvas2DRenderer()
}

/** 运行一个滚动场景：固定几何，逐帧只更新滚动偏移与柱体屏幕坐标。 */
async function runScenario(options: ScenarioOptions): Promise<ScenarioResult> {
  const { width, height, dpr, visibleBars, warmupFrames, sampleFrames } = options
  const started = performance.now()
  const canvas = mountCanvas(width, height, dpr)
  const renderer = await createRenderer(options.backend)
  const primitivesBackend: PrimitiveBackend = renderer.primitives
  // GPU 后端直接用可见表面；Canvas2D 没有表面，只能走它自己的 2D 目标。
  const surface = primitivesBackend.createSurface?.(canvas) ?? null
  const ctx = surface ? null : canvas.getContext('2d')
  if (!surface) {
    if (!ctx) throw new Error('2D context unavailable for canvas benchmark')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  const mapping = priceMapping(height)
  const palette = ['#f59e0b', '#38bdf8', '#a78bfa', '#22c55e']
  const { series, cloud } = cachedSeries(options.lineProfile, palette)
  const buffers: CandleBuffers = {
    body: new Float64Array(visibleBars * 4),
    wick: new Float64Array(visibleBars * 4),
  }
  const primitives: PaintPrimitive[] = [
    { kind: 'rects', data: buffers.wick, color: '#4b5563' },
    { kind: 'rects', data: buffers.body, color: '#22c55e' },
    ...buildStrokes(series, 0, visibleBars),
  ]
  const cloudIndex = cloud ? primitives.length : -1
  if (cloud) {
    primitives.push({
      kind: 'fill',
      paths: [],
      color: '#818cf8',
      opacity: 0.18,
      band: true,
      dataSpace: true,
    })
  }
  const margin = Math.max(1, Math.floor(visibleBars / 2))
  const windowBars = visibleBars + margin * 2
  let windowStart = -1
  const initializationMs = performance.now() - started
  const cpuFramePreparationMs: number[] = []
  const cpuFrameMs: number[] = []
  const frameIntervalsMs: number[] = []
  const maxScroll = Math.max(0, (TOTAL_BARS - visibleBars - 1) * BAR_STEP)
  let previousTimestamp: number | null = null
  let drawCallsPerFrame = 0
  let queueSubmitsPerFrame = 0
  let uploadsPerFrame = 0
  let uploadedBytesPerFrame = 0
  try {
    for (let index = 0; index < warmupFrames + sampleFrames; index += 1) {
      const timestamp = await nextAnimationFrame()
      const prepareStart = performance.now()
      const scrollPx = Math.round(((index * 2) % (maxScroll + BAR_STEP)) * dpr)
      writeCandles(buffers, scrollPx, dpr, visibleBars, height, mapping)
      // 投影窗口按半屏分桶：桶内只更新偏移，与应用保留几何的复用节奏一致。
      const scrollBar = scrollPx / dpr / BAR_STEP
      const startBar = Math.max(0, Math.floor(scrollBar / margin) * margin - margin)
      if (startBar !== windowStart) {
        windowStart = startBar
        const strokes = buildStrokes(series, startBar, startBar + windowBars)
        for (let line = 0; line < strokes.length; line += 1) primitives[2 + line] = strokes[line]!
        // 云带只在窗口分桶变化时重建：路径数组引用不变，后端才能复用几何与 Path2D 缓存。
        if (cloud && cloudIndex >= 0) {
          primitives[cloudIndex] = {
            kind: 'fill',
            paths: [cloudPath(cloud.spanA, cloud.spanB, startBar, windowBars)],
            color: '#818cf8',
            opacity: 0.18,
            band: true,
            dataSpace: true,
          }
        }
      }
      const transform = {
        offsetX: scrollPx / dpr,
        yScale: mapping.yScale,
        yOffset: mapping.yOffset,
      }
      const preparationMs = performance.now() - prepareStart
      const paintStart = performance.now()
      if (surface) {
        if (!surface.paint(primitives, dpr, true, transform))
          throw new Error(`${options.backend} surface paint failed`)
      } else {
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx!.clearRect(0, 0, width, height)
        if (!primitivesBackend.paint(ctx!, primitives, dpr, transform))
          throw new Error(`${options.backend} primitive paint failed`)
      }
      const elapsed = performance.now() - paintStart
      const metrics = primitivesBackend.getMetrics?.()
      drawCallsPerFrame = metrics?.drawCalls ?? 0
      queueSubmitsPerFrame = metrics?.submissions ?? 0
      uploadsPerFrame = metrics?.uploads ?? 0
      uploadedBytesPerFrame = metrics?.uploadedBytes ?? 0
      if (index >= warmupFrames) {
        cpuFramePreparationMs.push(preparationMs)
        cpuFrameMs.push(elapsed)
        if (previousTimestamp !== null) frameIntervalsMs.push(timestamp - previousTimestamp)
      }
      previousTimestamp = timestamp
    }
    await primitivesBackend.waitForIdle?.()
    return {
      backend: options.backend,
      effectiveBackend: renderer.caps.name,
      lineProfile: options.lineProfile,
      visibleBars,
      resolution: options.resolution,
      width,
      height,
      dpr,
      warmupFrames,
      sampleFrames,
      initializationMs,
      cpuFramePreparationMs,
      cpuFrameMs,
      frameIntervalsMs,
      gpuFrameMs: [],
      drawCallsPerFrame,
      queueSubmitsPerFrame,
      uploadsPerFrame,
      uploadedBytesPerFrame,
      jsHeapUsedBytes: jsHeapUsed(),
      webglRenderer:
        options.backend === 'webgl2'
          ? inspectWebGlRenderer(document.createElement('canvas'))
          : null,
    }
  } finally {
    surface?.dispose()
    renderer.dispose()
  }
}

/** 显式检查当前机器上的 WebGL/WebGPU 设备信息。 */
async function inspectGpu(): Promise<Record<string, unknown>> {
  const canvas = document.createElement('canvas')
  const webglRenderer = inspectWebGlRenderer(canvas)
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer,
    webgpuAvailable: Boolean(adapter),
    webgpuAdapter: adapter
      ? {
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          device: adapter.info.device,
          description: adapter.info.description,
          isFallbackAdapter: adapter.info.isFallbackAdapter ?? false,
        }
      : null,
  }
}

/** 在空闲页面上测量显示刷新间隔，用于判断掉帧阈值。 */
async function measureRefreshIntervals(frames: number): Promise<number[]> {
  const intervals: number[] = []
  let previous = await nextAnimationFrame()
  for (let index = 0; index < frames; index += 1) {
    const current = await nextAnimationFrame()
    intervals.push(current - previous)
    previous = current
  }
  return intervals
}

window.renderBench = { inspectGpu, measureRefreshIntervals, runScenario }
document.body.dataset.ready = 'true'
