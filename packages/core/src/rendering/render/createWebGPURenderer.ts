import type {
  BufferHandle,
  BufferUsage,
  ComputePipelineHandle,
  DispatchComputeParams,
  DrawInstancesParams,
  DrawLineStrip,
  DrawLinesParams,
  PipelineHandle,
  Renderer,
} from './Renderer'
import { createWebGPUSurfaceBackend, type WebGPUSurfaceBackend } from './createWebGPUSurfaceBackend'
import { createFrameMetrics } from './frameMetrics'
import { prepareLineStripForPhysicalPixels } from './physicalLine'
import { toPhysicalRegion } from './physicalRegion'
import { createWebGPUResourceTable } from './webgpuResourceTable'
import {
  GPU_BUFFER_COPY_DST,
  GPU_BUFFER_INDEX,
  GPU_BUFFER_STORAGE,
  GPU_BUFFER_UNIFORM,
  GPU_BUFFER_VERTEX,
  GPU_TEXTURE_RENDER_ATTACHMENT,
} from './webgpuGlobals'

type PipelineType = 'candle' | 'line' | 'fill'

type BufferRecord = {
  buffer: GPUBuffer
  size: number
}

type PipelineRecord = {
  type: PipelineType
}

export type CreateWebGPURendererOptions = {
  gpu?: GPU
  canvas?: HTMLCanvasElement
  onDeviceLost?: (info: GPUDeviceLostInfo) => void
  /** 可选帧指标探针；默认使用模块级 createFrameMetrics */
  metrics?: ReturnType<typeof createFrameMetrics>
}

const RECT_SHADER = `
struct Uniforms {
  resolution: vec2f,
  dpr: f32,
  scrollLeft: f32,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @location(0) rect: vec4f) -> @builtin(position) vec4f {
  let corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let unit = corners[vertexIndex];
  let left = round((rect.x - uniforms.scrollLeft) * uniforms.dpr);
  let top = round(rect.y * uniforms.dpr);
  let right = round((rect.x + rect.z - uniforms.scrollLeft) * uniforms.dpr);
  let bottom = round((rect.y + rect.w) * uniforms.dpr);
  let position = vec2f(
    left + unit.x * max(1.0, right - left),
    top + unit.y * max(1.0, bottom - top),
  );
  let clip = vec2f(position.x / uniforms.resolution.x * 2.0 - 1.0, 1.0 - position.y / uniforms.resolution.y * 2.0);
  return vec4f(clip, 0.0, 1.0);
}

@fragment
fn fragmentMain() -> @location(0) vec4f {
  return uniforms.color;
}
`

const LINE_SHADER = `
struct Uniforms {
  resolution: vec2f,
  dpr: f32,
  scrollLeft: f32,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain(@location(0) point: vec2f) -> @builtin(position) vec4f {
  let position = vec2f(
    (point.x - uniforms.scrollLeft) * uniforms.dpr,
    point.y * uniforms.dpr,
  );
  let clip = vec2f(position.x / uniforms.resolution.x * 2.0 - 1.0, 1.0 - position.y / uniforms.resolution.y * 2.0);
  return vec4f(clip, 0.0, 1.0);
}

@fragment
fn fragmentMain() -> @location(0) vec4f {
  return uniforms.color;
}
`

const BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
}

function bufferUsage(usage: BufferUsage): GPUBufferUsageFlags {
  if (usage === 'index') return GPU_BUFFER_INDEX | GPU_BUFFER_COPY_DST
  if (usage === 'uniform') return GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST
  if (usage === 'storage') return GPU_BUFFER_STORAGE | GPU_BUFFER_COPY_DST
  return GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST
}

