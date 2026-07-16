import type { createFrameMetrics } from './frameMetrics'

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
}

export type WebGPUResourceTable = {
  ensureUploaded(params: EnsureUploadedParams): GpuResourceHandle
  destroyKey(key: string): void
  destroyAll(): void
}

const GPU_BUFFER_COPY_DST = globalThis.GPUBufferUsage?.COPY_DST ?? 0x0008
const GPU_BUFFER_VERTEX = globalThis.GPUBufferUsage?.VERTEX ?? 0x0020
const GPU_BUFFER_UNIFORM = globalThis.GPUBufferUsage?.UNIFORM ?? 0x0040

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
      }
      return resource
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
