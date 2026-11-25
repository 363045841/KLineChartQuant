/** 两个执行后端的统一测试矩阵：同一脚本在两个后端上必须给出一致契约。 */
import type { IndicatorSeries } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../contracts/log.js'
import { compileSources } from '../execution/impl/compileSources.js'
import { prepareNativeModule } from '../execution/impl/prepareNativeModule.js'
import { prepareQuickJSScript } from '../quickjs/impl/runQuickJSScript.js'
import type { PreparedScript, QuickJSLibrary } from '../quickjs/types.js'
import type { ScriptSessionOutput } from '../execution/session/types.js'

/** 测试端口：常用路径只取序列；需要事件时用 output。 */
export interface PreparedTestScript {
  readonly definition: PreparedScript['definition']
  requests: PreparedScript['requests']
  run(...args: Parameters<PreparedScript['run']>): IndicatorSeries
  output(...args: Parameters<PreparedScript['run']>): ScriptSessionOutput
  dispose(): void
}

/** 把完整会话输出收敛成测试常用形状，避免每个用例重复解包。 */
function testPort(script: PreparedScript): PreparedTestScript {
  return {
    definition: script.definition,
    requests: (...args) => script.requests(...args),
    run: (...args) => {
      const { drawingDelta: _delta, alerts: _alerts, ...series } = script.run(...args)
      return series
    },
    output: (...args) => script.run(...args),
    dispose: () => script.dispose(),
  }
}

/** 原生后端没有单独的同步入口：测试按 Worker 的方式先编译再安装常驻会话。 */
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
  return testPort(prepareQuickJSScript(source, libraries, onLog))
}

/** 后端列表；name 用于用例标题，prepare 返回可重复运行的对象。 */
export const BACKENDS = [
  { name: 'native', prepare: prepareNative },
  { name: 'quickjs', prepare: prepareQuickJS },
]

