/** Script Worker 的异步执行接口与消息协议。 */
import type {
  Bar,
  ComputeRange,
  IndicatorSeries,
  ScriptAlertEvent,
} from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../contracts/log.js'
import type { CompiledScriptSources } from '../execution/types.js'
import type {
  PreparedScriptDefinition,
  QuickJSLibrary,
  ScriptParamValue,
} from '../quickjs/types.js'
import type { ScriptRequestContext, SecurityRequest } from '../request/types.js'
import type { PackedIndicatorSeries, RunInputPatch } from './transport/types.js'

/** 一次 Worker 计算的结果；告警事件与序列一起返回，便于统一抛回。 */
export interface ScriptRunResult {
  readonly series: IndicatorSeries
  readonly alerts: readonly ScriptAlertEvent[]
}

/**
 * 一条脚本执行线程。
 *
 * 浏览器实现包装 Web Worker，Node 实现包装 `worker_threads`；库内只使用这组方法，
 * 不感知线程由谁创建。事件订阅不支持解绑，关闭后由调用方的状态位忽略迟到事件。
 */
export interface ScriptThread {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void
  onMessage(listener: (data: unknown) => void): void
  onError(listener: (error: Error) => void): void
  onMessageError(listener: () => void): void
  terminate(): void
}

/** 一个客户端持有一个 Worker；同一脚本 ID 再次准备成功会替换旧定义。 */
export interface ScriptWorker {
  prepare(
    id: string,
    source: string,
    libraries?: readonly QuickJSLibrary[],
    trusted?: boolean,
    /** metadata 只读取参数与声明；执行会话在 execution 时同时安装运行态。 */
    mode?: 'metadata' | 'execution',
  ): Promise<PreparedScriptDefinition>
  run(
    id: string,
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
    context?: ScriptRequestContext,
    range?: ComputeRange,
    live?: boolean,
  ): Promise<ScriptRunResult>
  requests(
    id: string,
    params: Readonly<Record<string, ScriptParamValue>>,
    symbol: string,
  ): Promise<readonly SecurityRequest[]>
  release(id: string): Promise<void>
  dispose(): void
}

/** 线程池只做资源上限与线程管理，不识别指标、行情版本或任务轻重。 */
export interface ScriptWorkerPoolOptions {
  /** 执行线程数量；由宿主显式给出。 */
  readonly size: number
  /** 创建一条执行线程。 */
  readonly createThread: () => ScriptThread
  /** 创建编译线程；池持有并在销毁时关闭。 */
  readonly createCompilerThread: () => ScriptThread
  /** 脚本输出回调；由宿主决定转发到哪。 */
  readonly onOutput: (id: string, events: readonly LogEvent[]) => void
}

export type ScriptWorkerPool = Omit<ScriptWorker, 'run' | 'requests'> & {
  run(
    id: string,
    bars: Parameters<ScriptWorker['run']>[1],
    params?: Parameters<ScriptWorker['run']>[2],
    context?: Parameters<ScriptWorker['run']>[3],
    range?: Parameters<ScriptWorker['run']>[4],
    signal?: AbortSignal,
    live?: Parameters<ScriptWorker['run']>[5],
  ): ReturnType<ScriptWorker['run']>
  requests(
    id: string,
    params: Parameters<ScriptWorker['requests']>[1],
    symbol: string,
    signal?: AbortSignal,
  ): ReturnType<ScriptWorker['requests']>
}

/** 池创建时由执行器提供的运行期回调；宿主据此绑定自己的线程配置。 */
export interface ScriptWorkerPoolRuntime {
  readonly onOutput: (id: string, events: readonly LogEvent[]) => void
}

/** 宿主提供的 Worker 池工厂；浏览器用 Web Worker，Node 用 worker_threads。 */
export type ScriptWorkerPoolFactory = (runtime: ScriptWorkerPoolRuntime) => ScriptWorkerPool

/** 仅传递数据；编译闭包始终留在 Worker 内。 */
export type ScriptWorkerRequest = { readonly requestId: number; readonly id: string } & (
  | {
      readonly type: 'prepare'
      readonly module: CompiledScriptSources
      readonly trusted?: boolean
      /** 读取声明后立即释放临时运行态，不安装计算会话。 */
      readonly metadataOnly?: boolean
    }
  | {
      readonly type: 'run'
      readonly input: RunInputPatch
      readonly params?: Readonly<Record<string, ScriptParamValue>>
      readonly range?: ComputeRange
      /** 最后一根 bar 是否为实时 bar；true 时只有最后一根允许产生警报。 */
      readonly live?: boolean
    }
  | {
      readonly type: 'requests'
      readonly params: Readonly<Record<string, ScriptParamValue>>
      readonly symbol: string
    }
  | { readonly type: 'release' }
)

/** 绘图增量传输：reset 整体替换，否则按 id 合并 upsert 并删除 remove。 */
export interface PackedDrawingDelta {
  readonly reset: boolean
  readonly remove: readonly string[]
  readonly series: PackedIndicatorSeries
}

/** 显式保留脚本错误的诊断字段，避免结构化克隆丢失自定义属性。 */
export interface ScriptWorkerError {
  readonly name: string
  readonly message: string
  readonly stack?: string
  readonly code?: string
  readonly plotName?: string
  readonly barIndex?: number
}

/** 请求 ID 关联一次响应，不增加握手或版本协商。 */
export type ScriptWorkerResponse = { readonly requestId: number } & (
  | { readonly type: 'output'; readonly id: string; readonly events: readonly LogEvent[] }
  | { readonly type: 'prepare'; readonly definition: PreparedScriptDefinition }
  | {
      readonly type: 'run'
      readonly series: PackedIndicatorSeries
      readonly drawingDelta: PackedDrawingDelta
      readonly alerts: readonly ScriptAlertEvent[]
    }
  | { readonly type: 'requests'; readonly requests: readonly SecurityRequest[] }
  | { readonly type: 'release' }
  | { readonly type: 'error'; readonly error: ScriptWorkerError }
)
