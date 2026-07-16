import { describe, expect, it, vi } from 'vitest'

import { createWebGPURenderer } from '../createWebGPURenderer'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function makeWebGPU() {
  const passes: Array<ReturnType<typeof makePass>> = []
  const renderPassDescriptors: GPURenderPassDescriptor[] = []
  const pipelineDescriptors: GPURenderPipelineDescriptor[] = []
  const buffers: Array<{ destroy: ReturnType<typeof vi.fn> }> = []
  const lost = deferred<GPUDeviceLostInfo>()

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

  const queue = {
    writeBuffer: vi.fn(),
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn(async () => {}),
  }
  const device = {
    queue,
    lost: lost.promise,
    createBuffer: vi.fn(() => {
      const buffer = { destroy: vi.fn() }
      buffers.push(buffer)
      return buffer
    }),
    createShaderModule: vi.fn((descriptor) => descriptor),
    createRenderPipeline: vi.fn((descriptor: GPURenderPipelineDescriptor) => {
      pipelineDescriptors.push(descriptor)
      return { getBindGroupLayout: vi.fn(() => ({})) }
    }),
    createBindGroup: vi.fn((descriptor) => descriptor),
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
  const adapter = { requestDevice: vi.fn(async () => device) }
  const gpu = {
    requestAdapter: vi.fn(async () => adapter),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
  }
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({ createView: vi.fn(() => ({ kind: 'target-view' })) })),
  }
  const canvas = {
    width: 1,
    height: 1,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement

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
    buffers,
    lost,
  }
}

