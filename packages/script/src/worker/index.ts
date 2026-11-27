/** 脚本 Worker 入口：客户端不接触线程 QuickJS 与 TypeScript 运行细节。 */
export { createScriptWorker } from './impl/createScriptWorker.js'
export { createScriptWorkerPool } from './impl/createScriptWorkerPool.js'
export { fromEventTarget, type EventTargetThread } from './thread/impl/fromEventTarget.js'
export type { CompilationHost, CompilationLease } from './compiler/types.js'

/** 浏览器发布产物的执行线程入口；宿主用它创建 Web Worker。 */
export const SCRIPT_WORKER_URL = new URL('./impl/script.worker.js', import.meta.url)

/** 浏览器发布产物的编译线程入口。 */
export const COMPILER_WORKER_URL = new URL(
  './compiler/impl/compiler.worker.js',
  import.meta.url,
)
export type {
  ScriptRunResult,
  ScriptThread,
  ScriptWorker,
  ScriptWorkerPool,
  ScriptWorkerPoolFactory,
  ScriptWorkerPoolOptions,
  ScriptWorkerPoolRuntime,
} from './types.js'
