/**
 * 渲染器接口 — Scene 各层（蜡烛、指标、drawing 等）通过它画图。
 *
 * WebGL 和 WebGPU 实现同一套接口。调用方只走 sceneRenderer（返回 false 时 fail-closed 降级 Canvas2D），不走双路径。
 *
 * 设计说明：
 * - drawInstances 是主力：一份 unit geometry 配 instance buffer 渲染 N 份。
 *   蜡烛、成交量柱、footprint 格子、heatmap 磁贴都归约为 instanced 图元。
 * - drawLines 画 MA-style 折线、drawing、坐标轴。
 * - dispatchCompute 只有 WebGPU 有；WebGL 实现会抛异常，调用方先查 caps.compute。
 * - uniform 布局由各 shader/pipeline 自行定义，接口不做 schema 约束。
 */

import type { SurfaceBackend, SurfaceRegion } from './SurfaceBackend'

/** 后端上报的能力位，调用方据此分支 */
export type RendererCapabilities = {
  /** WebGPU compute shader 是否可用；WebGL 返回 false */
  compute: boolean
  /** storage buffer 是否可用 */
  storageBuffer: boolean
  /** 单次 drawInstances 上限（引擎强加） */
  maxInstances: number
  /** 名称，如 "webgl2" 或 "webgpu" */
  name: string
}

/**
 * 各后端（WebGL/WebGPU/Canvas2D）都实现的绘制接口。
 * 后端持有 GPU 资源，调用方通过不透明 handle 操作。
 */
export interface Renderer {
  /** 底层 surface，用于 region 绑定和最终合成 */
  readonly surface: SurfaceBackend

  /** 能力位标志 */
  readonly caps: RendererCapabilities

  // --- 资源生命周期 ---

  createBuffer(usage: BufferUsage, sizeBytes: number): BufferHandle
  writeBuffer(handle: BufferHandle, data: ArrayBufferView, offsetBytes?: number): void
  destroyBuffer(handle: BufferHandle): void

  /** 编译 shader pipeline。descriptor 格式后端自定，适配层通常提供工厂函数（如 createCandlePipeline） */
  createPipeline(descriptor: unknown): PipelineHandle
  destroyPipeline(handle: PipelineHandle): void

  /** WebGPU only — WebGL 会抛异常 */
  createComputePipeline(descriptor: unknown): ComputePipelineHandle
  destroyComputePipeline(handle: ComputePipelineHandle): void

  // --- 帧 ---

  beginFrame(region: SurfaceRegion): void
  /**
   * 返回 true 表示本批已成功提交 GPU（或 instanceCount<=0 无需绘制）。
   * 返回 false 表示未画上（无 surface / pipeline 不匹配 / 资源缺失）——调用方应 fail-closed 走 2D。
   */
  drawInstances(params: DrawInstancesParams): boolean
  /**
   * 返回 true 表示本批折线/填充已成功提交 GPU。
   * 返回 false 表示未画上——调用方应 fail-closed 走 2D。
   */
  drawLines(params: DrawLinesParams): boolean
  /** WebGPU only — WebGL 会抛异常，调用方先查 caps */
  dispatchCompute(params: DispatchComputeParams): void
  endFrame(): void

  dispose(): void
}

/** 不透明 buffer handle，后端持有 GPU 资源 */
export type BufferHandle = { readonly __brand: 'BufferHandle' }
/** 不透明 pipeline handle */
export type PipelineHandle = { readonly __brand: 'PipelineHandle' }
/** WebGPU compute pipeline handle */
export type ComputePipelineHandle = { readonly __brand: 'ComputePipelineHandle' }

export type BufferUsage = 'vertex' | 'instance' | 'index' | 'uniform' | 'storage'

export type DrawInstancesParams = {
  pipeline: PipelineHandle
  /** 所有 instance 共享的 unit geometry（如一个矩形） */
  vertices: BufferHandle
  /** 每个 instance 的属性 buffer（如一行 K 线数据） */
  instances: BufferHandle
  /** 绘制多少个 instance */
  instanceCount: number
  /** 每个 instance 的顶点数（quad 用 4，triangle 用 6） */
  vertexCount: number
  /** uniform 块，后端自行解译 */
  uniforms?: Record<string, unknown>
}

export type DrawLineStrip = {
  points: ReadonlyArray<{ x: number; y: number }>
  color: string
  width?: number
}

export type DrawLinesParams = {
  pipeline: PipelineHandle
  /**
   * 单 strip 路径：vertices 为交错 x,y Float32。
   * 若提供 strips，则忽略 vertices/vertexCount，一次 GPU 提交多条（避免 MSAA 逐条 clear）。
   */
  vertices?: BufferHandle
  vertexCount?: number
  /** strip 连续折线 / list 独立线段 */
  topology?: 'strip' | 'list'
  /** 多色折线批量（推荐 MA 等多周期） */
  strips?: ReadonlyArray<DrawLineStrip>
  uniforms?: Record<string, unknown>
}

export type DispatchComputeParams = {
  pipeline: ComputePipelineHandle
  /** 各轴 workgroup 数 */
  workgroups: [number, number?, number?]
  /** 输入/输出 buffer 绑定，key 为 binding index */
  bindings: Record<number, BufferHandle>
  uniforms?: Record<string, unknown>
}