function parseColor(value: unknown): readonly [number, number, number, number] | null {
  if (typeof value !== 'string') return null
  const color = value.trim().toLowerCase()
  let rgba: [number, number, number, number] | null = null
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      rgba = [
        Number.parseInt(hex[0]! + hex[0]!, 16) / 255,
        Number.parseInt(hex[1]! + hex[1]!, 16) / 255,
        Number.parseInt(hex[2]! + hex[2]!, 16) / 255,
        1,
      ]
    } else if (hex.length === 4) {
      rgba = [
        Number.parseInt(hex[0]! + hex[0]!, 16) / 255,
        Number.parseInt(hex[1]! + hex[1]!, 16) / 255,
        Number.parseInt(hex[2]! + hex[2]!, 16) / 255,
        Number.parseInt(hex[3]! + hex[3]!, 16) / 255,
      ]
    } else if (hex.length === 6) {
      rgba = [
        Number.parseInt(hex.slice(0, 2), 16) / 255,
        Number.parseInt(hex.slice(2, 4), 16) / 255,
        Number.parseInt(hex.slice(4, 6), 16) / 255,
        1,
      ]
    } else if (hex.length === 8) {
      rgba = [
        Number.parseInt(hex.slice(0, 2), 16) / 255,
        Number.parseInt(hex.slice(2, 4), 16) / 255,
        Number.parseInt(hex.slice(4, 6), 16) / 255,
        Number.parseInt(hex.slice(6, 8), 16) / 255,
      ]
    }
  } else {
    const match = color.match(/^rgba?\(([^)]+)\)$/)
    if (match) {
      const values = match[1]!.split(',').map((part) => Number(part.trim()))
      if ((values.length === 3 || values.length === 4) && values.every(Number.isFinite)) {
        rgba = [values[0]! / 255, values[1]! / 255, values[2]! / 255, values[3] ?? 1]
      }
    }
  }
  if (!rgba || rgba.some((component) => !Number.isFinite(component))) return null
  return [rgba[0] * rgba[3], rgba[1] * rgba[3], rgba[2] * rgba[3], rgba[3]]
}

function buildWideLine(strip: DrawLineStrip): Float32Array | null {
  const width = strip.width ?? 1
  if (strip.points.length < 2 || width <= 0) return null
  const output = new Float32Array((strip.points.length - 1) * 12)
  let offset = 0
  for (let index = 0; index < strip.points.length - 1; index++) {
    const start = strip.points[index]!
    const end = strip.points[index + 1]!
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    if (length <= 0) continue
    const nx = (-dy / length) * width * 0.5
    const ny = (dx / length) * width * 0.5
    output.set(
      [
        start.x + nx,
        start.y + ny,
        start.x - nx,
        start.y - ny,
        end.x + nx,
        end.y + ny,
        end.x + nx,
        end.y + ny,
        start.x - nx,
        start.y - ny,
        end.x - nx,
        end.y - ny,
      ],
      offset,
    )
    offset += 12
  }
  return offset === 0 ? null : output.subarray(0, offset)
}

function linePoints(strip: DrawLineStrip): Float32Array {
  const values = new Float32Array(strip.points.length * 2)
  for (let index = 0; index < strip.points.length; index++) {
    values[index * 2] = strip.points[index]!.x
    values[index * 2 + 1] = strip.points[index]!.y
  }
  return values
}

/** 几何 revision：按 float32 位型哈希，避免截断精度导致漏 upload */
function geometryRevision(values: Float32Array): number {
  const bits = new Uint32Array(values.buffer, values.byteOffset, values.length)
  let h = values.length >>> 0
  for (let i = 0; i < bits.length; i++) {
    h = Math.imul(h ^ bits[i]!, 16777619) >>> 0
  }
  return h
}

