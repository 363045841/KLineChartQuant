/**
 * 浏览器端渲染基准：在相同 K 线几何下比较 Canvas2D、项目 WebGL 与项目 WebGPU 后端。
 * 页面只暴露确定性的测试 API，实际编排、硬件采样与结果落盘由 run.mjs 完成。
 */

import { SharedWebGLSurface } from '../../packages/core/src/engine/renderers/webgl/sharedWebGLSurface'
import { drawRectBatchesViaRenderer } from '../../packages/core/src/engine/renderers/rectsViaRenderer'
import { createCanvas2DRenderer } from '../../packages/core/src/rendering/render/backend/createCanvas2DRenderer'
import { createWebGLRenderer } from '../../packages/core/src/rendering/render/backend/createWebGLRenderer'
import { createWebGPURenderer } from '../../packages/core/src/rendering/render/backend/createWebGPURenderer'
import { createWebGLSurfaceBackend } from '../../packages/core/src/rendering/render/createWebGLSurfaceBackend'
import {
  getFrameMetrics,
  resetFrameMetrics,
} from '../../packages/core/src/rendering/render/frameMetrics'
import type { Renderer } from '../../packages/core/src/rendering/render/Renderer'

type BackendName = 'canvas2d' | 'webgl2' | 'webgpu'
type IndicatorProfile = 'ma' | 'ichimoku'

type ScenarioOptions = {
  backend: BackendName
  indicatorProfile: IndicatorProfile
  visiblePoints: number
  width: number
  height: number
  dpr: number
  warmupFrames: number
  sampleFrames: number
}

type RectBatch = {
  buf: Float32Array
  count: number
  color: string
}

type LineStrip = {
  points: ReadonlyArray<{ x: number; y: number }>
  color: string
  width: number
}

type Geometry = {
  batches: RectBatch[]
  strips: LineStrip[]
  geometryMs: number
}

type WebGpuTimer = {
  gpu: GPU
  adapter: GPUAdapter
  device: GPUDevice
  timestampSupported: boolean
  drain: () => Promise<number[]>
}

type ScenarioResult = {
  backend: BackendName
  indicatorProfile: IndicatorProfile
  effectiveBackend: string
  visiblePoints: number
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
  queueSubmitsPerFrame: number | null
  jsHeapUsedBytes: number | null
  webglRenderer: string | null
  webgpuAdapter: Record<string, unknown> | null
  timestampQuerySupported: boolean
}

type SubmissionBenchmarkResult = {
  commandBuffersPerFrame: number
  repetitionsPerSample: number
  warmupFrames: number
  sampleFrames: number
  batchedSubmitMs: number[]
  splitSubmitMs: number[]
}

