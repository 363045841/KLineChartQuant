/**
 * 渲染后端的共享测试夹具：SurfaceBackend、SharedWebGLSurface 与 Renderer 的 spy 化替身。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 *
 * 约束：项目自有接口（SurfaceBackend / Renderer）用 satisfies 全量约束，成员缺失在编译期暴露；
 * SharedWebGLSurface 是含私有字段的 class，结构化对象无法满足其类型，
 * 只在 createMockSharedWebGLSurface 内保留唯一一处集中强转。
 */
import { vi } from 'vitest'

import type { SharedWebGLSurface } from '@/engine/renderers/webgl/sharedWebGLSurface'

import type {
  BufferHandle,
  BufferUsage,
  ComputePipelineHandle,
  DispatchComputeParams,
  DrawInstancesParams,
  DrawLinesParams,
  PipelineHandle,
  Renderer,
} from '../../Renderer'
import type { SurfaceBackend, SurfaceRegion } from '../../SurfaceBackend'

/** 最小 canvas 替身；core 默认 node 环境无 DOM，此强转集中在本夹具内。 */
const MOCK_CANVAS = { width: 0, height: 0 } as unknown as HTMLCanvasElement

/** 构造可观测的 SurfaceBackend 替身；dispose 后 isAvailable 与 bindRegion 变为不可用。 */
export function createMockSurfaceBackend() {
  let disposed = false
  return {
    isAvailable: vi.fn((): boolean => !disposed),
    resize: vi.fn(),
    bindRegion: vi.fn((region: SurfaceRegion): boolean => {
      if (disposed) return false
      return region.width > 0 && region.height > 0
    }),
    clearRegion: vi.fn(),
    compositeTo: vi.fn(),
    dispose: vi.fn(() => {
      disposed = true
    }),
  } satisfies SurfaceBackend
}

export type MockSurfaceBackend = ReturnType<typeof createMockSurfaceBackend>

/** SharedWebGLSurface 替身入参。 */
export interface MockSharedWebGLSurfaceOptions {
  /** 是否可用；false 用于 fail-closed 场景，bindRegion/beginFrame 一并返回 false。 */
  available?: boolean
}

/** SharedWebGLSurface 的 spy 集合；返回类型用于推导 MockSharedWebGLSurface。 */
function createSharedWebGLSurfaceSpies(options: MockSharedWebGLSurfaceOptions) {
  const { available = true } = options
  let disposed = false
  return {
    isAvailable: vi.fn((): boolean => available && !disposed),
    getGL: vi.fn((): null => null),
    getCanvas: vi.fn((): HTMLCanvasElement => MOCK_CANVAS),
    resize: vi.fn(),
    getPhysicalRegion: vi.fn(() => null),
    beginFrame: vi.fn((): boolean => available && !disposed),
    bindRegion: vi.fn(
      (region: SurfaceRegion): boolean =>
        available && !disposed && region.width > 0 && region.height > 0,
    ),
    clearRegion: vi.fn(),
    endFrame: vi.fn(),
    compositeRegionTo: vi.fn(),
    destroy: vi.fn(() => {
      disposed = true
    }),
  }
}

/** SharedWebGLSurface 与 spy 的交集；可直接传入后端工厂，同时保留调用断言能力。 */
export type MockSharedWebGLSurface = SharedWebGLSurface &
  ReturnType<typeof createSharedWebGLSurfaceSpies>

/** 构造可观测的 SharedWebGLSurface 替身；destroy 后 isAvailable 变为 false。 */
export function createMockSharedWebGLSurface(
  options: MockSharedWebGLSurfaceOptions = {},
): MockSharedWebGLSurface {
  // SharedWebGLSurface 含私有字段，结构化对象无法直接满足；强转集中在此。
  return createSharedWebGLSurfaceSpies(options) as unknown as MockSharedWebGLSurface
}

/** Renderer 替身入参。 */
export interface MockRendererOptions {
  /** caps.name；'webgpu' 用于可见 GPU canvas 分支。 */
  capsName?: string
}

/** 构造完整的 Renderer spy 替身；drawInstances/drawLines 默认成功。 */
export function createMockRenderer(options: MockRendererOptions = {}) {
  const { capsName = 'webgl2' } = options
  return {
    surface: createMockSurfaceBackend(),
    caps: { compute: false, storageBuffer: false, maxInstances: 1_000_000, name: capsName },
    createBuffer: vi.fn(
      (_usage: BufferUsage, _sizeBytes: number): BufferHandle => ({
        __brand: 'BufferHandle',
      }),
    ),
    writeBuffer: vi.fn(
      (_handle: BufferHandle, _data: ArrayBufferView, _offsetBytes?: number) => {},
    ),
    destroyBuffer: vi.fn((_handle: BufferHandle) => {}),
    createPipeline: vi.fn(
      (_descriptor: unknown): PipelineHandle => ({ __brand: 'PipelineHandle' }),
    ),
    destroyPipeline: vi.fn((_handle: PipelineHandle) => {}),
    createComputePipeline: vi.fn((_descriptor: unknown): ComputePipelineHandle => {
      throw new Error('compute not supported')
    }),
    destroyComputePipeline: vi.fn((_handle: ComputePipelineHandle) => {}),
    beginFrame: vi.fn((_region: SurfaceRegion, _options?: { clear?: boolean }) => {}),
    drawInstances: vi.fn((_params: DrawInstancesParams): boolean => true),
    drawLines: vi.fn((_params: DrawLinesParams): boolean => true),
    dispatchCompute: vi.fn((_params: DispatchComputeParams) => {}),
    endFrame: vi.fn(() => {}),
    dispose: vi.fn(() => {}),
  } satisfies Renderer
}

export type MockRenderer = ReturnType<typeof createMockRenderer>
