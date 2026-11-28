/**
 * 测试专用：在进程内直接执行脚本，不经过 Worker。
 *
 * 不属于对外 API；生产链路一律通过 Worker 池执行。
 */
import type { Bar, ComputeChange } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/log.js'
import { compileSources } from '../../execution/impl/compileSources.js'
import type { ScriptSessionOutput } from '../../execution/session/types.js'
import { preloadQuickJS, prepareQuickJSModule } from '../../quickjs/impl/runQuickJSModule.js'
import type {
  PreparedScript,
  QuickJSLibrary,
  QuickJSRunOptions,
  QuickJSScriptDefinition,
  ScriptParamValue,
} from '../../quickjs/types.js'
import type { ScriptRequestContext } from '../../request/types.js'

export { preloadQuickJS } from '../../quickjs/impl/runQuickJSModule.js'

/** 测试脚本：每次 run 都按全量处理，调用方只关心输入输出。 */
export interface TestScript {
  readonly definition: QuickJSScriptDefinition
  requests(params?: Readonly<Record<string, ScriptParamValue>>, symbol?: string): readonly import('../../request/types.js').SecurityRequest[]
  run(
    bars: readonly Bar[],
    params?: Readonly<Record<string, ScriptParamValue>>,
    context?: ScriptRequestContext,
    live?: boolean,
  ): ScriptSessionOutput
  dispose(): void
}

/** 编译并装配一个测试脚本；每次 run 使用递增修订号与 reset 变化。 */
export function prepareQuickJSScript(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
  timeoutMs?: number,
): TestScript {
  const script: PreparedScript = prepareQuickJSModule(compileSources(source, libraries), onLog, timeoutMs)
  let revision = 0
  return {
    definition: script.definition,
    requests: (params = {}, symbol = 'TEST') => script.requests(params, symbol),
    run(bars, params = {}, context?, live?) {
      const change: ComputeChange = { kind: 'reset', start: 0, revision: ++revision }
      return script.run({ bars, change, params, context, live })
    },
    dispose: () => script.dispose(),
  }
}

/** 初始化 WASM 后同步执行一份源码。 */
export async function runQuickJSScript(options: QuickJSRunOptions): Promise<ScriptSessionOutput> {
  await preloadQuickJS()
  return runQuickJSScriptSync(options)
}

/** 同步编译并执行；一次性调用创建会话并在结束后释放。 */
export function runQuickJSScriptSync(options: QuickJSRunOptions): ScriptSessionOutput {
  const script = prepareQuickJSScript(
    options.source,
    options.libraries,
    options.onLog,
    options.timeoutMs,
  )
  try {
    return script.run(options.bars, options.params, options.requestContext)
  } finally {
    script.dispose()
  }
}

/** 只读取声明，不保存额外编译快照。 */
export function readQuickJSScriptDefinitionSync(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): QuickJSScriptDefinition {
  const script = prepareQuickJSScript(source, libraries)
  try {
    return script.definition
  } finally {
    script.dispose()
  }
}