declare global {
  interface Window {
    renderBench: {
      inspectGpu: () => Promise<Record<string, unknown>>
      measureRefreshIntervals: (frames: number) => Promise<number[]>
      runScenario: (options: ScenarioOptions) => Promise<ScenarioResult>
      runSubmissionBenchmark: (
        commandBuffersPerFrame: number,
        warmupFrames: number,
        sampleFrames: number,
      ) => Promise<SubmissionBenchmarkResult>
    }
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!

/** 使用固定种子生成可重复的 K 线和指定指标几何。 */
function createGeometry(
  visiblePoints: number,
  width: number,
  height: number,
  indicatorProfile: IndicatorProfile,
): Geometry {
  const startedAt = performance.now()
  let state = 0x6d2b79f5
  const random = (): number => {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296
  }

  const up: number[] = []
  const down: number[] = []
  const upWicks: number[] = []
  const downWicks: number[] = []
  const closes = new Float64Array(visiblePoints)
  const highs = new Float64Array(visiblePoints)
  const lows = new Float64Array(visiblePoints)
  const step = width / visiblePoints
  const bodyWidth = Math.max(0.35, step * 0.68)
  let close = 100

  for (let index = 0; index < visiblePoints; index += 1) {
    const open = close
    close = Math.max(30, open + (random() - 0.49) * 3.2)
    const high = Math.max(open, close) + random() * 1.8
    const low = Math.min(open, close) - random() * 1.8
    closes[index] = close
    highs[index] = high
    lows[index] = low

    const x = index * step + (step - bodyWidth) * 0.5
    const priceToY = (price: number): number => height * 0.5 - (price - 100) * 2.4
    const bodyTop = priceToY(Math.max(open, close))
    const bodyBottom = priceToY(Math.min(open, close))
    const wickTop = priceToY(high)
    const wickBottom = priceToY(low)
    const target = close >= open ? up : down
    const wickTarget = close >= open ? upWicks : downWicks

    target.push(x, bodyTop, bodyWidth, Math.max(0.7, bodyBottom - bodyTop))
    wickTarget.push(
      x + bodyWidth * 0.46,
      wickTop,
      Math.max(0.35, bodyWidth * 0.08),
      wickBottom - wickTop,
    )
  }

  /** 计算简单移动平均线，保留 CPU 几何生成成本。 */
  const movingAverage = (period: number, color: string): LineStrip => {
    const points: Array<{ x: number; y: number }> = []
    let sum = 0
    for (let index = 0; index < closes.length; index += 1) {
      sum += closes[index]!
      if (index >= period) sum -= closes[index - period]!
      if (index + 1 >= period) {
        const value = sum / period
        points.push({
          x: index * step + step * 0.5,
          y: height * 0.5 - (value - 100) * 2.4,
        })
      }
    }
    return { points, color, width: 1 }
  }

  const asBatch = (values: number[], color: string): RectBatch => ({
    buf: new Float32Array(values),
    count: values.length / 4,
    color,
  })

  if (indicatorProfile === 'ma') {
    return {
      batches: [
        asBatch(upWicks, '#22c55e'),
        asBatch(downWicks, '#ef4444'),
        asBatch(up, '#22c55e'),
        asBatch(down, '#ef4444'),
      ],
      strips: [
        movingAverage(5, '#f59e0b'),
        movingAverage(20, '#38bdf8'),
        movingAverage(60, '#a78bfa'),
      ],
      geometryMs: performance.now() - startedAt,
    }
  }

  /** 计算 Ichimoku 中线：(指定周期内最高价 + 最低价) / 2。 */
  const midpoint = (period: number): Array<number | undefined> => {
    const values: Array<number | undefined> = Array.from({ length: visiblePoints })
    for (let index = period - 1; index < visiblePoints; index += 1) {
      let high = -Infinity
      let low = Infinity
      for (let offset = index - period + 1; offset <= index; offset += 1) {
        high = Math.max(high, highs[offset]!)
        low = Math.min(low, lows[offset]!)
      }
      values[index] = (high + low) / 2
    }
    return values
  }
  const toStrip = (values: Array<number | undefined>, color: string): LineStrip => ({
    points: values.flatMap((value, index) =>
      value === undefined
        ? []
        : [{ x: index * step + step * 0.5, y: height * 0.5 - (value - 100) * 2.4 }],
    ),
    color,
    width: 1,
  })
  const tenkan = midpoint(9)
  const kijun = midpoint(26)
  const spanBSource = midpoint(52)
  const spanA: Array<number | undefined> = Array.from({ length: visiblePoints })
  const spanB: Array<number | undefined> = Array.from({ length: visiblePoints })
  const chikou: Array<number | undefined> = Array.from({ length: visiblePoints })
  const displacement = 26
  for (let index = 0; index < visiblePoints; index += 1) {
    const target = index + displacement
    if (target < visiblePoints && tenkan[index] !== undefined && kijun[index] !== undefined) {
      spanA[target] = (tenkan[index]! + kijun[index]!) / 2
      spanB[target] = spanBSource[index]
    }
    if (index >= displacement) chikou[index - displacement] = closes[index]
  }
  const cloudUp: number[] = []
  const cloudDown: number[] = []
  for (let index = 0; index < visiblePoints; index += 1) {
    if (spanA[index] === undefined || spanB[index] === undefined) continue
    const top = height * 0.5 - (Math.max(spanA[index]!, spanB[index]!) - 100) * 2.4
    const bottom = height * 0.5 - (Math.min(spanA[index]!, spanB[index]!) - 100) * 2.4
    const target = spanA[index]! >= spanB[index]! ? cloudUp : cloudDown
    target.push(index * step, top, Math.max(step, 0.35), Math.max(0.35, bottom - top))
  }

  return {
    batches: [
      asBatch(upWicks, '#22c55e'),
      asBatch(downWicks, '#ef4444'),
      asBatch(up, '#22c55e'),
      asBatch(down, '#ef4444'),
      asBatch(cloudUp, '#86efac'),
      asBatch(cloudDown, '#fca5a5'),
    ],
    strips: [
      toStrip(tenkan, '#2563eb'),
      toStrip(kijun, '#dc2626'),
      toStrip(spanA, '#16a34a'),
      toStrip(spanB, '#ea580c'),
      toStrip(chikou, '#7c3aed'),
    ],
    geometryMs: performance.now() - startedAt,
  }
}

/** 创建并挂载用于当前场景的物理画布。 */
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

/** 读取 WebGL 实际 renderer 字符串，用于拒绝 SwiftShader 等软件后端。 */
function inspectWebGlRenderer(canvas: HTMLCanvasElement): string | null {
  const gl = canvas.getContext('webgl2')
  if (!gl) return null
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  if (!extension) return gl.getParameter(gl.RENDERER) as string
  return gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string
}

/** 把原生对象的方法绑定回原对象，避免 WebGPU brand check 失败。 */
function getBound(target: object, property: PropertyKey): unknown {
  const value = Reflect.get(target, property)
  return typeof value === 'function' ? value.bind(target) : value
}

/**
 * 为项目 WebGPU renderer 注入 timestamp-query，不修改生产代码。
 * 每个 render pass 自动写入首尾时间戳，并在 queue.submit 后异步读回。
 */
async function createTimestampedGpu(): Promise<WebGpuTimer> {
  if (!navigator.gpu) throw new Error('WebGPU unavailable')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('WebGPU adapter unavailable')
  const timestampSupported = adapter.features.has('timestamp-query')
  const device = await adapter.requestDevice({
    requiredFeatures: timestampSupported ? ['timestamp-query'] : [],
  })
  const finishedRecords: Array<{
    querySet: GPUQuerySet
    resolveBuffer: GPUBuffer
    readBuffer: GPUBuffer
  }> = []
  const pendingReads: Array<Promise<number | null>> = []

  if (timestampSupported) {
    const queue = device.queue
    const submit = queue.submit.bind(queue)
    const createCommandEncoder = device.createCommandEncoder.bind(device)

    Object.defineProperty(queue, 'submit', {
      configurable: true,
      value(commandBuffers: Iterable<GPUCommandBuffer>): void {
        submit(commandBuffers)
        const records = finishedRecords.splice(0)
        for (const record of records) {
          const read = queue.onSubmittedWorkDone().then(async () => {
            try {
              await record.readBuffer.mapAsync(GPUMapMode.READ)
              const values = new BigUint64Array(record.readBuffer.getMappedRange().slice(0))
              const elapsedMs = Number(values[1]! - values[0]!) / 1_000_000
              record.readBuffer.unmap()
              return elapsedMs
            } catch {
              return null
            } finally {
              record.querySet.destroy()
              record.resolveBuffer.destroy()
              record.readBuffer.destroy()
            }
          })
          pendingReads.push(read)
        }
      },
    })

    Object.defineProperty(device, 'createCommandEncoder', {
      configurable: true,
      value(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder {
        const encoder = createCommandEncoder(descriptor)
        const querySet = device.createQuerySet({ type: 'timestamp', count: 2 })
        const resolveBuffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
        })
        const readBuffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        })
        let timedPassCreated = false

        return new Proxy(encoder, {
          get(encoderTarget, encoderProperty) {
            if (encoderProperty === 'beginRenderPass') {
              return (passDescriptor: GPURenderPassDescriptor): GPURenderPassEncoder => {
                timedPassCreated = true
                return encoderTarget.beginRenderPass({
                  ...passDescriptor,
                  timestampWrites: {
                    querySet,
                    beginningOfPassWriteIndex: 0,
                    endOfPassWriteIndex: 1,
                  },
                })
              }
            }
            if (encoderProperty === 'finish') {
              return (finishDescriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer => {
                if (timedPassCreated) {
                  encoderTarget.resolveQuerySet(querySet, 0, 2, resolveBuffer, 0)
                  encoderTarget.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, 16)
                  finishedRecords.push({ querySet, resolveBuffer, readBuffer })
                } else {
                  querySet.destroy()
                  resolveBuffer.destroy()
                  readBuffer.destroy()
                }
                return encoderTarget.finish(finishDescriptor)
              }
            }
            return getBound(encoderTarget, encoderProperty)
          },
        }) as GPUCommandEncoder
      },
    })
  }

  const adapterProxy = new Proxy(adapter, {
    get(target, property) {
      if (property === 'requestDevice') return async (): Promise<GPUDevice> => device
      return getBound(target, property)
    },
  }) as GPUAdapter

  const gpuProxy = {
    requestAdapter: async () => adapterProxy,
    getPreferredCanvasFormat: () => navigator.gpu.getPreferredCanvasFormat(),
    wgslLanguageFeatures: navigator.gpu.wgslLanguageFeatures,
  } as GPU

  return {
    gpu: gpuProxy,
    adapter,
    device,
    timestampSupported,
    async drain(): Promise<number[]> {
      const values = await Promise.all(pendingReads.splice(0))
      return values.filter((value): value is number => value !== null && Number.isFinite(value))
    },
  }
}

