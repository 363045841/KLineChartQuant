/** 测试用执行端口：线程运行真实 Node 产物，编译线程独立一条。 */
import type { LogEvent } from '../../../contracts/log.js'
import { createCompilerHost } from '../../compiler/impl/compilerHost.js'
import { createScriptWorker } from '../../impl/createScriptWorker.js'
import { fromEventTarget, type EventTargetThread } from '../../thread/impl/fromEventTarget.js'
import type { ScriptWorker } from '../../types.js'
import { NodeScriptWorker } from '../nodeWorker.js'

/** 编译线程入口；NodeScriptWorker 按文件名映射到真实发布产物。 */
const COMPILER_ENTRY = new URL('compiler.worker.js', import.meta.url)

export interface NodeScriptWorkerOptions {
  /** 执行线程；默认加载发布产物的 script.worker.js。 */
  readonly thread?: () => EventTargetThread
  /** 编译线程；默认加载发布产物的 compiler.worker.js。 */
  readonly compilerThread?: () => EventTargetThread
  readonly onOutput?: (id: string, events: readonly LogEvent[]) => void
}

/** 创建一个真实执行的脚本端口；用例只声明自己的线程替身。 */
export function createNodeScriptWorker(options: NodeScriptWorkerOptions = {}): ScriptWorker {
  const compiler = createCompilerHost({
    createThread: () =>
      fromEventTarget(options.compilerThread?.() ?? new NodeScriptWorker(COMPILER_ENTRY)),
  })
  return createScriptWorker(
    fromEventTarget(options.thread?.() ?? new NodeScriptWorker()),
    options.onOutput ?? (() => {}),
    compiler,
  )
}