describe('createWebGPURenderer', () => {
  it('requests a device and reports MVP capabilities', async () => {
    const fake = makeWebGPU()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
    })

    expect(fake.gpu.requestAdapter).toHaveBeenCalledOnce()
    expect(fake.adapter.requestDevice).toHaveBeenCalledOnce()
    expect(renderer.caps).toMatchObject({ name: 'webgpu', compute: false, storageBuffer: false })
    expect(() => renderer.createComputePipeline({})).toThrow('compute not supported')
  })

  it('uploads owned buffers and delays destruction until submitted work completes', async () => {
    const fake = makeWebGPU()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
    })
    const handle = renderer.createBuffer('instance', 16)
    const data = new Float32Array([1, 2, 3, 4])

    renderer.writeBuffer(handle, data)
    renderer.destroyBuffer(handle)
    await Promise.resolve()
    await Promise.resolve()

    expect(fake.queue.writeBuffer).toHaveBeenCalledWith(fake.buffers[0], 0, data.buffer, 0, 16)
    expect(fake.queue.onSubmittedWorkDone).toHaveBeenCalledOnce()
    expect(fake.buffers[0]?.destroy).toHaveBeenCalledOnce()
  })

  it('draws rectangle instances into an MSAA region', async () => {
    const fake = makeWebGPU()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
    })
    renderer.surface.resize(200, 100, 2)
    renderer.beginFrame({ x: 10, y: 5, width: 80, height: 40, dpr: 2 })
    const vertices = renderer.createBuffer('vertex', 4)
    const instances = renderer.createBuffer('instance', 16)
    const pipeline = renderer.createPipeline({ type: 'candle' })

    const drawn = renderer.drawInstances({
      pipeline,
      vertices,
      instances,
      instanceCount: 3,
      vertexCount: 6,
      uniforms: { color: '#ff0000', scrollLeft: 4 },
    })

    expect(drawn).toBe(true)
    expect(fake.queue.submit).not.toHaveBeenCalled()
    renderer.endFrame()
    expect(fake.device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({ sampleCount: 4, format: 'bgra8unorm' }),
    )
    expect(fake.passes[0]?.setViewport).toHaveBeenCalledWith(20, 10, 160, 80, 0, 1)
    expect(fake.passes[0]?.setScissorRect).toHaveBeenCalledWith(20, 10, 160, 80)
    expect(fake.passes[0]?.draw).toHaveBeenCalledWith(6, 3)
    expect(fake.queue.submit).toHaveBeenCalledOnce()
  })

  it('records multiple draws and submits once on endFrame', async () => {
    const fake = makeWebGPU()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
    })
    renderer.surface.resize(200, 100, 1)
    renderer.beginFrame({ x: 0, y: 0, width: 200, height: 100, dpr: 1 })
    const pipeline = renderer.createPipeline({ type: 'candle' })
    const instances = renderer.createBuffer('instance', 16)
    renderer.writeBuffer(instances, new Float32Array([0, 0, 10, 20]))
    const vertices = renderer.createBuffer('vertex', 4)
    const params = {
      pipeline,
      vertices,
      instances,
      instanceCount: 1,
      vertexCount: 6,
      uniforms: { color: '#f00', scrollLeft: 0 },
    }

    expect(renderer.drawInstances(params)).toBe(true)
    expect(renderer.drawInstances(params)).toBe(true)
    expect(fake.queue.submit).not.toHaveBeenCalled()
    renderer.endFrame()
    expect(fake.queue.submit).toHaveBeenCalledTimes(1)
  })

  it('preserves earlier rectangle batches within the same frame', async () => {
    const fake = makeWebGPU()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
    })
    renderer.surface.resize(200, 100, 1)
    renderer.beginFrame({ x: 0, y: 0, width: 200, height: 100, dpr: 1 })
    const vertices = renderer.createBuffer('vertex', 4)
    const instances = renderer.createBuffer('instance', 16)
    const pipeline = renderer.createPipeline({ type: 'candle' })
    const params = {
      pipeline,
      vertices,
      instances,
      instanceCount: 1,
      vertexCount: 6,
      uniforms: { color: '#ff0000' },
    }

    expect(renderer.drawInstances(params)).toBe(true)
    expect(renderer.drawInstances(params)).toBe(true)
    renderer.endFrame()

    expect(fake.renderPassDescriptors).toHaveLength(1)
    expect(fake.renderPassDescriptors[0]?.colorAttachments[0]).toMatchObject({
      loadOp: 'clear',
      storeOp: 'store',
    })
    expect(fake.passes[0]?.draw).toHaveBeenCalledTimes(2)
  })

  it('draws multiple line strips in one render pass', async () => {
    const fake = makeWebGPU()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
    })
    renderer.surface.resize(200, 100, 1)
    renderer.beginFrame({ x: 0, y: 0, width: 200, height: 100, dpr: 1 })
    const pipeline = renderer.createPipeline({ type: 'line' })

    const drawn = renderer.drawLines({
      pipeline,
      strips: [
        {
          points: [
            { x: 0, y: 1 },
            { x: 2, y: 3 },
          ],
          color: '#f00',
          width: 1,
        },
        {
          points: [
            { x: 4, y: 5 },
            { x: 6, y: 7 },
          ],
          color: '#0f0',
          width: 2,
        },
      ],
      uniforms: { scrollLeft: 12 },
    })

    expect(drawn).toBe(true)
    expect(fake.queue.submit).not.toHaveBeenCalled()
    renderer.endFrame()
    expect(fake.passes).toHaveLength(1)
    expect(fake.passes[0]?.draw).toHaveBeenCalledTimes(2)
    const uniformWrites = fake.queue.writeBuffer.mock.calls.filter((call) => call[4] === 32)
    expect(uniformWrites).toHaveLength(2)
    for (const call of uniformWrites) {
      expect(new Float32Array(call[2] as ArrayBuffer)[2]).toBe(12)
    }
    expect(fake.queue.submit).toHaveBeenCalledOnce()
  })

  it('uses triangle-strip for filled bands and reports device loss', async () => {
    const fake = makeWebGPU()
    const onDeviceLost = vi.fn()
    const renderer = await createWebGPURenderer({
      gpu: fake.gpu as unknown as GPU,
      canvas: fake.canvas,
      onDeviceLost,
    })
    renderer.surface.resize(100, 100, 1)
    renderer.beginFrame({ x: 0, y: 0, width: 100, height: 100, dpr: 1 })
    const vertices = renderer.createBuffer('vertex', 32)
    const pipeline = renderer.createPipeline({ type: 'fill' })

    expect(renderer.drawLines({ pipeline, vertices, vertexCount: 4 })).toBe(true)
    renderer.endFrame()
    expect(
      fake.pipelineDescriptors.some((item) => item.primitive?.topology === 'triangle-strip'),
    ).toBe(true)

    const info = { reason: 'unknown', message: 'device reset' } as GPUDeviceLostInfo
    fake.lost.resolve(info)
    await Promise.resolve()
    expect(onDeviceLost).toHaveBeenCalledWith(info)
  })
})
