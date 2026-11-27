/**
 * 浏览器脚本服务组合根：Web Worker 线程 + IndexedDB 工作区。
 *
 * 线程入口与持久化都由本文件决定，Core 与 script-chart 只接收能力。
 */
import { builtinScriptSources } from '@363045841yyt/klinechart-script'
import {
  COMPILER_WORKER_URL,
  createScriptWorkerPool,
  fromEventTarget,
  SCRIPT_WORKER_URL,
} from '@363045841yyt/klinechart-script/worker'
import {
  createIndexedDbScriptPersistence,
  createScriptService,
  type ScriptService,
} from '@363045841yyt/klinechart-script-chart'
import type { DefinitionRegistry } from '@363045841yyt/klinechart-core'

/** 浏览器线程数：CPU 核数减一，至少一条。 */
function browserPoolSize(): number {
  return Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1)
}

/**
 * 用浏览器默认能力创建脚本服务。
 *
 * @param options - 定义注册表与警报引用检查
 * @returns 已恢复工作区的脚本服务
 */
export function createBrowserScriptService(options: {
  readonly definitions: DefinitionRegistry
  readonly isDefinitionReferenced: (definitionId: string) => boolean | Promise<boolean>
}): Promise<ScriptService> {
  return createScriptService([], {
    definitions: options.definitions,
    isDefinitionReferenced: options.isDefinitionReferenced,
    builtinSources: builtinScriptSources,
    persistence: createIndexedDbScriptPersistence(),
    createWorkerPool: (runtime) =>
      createScriptWorkerPool({
        ...runtime,
        size: browserPoolSize(),
        createThread: () => fromEventTarget(new Worker(SCRIPT_WORKER_URL, { type: 'module' })),
        createCompilerThread: () =>
          fromEventTarget(new Worker(COMPILER_WORKER_URL, { type: 'module' })),
      }),
  })
}
