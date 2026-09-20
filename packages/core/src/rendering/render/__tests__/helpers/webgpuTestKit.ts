/**
 * WebGPU 后端的共享测试夹具：可观测的 GPU / GPUAdapter / GPUDevice / GPUCanvasContext 替身。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：WebGPU 是 DOM 类型，成员上百，结构化对象无法满足；
 * 与 createMockCanvas2DContext 同例，强转集中在本夹具工厂内部，消费方不再内联 as unknown as。
 */
import { vi } from 'vitest'

/** 可手动 resolve 的 Promise。 */
interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

/** 创建可手动 resolve 的 Promise。 */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * 构造完整的 WebGPU 替身。
 * gpu / device / canvas 既可直接传入后端工厂，又保留 spy 断言能力；
 * passes / descriptors / buffers 记录帧内行为，lost 供 device lost 用例手动触发。
 */
export function createMockWebGPU() {
  const lost = deferred<GPUDeviceLostInfo>()
  const renderPassDescriptors: GPURenderPassDescriptor[] = []
  const pipelineDescriptors: GPURenderPipelineDescriptor[] = []
  const shaderModules: Array<{ code: string }> = []
  const buffers: Array<{ destroy: () => void; size: number }> = []

  function makePass() {
    return {
      setViewport: vi.fn(),
      setScissorRect: vi.fn(),
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
      setBindGroup: vi.fn(),
      draw: vi.fn(),
      end: vi.fn(),
    }
  }
  const passes: Array<ReturnType<typeof makePass>> = []

  const queue = {
    writeBuffer: vi.fn(),
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn(async () => {}),
  }

  const deviceSpies = {
    queue,
    lost: lost.promise,
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const buffer = { destroy: vi.fn(), size: descriptor.size }
      buffers.push(buffer)
      return buffer
    }),
    createShaderModule: vi.fn((descriptor: GPUShaderModuleDescriptor) => {
      const module = { code: descriptor.code }
      shaderModules.push(module)
      return module
    }),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => {
      pipelineDescriptors.push(descriptor)
      return { getBindGroupLayout: vi.fn(() => ({})) }
    }),
    createBindGroup: vi.fn((descriptor: GPUBindGroupDescriptor) => descriptor),
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({ kind: 'msaa-view' })),
      destroy: vi.fn(),
    })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn((descriptor: GPURenderPassDescriptor) => {
        renderPassDescriptors.push(descriptor)
        const pass = makePass()
        passes.push(pass)
        return pass
      }),
      finish: vi.fn(() => ({ kind: 'commands' })),
    })),
  }
  const device = deviceSpies as unknown as GPUDevice & typeof deviceSpies

  const contextSpies = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ kind: 'target-view' })) })),
  }
  const context = contextSpies as unknown as GPUCanvasContext & typeof contextSpies

  const canvasSpies = {
    width: 1,
    height: 1,
    style: { width: '', height: '' },
    getContext: vi.fn(() => context),
  }
  const canvas = canvasSpies as unknown as HTMLCanvasElement & typeof canvasSpies

  const adapterSpies = { requestDevice: vi.fn(async () => device) }
  const adapter = adapterSpies as unknown as GPUAdapter & typeof adapterSpies

  const gpuSpies = {
    requestAdapter: vi.fn(async () => adapter),
    getPreferredCanvasFormat: vi.fn((): GPUTextureFormat => 'bgra8unorm'),
  }
  const gpu = gpuSpies as unknown as GPU & typeof gpuSpies

  return {
    gpu,
    adapter,
    device,
    queue,
    context,
    canvas,
    passes,
    renderPassDescriptors,
    pipelineDescriptors,
    shaderModules,
    buffers,
    lost,
  }
}
