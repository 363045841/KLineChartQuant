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

/** Node 计算线程入口；由 worker_threads 加载。 */
export const SCRIPT_NODE_WORKER_URL = new URL('./impl/scriptWorker.node.js', import.meta.url)

/** Node 编译线程入口；由 worker_threads 加载。 */
export const COMPILER_NODE_WORKER_URL = new URL(
  './compiler/impl/compilerWorker.node.js',
  import.meta.url,
)
export type {
  ScriptRequestsInput,
  ScriptRunInput,
  ScriptRunResult,
  ScriptThread,
  ScriptWorker,
  ScriptWorkerPool,
  ScriptWorkerPoolFactory,
  ScriptWorkerPoolOptions,
} from './types.js'
export { ScriptThreadFailure } from './types.js'
