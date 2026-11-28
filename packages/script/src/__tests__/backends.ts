/** 两种执行后端与说明：同一脚本在原生与 QuickJS 后端上必须给出同一份结果。 */
import type { Bar, IndicatorSeries, ComputeChange } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../contracts/log.js'
import { compileSources } from '../execution/impl/compileSources.js'
import { prepareNativeModule } from '../execution/impl/prepareNativeModule.js'
import type { ScriptSessionOutput } from '../execution/session/types.js'
import { prepareQuickJSModule } from '../quickjs/impl/runQuickJSModule.js'
import type {
  QuickJSScriptDefinition,
  ScriptParamValue,
} from '../quickjs/types.js'
import type { QuickJSLibrary } from '../quickjs/types.js'
import type { ScriptRequestContext, SecurityRequest } from '../request/types.js'

/** 测试端口：测试用例只关心输入输出；缺省每次运行按全量处理。 */
export interface PreparedTestScript {
  readonly definition: QuickJSScriptDefinition
  requests(
    params?: Readonly<Record<string, ScriptParamValue>>,
    symbol?: string,
  ): readonly SecurityRequest[]
  run(
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
    context?: ScriptRequestContext,
    live?: boolean,
    change?: ComputeChange,
  ): IndicatorSeries
  output(
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
    context?: ScriptRequestContext,
    live?: boolean,
    change?: ComputeChange,
  ): ScriptSessionOutput
  dispose(): void
}

/** 把常驻会话适配成测试端口；缺省变化为整段重放。 */
function testPort(script: {
  readonly definition: QuickJSScriptDefinition
  requests(
    params?: Readonly<Record<string, ScriptParamValue>>,
    symbol?: string,
  ): readonly SecurityRequest[]
  run(input: {
    readonly bars: readonly Bar[]
    readonly change: ComputeChange
    readonly params?: Readonly<Record<string, ScriptParamValue>>
    readonly context?: ScriptRequestContext
    readonly live?: boolean
  }): ScriptSessionOutput
  dispose(): void
}): PreparedTestScript {
  let revision = 0
  const output = (
    bars: readonly Bar[],
    params: Readonly<Record<string, ScriptParamValue>> = {},
    context?: ScriptRequestContext,
    live?: boolean,
    change?: ComputeChange,
  ) =>
    script.run({
      bars,
      change: change ?? { kind: 'reset', start: 0, revision: ++revision },
      params,
      context,
      live,
    })
  return {
    definition: script.definition,
    requests: (...args) => script.requests(...args),
    run: (...args) => {
      const { drawingDelta: _delta, alerts: _alerts, ...series } = output(...args)
      return series
    },
    output,
    dispose: () => script.dispose(),
  }
}

/** 原生后端；可信脚本不经过 QuickJS。 */
export function prepareNative(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
): PreparedTestScript {
  return testPort(prepareNativeModule(compileSources(source, libraries), onLog))
}

/** QuickJS 后端；与 Worker 共用同一份编译与执行语义。 */
export function prepareQuickJS(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
): PreparedTestScript {
  return testPort(prepareQuickJSModule(compileSources(source, libraries), onLog))
}

/** 后端列表；name 用于用例标题，prepare 返回可重复运行的对象。 */
export const BACKENDS = [
  { name: 'native', prepare: prepareNative },
  { name: 'quickjs', prepare: prepareQuickJS },
]