/** 读取 adapter 可公开的识别信息。 */
function adapterInfo(adapter: GPUAdapter): Record<string, unknown> {
  const info = adapter.info
  return {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    isFallbackAdapter: info.isFallbackAdapter ?? false,
  }
}

/** 等待下一次 rAF 并返回回调时间。 */
function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

/** 计算页面当前 JS heap；Chrome 以外的浏览器返回空值。 */
function jsHeapUsed(): number | null {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
  return memory?.usedJSHeapSize ?? null
}

/** 执行 Canvas2D 场景并采集 CPU 与真实帧间隔。 */
async function runCanvasScenario(options: ScenarioOptions): Promise<ScenarioResult> {
  const initializationStarted = performance.now()
  const canvas = mountCanvas(options.width, options.height, options.dpr)
  const ctx = canvas.getContext('2d', { alpha: true })!
  ctx.scale(options.dpr, options.dpr)
  const canvasContract = createCanvas2DRenderer()
  const initializationMs = performance.now() - initializationStarted
  const cpuFramePreparationMs: number[] = []
  const cpuFrameMs: number[] = []
  const frameIntervalsMs: number[] = []
  let drawCallsPerFrame = 0
  let previousTimestamp: number | null = null

  const draw = (geometry: Geometry): void => {
    ctx.clearRect(0, 0, options.width, options.height)
    for (const batch of geometry.batches) {
      ctx.fillStyle = batch.color
      for (let offset = 0; offset < batch.buf.length; offset += 4) {
        ctx.fillRect(
          batch.buf[offset]!,
          batch.buf[offset + 1]!,
          batch.buf[offset + 2]!,
          batch.buf[offset + 3]!,
        )
      }
    }
    for (const strip of geometry.strips) {
      if (strip.points.length < 2) continue
      ctx.beginPath()
      ctx.strokeStyle = strip.color
      ctx.lineWidth = strip.width
      ctx.moveTo(strip.points[0]!.x, strip.points[0]!.y)
      for (let index = 1; index < strip.points.length; index += 1) {
        ctx.lineTo(strip.points[index]!.x, strip.points[index]!.y)
      }
      ctx.stroke()
    }
  }

  for (let index = 0; index < options.warmupFrames + options.sampleFrames; index += 1) {
    const timestamp = await nextAnimationFrame()
    const geometry = createGeometry(
      options.visiblePoints,
      options.width,
      options.height,
      options.indicatorProfile,
    )
    drawCallsPerFrame ||= geometry.batches.length + geometry.strips.length
    const startedAt = performance.now()
    draw(geometry)
    const elapsed = performance.now() - startedAt
    if (index >= options.warmupFrames) {
      cpuFramePreparationMs.push(geometry.geometryMs)
      cpuFrameMs.push(elapsed)
      if (previousTimestamp !== null) frameIntervalsMs.push(timestamp - previousTimestamp)
    }
    previousTimestamp = timestamp
  }

  canvasContract.dispose()
  return {
    backend: options.backend,
    indicatorProfile: options.indicatorProfile,
    effectiveBackend: canvasContract.caps.name,
    visiblePoints: options.visiblePoints,
    width: options.width,
    height: options.height,
    dpr: options.dpr,
    warmupFrames: options.warmupFrames,
    sampleFrames: options.sampleFrames,
    initializationMs,
    cpuFramePreparationMs,
    cpuFrameMs,
    frameIntervalsMs,
    gpuFrameMs: [],
    drawCallsPerFrame,
    queueSubmitsPerFrame: null,
    jsHeapUsedBytes: jsHeapUsed(),
    webglRenderer: null,
    webgpuAdapter: null,
    timestampQuerySupported: false,
  }
}

