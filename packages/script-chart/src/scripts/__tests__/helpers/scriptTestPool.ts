/** 测试用脚本线程池：执行与编译各跑真实 Node 产物，只桥接消息。 */
import type { ScriptWorkerPoolFactory } from '@363045841yyt/klinechart-script/worker'
import { createScriptWorkerPool, fromEventTarget } from '@363045841yyt/klinechart-script/worker'
import { NodeScriptWorker } from '../../../../../script/src/worker/__tests__/nodeWorker.js'

/** NodeScriptWorker 按文件名映射到发布产物；编译器入口用同名占位 URL。 */
const COMPILER_ENTRY = new URL('compiler.worker.js', import.meta.url)

/** 两条执行线程加一条编译线程；用例不关心具体数量时直接用这个工厂。 */
export const testScriptPool: ScriptWorkerPoolFactory = (runtime) =>
  createScriptWorkerPool({
    ...runtime,
    size: 2,
    createThread: () => fromEventTarget(new NodeScriptWorker()),
    createCompilerThread: () => fromEventTarget(new NodeScriptWorker(COMPILER_ENTRY)),
  })
