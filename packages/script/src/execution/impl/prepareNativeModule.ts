/** 可信脚本的原生执行后端：编译产物交给常驻会话，不加载 TypeScript，不提供沙箱保护。 */
import type { ComputeRange } from '@363045841yyt/klinechart-plot-contracts'
import type { Bar } from '../../contracts/input.js'
import type { LogEvent } from '../../contracts/output.js'
import type { PreparedQuickJSScript, ScriptParamValue } from '../../quickjs/types.js'
import { CURRENT_SYMBOL } from '../../request/impl/symbols.js'
import type { ScriptRequestContext } from '../../request/types.js'
import { createScriptExecutionSession } from '../session/impl/createScriptExecutionSession.js'
import { createNativeScriptRuntime } from '../session/impl/nativeRuntime.js'
import type { CompiledScriptSources } from '../types.js'

/** 编译一次原生工厂；运行态由会话持有，跨 tick 增量执行。 */
export function prepareNativeModule(
  compiled: CompiledScriptSources,
  onLog?: (event: LogEvent) => void,
): PreparedQuickJSScript {
  const session = createScriptExecutionSession({
    createRuntime: ({ expressionId, params, symbol }) =>
      createNativeScriptRuntime(compiled, { expressionId, onLog, params, symbol }),
    dependency: compiled.dependency,
    replayOnUpdate: compiled.replayOnUpdate,
    onLog,
  })
  return Object.freeze({
    definition: Object.freeze({ ...session.definition, dependency: compiled.dependency }),
    requests(params: Readonly<Record<string, ScriptParamValue>> = {}, symbol = CURRENT_SYMBOL) {
      return session.requests(params, symbol)
    },
    run(
      bars: readonly Bar[],
      params: Readonly<Record<string, ScriptParamValue>> = {},
      context?: ScriptRequestContext,
      range?: ComputeRange,
    ) {
      return session.run({ bars, params, context, range }).collection
    },
    runDetailed(
      bars: readonly Bar[],
      params: Readonly<Record<string, ScriptParamValue>> = {},
      context?: ScriptRequestContext,
      range?: ComputeRange,
    ) {
      return session.run({ bars, params, context, range })
    },
    dispose() {
      session.dispose()
    },
  })
}
