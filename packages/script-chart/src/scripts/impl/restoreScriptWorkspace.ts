/**
 * 启动恢复（只读阶段）：恢复目录、用户库与库可用性校验。
 *
 * 不写指标注册表；指标注册由管线在拿到文档快照后执行。库校验失败逐条记录，
 * 不阻断其余文档与指标的恢复。
 */
import type { IndicatorFailure } from '@363045841yyt/klinechart-core'
import { inspectScript } from '@363045841yyt/klinechart-script'
import type {
  SavedScript,
  ScriptDocument,
  ScriptPersistence,
  ScriptServiceOptions,
} from '../types.js'
import { validateLibrary } from './libraryValidation.js'
import type { ScriptDocumentStore } from './scriptDocumentStore.js'
import type { ScriptExecutor } from './scriptExecutor.js'
import { restoreFolders, type ScriptFolderMap } from './scriptFolderStore.js'

/** 恢复所需的持久化、读模型、执行器与启动选项。 */
export interface RestoreScriptWorkspaceRequest {
  readonly persistence: ScriptPersistence
  readonly store: ScriptDocumentStore
  readonly executor: ScriptExecutor
  readonly options: ScriptServiceOptions
}

/** 恢复结果：目录、全部持久化脚本与逐条库失败。 */
export interface RestoredScriptWorkspace {
  readonly folders: ScriptFolderMap
  readonly scripts: readonly SavedScript[]
  readonly failures: readonly IndicatorFailure[]
}

/**
 * 恢复用户工作区：目录 → 库 → 脚本快照。
 *
 * @param request 持久化、读模型与执行器
 * @returns 目录映射、持久化脚本与库校验失败清单
 */
export async function restoreScriptWorkspace(
  request: RestoreScriptWorkspaceRequest,
): Promise<RestoredScriptWorkspace> {
  const { persistence, store, executor } = request
  const restored = await persistence.load()
  const folders = restoreFolders(restored?.folders ?? [])
  const saved = restored?.scripts ?? []
  const failures: IndicatorFailure[] = []
  const libraryDocuments = new Map<string, SavedScript>()

  for (const document of saved) {
    const declaration = inspectScript(document.source)
    if (declaration.kind !== 'library') continue
    libraryDocuments.set(declaration.name, document)
    const library: ScriptDocument = Object.freeze({
      ...document,
      identity: 'user',
      kind: 'library',
      definition: { name: declaration.name },
    })
    store.setLibrary(library)
  }

  for (const library of store.catalog()) {
    try {
      await validateLibrary(executor, library.name)
    } catch (error) {
      failures.push({
        stage: 'collect',
        origin: 'user-script',
        key: libraryDocuments.get(library.name)?.id ?? library.name,
        name: library.name,
        error,
      })
    }
  }

  return { folders, scripts: saved, failures }
}
