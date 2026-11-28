/** 脚本执行会话的公共契约：一次准备对应一个常驻运行时，行情按变化事件推进。 */
import type {
  Bar,
  ComputeChange,
  DrawingObject,
  IndicatorSeries,
  ScriptAlertEvent,
} from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/log.js'
import type { QuickJSScriptDefinition, ScriptParamValue } from '../../quickjs/types.js'
import type {
  RequestExecution,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../../request/types.js'

/** 一次运行产出的绘图增量；消费端按 id 合并，reset 表示整体替换。 */
export interface DrawingDelta {
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
  /** 本次更新的实时末根下标；省略时整段是历史。 */
  readonly liveBarIndex?: number
  /** 当前实时 bar 上一次更新的价格。 */
  readonly prevPrice?: number
  /** 最后一根 bar 之前的状态下标；库在完成期渲染后用它提交检查点。 */
  readonly checkpointIndex?: number
}

/** 运行时执行结果；values 只对 request 表达式运行时有意义。 */
export interface ScriptRuntimeExecuteResult<Checkpoint = never> {
  readonly series: IndicatorSeries
  readonly values: readonly RequestValue[]
  readonly alerts: readonly ScriptAlertEvent[]
  /** 库在本次运行中提交的新检查点；未提交时沿用调用方的检查点。 */
  readonly checkpoint?: Checkpoint
}

/** 后端运行时：原生与 QuickJS 共用同一区间执行与回滚协议。 */
export interface ScriptRuntime<Checkpoint> {
  readonly definition: QuickJSScriptDefinition
  /** 顶层声明的请求计划；参数或品种变化时由会话重建运行时。 */
  requests(): readonly SecurityRequest[]
  /** 执行 [startIndex, endIndex) 区间；调用方保证区间之前的运行态已就绪。 */
  execute(options: ScriptRuntimeExecuteOptions): ScriptRuntimeExecuteResult<Checkpoint>
  /** 记录进入指定下标之前的状态；由会话在末根执行前调用。 */
  checkpoint(): Checkpoint
  /** 恢复到检查点；同一根 bar 更新时复用历史状态。 */
  rollback(checkpoint: Checkpoint): void
  /** 取走本次运行的绘图增量；reset 表示消费端必须整体替换。 */
  drawingDelta(reset: boolean): DrawingDelta
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

/** 会话运行输入；变化由数据层给出，会话不再自行比较行情。 */
export interface ScriptSessionRunOptions {
  readonly bars: readonly Bar[]
  readonly change: ComputeChange
  readonly params?: Readonly<Record<string, ScriptParamValue>>
  readonly context?: ScriptRequestContext
  /** 最后一根 bar 是否为实时 bar；为 true 时只有最后一根 bar 允许产生警报。 */
  readonly live?: boolean
}

/** 会话运行输出；继承完整绘图，另带本次增量与警报事件。 */
export interface ScriptSessionOutput extends IndicatorSeries {
  readonly drawingDelta: DrawingDelta
  /** 本次运行产生的实时警报事件；历史运行恒为空。 */
  readonly alerts: readonly ScriptAlertEvent[]
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
