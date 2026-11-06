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

/** 同步编译和执行，WASM 的预加载契约不变。 */
export function runQuickJSScriptSync(options: QuickJSRunOptions): PlotCollection {
  return prepareQuickJSScript(options.source, options.libraries, options.onLog).run(
    options.bars,
    options.params,
    options.requestContext,
  )
}

/** 只读取声明，不保存额外编译快照。 */
export function readQuickJSScriptDefinitionSync(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
): QuickJSScriptDefinition {
  return prepareQuickJSScript(source, libraries).definition
}

/** 同步 API 与 Worker 共同使用唯一编译入口和执行模块。 */
export function prepareQuickJSScript(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
): PreparedQuickJSScript {
  return prepareQuickJSModule(compileSources(source, libraries), onLog)
}
