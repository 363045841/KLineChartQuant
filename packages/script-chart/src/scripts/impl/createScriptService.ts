/**
 * 应用级脚本服务：启动恢复、串行持久化与目录操作。
 *
 * 文档读取、编译执行、库保存分别由独立模块负责；这里只做装配与事务边界。
 * 指标注册一律调用 Core 的唯一写入口，不存在旁路。
 */
import {
  generateUUID,
  indicatorFailures,
  logIndicatorFailure,
  registerIndicators,
  runIndicatorPipeline,
  setIndicatorFailures,
  unregisterIndicator,
  type IndicatorCandidate,
  type RegistrableIndicator,
} from '@363045841yyt/klinechart-core'
import { isWithinFolder, type ScriptRunOptions } from '@363045841yyt/klinechart-plot-contracts'
import {
  inspectScript,
  type QuickJSLibrary,
  resolveScriptLibraries,
} from '@363045841yyt/klinechart-script'
import type {
  ScriptDocument,
  ScriptFolder,
  ScriptService,
  ScriptServiceOptions,
  ScriptWorkspace,
} from '../types.js'
import { createScriptOutput } from './createScriptOutput.js'
import { restoreScriptWorkspace } from './restoreScriptWorkspace.js'
import { saveScriptLibrary } from './saveScriptLibrary.js'
import { createScriptDocumentStore } from './scriptDocumentStore.js'
import { createScriptExecutor, type CompiledScript } from './scriptExecutor.js'
import { createScriptIndicatorStage } from './scriptIndicatorStage.js'
import {
  folderKey,
  foldersWithin,
  nextFolder,
  removableFolder,
  requireFolder,
} from './scriptFolderStore.js'
import { createScriptPersistence } from './scriptPersistence.js'

/** 脚本指标在注册失败清单里的稳定描述。 */
function scriptCandidate(key: string): IndicatorCandidate {
  return { key, origin: 'user-script', identity: 'user' }
}

/**
 * 创建脚本服务。
 *
 * @param libraries 宿主注入的库源码，与用户库共同参与依赖解析
 * @param options 持久化与内置源码选项
 */
