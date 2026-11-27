/**
 * 脚本组合：worker_threads 线程池 + 文件工作区。
 */
import { builtinScriptSources } from '@363045841yyt/klinechart-script'
import {
  COMPILER_NODE_WORKER_URL,
  createScriptWorkerPool,
  SCRIPT_NODE_WORKER_URL,
  type ScriptWorkerPoolFactory,
} from '@363045841yyt/klinechart-script/worker'
import {
  createScriptService,
  type ScriptService,
} from '@363045841yyt/klinechart-script-chart'
import type { DefinitionRegistry } from '@363045841yyt/klinechart-core/node'
import type { ServerConfig } from '../config.js'
import { createFileScriptPersistence } from '../node/fileScriptPersistence.js'
import { createWorkerScriptThread } from '../node/scriptThread.js'

/** 线程池工厂：执行与编译各一条线程入口。 */
function createThreadPool(size: number): ScriptWorkerPoolFactory {
  return (runtime) =>
    createScriptWorkerPool({
      ...runtime,
      size,
      createThread: () => createWorkerScriptThread(SCRIPT_NODE_WORKER_URL),
      createCompilerThread: () => createWorkerScriptThread(COMPILER_NODE_WORKER_URL),
    })
}

/**
 * 装配脚本服务。
 *
 * @param config - 线程数量与工作区目录
 * @param definitions - 定义注册表
 * @param isDefinitionReferenced - 脚本是否仍被警报引用
 * @returns 已恢复工作区的脚本服务
 */
export function composeScripts(
  config: ServerConfig,
  definitions: DefinitionRegistry,
  isDefinitionReferenced: (definitionId: string) => boolean,
): Promise<ScriptService> {
  return createScriptService([], {
    definitions,
    builtinSources: builtinScriptSources,
    persistence: createFileScriptPersistence({ directory: config.scriptsDirectory }),
    createWorkerPool: createThreadPool(config.workers),
    bindRendering: null,
    isDefinitionReferenced,
  })
}
