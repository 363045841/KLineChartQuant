/** 脚本执行会话的公共契约：一次准备对应一个常驻运行时，行情按 bar 增量执行。 */
import type { Bar, DrawingObject, PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/output.js'
import type { QuickJSScriptDefinition, ScriptParamValue } from '../../quickjs/types.js'
import type {
  RequestExecution,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../../request/types.js'

/** 一次运行产出的绘图增量；消费端按 id 合并，reset 表示整体替换。 */
export interface DrawingPatch {
  readonly reset: boolean
  readonly upsert: readonly DrawingObject[]
  readonly remove: readonly string[]
}

/** 运行时执行一段 bar 的输入；startIndex/endIndex 为左闭右开。 */
export interface ScriptRuntimeExecuteOptions {
  readonly bars: readonly Bar[]
  readonly startIndex: number
  readonly endIndex: number
  readonly params: Readonly<Record<string, ScriptParamValue>>
  readonly execution: RequestExecution
  readonly emit?: (event: LogEvent) => void
  /** 最后一根 bar 之前的状态下标；库在完成期渲染后用它提交检查点。 */
  readonly checkpointIndex?: number
}

/** 运行时执行结果；values 只对 request 表达式运行时有意义。 */
export interface ScriptRuntimeExecuteResult<Checkpoint = never> {
  readonly collection: PlotCollection
  readonly values: readonly RequestValue[]
  /** 库在本次运行中提交的新检查点；未提交时沿用调用方的检查点。 */
  readonly checkpoint?: Checkpoint
}

/** 后端运行时：原生与 QuickJS 共用同一增量执行与回滚协议。 */
export interface ScriptRuntime<Checkpoint> {
  readonly definition: QuickJSScriptDefinition
  /** 顶层声明的请求计划；参数或品种变化时由会话重建运行时。 */
  requests(): readonly SecurityRequest[]
  /** 执行 [startIndex, endIndex) 区间；调用方保证区间之前的运行态已就绪。 */
  execute(options: ScriptRuntimeExecuteOptions): ScriptRuntimeExecuteResult<Checkpoint>
  /** 记录当前运行态；由会话在最后一根 bar 之前调用。 */
  checkpoint(): Checkpoint
  /** 恢复到检查点；同一根 bar 更新时复用历史状态。 */
  rollback(checkpoint: Checkpoint): void
  /** 取走本次运行的绘图增量；reset 表示消费端必须整体替换。 */
  drawingPatch(reset: boolean): DrawingPatch
  dispose(): void
}

/** 运行时工厂输入；表达式运行时的 expressionId 非空，主运行时为空。 */
export interface ScriptRuntimeFactoryOptions {
  readonly expressionId?: string
  readonly params: Readonly<Record<string, ScriptParamValue>>
  readonly symbol: string
}

/** 后端运行时工厂；会话按参数、品种和表达式身份创建常驻运行时。 */
export type ScriptRuntimeFactory<Checkpoint> = (
  options: ScriptRuntimeFactoryOptions,
) => ScriptRuntime<Checkpoint>

/** 会话运行输入；startIndex 由传输层提供，缺省时按行情值比较。 */
export interface ScriptSessionRunOptions {
  readonly bars: readonly Bar[]
  readonly params?: Readonly<Record<string, ScriptParamValue>>
  readonly context?: ScriptRequestContext
  readonly startIndex?: number
}

/** 会话运行输出；collection 含完整绘图，drawingPatch 是本次增量。 */
export interface ScriptSessionOutput {
  readonly collection: PlotCollection
  readonly drawingPatch: DrawingPatch
}

/** 脚本执行会话：宿主唯一入口，不暴露运行时细节。 */
export interface ScriptExecutionSession {
  readonly definition: QuickJSScriptDefinition
  requests(
    params: Readonly<Record<string, ScriptParamValue>>,
    symbol: string,
  ): readonly SecurityRequest[]
  run(options: ScriptSessionRunOptions): ScriptSessionOutput
  dispose(): void
}
