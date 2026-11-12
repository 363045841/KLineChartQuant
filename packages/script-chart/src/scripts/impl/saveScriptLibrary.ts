/**
 * 保存库：校验名称与全部依赖、重新编译受影响指标后才持久化，最后一次性注册。
 *
 * 任何一步失败都不会替换已提交版本，也不会改变内存中的库快照。
 */
import type { IndicatorCandidate, RegistrableIndicator } from '@363045841yyt/klinechart-core'
import { registerIndicators } from '@363045841yyt/klinechart-core'
import { resolveScriptLibraries } from '@363045841yyt/klinechart-script'
import type { ScriptDocument } from '../types.js'
import { validateLibrary } from './libraryValidation.js'
import type { ScriptDocumentStore } from './scriptDocumentStore.js'
import type { CompiledScript, ScriptExecutor } from './scriptExecutor.js'

/** 保存库所需的协作者：文档快照、执行器与持久化入口。 */
export interface SaveScriptLibraryRequest {
  readonly document: ScriptDocument
  /** 更新前的同名库；用于识别重命名后的悬空引用。 */
  readonly previous?: ScriptDocument
  readonly store: ScriptDocumentStore
  readonly executor: ScriptExecutor
  persist(documents: readonly ScriptDocument[]): Promise<void>
}

/** 受影响指标：持久化文档与其编译结果一一对应。 */
interface AffectedScript {
  readonly document: ScriptDocument & { kind: 'indicator' }
  readonly compiled: CompiledScript
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

  const affected: AffectedScript[] = []
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
      const compiled = await executor.compile(item.source, item.trusted, documents)
      affected.push({
        document: { ...item, revision: item.revision + 1, definition: compiled.definition },
        compiled,
      })
    }
    await persist(
      documents.map(
        (item) => affected.find((entry) => entry.document.id === item.id)?.document ?? item,
      ),
    )
    store.setLibrary(document)
    const registrable: RegistrableIndicator[] = []
    for (const entry of affected) {
      const definition = await executor.createDefinition(entry.compiled, {
          id: entry.document.id,
          source: entry.document.source,
          revision: entry.document.revision,
          identity: 'user',
          trusted: entry.document.trusted,
          folder: entry.document.folder,
        },
      )
      const candidate: IndicatorCandidate = {
        key: entry.document.id,
        origin: 'user-script',
        identity: 'user',
      }
      registrable.push({ kind: 'definition', candidate, definition })
    }
    const report = registerIndicators(registrable)
    const [failure] = report.failures
    if (failure) throw failure.error
    return document
  } finally {
    // 已提交的句柄由执行器持有；只有编译后未注册的句柄需要归还。
    for (const entry of affected) await executor.abandon(entry.document.id, entry.compiled.handle)
  }
}
