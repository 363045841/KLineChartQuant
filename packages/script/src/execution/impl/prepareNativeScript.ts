/** 同步脚本 API 的编译适配层；计算 Worker 直接使用 prepareNativeModule。 */
import type { LogEvent } from '../../contracts/output.js'
import type { PreparedQuickJSScript, QuickJSLibrary } from '../../quickjs/types.js'
import { compileSources } from './compileSources.js'
import { prepareNativeModule } from './prepareNativeModule.js'

/** 同步调用编译与执行模块；保留宿主侧同步 API 的既有语义。 */
export function prepareNativeScript(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
): PreparedQuickJSScript {
  return prepareNativeModule(compileSources(source, libraries), onLog)
}