/** 执行项目 WebGL 后端场景，并用 EXT_disjoint_timer_query_webgl2 读取 GPU 时间。 */
async function runWebGlScenario(options: ScenarioOptions): Promise<ScenarioResult> {
  const initializationStarted = performance.now()
  const canvas = mountCanvas(options.width, options.height, options.dpr)
  const shared = new SharedWebGLSurface(canvas)
  const surface = createWebGLSurfaceBackend(shared)
  surface.resize(options.width, options.height, options.dpr)
  const renderer = createWebGLRenderer(surface, shared)
  const gl = shared.getGL()
  if (!gl) throw new Error('WebGL2 unavailable')
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const linePipeline = renderer.createPipeline({ type: 'line' })
  const initializationMs = performance.now() - initializationStarted
  const cpuFramePreparationMs: number[] = []
  const cpuFrameMs: number[] = []
  const frameIntervalsMs: number[] = []
  const queries: WebGLQuery[] = []
  let drawCallsPerFrame = 0
  let previousTimestamp: number | null = null

  const draw = (geometry: Geometry): void => {
    renderer.beginFrame({
      x: 0,
      y: 0,
      width: options.width,
      height: options.height,
      dpr: options.dpr,
    })
    if (!drawRectBatchesViaRenderer(renderer, geometry.batches, 0)) {
      throw new Error('WebGL rect draw failed')
    }
    if (!renderer.drawLines({ pipeline: linePipeline, strips: geometry.strips })) {
      throw new Error('WebGL line draw failed')
    }
    renderer.endFrame()
  }

  for (let index = 0; index < options.warmupFrames + options.sampleFrames; index += 1) {
    const timestamp = await nextAnimationFrame()
    const geometry = createGeometry(
      options.visiblePoints,
      options.width,
      options.height,
      options.indicatorProfile,
    )
    drawCallsPerFrame ||= geometry.batches.length + geometry.strips.length
    const query = timer ? gl.createQuery() : null
    if (query && timer) gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
    const startedAt = performance.now()
    draw(geometry)
    const elapsed = performance.now() - startedAt
    if (query && timer) {
      gl.endQuery(timer.TIME_ELAPSED_EXT)
      if (index >= options.warmupFrames) queries.push(query)
      else gl.deleteQuery(query)
    }
    if (index >= options.warmupFrames) {
      cpuFramePreparationMs.push(geometry.geometryMs)
      cpuFrameMs.push(elapsed)
      if (previousTimestamp !== null) frameIntervalsMs.push(timestamp - previousTimestamp)
    }
    previousTimestamp = timestamp
  }

  const gpuFrameMs: number[] = []
  const deadline = performance.now() + 10_000
  while (queries.length > 0 && performance.now() < deadline) {
    for (let index = queries.length - 1; index >= 0; index -= 1) {
      const query = queries[index]!
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue
      if (!timer || gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        gl.deleteQuery(query)
        queries.splice(index, 1)
        continue
      }
      gpuFrameMs.push(Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1_000_000)
      gl.deleteQuery(query)
      queries.splice(index, 1)
    }
    if (queries.length > 0) await new Promise((resolve) => setTimeout(resolve, 10))
  }
  for (const query of queries) gl.deleteQuery(query)

  const webglRenderer = inspectWebGlRenderer(canvas)
  renderer.destroyPipeline(linePipeline)
  renderer.dispose()
  return {
    backend: options.backend,
    indicatorProfile: options.indicatorProfile,
    effectiveBackend: renderer.caps.name,
    visiblePoints: options.visiblePoints,
    width: options.width,
    height: options.height,
    dpr: options.dpr,
    warmupFrames: options.warmupFrames,
    sampleFrames: options.sampleFrames,
    initializationMs,
    cpuFramePreparationMs,
    cpuFrameMs,
    frameIntervalsMs,
    gpuFrameMs,
    drawCallsPerFrame,
    queueSubmitsPerFrame: null,
    jsHeapUsedBytes: jsHeapUsed(),
    webglRenderer,
    webgpuAdapter: null,
    timestampQuerySupported: timer !== null,
  }
}

