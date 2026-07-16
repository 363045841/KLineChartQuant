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
}

const GPU_BUFFER_COPY_DST = globalThis.GPUBufferUsage?.COPY_DST ?? 0x0008
const GPU_BUFFER_INDEX = globalThis.GPUBufferUsage?.INDEX ?? 0x0010
const GPU_BUFFER_VERTEX = globalThis.GPUBufferUsage?.VERTEX ?? 0x0020
const GPU_BUFFER_UNIFORM = globalThis.GPUBufferUsage?.UNIFORM ?? 0x0040
const GPU_BUFFER_STORAGE = globalThis.GPUBufferUsage?.STORAGE ?? 0x0080
const GPU_TEXTURE_RENDER_ATTACHMENT = globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10

const RECT_SHADER = `
struct Uniforms {
  resolution: vec2f,
  scrollLeft: f32,
  padding: f32,
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
  let position = vec2f(rect.x - uniforms.scrollLeft + unit.x * rect.z, rect.y + unit.y * rect.w);
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
  scrollLeft: f32,
  padding: f32,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertexMain(@location(0) point: vec2f) -> @builtin(position) vec4f {
  let position = vec2f(point.x - uniforms.scrollLeft, point.y);
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
    } else if (hex.length === 6) {
      rgba = [
        Number.parseInt(hex.slice(0, 2), 16) / 255,
        Number.parseInt(hex.slice(2, 4), 16) / 255,
        Number.parseInt(hex.slice(4, 6), 16) / 255,
        1,
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
  const surface = createWebGPUSurfaceBackend({ canvas, device, format })

  let disposed = false
  let msaaTexture: GPUTexture | null = null
  let msaaWidth = 0
  let msaaHeight = 0
  let clearPending = true
  const buffers = new WeakMap<object, BufferRecord>()
  const bufferRecords = new Set<BufferRecord>()
  const pipelines = new WeakMap<object, PipelineRecord>()
  const pipelineCache = new Map<string, GPURenderPipeline>()

  void device.lost.then((info) => {
    if (!disposed) options.onDeviceLost?.(info)
  })

  function createBufferRecord(usage: BufferUsage, sizeBytes: number): BufferRecord {
    const size = Math.max(4, Math.ceil(sizeBytes / 4) * 4)
    const record = {
      buffer: device.createBuffer({ size, usage: bufferUsage(usage) }),
      size,
    }
    bufferRecords.add(record)
    return record
  }

  function deferDestroy(record: BufferRecord): void {
    bufferRecords.delete(record)
    void device.queue.onSubmittedWorkDone().then(() => record.buffer.destroy())
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
  ): { record: BufferRecord; bindGroup: GPUBindGroup } | null {
    const region = surface.getBoundRegion()
    const color = parseColor(colorValue ?? '#000000')
    if (!region || !color) return null
    const values = new Float32Array([
      region.width,
      region.height,
      scrollLeft,
      0,
      color[0],
      color[1],
      color[2],
      color[3],
    ])
    const record = createBufferRecord('uniform', values.byteLength)
    device.queue.writeBuffer(record.buffer, 0, values.buffer, 0, values.byteLength)
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: record.buffer } }],
    })
    return { record, bindGroup }
  }

  function beginPass(): { encoder: GPUCommandEncoder; pass: GPURenderPassEncoder } | null {
    const region = surface.getBoundRegion()
    const view = surface.getCurrentTextureView()
    const msaaView = ensureMsaaView()
    if (!region || !view || !msaaView) return null
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: msaaView,
          resolveTarget: view,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: clearPending ? 'clear' : 'load',
          storeOp: 'store',
        },
      ],
    })
    const x = Math.max(0, Math.round(region.x * region.dpr))
    const y = Math.max(0, Math.round(region.y * region.dpr))
    const width = Math.min(canvas.width - x, Math.round(region.width * region.dpr))
    const height = Math.min(canvas.height - y, Math.round(region.height * region.dpr))
    if (width <= 0 || height <= 0) {
      pass.end()
      return null
    }
    clearPending = false
    pass.setViewport(x, y, width, height, 0, 1)
    pass.setScissorRect(x, y, width, height)
    return { encoder, pass }
  }

  const renderer: Renderer = {
    surface,
    caps: { compute: false, storageBuffer: false, maxInstances: 1_000_000, name: 'webgpu' },
    createBuffer(usage, sizeBytes): BufferHandle {
      if (disposed) throw new Error('Renderer is disposed')
      const handle = {}
      buffers.set(handle, createBufferRecord(usage, sizeBytes))
      return handle as BufferHandle
    },
    writeBuffer(handle, data, offsetBytes = 0): void {
      if (disposed) return
      const record = buffers.get(handle as object)
      if (!record || offsetBytes < 0 || offsetBytes + data.byteLength > record.size) return
      device.queue.writeBuffer(
        record.buffer,
        offsetBytes,
        data.buffer as ArrayBuffer,
        data.byteOffset,
        data.byteLength,
      )
    },
    destroyBuffer(handle): void {
      if (disposed) return
      const record = buffers.get(handle as object)
      if (!record) return
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
        clearPending = true
        surface.bindRegion(region)
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
      if (pipelineRecord?.type !== 'candle' || !instanceRecord) return false
      try {
        const pipeline = getPipeline('candle')
        const uniform = createUniform(
          pipeline,
          params.uniforms?.color,
          (params.uniforms?.scrollLeft as number) ?? 0,
        )
        const frame = beginPass()
        if (!uniform || !frame) return false
        frame.pass.setPipeline(pipeline)
        frame.pass.setVertexBuffer(0, instanceRecord.buffer)
        frame.pass.setBindGroup(0, uniform.bindGroup)
        frame.pass.draw(6, params.instanceCount)
        frame.pass.end()
        device.queue.submit([frame.encoder.finish()])
        deferDestroy(uniform.record)
        return true
      } catch {
        return false
      }
    },
    drawLines(params: DrawLinesParams): boolean {
      if (disposed) return false
      const pipelineRecord = pipelines.get(params.pipeline as object)
      if (!pipelineRecord || pipelineRecord.type === 'candle') return false
      if (params.strips && params.strips.length === 0) return true
      try {
        const frame = beginPass()
        if (!frame) return false
        const temporaryRecords: BufferRecord[] = []

        if (params.strips) {
          const scrollLeft = (params.uniforms?.scrollLeft as number) ?? 0
          for (const strip of params.strips) {
            if (strip.points.length < 2) return false
            const wide = (strip.width ?? 1) > 1
            const values = wide ? buildWideLine(strip) : linePoints(strip)
            if (!values) return false
            const vertexRecord = createBufferRecord('vertex', values.byteLength)
            device.queue.writeBuffer(vertexRecord.buffer, 0, values.buffer, 0, values.byteLength)
            temporaryRecords.push(vertexRecord)
            const pipeline = getPipeline(wide ? 'line-wide' : 'line-strip')
            const uniform = createUniform(pipeline, strip.color, scrollLeft)
            if (!uniform) return false
            temporaryRecords.push(uniform.record)
            frame.pass.setPipeline(pipeline)
            frame.pass.setVertexBuffer(0, vertexRecord.buffer)
            frame.pass.setBindGroup(0, uniform.bindGroup)
            frame.pass.draw(values.length / 2, 1)
          }
        } else {
          if (pipelineRecord.type !== 'fill' || !params.vertices || !params.vertexCount)
            return false
          const vertexRecord = buffers.get(params.vertices as object)
          if (!vertexRecord || params.vertexCount < 3) return false
          const pipeline = getPipeline('fill')
          const uniform = createUniform(
            pipeline,
            params.uniforms?.color,
            (params.uniforms?.scrollLeft as number) ?? 0,
          )
          if (!uniform) return false
          temporaryRecords.push(uniform.record)
          frame.pass.setPipeline(pipeline)
          frame.pass.setVertexBuffer(0, vertexRecord.buffer)
          frame.pass.setBindGroup(0, uniform.bindGroup)
          frame.pass.draw(params.vertexCount, 1)
        }

        frame.pass.end()
        device.queue.submit([frame.encoder.finish()])
        for (const record of temporaryRecords) deferDestroy(record)
        return true
      } catch {
        return false
      }
    },
    dispatchCompute(_params: DispatchComputeParams): void {
      throw new Error('dispatchCompute requires a backend with caps.compute === true')
    },
    endFrame(): void {},
    dispose(): void {
      if (disposed) return
      disposed = true
      msaaTexture?.destroy()
      msaaTexture = null
      for (const record of bufferRecords) record.buffer.destroy()
      bufferRecords.clear()
      surface.dispose()
    },
  }

  return renderer
}