export async function createScriptService(
  libraries: readonly QuickJSLibrary[] = [],
  options: ScriptServiceOptions = {},
): Promise<ScriptService> {
  const persistence = options.persistence ?? createScriptPersistence()
  const output = createScriptOutput()
  const store = createScriptDocumentStore(libraries)
  const executor = createScriptExecutor(store, output)
  const restored = await restoreScriptWorkspace({ persistence, store, executor, options })
  const folders = restored.folders
  const report = await runIndicatorPipeline([
    createScriptIndicatorStage({
      builtinSources: options.builtinSources ?? [],
      documents: restored.scripts,
      executor,
    }),
  ])
  if (restored.failures.length > 0) {
    for (const failure of restored.failures) logIndicatorFailure(failure)
    setIndicatorFailures([...restored.failures, ...report.failures])
  }

  // 异步写入串行执行，版本检查与快照生成均在队列内完成。
  let pending: Promise<unknown> = Promise.resolve()
  /** 串行提交，单次失败不会阻断后续保存。 */
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation)
    pending = result.catch(() => undefined)
    return result
  }

  /** 持久化完成后才注册运行定义；保存失败保留当前版本。 */
  async function persist(
    documents: readonly ScriptDocument[],
    nextFolders: readonly ScriptFolder[] = [...folders.values()],
  ): Promise<void> {
    const workspace: ScriptWorkspace = {
      scripts: documents
        .filter((item) => item.identity === 'user')
        .map(({ id, source, revision, trusted, folder }) => ({
          id,
          source,
          revision,
          trusted,
          folder,
        })),
      folders: nextFolders,
    }
    if (!(await persistence.save(workspace))) throw new Error('用户脚本保存失败')
  }

  /** 返回按分组与路径排序的文件夹快照，目录树一次渲染完成。 */
  function listFolders(): readonly ScriptFolder[] {
    return Object.freeze(
      [...folders.values()].sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path, 'zh-CN'),
      ),
    )
  }

  /**
   * 注册一条脚本指标。
   *
   * 调用前目录已持久化，且 `assertAvailable` 已排除全部可预期冲突；
   * 因此注册失败只可能是契约被绕过，必须抛出而不是静默保留半成品。
   */
  function commitIndicator(
    document: ScriptDocument & { kind: 'indicator' },
    compiled: CompiledScript,
  ): Promise<ScriptDocument> {
    return (async () => {
      const definition = await executor.createDefinition(compiled, {
        id: document.id,
        source: document.source,
        revision: document.revision,
        identity: 'user',
        trusted: document.trusted,
        folder: document.folder,
      })
      const item: RegistrableIndicator = {
        kind: 'definition',
        candidate: scriptCandidate(document.id),
        definition,
      }
      const result = registerIndicators([item])
      const [failure] = result.failures
      if (failure) throw failure.error
      return document
    })()
  }

  return Object.freeze({
    output: output.source,
    failures: indicatorFailures,
    run(options: ScriptRunOptions) {
      return executor.run(options)
    },
    create(source: string, trusted = false, folder = '') {
      return enqueue(async () => {
        const id = `script_${generateUUID()}`
        const declaration = inspectScript(source)
        const target = requireFolder(folders, declaration.kind, folder)
        if (declaration.kind === 'library') {
          return saveScriptLibrary({
            document: {
              id,
              source,
              trusted,
              revision: 1,
              identity: 'user',
              kind: 'library',
              folder: target,
              definition: { name: declaration.name },
            },
            store,
            executor,
            persist,
          })
        }
        const compiled = await executor.compile(source, trusted)
        try {
          store.assertAvailable(compiled.definition)
          const document: ScriptDocument & { kind: 'indicator' } = {
            kind: 'indicator',
            id,
            identity: 'user',
            source,
            revision: 1,
            definition: compiled.definition,
            trusted,
            folder: target,
          }
          await persist([...store.list(), document])
          return await commitIndicator(document, compiled)
        } catch (error) {
          await executor.abandon(id, compiled.handle)
          throw error
        }
      })
    },
    listFolders,
    /** 删除目录子树及其文档；引用检查在写入前完成，避免部分删除。 */
    removeFolder(folder: ScriptFolder) {
      return enqueue(async () => {
        const { kind, path } = removableFolder(folders, folder.kind, folder.path)
        const removed = store
          .list()
          .filter(
            (item) =>
              item.identity === 'user' && item.kind === kind && isWithinFolder(item.folder, path),
          )
        const removedIds = new Set(removed.map((item) => item.id))
        const catalog = store.catalog()
        const libraryNames = new Set(
          removed.filter((item) => item.kind === 'library').map((item) => item.definition.name),
        )
        // 目录外脚本仍引用目录内的库时整体拒绝，删除不能留下悬空依赖。
        const outside = store
          .list()
          .filter(
            (item) =>
              !removedIds.has(item.id) &&
              resolveScriptLibraries(item.source, catalog).some((library) =>
                libraryNames.has(library.name),
              ),
          )
        if (outside.length)
          throw new Error(
            `文件夹仍被引用：${outside.map((item) => item.definition.name).join('、')}`,
          )
        const removedFolders = foldersWithin(folders, kind, path)
        const removedKeys = new Set(
          removedFolders.map((record) => folderKey(record.kind, record.path)),
        )
        await persist(
          store.list().filter((item) => !removedIds.has(item.id)),
          [...folders.values()].filter(
            (record) => !removedKeys.has(folderKey(record.kind, record.path)),
          ),
        )
        for (const key of removedKeys) folders.delete(key)
        for (const item of removed) {
          if (item.kind === 'library') store.deleteLibrary(item.id)
          else unregisterIndicator(item.id)
          output.remove(item.id)
          await executor.releaseDefinition(item.id)
        }
        return { documentIds: [...removedIds], folders: removedFolders }
      })
    },
    /** 空文件夹与脚本文档共用一次持久化事务，恢复顺序不依赖文档存在。 */
    createFolder(folder: ScriptFolder) {
      return enqueue(async () => {
        const record = nextFolder(folders, folder)
        await persist(store.list(), [...folders.values(), record])
        folders.set(folderKey(record.kind, record.path), record)
      })
    },
    read: store.read,
    list: store.list,
    update(id: string, source: string, expectedRevision: number, trusted = false) {
      return enqueue(async () => {
        const current = store.requireRevision(id, expectedRevision)
        const declaration = inspectScript(source)
        if (declaration.kind !== current.kind) throw new Error('不能更改脚本文档类型')
        if (declaration.kind === 'library') {
          return saveScriptLibrary({
            document: {
              ...current,
              kind: 'library',
              source,
              trusted,
              revision: current.revision + 1,
              definition: { name: declaration.name },
            },
            previous: current,
            store,
            executor,
            persist,
          })
        }
        const compiled = await executor.compile(source, trusted)
        try {
          store.assertAvailable(compiled.definition, current.id)
          if (current.kind !== 'indicator') throw new Error('不能更改脚本文档类型')
          const revision = current.revision + 1
          const document: ScriptDocument & { kind: 'indicator' } = {
            ...current,
            source,
            revision,
            definition: compiled.definition,
            trusted,
          }
          await persist(
            store.list().map((item) => (item.id === current.id ? document : item)),
          )
          return await commitIndicator(document, compiled)
        } catch (error) {
          await executor.abandon(current.id, compiled.handle)
          throw error
        }
      })
    },
    remove(id: string, expectedRevision: number) {
      return enqueue(async () => {
        const current = store.requireRevision(id, expectedRevision)
        if (current.kind === 'library') {
          const catalog = store.catalog()
          const references = store
            .list()
            .filter(
              (item) =>
                item.id !== id &&
                resolveScriptLibraries(item.source, catalog).some(
                  (library) => library.name === current.definition.name,
                ),
            )
          if (references.length)
            throw new Error(
              `库仍被引用：${references.map((item) => item.definition.name).join('、')}`,
            )
          await persist(store.list().filter((item) => item.id !== id))
          store.deleteLibrary(id)
          return
        }
        await persist(store.list().filter((item) => item.id !== current.id))
        unregisterIndicator(current.id)
        output.remove(current.id)
        await executor.releaseDefinition(current.id)
      })
    },
    dispose() {
      output.dispose()
      executor.dispose()
    },
  })
}
