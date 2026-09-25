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

  it('compares uploaded float32 bits and handles changes without a hash', () => {
    const fake = createMockWebGPU()
    const table = createWebGPUResourceTable({ device: fake.device })
    const initial = new Float32Array([1, 2, 0, 4])
    const first = table.ensureUploadedExact({ key: 'strip', data: initial, usage: 'vertex' })
    initial[1] = 3 // callers may reuse and mutate their input array
    table.ensureUploadedExact({ key: 'strip', data: initial, usage: 'vertex' })
    table.ensureUploadedExact({ key: 'strip', data: new Float32Array([1, 3, 0, 4]), usage: 'vertex' })
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(2)

    const signedZero = new Float32Array([1, 3, -0, 4])
    table.ensureUploadedExact({ key: 'strip', data: signedZero, usage: 'vertex' })
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(3)
    const shorter = new Float32Array([1, 3])
    table.ensureUploadedExact({ key: 'strip', data: shorter, usage: 'vertex' })
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(4)
    expect(fake.device.createBuffer).toHaveBeenCalledTimes(1)
    expect(first.buffer).toBe(table.ensureUploadedExact({ key: 'strip', data: shorter, usage: 'vertex' }).buffer)
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(4)
  })

  it('takes ownership of fresh geometry without copying it after upload', () => {
    const fake = createMockWebGPU()
    const table = createWebGPUResourceTable({ device: fake.device })
    const firstData = new Float32Array([99, 1, 2, 3, 4]).subarray(1)
    const first = table.ensureUploadedOwnedExact({ key: 'strip', data: firstData, usage: 'vertex' })
    expect(first.uploadedBits?.buffer).toBe(firstData.buffer)
    expect(first.uploadedBits?.byteOffset).toBe(firstData.byteOffset)

    const same = new Float32Array([1, 2, 3, 4])
    table.ensureUploadedOwnedExact({ key: 'strip', data: same, usage: 'vertex' })
    expect(first.uploadedBits?.buffer).toBe(firstData.buffer)
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(1)

    const changed = new Float32Array([1, 2, -0, 4])
    table.ensureUploadedOwnedExact({ key: 'strip', data: changed, usage: 'vertex' })
    expect(first.uploadedBits?.buffer).toBe(changed.buffer)
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(2)
    table.ensureUploadedOwnedExact({ key: 'strip', data: new Float32Array([1, 2]), usage: 'vertex' })
    expect(fake.queue.writeBuffer).toHaveBeenCalledTimes(3)
  })
})