export async function createWebGPURenderer(
  options: CreateWebGPURendererOptions = {},
): Promise<Renderer> {
  const gpu = options.gpu ?? globalThis.navigator?.gpu
  if (!gpu) throw new Error('WebGPU unavailable')
  const adapter = await gpu.requestAdapter()
  if (!adapter) throw new Error('WebGPU adapter unavailable')
  const device = await adapter.requestDevice()
  const canvas = options.canvas ?? globalThis.document?.createElement('canvas')
  if (!canvas) throw new Error('WebGPU canvas unavailable')
  const format = gpu.getPreferredCanvasFormat()
  const rawSurface = createWebGPUSurfaceBackend({ canvas, device, format })
  const metrics = options.metrics ?? createFrameMetrics()
  const resourceTable = createWebGPUResourceTable({ device, metrics })

  type PendingDraw =
    | {
        kind: 'instances'
        region: import('./SurfaceBackend').SurfaceRegion
        pipeline: GPURenderPipeline
        instanceBuffer: GPUBuffer
        instanceCount: number
        color: unknown
        scrollLeft: number
      }
    | {
        kind: 'lines'
        region: import('./SurfaceBackend').SurfaceRegion
        pipeline: GPURenderPipeline
        vertexBuffer: GPUBuffer
        vertexCount: number
        color: unknown
        scrollLeft: number
      }

  let disposed = false
  let msaaTexture: GPUTexture | null = null
  let msaaWidth = 0
  let msaaHeight = 0
  let currentRegion: import('./SurfaceBackend').SurfaceRegion | null = null
  let pendingDraws: PendingDraw[] = []
  let metricsFrameOpen = false
  let stripSeq = 0
  /** 本帧 touch 的 strip ResourceTable key；flush 后 prune 未 touch 的 */
  const stripKeysThisFrame = new Set<string>()
  const stripKeysKnown = new Set<string>()
  const buffers = new WeakMap<object, BufferRecord>()
  const bufferRecords = new Set<BufferRecord>()
  const pipelines = new WeakMap<object, PipelineRecord>()
  const pipelineCache = new Map<string, GPURenderPipeline>()
  /** 帧内 uniform 环：跨帧复用，flush 后游标归零 */
  const uniformPool: BufferRecord[] = []
  let uniformPoolUsed = 0

  void device.lost.then((info) => {
    if (!disposed) options.onDeviceLost?.(info)
  })

  function openMetricsFrame(): void {
    if (metricsFrameOpen) return
    metrics.beginFrame()
    metricsFrameOpen = true
    stripSeq = 0
    stripKeysThisFrame.clear()
    uniformPoolUsed = 0
  }

  function pruneUnusedStripKeys(): void {
    for (const key of stripKeysKnown) {
      if (stripKeysThisFrame.has(key)) continue
      resourceTable.destroyKey(key)
      stripKeysKnown.delete(key)
    }
    for (const key of stripKeysThisFrame) stripKeysKnown.add(key)
  }

  function createBufferRecord(usage: BufferUsage, sizeBytes: number): BufferRecord {
    const size = Math.max(4, Math.ceil(sizeBytes / 4) * 4)
    const record = {
      buffer: device.createBuffer({ size, usage: bufferUsage(usage) }),
      size,
    }
    bufferRecords.add(record)
    metrics.recordBufferCreate()
    return record
  }

  function deferDestroy(record: BufferRecord): void {
    bufferRecords.delete(record)
    void device.queue.onSubmittedWorkDone().then(() => record.buffer.destroy())
  }

  function acquireUniform(byteLength: number): BufferRecord {
    if (uniformPoolUsed < uniformPool.length) {
      const existing = uniformPool[uniformPoolUsed]!
      if (existing.size >= byteLength) {
        uniformPoolUsed += 1
        return existing
      }
    }
    const record = createBufferRecord('uniform', byteLength)
    if (uniformPoolUsed < uniformPool.length) {
      const old = uniformPool[uniformPoolUsed]!
      deferDestroy(old)
      uniformPool[uniformPoolUsed] = record
    } else {
      uniformPool.push(record)
    }
    uniformPoolUsed += 1
    return record
  }

  function getPipeline(kind: 'candle' | 'line-strip' | 'line-wide' | 'fill'): GPURenderPipeline {
    const cached = pipelineCache.get(kind)
    if (cached) return cached
    const isCandle = kind === 'candle'
    const module = device.createShaderModule({ code: isCandle ? RECT_SHADER : LINE_SHADER })
    const topology: GPUPrimitiveTopology =
      kind === 'line-strip' ? 'line-strip' : kind === 'fill' ? 'triangle-strip' : 'triangle-list'
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: isCandle ? 16 : 8,
            stepMode: isCandle ? 'instance' : 'vertex',
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: isCandle ? 'float32x4' : 'float32x2',
              },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{ format, blend: BLEND }],
      },
      primitive: { topology },
      multisample: { count: 4 },
    })
    pipelineCache.set(kind, pipeline)
    return pipeline
  }

  function ensureMsaaView(): GPUTextureView | null {
    const width = canvas.width
    const height = canvas.height
    if (width <= 0 || height <= 0) return null
    if (!msaaTexture || width !== msaaWidth || height !== msaaHeight) {
      msaaTexture?.destroy()
      msaaTexture = device.createTexture({
        size: { width, height },
        sampleCount: 4,
        format,
        usage: GPU_TEXTURE_RENDER_ATTACHMENT,
      })
      msaaWidth = width
      msaaHeight = height
    }
    return msaaTexture.createView()
  }

  function createUniform(
    pipeline: GPURenderPipeline,
    colorValue: unknown,
    scrollLeft: number,
    region: import('./SurfaceBackend').SurfaceRegion,
  ): { bindGroup: GPUBindGroup } | null {
    const color = parseColor(colorValue ?? '#000000')
    if (!color) return null
    const values = new Float32Array([
      Math.round(region.width * region.dpr),
      Math.round(region.height * region.dpr),
      region.dpr,
      scrollLeft,
      color[0],
      color[1],
      color[2],
      color[3],
    ])
    const record = acquireUniform(values.byteLength)
    device.queue.writeBuffer(record.buffer, 0, values.buffer, 0, values.byteLength)
    metrics.recordUpload(values.byteLength)
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: record.buffer } }],
    })
    return { bindGroup }
  }

  function beginPass(
    encoder: GPUCommandEncoder,
    region: import('./SurfaceBackend').SurfaceRegion,
    loadOp: 'clear' | 'load',
  ): GPURenderPassEncoder | null {
    const view = rawSurface.getCurrentTextureView()
    const msaaView = ensureMsaaView()
    if (!view || !msaaView) return null
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: msaaView,
          resolveTarget: view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp,
          storeOp: 'store',
        },
      ],
    })
    const { x, y, width, height } = toPhysicalRegion(region, {
      width: canvas.width,
      height: canvas.height,
    })
    if (width <= 0 || height <= 0) {
      pass.end()
      return null
    }
    pass.setViewport(x, y, width, height, 0, 1)
    pass.setScissorRect(x, y, width, height)
    return pass
  }

  function regionKey(region: import('./SurfaceBackend').SurfaceRegion): string {
    return `${region.x},${region.y},${region.width},${region.height},${region.dpr}`
  }

  function flushPendingDraws(options?: { composite?: boolean }): void {
    const hadDraws = pendingDraws.length > 0
    if (hadDraws) {
      openMetricsFrame()
      const encoder = device.createCommandEncoder()
      const groups = new Map<string, PendingDraw[]>()
      for (const draw of pendingDraws) {
        const key = regionKey(draw.region)
        const list = groups.get(key)
        if (list) list.push(draw)
        else groups.set(key, [draw])
      }

      // 单 RenderPass：所有 region 组共享一次 clear + resolve，避免 MSAA 多 pass 驱动问题
      const view = rawSurface.getCurrentTextureView()
      const msaaView = ensureMsaaView()
      if (view && msaaView) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: msaaView,
              resolveTarget: view,
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        })

        for (const draws of groups.values()) {
          const region = draws[0]!.region
          rawSurface.bindRegion(region)

          const { x, y, width, height } = toPhysicalRegion(region, {
            width: canvas.width,
            height: canvas.height,
          })
          if (width > 0 && height > 0) {
            pass.setViewport(x, y, width, height, 0, 1)
            pass.setScissorRect(x, y, width, height)

            for (const draw of draws) {
              const uniform = createUniform(draw.pipeline, draw.color, draw.scrollLeft, draw.region)
              if (!uniform) continue
              pass.setPipeline(draw.pipeline)
              if (draw.kind === 'instances') {
                pass.setVertexBuffer(0, draw.instanceBuffer)
                pass.setBindGroup(0, uniform.bindGroup)
                pass.draw(6, draw.instanceCount)
                metrics.recordDraw()
              } else {
                pass.setVertexBuffer(0, draw.vertexBuffer)
                pass.setBindGroup(0, uniform.bindGroup)
                pass.draw(draw.vertexCount, 1)
                metrics.recordDraw()
              }
            }
          }
        }
        pass.end()
      }
      device.queue.submit([encoder.finish()])
      metrics.recordSubmit()
      pendingDraws = []
    }

    if (options?.composite) {
      if (metricsFrameOpen || hadDraws) {
        openMetricsFrame()
        metrics.recordComposite()
      }
    }

    // endFrame 收口：prune 未 touch 的 strip 资源；composite 中途 flush 保持 frame open
    if (!options?.composite && metricsFrameOpen) {
      pruneUnusedStripKeys()
      metrics.endFrame()
      metricsFrameOpen = false
    }
  }

  // M2：compositeTo 为 no-op（可见 GPU canvas）；仅 endFrame submit
  const surface: WebGPUSurfaceBackend = {
    ...rawSurface,
    compositeTo(_targetCtx, _region, _compositeOptions) {
      // 禁止中途 flush，保证每 chart 帧单次 queue.submit
    },
  }

  const renderer: Renderer = {
    surface,
    caps: { compute: false, storageBuffer: false, maxInstances: 1_000_000, name: 'webgpu' },
    createBuffer(usage, sizeBytes): BufferHandle {
      if (disposed) throw new Error('Renderer is disposed')
      openMetricsFrame()
      const handle = {}
      buffers.set(handle, createBufferRecord(usage, sizeBytes))
      return handle as BufferHandle
    },
    writeBuffer(handle, data, offsetBytes = 0): void {
      if (disposed) return
      const record = buffers.get(handle as object)
      if (!record || offsetBytes < 0 || offsetBytes + data.byteLength > record.size) return
      openMetricsFrame()
      device.queue.writeBuffer(
        record.buffer,
        offsetBytes,
        data.buffer as ArrayBuffer,
        data.byteOffset,
        data.byteLength,
      )
      metrics.recordUpload(data.byteLength)
    },
    destroyBuffer(handle): void {
      if (disposed) return
      const record = buffers.get(handle as object)
      if (!record) return
      // 不立即 destroy：helper 可跨帧复用同一 handle；显式 dispose 才释放
      // 兼容仍调用 destroyBuffer 的旧路径：仅解除 handle 映射，GPU buffer 延迟回收
      buffers.delete(handle as object)
      deferDestroy(record)
    },
    createPipeline(descriptor): PipelineHandle {
      if (disposed) throw new Error('Renderer is disposed')
      const type = (descriptor as { type?: PipelineType })?.type
      if (type !== 'candle' && type !== 'line' && type !== 'fill') {
        throw new Error('Unsupported WebGPU pipeline type')
      }
      const handle = {}
      pipelines.set(handle, { type })
      return handle as PipelineHandle
    },
    destroyPipeline(handle): void {
      if (!disposed) pipelines.delete(handle as object)
    },
    createComputePipeline(_descriptor): ComputePipelineHandle {
      throw new Error('compute not supported on WebGPU MVP backend (caps.compute === false)')
    },
    destroyComputePipeline(_handle): void {},
    beginFrame(region): void {
      if (!disposed) {
        openMetricsFrame()
        currentRegion = { ...region }
        rawSurface.bindRegion(region)
      }
    },
    drawInstances(params: DrawInstancesParams): boolean {
      if (
        disposed ||
        params.instanceCount < 0 ||
        params.instanceCount > renderer.caps.maxInstances
      ) {
        return false
      }
      if (params.instanceCount === 0) return true
      const pipelineRecord = pipelines.get(params.pipeline as object)
      const instanceRecord = buffers.get(params.instances as object)
      if (pipelineRecord?.type !== 'candle' || !instanceRecord || !currentRegion) return false
      try {
        openMetricsFrame()
        pendingDraws.push({
          kind: 'instances',
          region: { ...currentRegion },
          pipeline: getPipeline('candle'),
          instanceBuffer: instanceRecord.buffer,
          instanceCount: params.instanceCount,
          color: params.uniforms?.color,
          scrollLeft: (params.uniforms?.scrollLeft as number) ?? 0,
        })
        return true
      } catch {
        return false
      }
    },
    drawLines(params: DrawLinesParams): boolean {
      if (disposed || !currentRegion) return false
      const pipelineRecord = pipelines.get(params.pipeline as object)
      if (!pipelineRecord || pipelineRecord.type === 'candle') return false
      if (params.strips && params.strips.length === 0) return true
      try {
        openMetricsFrame()
        if (params.strips) {
          const scrollLeft = (params.uniforms?.scrollLeft as number) ?? 0
          for (const strip of params.strips) {
            if (strip.points.length < 2) return false
            const physicalStrip = prepareLineStripForPhysicalPixels(
              strip,
              currentRegion.dpr,
              scrollLeft,
            )
            const wide = (physicalStrip.width ?? 1) * currentRegion.dpr > 1
            const values = wide ? buildWideLine(physicalStrip) : linePoints(physicalStrip)
            if (!values) return false
            // 帧内序号作 key：同顺序跨帧复用；revision 未变则不 upload
            const key = `strip/${stripSeq++}`
            stripKeysThisFrame.add(key)
            const uploaded = resourceTable.ensureUploaded({
              key,
              revision: geometryRevision(values),
              data: values,
              usage: 'vertex',
            })
            pendingDraws.push({
              kind: 'lines',
              region: { ...currentRegion },
              pipeline: getPipeline(wide ? 'line-wide' : 'line-strip'),
              vertexBuffer: uploaded.buffer,
              vertexCount: values.length / 2,
              color: strip.color,
              scrollLeft,
            })
          }
          return true
        }

        if (pipelineRecord.type !== 'fill' || !params.vertices || !params.vertexCount) return false
        const vertexRecord = buffers.get(params.vertices as object)
        if (!vertexRecord || params.vertexCount < 3) return false
        pendingDraws.push({
          kind: 'lines',
          region: { ...currentRegion },
          pipeline: getPipeline('fill'),
          vertexBuffer: vertexRecord.buffer,
          vertexCount: params.vertexCount,
          color: params.uniforms?.color,
          scrollLeft: (params.uniforms?.scrollLeft as number) ?? 0,
        })
        return true
      } catch {
        return false
      }
    },
    dispatchCompute(_params: DispatchComputeParams): void {
      throw new Error('dispatchCompute requires a backend with caps.compute === true')
    },
    endFrame(): void {
      if (!disposed) flushPendingDraws()
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      pendingDraws = []
      stripKeysThisFrame.clear()
      stripKeysKnown.clear()
      msaaTexture?.destroy()
      msaaTexture = null
      resourceTable.destroyAll()
      for (const record of uniformPool) record.buffer.destroy()
      uniformPool.length = 0
      for (const record of bufferRecords) record.buffer.destroy()
      bufferRecords.clear()
      rawSurface.dispose()
    },
  }

  return renderer
}