/** 执行项目 WebGPU 后端场景，并读取单次 RenderPass 的真实 GPU 时间。 */
async function runWebGpuScenario(options: ScenarioOptions): Promise<ScenarioResult> {
  const initializationStarted = performance.now()
  const canvas = mountCanvas(options.width, options.height, options.dpr)
  const timedGpu = await createTimestampedGpu()
  const renderer = await createWebGPURenderer({ gpu: timedGpu.gpu, canvas })
  renderer.surface.resize(options.width, options.height, options.dpr)
  const linePipeline = renderer.createPipeline({ type: 'line' })
  const initializationMs = performance.now() - initializationStarted
  const cpuFramePreparationMs: number[] = []
  const cpuFrameMs: number[] = []
  const frameIntervalsMs: number[] = []
  let drawCallsPerFrame = 0
  let previousTimestamp: number | null = null
  resetFrameMetrics()

  const draw = (geometry: Geometry): void => {
    renderer.beginFrame({
      x: 0,
      y: 0,
      width: options.width,
      height: options.height,
      dpr: options.dpr,
    })
    if (!drawRectBatchesViaRenderer(renderer, geometry.batches, 0)) {
      throw new Error('WebGPU rect draw failed')
    }
    if (!renderer.drawLines({ pipeline: linePipeline, strips: geometry.strips })) {
      throw new Error('WebGPU line draw failed')
    }
    renderer.endFrame()
  }

  for (let index = 0; index < options.warmupFrames + options.sampleFrames; index += 1) {
    const timestamp = await nextAnimationFrame()
    const geometry = createGeometry(
      options.visiblePoints,
      options.width,
      options.height,
      options.indicatorProfile,
    )
    drawCallsPerFrame ||= geometry.batches.length + geometry.strips.length
    const startedAt = performance.now()
    draw(geometry)
    const elapsed = performance.now() - startedAt
    if (index >= options.warmupFrames) {
      cpuFramePreparationMs.push(geometry.geometryMs)
      cpuFrameMs.push(elapsed)
      if (previousTimestamp !== null) frameIntervalsMs.push(timestamp - previousTimestamp)
    }
    previousTimestamp = timestamp
  }

  await timedGpu.device.queue.onSubmittedWorkDone()
  const allGpuFrames = await timedGpu.drain()
  const gpuFrameMs = allGpuFrames.slice(-options.sampleFrames)
  const metrics = getFrameMetrics()
  const webgpuAdapter = adapterInfo(timedGpu.adapter)
  renderer.destroyPipeline(linePipeline)
  renderer.dispose()
  return {
    backend: options.backend,
    indicatorProfile: options.indicatorProfile,
    effectiveBackend: renderer.caps.name,
    visiblePoints: options.visiblePoints,
    width: options.width,
    height: options.height,
    dpr: options.dpr,
    warmupFrames: options.warmupFrames,
    sampleFrames: options.sampleFrames,
    initializationMs,
    cpuFramePreparationMs,
    cpuFrameMs,
    frameIntervalsMs,
    gpuFrameMs,
    drawCallsPerFrame: metrics.drawCallCount || drawCallsPerFrame,
    queueSubmitsPerFrame: metrics.queueSubmitCount,
    jsHeapUsedBytes: jsHeapUsed(),
    webglRenderer: null,
    webgpuAdapter,
    timestampQuerySupported: timedGpu.timestampSupported,
  }
}

