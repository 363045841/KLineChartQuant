/** 按 key 和 revision 缓存 WebGPU buffer，避免重复创建和上传。 */

import type { createFrameMetrics } from './frameMetrics.js'
import { GPU_BUFFER_COPY_DST, GPU_BUFFER_UNIFORM, GPU_BUFFER_VERTEX } from './webgpuGlobals.js'

type Metrics = ReturnType<typeof createFrameMetrics>

export type ResourceUsage = 'vertex' | 'instance' | 'uniform'

export type EnsureUploadedParams = {
  key: string
  revision: number
  data: Float32Array
  usage: ResourceUsage
}

export type GpuResourceHandle = {
  buffer: GPUBuffer
  capacity: number
  lastRevision: number
  uploadedBits?: Uint32Array
}

export type WebGPUResourceTable = {
  ensureUploaded(params: EnsureUploadedParams): GpuResourceHandle
  ensureUploadedExact(params: Omit<EnsureUploadedParams, 'revision'>): GpuResourceHandle
  /** 接管新建的顶点数组；调用后不得再修改该数组或其底层 ArrayBuffer。 */
  ensureUploadedOwnedExact(params: Omit<EnsureUploadedParams, 'revision'>): GpuResourceHandle
  destroyKey(key: string): void
  destroyAll(): void
}

function gpuUsage(usage: ResourceUsage): GPUBufferUsageFlags {
  if (usage === 'uniform') return GPU_BUFFER_UNIFORM | GPU_BUFFER_COPY_DST
  return GPU_BUFFER_VERTEX | GPU_BUFFER_COPY_DST
}

function growCapacity(needed: number, existing: number): number {
  let capacity = Math.max(4, existing || 4)
  while (capacity < needed) capacity = Math.ceil(capacity * 1.5)
  return Math.ceil(capacity / 4) * 4
}

export function createWebGPUResourceTable(options: {
  device: GPUDevice
  metrics?: Metrics
}): WebGPUResourceTable {
  const { device, metrics } = options
  const resources = new Map<string, GpuResourceHandle>()

  function ensureExact(
    { key, data, usage }: Omit<EnsureUploadedParams, 'revision'>,
    takeOwnership: boolean,
  ): GpuResourceHandle {
    const byteLength = data.byteLength
    let resource = resources.get(key)
    if (!resource || resource.capacity < byteLength) {
      resource?.buffer.destroy()
      const capacity = growCapacity(byteLength, resource?.capacity ?? 0)
      resource = {
        buffer: device.createBuffer({ size: capacity, usage: gpuUsage(usage) }),
        capacity,
        lastRevision: -1,
      }
      metrics?.recordBufferCreate()
      resources.set(key, resource)
    }
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.length)
    const previous = resource.uploadedBits
    let changed = !previous || previous.length !== bits.length
    if (!changed && previous) {
      for (let i = 0; i < bits.length; i++) {
        if (bits[i] !== previous[i]) {
          changed = true
          break
        }
      }
    }
    if (changed) {
      device.queue.writeBuffer(resource.buffer, 0, data.buffer as ArrayBuffer, data.byteOffset, byteLength)
      metrics?.recordUpload(byteLength)
      // 折线几何由 renderer 每次新建，可直接保存其位型视图，省去第二次全量复制。
      if (takeOwnership) resource.uploadedBits = bits
      else if (!previous || previous.length !== bits.length) resource.uploadedBits = new Uint32Array(bits)
      else previous.set(bits)
      resource.lastRevision = -1
    }
    return resource
  }

  return {
    ensureUploaded({ key, revision, data, usage }): GpuResourceHandle {
      const byteLength = data.byteLength
      let resource = resources.get(key)
      if (!resource || resource.capacity < byteLength) {
        resource?.buffer.destroy()
        const capacity = growCapacity(byteLength, resource?.capacity ?? 0)
        const buffer = device.createBuffer({
          size: capacity,
          usage: gpuUsage(usage),
        })
        metrics?.recordBufferCreate()
        resource = { buffer, capacity, lastRevision: -1 }
        resources.set(key, resource)
      }
      if (resource.lastRevision !== revision) {
        device.queue.writeBuffer(
          resource.buffer,
          0,
          data.buffer as ArrayBuffer,
          data.byteOffset,
          data.byteLength,
        )
        metrics?.recordUpload(byteLength)
        resource.lastRevision = revision
        resource.uploadedBits = undefined
      }
      return resource
    },
    ensureUploadedExact(params): GpuResourceHandle {
      return ensureExact(params, false)
    },
    ensureUploadedOwnedExact(params): GpuResourceHandle {
      return ensureExact(params, true)
    },
    destroyKey(key): void {
      const resource = resources.get(key)
      if (!resource) return
      resource.buffer.destroy()
      resources.delete(key)
    },
    destroyAll(): void {
      for (const resource of resources.values()) resource.buffer.destroy()
      resources.clear()
    },
  }
}
