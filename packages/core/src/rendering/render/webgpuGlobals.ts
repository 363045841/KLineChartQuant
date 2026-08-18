/**
 * WebGPU 全局常量安全访问。
 * DOM lib 仅将 GPUBufferUsage 等声明为类型命名空间，不挂在 typeof globalThis 上，
 * 且 WebGPU 未启用时运行时全局对象缺失，需通过可选链回退到硬编码位值。
 */

type GpuGlobal = typeof globalThis & {
  readonly GPUBufferUsage?: {
    readonly COPY_DST?: number
    readonly INDEX?: number
    readonly VERTEX?: number
    readonly UNIFORM?: number
    readonly STORAGE?: number
  }
  readonly GPUTextureUsage?: { readonly RENDER_ATTACHMENT?: number }
}

const gpu = globalThis as GpuGlobal

export const GPU_BUFFER_COPY_DST = gpu.GPUBufferUsage?.COPY_DST ?? 0x0008
export const GPU_BUFFER_INDEX = gpu.GPUBufferUsage?.INDEX ?? 0x0010
export const GPU_BUFFER_VERTEX = gpu.GPUBufferUsage?.VERTEX ?? 0x0020
export const GPU_BUFFER_UNIFORM = gpu.GPUBufferUsage?.UNIFORM ?? 0x0040
export const GPU_BUFFER_STORAGE = gpu.GPUBufferUsage?.STORAGE ?? 0x0080
export const GPU_TEXTURE_RENDER_ATTACHMENT = gpu.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10