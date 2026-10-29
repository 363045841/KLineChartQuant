/**
 * 启动恢复：先目录，再库，后内置脚本与用户指标。
 *
 * 顺序由依赖决定：文档只能落在已恢复的目录中，指标只能引用已恢复的库。
 */
import { getIndicatorDescriptor } from '@363045841yyt/klinechart-core'
import { inspectScript } from '@363045841yyt/klinechart-script'
import type { ScriptPersistence, ScriptServiceOptions } from '../types.js'
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

/**
 * 恢复用户工作区并注册全部可执行定义。
 *
 * @returns 恢复后的目录集合
 */
export async function restoreScriptWorkspace(
  request: RestoreScriptWorkspaceRequest,
): Promise<ScriptFolderMap> {
  const { persistence, store, executor, options } = request
  try {
    const restored = await persistence.load()
    const folders = restoreFolders(restored?.folders ?? [])
    const saved = restored?.scripts ?? []
    // 先恢复全部库，再准备指标；归档顺序不参与依赖加载。
    const libraryIds = new Set<string>()
    for (const document of saved) {
      const declaration = inspectScript(document.source)
      if (declaration.kind === 'library') {
        libraryIds.add(document.id)
        store.setLibrary(
          Object.freeze({
            ...document,
            identity: 'user',
            kind: 'library',
            definition: { name: declaration.name },
          }),
        )
      }
    }
    for (const library of store.catalog()) await validateLibrary(executor, library.name)
    for (const source of options.builtinSources ?? []) {
      const prepared = await executor.prepare(source, true)
      // 内置脚本随包发布且只读，可信是它的固有属性，不是用户选择。
      await executor.publish(prepared.definition.name, source, prepared, 1, false, true, 'builtin')
    }
    for (const document of saved) {
      if (libraryIds.has(document.id)) continue
      const prepared = await executor.prepare(document.source, document.trusted)
      const { definition } = prepared
      store.assertAvailable(definition)
      if (getIndicatorDescriptor(document.id)) throw new Error(`脚本 ID 已存在：${document.id}`)
      await executor.publish(
        document.id,
        document.source,
        prepared,
        document.revision,
        false,
        document.trusted,
        'user',
        document.folder,
      )
    }
    return folders
  } catch (error) {
    executor.dispose()
    throw error
  }
}
