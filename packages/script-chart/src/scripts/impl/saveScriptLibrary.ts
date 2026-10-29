/**
 * 保存库：校验名称与全部依赖、重编译受影响指标后才持久化。
 *
 * 任何一步失败都不会替换已提交版本，也不会改变内存中的库快照。
 */
import { resolveScriptLibraries } from '@363045841yyt/klinechart-script'
import type { ScriptDocument } from '../types.js'
import { validateLibrary } from './libraryValidation.js'
import type { ScriptDocumentStore } from './scriptDocumentStore.js'
import type { PreparedScript, ScriptExecutor } from './scriptExecutor.js'

/** 保存库所需的协作者：文档快照、执行器与持久化入口。 */
export interface SaveScriptLibraryRequest {
  readonly document: ScriptDocument
  /** 更新前的同名库；用于识别重命名后的悬空引用。 */
  readonly previous?: ScriptDocument
  readonly store: ScriptDocumentStore
  readonly executor: ScriptExecutor
  persist(documents: readonly ScriptDocument[]): Promise<void>
}

/** 保存库并重编译所有依赖它的指标，返回提交后的库文档。 */
export async function saveScriptLibrary(
  request: SaveScriptLibraryRequest,
): Promise<ScriptDocument> {
  const { document, previous, store, executor, persist } = request
  const documents = [...store.list().filter((item) => item.id !== document.id), document]
  if (
    documents.some(
      (item) => item.id !== document.id && item.definition.name === document.definition.name,
    )
  ) {
    throw new Error(`脚本名称已存在：${document.definition.name}`)
  }
  const catalog = store.catalog(documents)
  const names = new Set<string>(['ta'])
  for (const library of catalog) {
    if (names.has(library.name)) throw new Error(`库名已存在：${library.name}`)
    names.add(library.name)
  }
  // 所有库都解析依赖，也检测重命名导致的悬空引用。
  for (const library of catalog) resolveScriptLibraries(library.source, catalog)
  await validateLibrary(executor, document.definition.name, documents)
  const affected: { document: ScriptDocument; prepared: PreparedScript }[] = []
  try {
    for (const item of documents) {
      if (item.kind !== 'indicator') continue
      const dependencies = resolveScriptLibraries(item.source, catalog)
      if (
        !dependencies.some(
          (library) =>
            library.name === document.definition.name || library.name === previous?.definition.name,
        )
      )
        continue
      const prepared = await executor.prepare(item.source, item.trusted, documents)
      affected.push({
        document: { ...item, revision: item.revision + 1, definition: prepared.definition },
        prepared,
      })
    }
    await persist(
      documents.map(
        (item) => affected.find((entry) => entry.document.id === item.id)?.document ?? item,
      ),
    )
    store.setLibrary(document)
    for (const item of affected) {
      await executor.publish(
        item.document.id,
        item.document.source,
        item.prepared,
        item.document.revision,
        true,
        item.document.trusted,
        item.document.identity,
        item.document.folder,
      )
    }
    return document
  } finally {
    for (const item of affected)
      await executor.releasePrepared(item.document.id, item.prepared.handle)
  }
}
