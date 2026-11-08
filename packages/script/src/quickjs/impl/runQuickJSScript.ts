/** 同步与异步源码 API 的编译适配层；Worker 只导入不含编译器的运行模块。 */
import type { PlotCollection } from '@363045841yyt/klinechart-plot-contracts'
import type { LogEvent } from '../../contracts/output.js'
import { compileSources } from '../../execution/impl/compileSources.js'
import type {
  PreparedQuickJSScript,
  QuickJSLibrary,
  QuickJSRunOptions,
  QuickJSScriptDefinition,
} from '../types.js'
import { preloadQuickJS, prepareQuickJSModule } from './runQuickJSModule.js'

export { preloadQuickJS } from './runQuickJSModule.js'

/** 初始化 WASM 后执行源码。 */
export async function runQuickJSScript(options: QuickJSRunOptions): Promise<PlotCollection> {
  await preloadQuickJS()
  return runQuickJSScriptSync(options)
}

/** 同步编译和执行；一次性调用创建会话并在结束后释放。 */
export function runQuickJSScriptSync(options: QuickJSRunOptions): PlotCollection {
  const script = prepareQuickJSScript(options.source, options.libraries, options.onLog)
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

/** 同步 API 与 Worker 共同使用唯一编译入口和执行模块。 */
export function prepareQuickJSScript(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
): PreparedQuickJSScript {
  return prepareQuickJSModule(compileSources(source, libraries), onLog)
}