/** 执行单个后端、单个可见点数量的独立场景。 */
async function runScenario(options: ScenarioOptions): Promise<ScenarioResult> {
  if (options.backend === 'canvas2d') return runCanvasScenario(options)
  if (options.backend === 'webgl2') return runWebGlScenario(options)
  return runWebGpuScenario(options)
}

/** 在正式测试前检查浏览器内的 WebGL/WebGPU 设备身份。 */
async function inspectGpu(): Promise<Record<string, unknown>> {
  const canvas = document.createElement('canvas')
  const webglRenderer = inspectWebGlRenderer(canvas)
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
  return {
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer,
    webgpuAvailable: Boolean(adapter),
    webgpuAdapter: adapter ? adapterInfo(adapter) : null,
    timestampQuerySupported: adapter?.features.has('timestamp-query') ?? false,
  }
}

/** 在空闲页面上测量显示刷新间隔，供掉帧判定使用。 */
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

/** 对比一次提交多个命令缓冲与逐个提交的 JS 到 GPU 进程通信边界开销。 */
async function runSubmissionBenchmark(
  commandBuffersPerFrame: number,
  warmupFrames: number,
  sampleFrames: number,
): Promise<SubmissionBenchmarkResult> {
  if (!navigator.gpu) throw new Error('WebGPU unavailable')
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('WebGPU adapter unavailable')
  const device = await adapter.requestDevice()
  const batchedSubmitMs: number[] = []
  const splitSubmitMs: number[] = []
  const totalFrames = warmupFrames + sampleFrames
  const repetitionsPerSample = 100

  const measureSubmit = (split: boolean): number => {
    const commandBufferGroups = Array.from({ length: repetitionsPerSample }, () =>
      Array.from({ length: commandBuffersPerFrame }, () => device.createCommandEncoder().finish()),
    )
    const startedAt = performance.now()
    if (split) {
      for (const commandBuffers of commandBufferGroups) {
        for (const commandBuffer of commandBuffers) device.queue.submit([commandBuffer])
      }
    } else {
      for (const commandBuffers of commandBufferGroups) device.queue.submit(commandBuffers)
    }
    return (performance.now() - startedAt) / repetitionsPerSample
  }

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const batchedFirst = frame % 2 === 0
    const first = measureSubmit(!batchedFirst)
    const second = measureSubmit(batchedFirst)
    if (frame >= warmupFrames) {
      batchedSubmitMs.push(batchedFirst ? first : second)
      splitSubmitMs.push(batchedFirst ? second : first)
    }
    await device.queue.onSubmittedWorkDone()
  }

  await device.queue.onSubmittedWorkDone()
  device.destroy()
  return {
    commandBuffersPerFrame,
    repetitionsPerSample,
    warmupFrames,
    sampleFrames,
    batchedSubmitMs,
    splitSubmitMs,
  }
}

window.renderBench = {
  inspectGpu,
  measureRefreshIntervals,
  runScenario,
  runSubmissionBenchmark,
}
document.body.dataset.ready = 'true'
app.textContent = 'render benchmark ready'
