/** WebGPU 有序合批设备：共享宿主 device、复用上传资源和 MSAA 目标，文字不进入 GPU。 */
import {
  GPU_BUFFER_COPY_DST,
  GPU_BUFFER_UNIFORM,
  GPU_BUFFER_VERTEX,
  GPU_TEXTURE_RENDER_ATTACHMENT,
} from '@/rendering/render/webgpuGlobals.js'
import { UploadTracker } from './buffers.js'
import { createGpuPrimitiveBackend, type PrimitiveDevice } from './gpu.js'
import { INSTANCE_FLOATS, MESH_FLOATS, MESH_WGSL, SHAPE_WGSL } from './shaders.js'

/** 设备只负责整批重画；没有局部保留、脏区域或读回。 */
function createDevice(
  document: Document,
  device: GPUDevice,
  format: GPUTextureFormat,
): PrimitiveDevice {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('webgpu')
  if (!context || !('configure' in context)) throw new Error('Primitive WebGPU unavailable')
  context.configure({ device, format, alphaMode: 'premultiplied' })
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
      multisample: { count: 4 },
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
    direct = pipeline('direct'),
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
  let color: GPUTexture | undefined, depth: GPUTexture | undefined
  let meshBuffer: GPUBuffer | undefined, instanceBuffer: GPUBuffer | undefined
  let meshCapacity = 0,
    instanceCapacity = 0
  let targetWidth = 0,
    targetHeight = 0
  const meshTracker = new UploadTracker(),
    instanceTracker = new UploadTracker()
  return {
    render(batch, width, height, dpr) {
      // 目标只增不减：多 pane 交替绘制不会每帧销毁重建 MSAA 纹理。
      if (!color || targetWidth < width || targetHeight < height) {
        color?.destroy()
        depth?.destroy()
        targetWidth = Math.max(width, targetWidth)
        targetHeight = Math.max(height, targetHeight)
        canvas.width = targetWidth
        canvas.height = targetHeight
        color = device.createTexture({
          size: [targetWidth, targetHeight],
          format,
          sampleCount: 4,
          usage: GPU_TEXTURE_RENDER_ATTACHMENT,
        })
        depth = device.createTexture({
          size: [targetWidth, targetHeight],
          format: 'depth24plus-stencil8',
          sampleCount: 4,
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
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: color.createView(),
            resolveTarget: context.getCurrentTexture().createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'discard',
          },
        ],
        depthStencilAttachment: {
          view: depth!.createView(),
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
          depthClearValue: 1,
          stencilLoadOp: 'clear',
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
          select(direct, meshBuffer)
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
      canvas.width = canvas.height = 1
    },
  }
}

/** WebGPU 原语后端共用行情 device，但独立管理自身管线和容量。 */
export function createWebGPUPrimitiveBackend(
  device: GPUDevice,
  format: GPUTextureFormat,
  document?: Document,
) {
  return createGpuPrimitiveBackend(
    (document) => createDevice(document, device, format),
    document ? createDevice(document, device, format) : undefined,
  )
}
