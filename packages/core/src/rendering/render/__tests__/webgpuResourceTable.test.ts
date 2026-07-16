import { describe, expect, it, vi } from 'vitest'

import { createFrameMetrics } from '../frameMetrics'
import { createWebGPUResourceTable } from '../webgpuResourceTable'

function makeDevice() {
  const buffers: Array<{ destroy: ReturnType<typeof vi.fn>; size: number }> = []
  const queue = {
    writeBuffer: vi.fn(),
  }
  const device = {
    queue,
    createBuffer: vi.fn(({ size }: { size: number }) => {
      const buffer = { destroy: vi.fn(), size }
      buffers.push(buffer)
      return buffer
    }),
  }
  return { device, queue, buffers }
}

describe('createWebGPUResourceTable', () => {
  it('reuses buffer when revision unchanged', () => {
    const fake = makeDevice()
    const metrics = createFrameMetrics()
    metrics.beginFrame()
    const table = createWebGPUResourceTable({
      device: fake.device as unknown as GPUDevice,
      metrics,
    })
    const data = new Float32Array([1, 2, 3, 4])
    const a = table.ensureUploaded({ key: 'k', revision: 1, data, usage: 'vertex' })
    const b = table.ensureUploaded({ key: 'k', revision: 1, data, usage: 'vertex' })
    expect(a.buffer).toBe(b.buffer)
    expect(fake.device.createBuffer).toHaveBeenCalledTimes(1)
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(1)
  })

  it('uploads again when revision changes', () => {
    const fake = makeDevice()
    const metrics = createFrameMetrics()
    metrics.beginFrame()
    const table = createWebGPUResourceTable({
      device: fake.device as unknown as GPUDevice,
      metrics,
    })
    table.ensureUploaded({
      key: 'k',
      revision: 1,
      data: new Float32Array([1, 2, 3, 4]),
      usage: 'vertex',
    })
    table.ensureUploaded({
      key: 'k',
      revision: 2,
      data: new Float32Array([5, 6, 7, 8]),
      usage: 'vertex',
    })
    expect(fake.device.createBuffer).toHaveBeenCalledTimes(1)
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(2)
  })
})
