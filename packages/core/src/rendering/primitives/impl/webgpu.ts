/** WebGPU 有序合批设备：共享宿主 device、复用上传资源与 MSAA 目标，文字不进入 GPU。 */
import {
  GPU_BUFFER_COPY_DST,
  GPU_BUFFER_UNIFORM,
  GPU_BUFFER_VERTEX,
  GPU_TEXTURE_RENDER_ATTACHMENT,
} from '@/rendering/render/webgpuGlobals.js'
import type { PrimitiveBackend, PrimitiveSurface } from '../types.js'
import { UploadTracker } from './buffers.js'
import { createColorResolver } from './colors.js'
import { createGpuPrimitiveBackend, type PrimitiveDevice } from './gpu.js'
import { createPrimitivePreparer, type GeometryPrimitive } from './prepare.js'
import { INSTANCE_FLOATS, MESH_FLOATS, MESH_WGSL, SHAPE_WGSL } from './shaders.js'

/**
 * 绑定一个画布的设备。
 *
 * @param direct true 表示画布本身就是可见表面：单采样、直接写 current texture，
 *   保留上一帧内容时用 loadOp=load；false 表示离屏目标：4x MSAA 后 resolve。
 */
function createDevice(
  device: GPUDevice,
  format: GPUTextureFormat,
  canvas: HTMLCanvasElement,
  direct: boolean,
): PrimitiveDevice {
  const context = canvas.getContext('webgpu')
  if (!context || !('configure' in context)) throw new Error('Primitive WebGPU unavailable')
  context.configure({ device, format, alphaMode: 'premultiplied' })
  const sampleCount = direct ? 1 : 4
  const meshModule = device.createShaderModule({ code: MESH_WGSL })
  const shapeModule = device.createShaderModule({ code: SHAPE_WGSL })
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  }
  const shapeLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: 3, buffer: { type: 'uniform' } }],
  })
  const shapePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [shapeLayout] })
  const meshPipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [] })
  /** 同一网格布局覆盖直绘、winding mask 和 cover，切换不重新绑定 buffer。 */
  const pipeline = (
    mode: 'shape' | 'direct' | 'mask' | 'parityMask' | 'cover' | 'parityCover',
  ): GPURenderPipeline => {
    const mask = mode === 'mask' || mode === 'parityMask',
      shape = mode === 'shape'
    const cover = mode === 'cover' || mode === 'parityCover'
    const attributes: GPUVertexAttribute[] = shape
      ? [0, 1, 2, 3].map((index) => ({
          shaderLocation: index,
          offset: index * 16,
          format: 'float32x4',
        }))
      : [
          { shaderLocation: 0, offset: 0, format: 'float32x2' },
          { shaderLocation: 1, offset: 8, format: 'float32x4' },
        ]
    return device.createRenderPipeline({
      layout: shape ? shapePipelineLayout : meshPipelineLayout,
      vertex: {
        module: shape ? shapeModule : meshModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: (shape ? INSTANCE_FLOATS : MESH_FLOATS) * 4,
            stepMode: shape ? 'instance' : 'vertex',
            attributes,
          },
        ],
      },
      fragment: {
        module: shape ? shapeModule : meshModule,
        entryPoint: 'fs',
        targets: [{ format, blend, writeMask: mask ? 0 : 0xf }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: sampleCount },
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilReadMask: mode === 'parityCover' ? 1 : 0xff,
        stencilWriteMask: 0xff,
        stencilFront: mask
          ? { compare: 'always', passOp: mode === 'parityMask' ? 'invert' : 'increment-wrap' }
          : cover
            ? { compare: 'not-equal', passOp: 'zero', failOp: 'zero' }
            : { compare: 'always', passOp: 'keep' },
        stencilBack: mask
          ? { compare: 'always', passOp: mode === 'parityMask' ? 'invert' : 'decrement-wrap' }
          : cover
            ? { compare: 'not-equal', passOp: 'zero', failOp: 'zero' }
            : { compare: 'always', passOp: 'keep' },
      },
    })
  }
  const shapes = pipeline('shape'),
    directPipeline = pipeline('direct'),
    mask = pipeline('mask'),
    parityMask = pipeline('parityMask'),
    cover = pipeline('cover'),
    parityCover = pipeline('parityCover')
  const uniform = device.createBuffer({ size: 16, usage: GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST })
  const bind = device.createBindGroup({
    layout: shapeLayout,
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  })
  const viewport = new Float32Array(4)
  let viewportWidth = 0,
    viewportHeight = 0,
    viewportDpr = 0
  /** 离屏目标的多采样颜色纹理；可见表面直接渲染到 current texture。 */
  let color: GPUTexture | undefined
  let depth: GPUTexture | undefined
  let meshBuffer: GPUBuffer | undefined, instanceBuffer: GPUBuffer | undefined
  let meshCapacity = 0,
    instanceCapacity = 0
  let targetWidth = 0,
    targetHeight = 0
  const meshTracker = new UploadTracker(),
    instanceTracker = new UploadTracker()
  return {
    render(batch, width, height, dpr, clear = true) {
      // 离屏目标只增不减；可见表面由 Pane 负责尺寸，直接沿用。
      const nextWidth = direct ? canvas.width : Math.max(width, targetWidth)
      const nextHeight = direct ? canvas.height : Math.max(height, targetHeight)
      if (nextWidth <= 0 || nextHeight <= 0) throw new Error('Primitive WebGPU target unavailable')
      if (
        depth === undefined ||
        targetWidth !== nextWidth ||
        targetHeight !== nextHeight ||
        (!direct && color === undefined)
      ) {
        color?.destroy()
        depth?.destroy()
        targetWidth = nextWidth
        targetHeight = nextHeight
        if (!direct) {
          canvas.width = targetWidth
          canvas.height = targetHeight
          color = device.createTexture({
            size: [targetWidth, targetHeight],
            format,
            sampleCount: 4,
            usage: GPU_TEXTURE_RENDER_ATTACHMENT,
          })
        }
        depth = device.createTexture({
          size: [targetWidth, targetHeight],
          format: 'depth24plus-stencil8',
          sampleCount,
          usage: GPU_TEXTURE_RENDER_ATTACHMENT,
        })
      }
      const metrics = { drawCalls: 0, uploads: 0, uploadedBytes: 0, submissions: 1 }
      /** buffer 按容量增长，CPU 镜像决定本批实际需要上传的连续区间。 */
      const upload = (
        values: Float32Array,
        tracker: UploadTracker,
        buffer: GPUBuffer | undefined,
        capacity: number,
      ): { buffer: GPUBuffer; capacity: number } => {
        const grow = !buffer || values.byteLength > capacity
        if (grow) {
          buffer?.destroy()
          capacity = Math.max(values.byteLength, capacity * 2, 1024)
          buffer = device.createBuffer({
            size: capacity,
            usage: GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST,
          })
        }
        const range = tracker.update(values, grow)
        if (range) {
          device.queue.writeBuffer(
            buffer!,
            range.offset,
            range.values.buffer,
            range.values.byteOffset,
            range.values.byteLength,
          )
          metrics.uploads++
          metrics.uploadedBytes += range.values.byteLength
        }
        return { buffer: buffer!, capacity }
      }
      const mesh = upload(batch.vertices, meshTracker, meshBuffer, meshCapacity)
      meshBuffer = mesh.buffer
      meshCapacity = mesh.capacity
      const instances = upload(batch.instances, instanceTracker, instanceBuffer, instanceCapacity)
      instanceBuffer = instances.buffer
      instanceCapacity = instances.capacity
      if (
        batch.instances.length &&
        (viewportWidth !== width || viewportHeight !== height || viewportDpr !== dpr)
      ) {
        viewport.set([width / dpr, height / dpr, dpr, 0])
        device.queue.writeBuffer(uniform, 0, viewport)
        viewportWidth = width
        viewportHeight = height
        viewportDpr = dpr
        metrics.uploads++
        metrics.uploadedBytes += viewport.byteLength
      }
      const encoder = device.createCommandEncoder()
      const current = context.getCurrentTexture().createView()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          direct
            ? {
                view: current,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: clear ? 'clear' : 'load',
                storeOp: 'store',
              }
            : {
                view: color!.createView(),
                resolveTarget: current,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'discard',
              },
        ],
        depthStencilAttachment: {
          view: depth!.createView(),
          depthLoadOp: clear ? 'clear' : 'load',
          depthStoreOp: 'discard',
          depthClearValue: 1,
          stencilLoadOp: clear ? 'clear' : 'load',
          stencilStoreOp: 'discard',
          stencilClearValue: 0,
        },
      })
      pass.setStencilReference(0)
      // 共享目标可能大于本 pane；只写左上角目标区域，其余内容由合成端忽略。
      pass.setViewport(0, 0, width, height, 0, 1)
      let active: GPURenderPipeline | undefined
      let activeBuffer: GPUBuffer | undefined
      /** 避免相邻同管线命令重复绑定。 */
      const select = (next: GPURenderPipeline, buffer: GPUBuffer): void => {
        if (active !== next) {
          pass.setPipeline(next)
          active = next
        }
        if (activeBuffer !== buffer) {
          pass.setVertexBuffer(0, buffer)
          activeBuffer = buffer
        }
      }
      for (const draw of batch.draws) {
        if (draw.kind === 'instances') {
          select(shapes, instanceBuffer)
          pass.setBindGroup(0, bind)
          pass.draw(6, draw.count, 0, draw.first)
          metrics.drawCalls++
        } else if (draw.kind === 'direct') {
          select(directPipeline, meshBuffer)
          pass.draw(draw.count, 1, draw.first)
          metrics.drawCalls++
        } else {
          select(draw.evenodd ? parityMask : mask, meshBuffer)
          pass.draw(draw.count, 1, draw.first)
          select(draw.evenodd ? parityCover : cover, meshBuffer)
          pass.draw(draw.coverCount, 1, draw.coverFirst)
          metrics.drawCalls += 2
        }
      }
      pass.end()
      device.queue.submit([encoder.finish()])
      return { canvas, metrics }
    },
    async waitForIdle() {
      await device.queue.onSubmittedWorkDone()
    },
    dispose() {
      meshBuffer?.destroy()
      instanceBuffer?.destroy()
      uniform.destroy()
      color?.destroy()
      depth?.destroy()
      context.unconfigure()
      if (!direct) canvas.width = canvas.height = 1
    },
  }
}

