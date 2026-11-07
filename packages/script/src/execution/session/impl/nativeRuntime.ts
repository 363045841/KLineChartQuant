/** 可信脚本的原生运行时：工厂与作用域只创建一次，行情按 bar 增量执行。 */
import {
  isPlotKind,
  type PlotCollection,
  PlotCollector,
  PlotKind,
  timeframeSeconds,
  timeValue,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../../contracts/input.js'
import type { LogEvent } from '../../../contracts/output.js'
import { ScriptExecutionError, ScriptPlotError } from '../../../errors.js'
import {
  DRAWING_API_PRELUDE,
  DRAWING_PRELUDE,
  INDICATOR_PRELUDE,
  LIBRARY_PRELUDE,
  PIVOT_PRELUDE,
  REQUEST_PRELUDE,
  ROLLING_PRELUDE,
  SCRIPT_PRELUDE,
  TIME_PRELUDE,
} from '../../../quickjs/generated/runtime.js'
import {
  readDefinition,
  readFillCall,
  readHLineCall,
  readPlotCall,
} from '../../../quickjs/impl/readDefinition.js'
import { SCRIPT_ENUM_GLOBALS } from '../../../quickjs/impl/scriptEnumGlobals.js'
import type { QuickJSScriptDefinition, ScriptParamValue } from '../../../quickjs/types.js'
import { CURRENT_SYMBOL } from '../../../request/impl/symbols.js'
import type { RequestExecution, RequestValue, SecurityRequest } from '../../../request/types.js'
import { createScriptConsole } from '../../impl/createScriptConsole.js'
import { FIELD_READERS, toOhlcPlotPoint, toPlotPoint } from '../../impl/scriptRuntime.js'
import type { CompiledScriptSources } from '../../types.js'
import type {
  DrawingDelta,
  ScriptRuntime,
  ScriptRuntimeExecuteOptions,
  ScriptRuntimeExecuteResult,
} from '../types.js'

/** 绘图检查点：对象身份集合与 id 序列。 */
interface NativeDrawingCheckpoint {
  readonly ids: ReadonlySet<string>
  readonly sequence: number
}

/** 会话检查点：series 缓存下标、绘图快照与库状态。 */
interface NativeCheckpoint {
  readonly index: number
  readonly drawings: NativeDrawingCheckpoint
  readonly libraries: readonly unknown[]
}

/** 原生运行时工厂的返回面；只暴露会话需要的入口。 */
interface NativeRuntime {
  metadata(): unknown
  onBar(): void
  requests(): readonly SecurityRequest[]
  expression(id: string): RequestValue
  drawings(): NonNullable<PlotCollection['drawings']>
  checkpoint(): NativeCheckpoint
  rollback(checkpoint: NativeCheckpoint): void
  drawingDelta(reset: boolean): DrawingDelta
  invalidateSeries(startIndex: number): void
  drawingCheckpoint(): NativeDrawingCheckpoint
  checkpointLibraries(): readonly unknown[]
}

/** 运行时可变状态；所有 scope 函数读取同一份，避免闭包各自持有一份行情。 */
interface NativeState {
  bars: readonly Bar[]
  index: number
  params: Record<string, ScriptParamValue>
  defaults: Record<string, ScriptParamValue>
  execution: RequestExecution
  collector: PlotCollector
  emit?: (event: LogEvent) => void
  /** 顶层声明阶段产生的日志；首次运行时补发给本次运行的接收者。 */
  pendingLogs: LogEvent[]
  phase: 'compile' | 'run'
  values: RequestValue[]
  /** 最后一根 bar 之前的状态下标；库提交检查点时使用。 */
  checkpointIndex: number
  /** 库在本次运行中提交的新检查点。 */
  committedCheckpoint?: NativeCheckpoint
}

/** 原生运行时选项；参数与品种在创建时进入顶层声明，之后只按 bar 增量执行。 */
export interface NativeRuntimeOptions {
  readonly expressionId?: string
  readonly onLog?: (event: LogEvent) => void
  readonly params?: Readonly<Record<string, ScriptParamValue>>
  readonly symbol?: string
}

/** 动态函数创建失败（包括 CSP 拒绝）统一报告为编译错误，不切换后端。 */
function createFactory(body: string) {
  try {
    return new Function('globalThis', body)
  } catch (error) {
    throw new ScriptExecutionError(
      'compile',
      error instanceof Error ? error.message : String(error),
    )
  }
}

/** 构造一次运行的作用域；运行态由 state 持有，作用域只提供宿主桥。 */
function createScope(state: NativeState): Record<string, unknown> {
  /** 顶层源码只能声明指标，绘图必须发生在 onBar 内。 */
  function requireBar(kind: string): void {
    if (state.index < 0) throw new ScriptExecutionError('compile', `${kind} 只能在 onBar 中调用`)
  }
  const scope: Record<string, unknown> = {
    console: createScriptConsole(
      (event) => {
        if (state.emit) state.emit(event)
        else state.pendingLogs.push(event)
      },
      () => state.index,
    ),
    __requestContext: state.execution,
    __timeValue: (
      mode: string,
      period: string,
      timestamp: number,
      session?: string,
      timezone?: string,
    ) => timeValue(state.execution.time, mode, period, timestamp, session, timezone),
    __timeframeSeconds: timeframeSeconds,
    ...SCRIPT_ENUM_GLOBALS,
    params: state.params,
    /** 按当前游标读取历史行情。 */
    __read(field: string, offset: number): number {
      const bar = state.bars[state.index - offset]
      const reader = FIELD_READERS[field]
      return bar && reader ? reader(bar) : Number.NaN
    },
    /** 当前已经处理的行情数量。 */
    __count: () => state.index + 1,
    __barCount: () => state.bars.length,
    /** 采集数值点；保留与 QuickJS 相同的无穷值诊断。 */
    __plot(kind: unknown, value: unknown, name: unknown, options: unknown) {
      requireBar('plot')
      if (!isPlotKind(kind)) throw new ScriptExecutionError('run', '未知 plot kind')
      const declaration = readPlotCall(name, options, kind)
      if (declaration.kind === PlotKind.Candle || declaration.kind === PlotKind.Bar) {
        state.collector.onOhlc(declaration, state.index, toOhlcPlotPoint(declaration, value))
        return
      }
      if (value !== null && typeof value !== 'number')
        throw new ScriptExecutionError('run', 'plot value 需要数值或 null')
      if (value === Infinity || value === -Infinity)
        throw new ScriptPlotError(declaration.name, state.index)
      state.collector.onPlot(
        declaration.name,
        state.index,
        value === null ? null : toPlotPoint(declaration, value),
        declaration.kind,
        declaration,
      )
    },
    /** 采集填充：Plot 之间按 bar 取色，水平线之间是整幅单色。 */
    __fill(from: unknown, to: unknown, color: unknown, title: unknown, options: unknown) {
      const call = readFillCall(from, to, color, title, options)
      if (call.kind === 'plot') {
        requireBar('fill')
        state.collector.onFill(call.declaration, state.index)
        return
      }
      if (state.index >= 0)
        throw new ScriptExecutionError('compile', 'hline 填充只能在文件顶层声明')
      state.collector.onHLineFill(call.from, call.to, call.color, call.title, call.visible)
    },
    /** 采集图表级水平线；与 plot 相反，只允许在文件顶层声明。 */
    __hline(price: unknown, options: unknown): string {
      if (state.index >= 0) throw new ScriptExecutionError('compile', 'hline 只能在文件顶层声明')
      return state.collector.onHLine(readHLineCall(price, options))
    },
  }
  // 保留原生全局能力的读取，运行库写入仍归本次 scope 所有；这里不做安全隔离。
  Object.setPrototypeOf(scope, globalThis)
  Object.defineProperty(scope, 'globalThis', { value: scope })
  return scope
}

/** 创建一个常驻原生运行时；同一会话内只创建一次，后续按 bar 增量执行。 */
export function createNativeScriptRuntime(
  compiled: CompiledScriptSources,
  options: NativeRuntimeOptions = {},
): ScriptRuntime<NativeCheckpoint> {
  const state: NativeState = {
    bars: [],
    index: -1,
    params: { ...options.params },
    defaults: {},
    execution: { symbol: options.symbol ?? CURRENT_SYMBOL, results: {} },
    collector: new PlotCollector({ barCount: 0 }),
    // 顶层声明阶段不转发日志；每次 execute 再注入本次运行的接收者。
    emit: undefined,
    pendingLogs: [],
    phase: 'compile',
    values: [],
    checkpointIndex: 0,
  }
  const scope = createScope(state)
  // with 只用于让动态注册的库名可被脚本解析；作用域不是安全边界。
  // 运行库的 globalThis 指向本次运行的作用域，避免库和行情对象写入 Worker 全局。
  const factory = createFactory(
    `
    with (globalThis) {
      return (function () {
        'use strict'
        ${LIBRARY_PRELUDE}
        ${SCRIPT_PRELUDE}
        ${REQUEST_PRELUDE}
        ${TIME_PRELUDE}
        ${ROLLING_PRELUDE}
        ${INDICATOR_PRELUDE}
        ${DRAWING_API_PRELUDE}
        ${DRAWING_PRELUDE}
        ${PIVOT_PRELUDE}
        ${compiled.libraries.map((library) => `${library.source}\n;importLibrary(${JSON.stringify(library.name)});`).join('\n')}
        ${compiled.source}
        ;return { metadata: __metadata, onBar: __onBar, drawings: __drawingSnapshot, requests: () => __requests, expression: (id) => __copyRequestValue(__requestExpressions.get(id)()), checkpoint: __checkpoint, rollback: __rollback, drawingDelta: __drawingDelta, invalidateSeries: __rollbackSeries, drawingCheckpoint: __drawingCheckpoint, checkpointLibraries: __checkpointLibraries }
      }).call(globalThis)
    }
  `,
  )
  const runtime: NativeRuntime = factory(scope)
  state.defaults = { ...state.params }
  // 库在完成期渲染后提交检查点；活动期绘图仍由会话在回滚后重建。
  scope.__commitCheckpoint = () => {
    state.committedCheckpoint = {
      index: state.checkpointIndex,
      drawings: runtime.drawingCheckpoint(),
      libraries: runtime.checkpointLibraries(),
    }
  }
  const definition: QuickJSScriptDefinition = readDefinition(runtime.metadata())
  const requests = runtime.requests()

  /** 执行 [startIndex, endIndex)；参数与请求上下文只替换引用，不重建作用域。 */
  function execute(input: ScriptRuntimeExecuteOptions): ScriptRuntimeExecuteResult {
    state.bars = input.bars
    state.params = { ...state.defaults, ...input.params }
    scope.params = state.params
    state.execution = input.execution
    scope.__requestContext = input.execution
    if (input.emit && state.pendingLogs.length) {
      for (const event of state.pendingLogs) input.emit(event)
      state.pendingLogs.length = 0
    }
    state.emit = input.emit
    state.index = input.startIndex - 1
    state.phase = 'run'
    state.committedCheckpoint = undefined
    state.checkpointIndex = input.checkpointIndex ?? input.endIndex - 1
    state.collector.prepare(input.bars.length, input.startIndex)
    try {
      if (options.expressionId === undefined) {
        for (state.index = input.startIndex; state.index < input.endIndex; state.index++)
          runtime.onBar()
      } else {
        state.values.length = input.startIndex
        for (state.index = input.startIndex; state.index < input.endIndex; state.index++)
          state.values[state.index] = runtime.expression(options.expressionId)
      }
    } catch (error) {
      if (error instanceof ScriptExecutionError || error instanceof ScriptPlotError) throw error
      throw new ScriptExecutionError(
        state.phase,
        error instanceof Error ? error.message : String(error),
      )
    }
    return {
      collection: { ...state.collector.collect(), drawings: runtime.drawings() },
      values: state.values,
      ...(state.committedCheckpoint === undefined ? {} : { checkpoint: state.committedCheckpoint }),
    }
  }

  return {
    definition,
    requests: () => requests,
    execute,
    checkpoint: () => runtime.checkpoint(),
    rollback: (checkpoint) => runtime.rollback(checkpoint),
    invalidate: (startIndex) => runtime.invalidateSeries(startIndex),
    drawingDelta: (reset) => runtime.drawingDelta(reset),
    /** 原生运行态随闭包释放，不需要显式清理。 */
    dispose: () => {},
  }
}
