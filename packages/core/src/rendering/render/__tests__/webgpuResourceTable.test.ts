/** 验证 WebGPU 资源表按 key、revision 和容量复用 buffer 的行为。 */

import { describe, expect, it } from 'vitest'

import { createFrameMetrics } from '../frameMetrics'
import { createWebGPUResourceTable } from '../webgpuResourceTable'
import { createMockWebGPU } from './helpers/webgpuTestKit'

describe('createWebGPUResourceTable', () => {
  it('reuses buffer when revision unchanged', () => {
    const fake = createMockWebGPU()
    const metrics = createFrameMetrics()
    metrics.beginFrame()
    const table = createWebGPUResourceTable({ device: fake.device, metrics })
    const data = new Float32Array([1, 2, 3, 4])
    const a = table.ensureUploaded({ key: 'k', revision: 1, data, usage: 'vertex' })
    const b = table.ensureUploaded({ key: 'k', revision: 1, data, usage: 'vertex' })
    expect(a.buffer).toBe(b.buffer)
    expect(fake.device.createBuffer).toHaveBeenCalledTimes(1)
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(1)
  })

  it('uploads again when revision changes', () => {
    const fake = createMockWebGPU()
    const metrics = createFrameMetrics()
    metrics.beginFrame()
    const table = createWebGPUResourceTable({ device: fake.device, metrics })
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
