/** 两个执行后端的统一测试矩阵：同一脚本在两个后端上必须给出一致契约。 */
import type { LogEvent } from '../contracts/output.js'
import { compileSources } from '../execution/impl/compileSources.js'
import { prepareNativeModule } from '../execution/impl/prepareNativeModule.js'
import { prepareQuickJSScript } from '../quickjs/impl/runQuickJSScript.js'
import type { QuickJSLibrary } from '../quickjs/types.js'

/** 原生后端没有单独的同步入口：测试按 Worker 的方式先编译再安装常驻会话。 */
export function prepareNative(
  source: string,
  libraries: readonly QuickJSLibrary[] = [],
  onLog?: (event: LogEvent) => void,
) {
  return prepareNativeModule(compileSources(source, libraries), onLog)
}

/** 后端列表；name 用于用例标题，prepare 返回可重复运行的对象。 */
export const BACKENDS = [
  { name: 'native', prepare: prepareNative },
  { name: 'quickjs', prepare: prepareQuickJSScript },
]
