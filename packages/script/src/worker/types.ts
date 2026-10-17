/** Script Worker 的异步执行接口与消息类型。 */
import type { Bar, PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { QuickJSLibrary, QuickJSScriptDefinition, ScriptParamValue } from '../quickjs/types.js'
import type { ScriptRequestContext, SecurityRequest } from '../request/types.js'

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

/** 仅传递数据；编译闭包始终留在 Worker 内。 */
export type ScriptWorkerRequest = { readonly requestId: number; readonly id: string } & (
  | {
      readonly type: 'prepare'
      readonly source: string
      readonly libraries?: readonly QuickJSLibrary[]
      readonly trusted?: boolean
    }
  | {
      readonly type: 'run'
      readonly bars: readonly Bar[]
      readonly params?: Readonly<Record<string, ScriptParamValue>>
      readonly context?: ScriptRequestContext
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
  | { readonly type: 'prepare'; readonly definition: QuickJSScriptDefinition }
  | { readonly type: 'run'; readonly collection: PlotCollection }
  | { readonly type: 'requests'; readonly requests: readonly SecurityRequest[] }
  | { readonly type: 'release' }
  | { readonly type: 'error'; readonly error: ScriptWorkerError }
)
