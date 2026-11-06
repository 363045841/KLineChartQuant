/** Script Worker 的异步执行接口与消息类型。 */
import type { Bar, PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../contracts/output.js'
import type { QuickJSLibrary, QuickJSScriptDefinition, ScriptParamValue } from '../quickjs/types.js'
import type { ScriptRequestContext, SecurityRequest } from '../request/types.js'
import type { PackedPlotCollection, RunInputPatch } from './transport/types.js'
import type { CompiledScriptSources } from '../execution/types.js'

/** 一个客户端持有一个 Worker；同一脚本 ID 再次准备成功后替换编译结果。 */
export interface ScriptWorker {
  prepare(
    id: string,
    source: string,
    libraries?: readonly QuickJSLibrary[],
    trusted?: boolean,
  ): Promise<QuickJSScriptDefinition>
  run(
    id: string,
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
    context?: ScriptRequestContext,
  ): Promise<PlotCollection>
  requests(
    id: string,
    params: Readonly<Record<string, ScriptParamValue>>,
    symbol: string,
  ): Promise<readonly SecurityRequest[]>
  release(id: string): Promise<void>
  dispose(): void
}

/** 线程池只配置资源上限和线程工厂，不接受指标轻重或行情版本参数。 */
export interface ScriptWorkerPoolOptions {
  readonly size?: number
  readonly createWorker?: () => ScriptWorker
  readonly onOutput?: (id: string, events: readonly LogEvent[]) => void
}

export type ScriptWorkerPool = Omit<ScriptWorker, 'run' | 'requests'> & {
  run(
    id: string,
    bars: Parameters<ScriptWorker['run']>[1],
    params?: Parameters<ScriptWorker['run']>[2],
    context?: Parameters<ScriptWorker['run']>[3],
    signal?: AbortSignal,
  ): ReturnType<ScriptWorker['run']>
  requests(
    id: string,
    params: Parameters<ScriptWorker['requests']>[1],
    symbol: string,
    signal?: AbortSignal,
  ): ReturnType<ScriptWorker['requests']>
}

/** 仅传递数据；编译闭包始终留在 Worker 内。 */
export type ScriptWorkerRequest = { readonly requestId: number; readonly id: string } & (
  | {
      readonly type: 'prepare'
      readonly module: CompiledScriptSources
      readonly trusted?: boolean
    }
  | {
      readonly type: 'run'
      readonly input: RunInputPatch
      readonly params?: Readonly<Record<string, ScriptParamValue>>
    }
  | {
      readonly type: 'requests'
      readonly params: Readonly<Record<string, ScriptParamValue>>
      readonly symbol: string
    }
  | { readonly type: 'release' }
)

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
  | { readonly type: 'prepare'; readonly definition: QuickJSScriptDefinition }
  | { readonly type: 'run'; readonly collection: PackedPlotCollection }
  | { readonly type: 'requests'; readonly requests: readonly SecurityRequest[] }
  | { readonly type: 'release' }
  | { readonly type: 'error'; readonly error: ScriptWorkerError }
)
