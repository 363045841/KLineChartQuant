/** WebGPU 原语设备：共享宿主 device，独立 MSAA 目标和 stencil，提交后合成到指定业务层。 */
import { GPU_BUFFER_COPY_DST, GPU_BUFFER_VERTEX, GPU_TEXTURE_RENDER_ATTACHMENT, GPU_TEXTURE_COPY_DST, GPU_TEXTURE_BINDING } from '@/rendering/render/webgpuGlobals.js'
import { createGpuPrimitiveBackend, type PrimitiveDevice } from './gpu.js'

const SHADER = `
struct Vertex { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f }
@vertex fn vs(@location(0) position:vec2f,@location(1) uv:vec2f,@location(2) color:vec4f)->Vertex {
  var out:Vertex;out.position=vec4f(position,0.,1.);out.uv=uv;out.color=color;return out;
}
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var imageSampler:sampler;
@fragment fn fs(in:Vertex)->@location(0) vec4f {
  let value=textureSample(image,imageSampler,in.uv);
  return vec4f(value.rgb*in.color.rgb*in.color.a,value.a*in.color.a);
}`

/** 使用宿主 device 构造隔离管线，避免重复申请 adapter/device。 */
function createDevice(document: Document, device: GPUDevice, format: GPUTextureFormat): PrimitiveDevice {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('webgpu')
  if (!context || !('configure' in context)) throw new Error('Primitive WebGPU unavailable')
  context.configure({ device, format, alphaMode: 'premultiplied' })
  const module = device.createShaderModule({ code: SHADER })
  const sampler = device.createSampler({ minFilter: 'linear', magFilter: 'linear' })
  const layout = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 2, texture: {} }, { binding: 1, visibility: 2, sampler: {} },
  ] })
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] })
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  }
  /** mask 累计 winding；cover 一次着色并清零 stencil，防止透明路径交叉处重复混合。 */
  function pipeline(mode: 'mask' | 'evenodd' | 'cover' | 'coverEvenodd' | 'image'): GPURenderPipeline {
    const mask = mode === 'mask' || mode === 'evenodd'
    const face: GPUStencilFaceState = { compare: 'always', passOp: 'keep' }
    return device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs', buffers: [{ arrayStride: 32, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x2' },
        { shaderLocation: 1, offset: 8, format: 'float32x2' },
        { shaderLocation: 2, offset: 16, format: 'float32x4' },
      ] }] },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend, writeMask: mask ? 0 : 0xf }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      multisample: { count: 4 },
      depthStencil: {
        format: 'depth24plus-stencil8', depthWriteEnabled: false, depthCompare: 'always',
        stencilReadMask: mode === 'coverEvenodd' ? 1 : 0xff,
        stencilWriteMask: 0xff,
        stencilFront: mask ? { compare: 'always', passOp: mode === 'evenodd' ? 'invert' : 'increment-wrap' } : mode === 'image' ? face : { compare: 'not-equal', passOp: 'zero', failOp: 'zero' },
        stencilBack: mask ? { compare: 'always', passOp: mode === 'evenodd' ? 'invert' : 'decrement-wrap' } : mode === 'image' ? face : { compare: 'not-equal', passOp: 'zero', failOp: 'zero' },
      },
    })
  }
  const mask = pipeline('mask'), parityMask = pipeline('evenodd'), cover = pipeline('cover'), parityCover = pipeline('coverEvenodd'), imagePipeline = pipeline('image')
  let color: GPUTexture | undefined, depth: GPUTexture | undefined
  let buffer: GPUBuffer | undefined, capacity = 0
  const white = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPU_TEXTURE_COPY_DST | GPU_TEXTURE_BINDING })
  device.queue.writeTexture({ texture: white }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1])
  /** 同一 layout 用于所有模式，纹理可在管线之间复用。 */
  function bind(texture: GPUTexture): GPUBindGroup {
    return device.createBindGroup({ layout, entries: [{ binding: 0, resource: texture.createView() }, { binding: 1, resource: sampler }] })
  }
  const solid = bind(white)
  return {
    render(batch, width, height) {
      if (!color || canvas.width !== width || canvas.height !== height) {
        color?.destroy(); depth?.destroy()
        canvas.width = width; canvas.height = height
        color = device.createTexture({ size: [width, height], format, sampleCount: 4, usage: GPU_TEXTURE_RENDER_ATTACHMENT })
        depth = device.createTexture({ size: [width, height], format: 'depth24plus-stencil8', sampleCount: 4, usage: GPU_TEXTURE_RENDER_ATTACHMENT })
      }
      const size = batch.reduce((sum, primitive) => sum + primitive.vertices.byteLength, 0)
      if (!buffer || capacity < size) {
        buffer?.destroy(); capacity = Math.max(32, size)
        buffer = device.createBuffer({ size: capacity, usage: GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST })
      }
      const textures: GPUTexture[] = []
      const draws = batch.map(primitive => {
        if (!primitive.image) return solid
        const texture = device.createTexture({ size: [primitive.image.width, primitive.image.height], format: 'rgba8unorm', usage: GPU_TEXTURE_COPY_DST | GPU_TEXTURE_BINDING | GPU_TEXTURE_RENDER_ATTACHMENT })
        textures.push(texture)
        device.queue.copyExternalImageToTexture({ source: primitive.image }, { texture, premultipliedAlpha: true }, [primitive.image.width, primitive.image.height])
        return bind(texture)
      })
      let offset = 0
      for (const primitive of batch) {
        device.queue.writeBuffer(buffer, offset, primitive.vertices.buffer, primitive.vertices.byteOffset, primitive.vertices.byteLength)
        offset += primitive.vertices.byteLength
      }
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: color.createView(), resolveTarget: context.getCurrentTexture().createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
        depthStencilAttachment: { view: depth!.createView(), depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1, stencilLoadOp: 'clear', stencilStoreOp: 'discard', stencilClearValue: 0 },
      })
      pass.setStencilReference(0)
      offset = 0
      for (let i = 0; i < batch.length; i++) {
        const primitive = batch[i]!
        pass.setVertexBuffer(0, buffer, offset, primitive.vertices.byteLength)
        pass.setBindGroup(0, draws[i]!)
        if (primitive.image || primitive.direct) { pass.setPipeline(imagePipeline); pass.draw(primitive.vertices.length / 8) }
        else if (primitive.maskCount > 0) {
          pass.setPipeline(primitive.evenodd ? parityMask : mask); pass.draw(primitive.maskCount)
          pass.setPipeline(primitive.evenodd ? parityCover : cover); pass.draw(6, 1, primitive.maskCount)
        }
        offset += primitive.vertices.byteLength
      }
      pass.end()
      device.queue.submit([encoder.finish()])
      // submit 已持有资源引用；销毁不再供后续帧使用的字形纹理。
      for (const texture of textures) texture.destroy()
      return canvas
    },
    dispose() { buffer?.destroy(); color?.destroy(); depth?.destroy(); white.destroy(); context.unconfigure(); canvas.width = canvas.height = 1 },
  }
}

/** WebGPU 原语后端与行情后端共享设备生命周期。 */
export function createWebGPUPrimitiveBackend(device: GPUDevice, format: GPUTextureFormat) {
  return createGpuPrimitiveBackend(document => createDevice(document, device, format))
}