/** 直接写入可见画布的 WebGPU 表面；单采样、不 resolve、不拷贝。 */
function createSurface(
  device: GPUDevice,
  format: GPUTextureFormat,
  canvas: HTMLCanvasElement,
): PrimitiveSurface | null {
  let target: PrimitiveDevice | null = null
  let preparer: ReturnType<typeof createPrimitivePreparer> | null = null
  return {
    canvas,
    paint(primitives, dpr, clear) {
      try {
        const document = canvas.ownerDocument
        if (!document) return false
        if (primitives.some((primitive) => primitive.kind === 'text')) return false
        const width = canvas.width,
          height = canvas.height
        if (width <= 0 || height <= 0) return false
        preparer ??= createPrimitivePreparer(createColorResolver(document))
        const batch = preparer.prepare(primitives as GeometryPrimitive[], width, height, dpr)
        target ??= createDevice(device, format, canvas, true)
        target.render(batch, width, height, dpr, clear)
        return true
      } catch {
        target?.dispose()
        target = null
        return false
      }
    },
    dispose() {
      target?.dispose()
      target = null
    },
  }
}

/** WebGPU 原语后端共用行情 device，但独立管理自身管线与容量。 */
export function createWebGPUPrimitiveBackend(
  device: GPUDevice,
  format: GPUTextureFormat,
  document?: Document,
) {
  const composite = createGpuPrimitiveBackend(
    (target) => createDevice(device, format, target.createElement('canvas'), false),
    document ? createDevice(device, format, document.createElement('canvas'), false) : undefined,
  )
  return {
    ...composite,
    createSurface: (canvas: HTMLCanvasElement) => createSurface(device, format, canvas),
  } satisfies PrimitiveBackend
}
