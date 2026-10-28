/** 可信脚本的原生执行后端；只由 Script Worker 使用，不提供沙箱保护。 */
import {
  isPlotKind,
  type PlotCollection,
  PlotCollector,
  PlotKind,
} from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../contracts/input.js'
import type { LogEvent } from '../../contracts/output.js'
import { ScriptExecutionError, ScriptPlotError } from '../../errors.js'
import {
  DRAWING_API_PRELUDE,
  DRAWING_PRELUDE,
  INDICATOR_PRELUDE,
  LIBRARY_PRELUDE,
  PIVOT_PRELUDE,
  REQUEST_PRELUDE,
  ROLLING_PRELUDE,
  SCRIPT_PRELUDE,
} from '../../quickjs/generated/runtime.js'
import {
  readDefinition,
  readFillCall,
  readHLineCall,
  readPlotCall,
} from '../../quickjs/impl/readDefinition.js'
import { SCRIPT_ENUM_GLOBALS } from '../../quickjs/impl/scriptEnumGlobals.js'
import {
  type PreparedQuickJSScript,
  type QuickJSLibrary,
  type ScriptParamValue,
} from '../../quickjs/types.js'
import {
  CURRENT_SYMBOL,
  EMPTY_REQUEST_EXECUTION,
  executeRequests,
} from '../../request/impl/executeRequests.js'
import type {
  RequestExecution,
  RequestValue,
  ScriptRequestContext,
  SecurityRequest,
} from '../../request/types.js'
import { createScriptConsole } from './createScriptConsole.js'
import { compileSources, FIELD_READERS, toOhlcPlotPoint, toPlotPoint } from './scriptRuntime.js'

/** 工厂只返回指标入口，运行库和用户状态留在每次调用的函数作用域内。 */
interface NativeRuntime {
  metadata(): unknown
  onBar(): void
  requests(): readonly SecurityRequest[]
  expression(id: string): RequestValue
  drawings(): NonNullable<PlotCollection['drawings']>
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

/** 编译一次原生工厂；读取声明和每次计算都创建独立运行态。 */
export function prepareNativeScript(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
): PreparedQuickJSScript {
  const compiled = compileSources(source, libraries)
  // with 只用于让动态注册的库名可被脚本解析；作用域不是安全边界。
  // 运行库的 globalThis 指向本次调用的对象，避免库和行情对象写入 Worker 全局。
  const factory = createFactory(
    `
    with (globalThis) {
      return (function () {
        'use strict'
        ${LIBRARY_PRELUDE}
        ${SCRIPT_PRELUDE}
        ${REQUEST_PRELUDE}
        ${ROLLING_PRELUDE}
        ${INDICATOR_PRELUDE}
        ${DRAWING_API_PRELUDE}
        ${DRAWING_PRELUDE}
        ${PIVOT_PRELUDE}
        ${compiled.libraries.map((library) => `${library.source}\n;importLibrary(${JSON.stringify(library.name)});`).join('\n')}
        ${compiled.source}
        ;return { metadata: __metadata, onBar: __onBar, drawings: __drawingSnapshot, requests: () => __requests, expression: (id) => __copyRequestValue(__requestExpressions.get(id)()) }
      }).call(globalThis)
    }
  `,
  )

  /** 注入本次行情与采集器，原生调用共享的声明校验和绘图契约。 */
  function execute(
    bars: readonly Bar[],
    params: Readonly<Record<string, ScriptParamValue>> = {},
    execution: RequestExecution = EMPTY_REQUEST_EXECUTION,
    emit?: (event: LogEvent) => void,
  ) {
    let index = -1
    let phase: 'compile' | 'run' = 'compile'
    const collector = new PlotCollector({ barCount: bars.length })
    /** 顶层源码只能声明指标，绘图必须发生在 onBar 内。 */
    function requireBar(kind: string): void {
      if (index < 0) throw new ScriptExecutionError('compile', `${kind} 只能在 onBar 中调用`)
    }
    const scope = {
      console: createScriptConsole(emit, () => index),
      __requestContext: execution,
      // 公开枚举与 QuickJS 后端共用同一份名字和取值，两个后端不再各自抄一遍。
      ...SCRIPT_ENUM_GLOBALS,
      params: { ...params },
      /** 按当前游标读取历史行情。 */
      __read(field: string, offset: number): number {
        const bar = bars[index - offset]
        const reader = FIELD_READERS[field]
        return bar && reader ? reader(bar) : Number.NaN
      },
      /** 当前已经处理的行情数量。 */
      __count: () => index + 1,
      __barCount: () => bars.length,
      /** 采集数值点；保留与 QuickJS 相同的无穷值诊断。 */
      __plot(kind: unknown, value: unknown, name: unknown, options: unknown) {
        requireBar('plot')
        if (!isPlotKind(kind)) throw new ScriptExecutionError('run', '未知 plot kind')
        const declaration = readPlotCall(name, options, kind)
        if (declaration.kind === PlotKind.Candle || declaration.kind === PlotKind.Bar) {
          collector.onOhlc(declaration, index, toOhlcPlotPoint(declaration, value))
          return
        }
        if (value !== null && typeof value !== 'number')
          throw new ScriptExecutionError('run', 'plot value 需要数值或 null')
        if (value === Infinity || value === -Infinity)
          throw new ScriptPlotError(declaration.name, index)
        collector.onPlot(
          declaration.name,
          index,
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
          collector.onFill(call.declaration, index)
          return
        }
        if (index >= 0) throw new ScriptExecutionError('compile', 'hline 填充只能在文件顶层声明')
        collector.onHLineFill(call.from, call.to, call.color, call.title, call.visible)
      },
      /** 采集图表级水平线；与 plot 相反，只允许在文件顶层声明。 */
      __hline(price: unknown, options: unknown): string {
        if (index >= 0) throw new ScriptExecutionError('compile', 'hline 只能在文件顶层声明')
        return collector.onHLine(readHLineCall(price, options))
      },
    }
    // 保留原生全局能力的读取，运行库写入仍归本次 scope 所有；这里不做安全隔离。
    Object.setPrototypeOf(scope, globalThis)
    Object.defineProperty(scope, 'globalThis', { value: scope })
    try {
      const runtime: NativeRuntime = factory(scope)
      const definition = readDefinition(runtime.metadata())
      phase = 'run'
      const values: RequestValue[] = []
      for (index = 0; index < bars.length; index++) {
        if (execution.expressionId === undefined) runtime.onBar()
        else values.push(runtime.expression(execution.expressionId))
      }
      return {
        definition,
        collection: { ...collector.collect(), drawings: runtime.drawings() },
        requests: runtime.requests(),
        values,
      }
    } catch (error) {
      if (error instanceof ScriptExecutionError || error instanceof ScriptPlotError) throw error
      throw new ScriptExecutionError(phase, error instanceof Error ? error.message : String(error))
    }
  }

  const definition = execute([]).definition
  return Object.freeze({
    definition,
    requests(params: Readonly<Record<string, ScriptParamValue>> = {}, symbol = CURRENT_SYMBOL) {
      return execute([], params, { symbol, results: {} }).requests
    },
    /** 每次计算重建局部状态，避免参数、库、序列缓存串到其他请求。 */
    run(
      bars: readonly Bar[],
      params: Readonly<Record<string, ScriptParamValue>> = {},
      context?: ScriptRequestContext,
    ) {
      return executeRequests(
        (target, input, execution, emitOutput) =>
          execute(target, input, execution, emitOutput ? onLog : undefined),
        bars,
        params,
        context,
      )
    },
  })
}
