/**
 * 应用级脚本服务：启动恢复、串行持久化与目录操作。
 *
 * 文档读取、编译执行、库保存分别由独立模块负责；这里只做装配与事务边界。
 * 指标注册一律调用 Core 的唯一写入口，不存在旁路。
 */
import {
  generateUUID,
  logIndicatorFailure,
  runIndicatorPipeline,
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
import { createScriptLog } from './createScriptLog.js'
import { restoreScriptWorkspace } from './restoreScriptWorkspace.js'
import { saveScriptLibrary } from './saveScriptLibrary.js'
import {
  commitIndicators,
  documentIdentity,
  scriptCandidate,
  toSavedScript,
} from './scriptCommit.js'
import { createScriptDocumentStore } from './scriptDocumentStore.js'
import { type CompiledScript, createScriptExecutor } from './scriptExecutor.js'
import {
  folderKey,
  foldersWithin,
  nextFolder,
  removableFolder,
  requireFolder,
} from './scriptFolderStore.js'
import { createScriptIndicatorStage } from './scriptIndicatorStage.js'

/**
 * 创建脚本服务。
 *
 * @param libraries 宿主注入的库源码，与用户库共同参与依赖解析
 * @param options 持久化与内置源码选项
 */
export async function createScriptService(
  libraries: readonly QuickJSLibrary[],
  options: ScriptServiceOptions,
): Promise<ScriptService> {
  const persistence = options.persistence
  const log = createScriptLog()
  const store = createScriptDocumentStore(libraries, options.definitions)
  const executor = createScriptExecutor(store, log, options.createWorkerPool)
  const restored = await restoreScriptWorkspace({ persistence, store, executor, options })
  const folders = restored.folders
  const report = await runIndicatorPipeline(options.definitions, [
    createScriptIndicatorStage({
      builtinSources: options.builtinSources,
      documents: restored.scripts,
      executor,
    }),
  ])
  if (restored.failures.length > 0) {
    for (const failure of restored.failures) logIndicatorFailure(failure)
    options.definitions.setFailures([...restored.failures, ...report.failures])
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
      scripts: documents.filter((item) => item.identity === 'user').map(toSavedScript),
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
  async function commitIndicator(
    document: ScriptDocument & { kind: 'indicator' | 'alert' },
    compiled: CompiledScript,
  ): Promise<ScriptDocument> {
    const definition = await executor.createDefinition(compiled, documentIdentity(document))
    commitIndicators(options.definitions, [
      { kind: 'definition', candidate: scriptCandidate(document.id), definition },
    ])
    return document
  }

  /**
   * 指标文档的写入流程：检查身份、持久化、注册；任何一步失败都归还编译句柄。
   *
   * 新建与更新只在“目标文档从哪里来”上不同，事务顺序完全一致。
   */
  async function writeIndicator(
    document: ScriptDocument & { kind: 'indicator' | 'alert' },
    compiled: CompiledScript,
    documents: readonly ScriptDocument[],
  ): Promise<ScriptDocument> {
    try {
      store.assertAvailable(compiled.definition, document.id)
      await persist(documents)
      return await commitIndicator(document, compiled)
    } catch (error) {
      await executor.abandon(document.id, compiled.handle)
      throw error
    }
  }

  /** 文档被撤销后的运行时清理：注销定义、清空输出、释放执行句柄。 */
  async function dropDocument(document: ScriptDocument): Promise<void> {
    if (document.kind === 'library') store.deleteLibrary(document.id)
    else options.definitions.unregister(document.id)
    log.remove(document.id)
    await executor.releaseDefinition(document.id)
  }

  /**
   * 创建一份用户脚本文档。
   *
   * kind 由源码声明决定；requiredKind 在写入任何状态前限制入口，
   * 让 Agent 只能创建指标脚本，不能顺带写入库脚本。
   */
  function createDocument(
    source: string,
    trusted: boolean,
    folder: string,
    requiredKind?: 'indicator',
  ): Promise<ScriptDocument> {
    return enqueue(async () => {
      const id = `script_${generateUUID()}`
      const declaration = inspectScript(source)
      if (requiredKind !== undefined && declaration.kind !== requiredKind)
        throw new Error('该入口只接受 defineIndicator；defineLibrary 和 defineAlert 请通过脚本工作区创建')
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
          definitions: options.definitions,
        })
      }
      const compiled = await executor.compile(source, trusted)
      const document: ScriptDocument & { kind: 'indicator' | 'alert' } = {
        kind: compiled.definition.kind,
        id,
        identity: 'user',
        source,
        revision: 1,
        definition: compiled.definition,
        trusted,
        folder: target,
      }
      return writeIndicator(document, compiled, [...store.list(), document])
    })
  }

  async function assertUnreferencedAlert(document: ScriptDocument): Promise<void> {
    if (document.kind === 'alert' && await options.isDefinitionReferenced?.(document.id)) {
      throw new Error(`脚本仍被警报引用：${document.definition.name}`)
    }
  }

  return Object.freeze({
    log: log.source,
    failures: options.definitions.failures,
    run(options: ScriptRunOptions) {
      return executor.run(options)
    },
    create(source: string, trusted = false, folder = '') {
      return createDocument(source, trusted, folder)
    },
    createIndicator(source: string, folder = '') {
      return createDocument(source, false, folder, 'indicator')
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
        // 目录内仍被警报引用的脚本不能被删除，避免留下悬空规则。
        for (const item of removed) await assertUnreferencedAlert(item)
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
        for (const item of removed) await dropDocument(item)
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
        if (current.kind === 'library') {
          if (declaration.kind !== 'library') throw new Error('不能更改脚本文档类型')
          return saveScriptLibrary({
            document: {
              ...current,
              source,
              trusted,
              revision: current.revision + 1,
              definition: { name: declaration.name },
            },
            previous: current,
            store,
            executor,
            persist,
            definitions: options.definitions,
          })
        }
        if (declaration.kind !== current.kind) throw new Error('不能更改脚本文档类型')
        const compiled = await executor.compile(source, trusted)
        const document: ScriptDocument & { kind: 'indicator' | 'alert' } = {
          ...current,
          source,
          trusted,
          revision: current.revision + 1,
          definition: compiled.definition,
        }
        return writeIndicator(
          document,
          compiled,
          store.list().map((item) => (item.id === current.id ? document : item)),
        )
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
          await dropDocument(current)
          return
        }
        // 仍被警报引用的脚本不能被删除，避免留下悬空规则。
        await assertUnreferencedAlert(current)
        await persist(store.list().filter((item) => item.id !== current.id))
        await dropDocument(current)
      })
    },
    dispose() {
      log.dispose()
      executor.dispose()
    },
  })
}
