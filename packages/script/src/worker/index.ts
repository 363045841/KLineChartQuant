/** 独立 Worker 入口；导入客户端不会加载主线程 QuickJS 或 TypeScript 编译器。 */
export { createScriptWorker } from './impl/createScriptWorker.js'
export type { ScriptWorker } from './types.js'
