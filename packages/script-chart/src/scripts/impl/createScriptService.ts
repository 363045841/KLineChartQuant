/** 通过 core 定义仓库提交完整脚本文档，不维护影子源码仓库。 */
import {
  generateUUID,
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  registerPlotIndicator,
  removeScriptIndicatorDefinition,
  updatePlotIndicator,
} from '@363045841yyt/klinechart-core'
import {
  type Bar,
  DEFAULT_REQUEST_BARS,
  type IndicatorMarketContext,
  type ScriptRunOptions,
} from '@363045841yyt/klinechart-plot-contracts'
import {
  builtinLibraries,
  inspectScript,
  type QuickJSLibrary,
  type QuickJSScriptDefinition,
  resolveScriptLibraries,
} from '@363045841yyt/klinechart-script'
import { createScriptWorker } from '@363045841yyt/klinechart-script/worker'
import type {
  ScriptDocument,
  ScriptFolder,
  ScriptService,
  ScriptServiceOptions,
  ScriptWorkspace,
} from '../types.js'
import { createScriptOutput } from './createScriptOutput.js'
import { isWithinFolder, normalizeFolderPath, parentFolderPath } from './folderPath.js'
import { createScriptPersistence } from './scriptPersistence.js'

/** 应用级脚本服务：启动恢复源码，读写统一经过 core 定义仓库。 */
export async function createScriptService(
  libraries: readonly QuickJSLibrary[] = [],
  options: ScriptServiceOptions = {},
): Promise<ScriptService> {
  const persistence = options.persistence ?? createScriptPersistence()
  const restored = await persistence.load()
  const handles = new Map<string, string>()
  const debugOutputs = new Map<string, string>()
  // 文件夹按 kind 命名空间隔离；只保存非根路径，根目录由文件自身表达。
  const folders = new Map<string, ScriptFolder>()

  /** 文件夹唯一键：同一路径在不同分组下互不影响。 */
  function folderKey(kind: ScriptFolder['kind'], path: string): string {
    return `${kind}:${path}`
  }

  /** 文档只能落在已存在的文件夹中，避免目录树出现悬空路径。 */
  function requireFolder(kind: ScriptFolder['kind'], path: string): string {
    if (path === '') return ''
    const normalized = normalizeFolderPath(path)
    if (!folders.has(folderKey(kind, normalized))) throw new Error(`文件夹不存在：${normalized}`)
    return normalized
  }

  // 库没有图表定义，源码直接归本服务所有；指标仍从 core 的提交快照读取。
  const libraryDocuments = new Map<string, ScriptDocument>()
  // 内置库随包发布，只做目录展示，不进入持久化和依赖目录。
  const builtinLibraryDocuments = new Map<string, ScriptDocument>(
    builtinLibraries.map((library) => [
      `builtin_library_${library.name}`,
      Object.freeze({
        id: `builtin_library_${library.name}`,
        kind: 'library' as const,
        identity: 'builtin' as const,
        trusted: true,
        revision: 1,
        source: library.typeSource,
        folder: '',
        definition: { name: library.name },
      }),
    ]),
  )
  const output = createScriptOutput()
  const worker = createScriptWorker(undefined, (handle, events) => {
    const outputId = debugOutputs.get(handle)
    if (outputId !== undefined) output.append(outputId, events)
    for (const [id, active] of handles) {
      if (active === handle) output.append(id, events)
    }
  })
  // 异步写入串行执行，版本检查与快照生成均在队列内完成。
  let pending: Promise<unknown> = Promise.resolve()
  /** 串行提交，单次失败不会阻断后续保存。 */
  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation)
    pending = result.catch(() => undefined)
    return result
  }

  /** 从已提交定义还原公开快照，读取无需重新执行用户脚本。 */
  function read(id: string): ScriptDocument | undefined {
    const builtin = builtinLibraryDocuments.get(id)
    if (builtin) return builtin
    const library =
      libraryDocuments.get(id) ??
      [...libraryDocuments.values()].find((item) => item.definition.name === id)
    if (library) return library
    const metadata = getRegisteredIndicatorDefinition(id)
    const document = metadata?.document
    if (!metadata || !document || metadata.source !== 'script') return undefined
    // 定义在提交时已校验；公开元数据保存在同一不可变编译快照内。
    return documentsFromMetadata(metadata.name)
  }

  /** 文档读模型从 core 的编译产物读取，元数据不再执行 VM。 */
  function documentsFromMetadata(name: string): ScriptDocument | undefined {
    const metadata = getRegisteredIndicatorDefinition(name)
    const document = metadata?.document
    if (!metadata || !document || !document.definition) return undefined
    return Object.freeze({
      kind: 'indicator',
      id: metadata.name,
      identity: document.identity,
      revision: document.revision,
      source: document.source,
      trusted: document.trusted === true,
      folder: document.folder,
      definition: document.definition,
    })
  }

  /** 校验和编译全部完成后，以单个定义快照提交，执行闭包绑定该版本源码。 */
  async function publish(
    id: string,
    source: string,
    prepared: { readonly handle: string; readonly definition: QuickJSScriptDefinition },
    revision: number,
    update: boolean,
    trusted: boolean,
    identity: ScriptDocument['identity'] = 'user',
    folder = '',
  ): Promise<ScriptDocument> {
    const { definition } = prepared
    const document = Object.freeze({ revision, source, definition, identity, trusted, folder })
    const commit = update ? updatePlotIndicator : registerPlotIndicator
    commit({
      ...definition,
      id,
      source: 'script',
      document,
      compute: (bars, params, market) => compute(prepared.handle, bars, params, market),
    })
    const previous = handles.get(id)
    handles.set(id, prepared.handle)
    if (previous) await worker.release(previous)
    return Object.freeze({ kind: 'indicator', id, ...document })
  }

  /** 调试和图表计算共用 Request 准备及 Worker 执行入口。 */
  async function compute(
    handle: string,
    bars: readonly Bar[],
    params: Readonly<Record<string, number | string | boolean>>,
    market?: IndicatorMarketContext,
  ) {
    if (market === undefined) return worker.run(handle, bars, params)
    const requests = await worker.requests(handle, params, market.symbol)
    const snapshots = await Promise.all(
      requests.map(async (request) => ({
        id: request.id,
        bars: await market.loadBars({
          symbol: request.symbol,
          timeframe: request.timeframe,
          source: request.source,
          calcBarsCount:
            request.calcBarsCount === undefined ? DEFAULT_REQUEST_BARS : request.calcBarsCount,
        }),
      })),
    )
    return worker.run(handle, bars, params, { symbol: market.symbol, snapshots })
  }

  /** 每次准备使用独立句柄，保存失败或过期提交不会覆盖当前可执行版本。 */
  async function prepare(source: string, trusted: boolean, documents = list()) {
    const handle = generateUUID()
    const catalog = libraryCatalog(documents)
    const resolved = resolveScriptLibraries(source, catalog)
    const selected = [
      ...libraries,
      ...resolved.filter((item) => !libraries.some((host) => host.name === item.name)),
    ]
    const effectiveTrust =
      trusted &&
      resolved.every((library) => {
        const document = documents.find(
          (item) => item.kind === 'library' && item.definition.name === library.name,
        )
        return document === undefined || document.trusted
      })
    const definition = await worker.prepare(handle, source, selected, effectiveTrust)
    return { handle, definition }
  }

  /** 由当前文档快照生成库目录，不另存可变的加载列表。 */
  function libraryCatalog(documents: readonly ScriptDocument[]): QuickJSLibrary[] {
    return [
      ...libraries,
      ...documents
        .filter((item) => item.kind === 'library' && item.identity === 'user')
        .map((item) => ({ name: item.definition.name, source: item.source })),
    ]
  }

  /** 验证库初始化及受影响指标后才持久化，失败不替换任何已提交版本。 */
  async function saveLibrary(
    document: ScriptDocument,
    previous?: ScriptDocument,
  ): Promise<ScriptDocument> {
    const documents = [...list().filter((item) => item.id !== document.id), document]
    if (
      documents.some(
        (item) => item.id !== document.id && item.definition.name === document.definition.name,
      )
    ) {
      throw new Error(`脚本名称已存在：${document.definition.name}`)
    }
    const catalog = libraryCatalog(documents)
    const names = new Set<string>(['ta'])
    for (const library of catalog) {
      if (names.has(library.name)) throw new Error(`库名已存在：${library.name}`)
      names.add(library.name)
    }
    // 所有库都解析依赖，也检测重命名导致的悬空引用。
    for (const library of catalog) resolveScriptLibraries(library.source, catalog)
    const validation = await prepare(
      `importLibrary(${JSON.stringify(document.definition.name)});\ndefineIndicator({ name: '__library_validation', position: Position.Sub, onBar() {} })`,
      false,
      documents,
    )
    await worker.release(validation.handle)
    const affected: { document: ScriptDocument; prepared: Awaited<ReturnType<typeof prepare>> }[] =
      []
    try {
      for (const item of documents) {
        if (item.kind !== 'indicator') continue
        const dependencies = resolveScriptLibraries(item.source, catalog)
        if (
          !dependencies.some(
            (library) =>
              library.name === document.definition.name ||
              library.name === previous?.definition.name,
          )
        )
          continue
        const prepared = await prepare(item.source, item.trusted, documents)
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
      libraryDocuments.set(document.id, Object.freeze(document))
      for (const item of affected) {
        await publish(
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
      for (const item of affected) {
        if (handles.get(item.document.id) !== item.prepared.handle)
          await worker.release(item.prepared.handle)
      }
    }
  }

  /** 乐观并发校验，过期编辑会话不能覆盖新提交。 */
  function requireRevision(id: string, expected: number): ScriptDocument {
    const current = read(id)
    if (!current) throw new Error(`脚本不存在：${id}`)
    if (current.identity === 'builtin') throw new Error('内置脚本只读，请创建副本')
    if (current.revision !== expected) throw new Error(`脚本已更新，请重新打开：${id}`)
    return current
  }

  /** 从唯一注册表派生用户快照，不维护第二份源码状态。 */
  function list(): readonly ScriptDocument[] {
    return Object.freeze([
      ...getRegisteredIndicatorDefinitions().flatMap((metadata) => {
        const document = read(metadata.name)
        return document ? [document] : []
      }),
      ...builtinLibraryDocuments.values(),
      ...libraryDocuments.values(),
    ])
  }
  /** 返回按分组与路径排序的文件夹快照，目录树一次渲染完成。 */
  function listFolders(): readonly ScriptFolder[] {
    return Object.freeze(
      [...folders.values()].sort(
        (a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path, 'zh-CN'),
      ),
    )
  }
  /** 在注册前检查身份，避免写入一个无法注册的持久化文档。 */
  function assertAvailable(definition: QuickJSScriptDefinition, currentId?: string): void {
    const name = definition.name
    if (!/[\p{L}\p{N}]/u.test(name)) throw new Error('脚本名称必须包含字母或数字')
    const existing = getIndicatorDescriptor(name)
    if (existing && existing.name !== currentId) throw new Error(`脚本名称已存在：${name}`)
    if ([...libraryDocuments.values()].some((item) => item.definition.name === name))
      throw new Error(`脚本名称已存在：${name}`)
  }
  /** 持久化完成后才发布运行定义；保存失败保留当前版本。 */
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
    if (!(await persistence.save(workspace))) {
      throw new Error('用户脚本保存失败')
    }
  }
  try {
    // 先恢复文件夹，再恢复库和指标；文档只能落在已恢复的目录中。
    const restoredFolders = [...(restored?.folders ?? [])].sort(
      (a, b) => a.path.split('/').length - b.path.split('/').length,
    )
    for (const folder of restoredFolders) {
      const path = normalizeFolderPath(folder.path)
      requireFolder(folder.kind, parentFolderPath(path))
      folders.set(folderKey(folder.kind, path), Object.freeze({ kind: folder.kind, path }))
    }
    const restoredDocuments = restored?.scripts ?? []
    // 先恢复全部库，再准备指标；归档顺序不参与依赖加载。
    for (const document of restoredDocuments) {
      const declaration = inspectScript(document.source)
      if (declaration.kind === 'library')
        libraryDocuments.set(
          document.id,
          Object.freeze({
            ...document,
            identity: 'user',
            kind: 'library',
            definition: { name: declaration.name },
          }),
        )
    }
    const restoredCatalog = libraryCatalog(list())
    for (const library of restoredCatalog) {
      const validation = await prepare(
        `importLibrary(${JSON.stringify(library.name)});\ndefineIndicator({ name: '__library_validation', position: Position.Sub, onBar() {} })`,
        false,
      )
      await worker.release(validation.handle)
    }
    for (const source of options.builtinSources ?? []) {
      const prepared = await prepare(source, true)
      // 内置脚本随包发布且只读，可信是它的固有属性，不是用户选择。
      await publish(prepared.definition.name, source, prepared, 1, false, true, 'builtin')
    }
    for (const document of restoredDocuments) {
      if (libraryDocuments.has(document.id)) continue
      const prepared = await prepare(document.source, document.trusted)
      const { definition } = prepared
      assertAvailable(definition)
      if (getIndicatorDescriptor(document.id)) throw new Error(`脚本 ID 已存在：${document.id}`)
      await publish(
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
  } catch (error) {
    worker.dispose()
    throw error
  }

  return Object.freeze({
    output: output.source,
    async run(options: ScriptRunOptions) {
      output.source.clear(options.outputId)
      const prepared = await prepare(options.source, options.trusted)
      debugOutputs.set(prepared.handle, options.outputId)
      try {
        await compute(prepared.handle, options.bars, {}, options.market)
      } finally {
        debugOutputs.delete(prepared.handle)
        await worker.release(prepared.handle)
      }
    },
    create(source: string, trusted = false, folder = '') {
      return enqueue(async () => {
        const id = `script_${generateUUID()}`
        const declaration = inspectScript(source)
        const target = requireFolder(declaration.kind, folder)
        if (declaration.kind === 'library') {
          return saveLibrary({
            id,
            source,
            trusted,
            revision: 1,
            identity: 'user',
            kind: 'library',
            folder: target,
            definition: { name: declaration.name },
          })
        }
        const prepared = await prepare(source, trusted)
        try {
          const { definition } = prepared
          assertAvailable(definition)
          const document: ScriptDocument = {
            kind: 'indicator',
            id,
            identity: 'user',
            source,
            revision: 1,
            definition,
            trusted,
            folder: target,
          }
          await persist([...list(), document])
          return await publish(document.id, source, prepared, 1, false, trusted, 'user', target)
        } finally {
          if (handles.get(id) !== prepared.handle) await worker.release(prepared.handle)
        }
      })
    },
    listFolders,
    /** 删除目录子树及其文档；引用检查在写入前完成，避免部分删除。 */
    removeFolder(folder: ScriptFolder) {
      return enqueue(async () => {
        const path = normalizeFolderPath(folder.path)
        const key = folderKey(folder.kind, path)
        if (!folders.has(key)) throw new Error(`文件夹不存在：${path}`)
        const removed = list().filter(
          (item) =>
            item.identity === 'user' &&
            item.kind === folder.kind &&
            isWithinFolder(item.folder, path),
        )
        const removedIds = new Set(removed.map((item) => item.id))
        const catalog = libraryCatalog(list())
        const libraryNames = new Set(
          removed.filter((item) => item.kind === 'library').map((item) => item.definition.name),
        )
        // 目录外脚本仍引用目录内的库时整体拒绝，删除不能留下悬空依赖。
        const outside = list().filter(
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
        const removedFolders = [...folders].filter(
          ([, record]) => record.kind === folder.kind && isWithinFolder(record.path, path),
        )
        const removedKeys = new Set(removedFolders.map(([entryKey]) => entryKey))
        await persist(
          list().filter((item) => !removedIds.has(item.id)),
          [...folders]
            .filter(([entryKey]) => !removedKeys.has(entryKey))
            .map(([, record]) => record),
        )
        for (const entryKey of removedKeys) folders.delete(entryKey)
        const releasedHandles: string[] = []
        for (const item of removed) {
          if (item.kind === 'library') libraryDocuments.delete(item.id)
          else removeScriptIndicatorDefinition(item.id)
          output.remove(item.id)
          const handle = handles.get(item.id)
          if (handle) {
            handles.delete(item.id)
            releasedHandles.push(handle)
          }
        }
        await Promise.allSettled(releasedHandles.map((handle) => worker.release(handle)))
        return {
          documentIds: [...removedIds],
          folders: removedFolders.map(([, record]) => record),
        }
      })
    },
    /** 空文件夹与脚本文档共用一次持久化事务，恢复顺序不依赖文档存在。 */
    createFolder(folder: ScriptFolder) {
      return enqueue(async () => {
        const path = normalizeFolderPath(folder.path)
        const key = folderKey(folder.kind, path)
        if (folders.has(key)) throw new Error(`文件夹已存在：${path}`)
        requireFolder(folder.kind, parentFolderPath(path))
        const record = Object.freeze({ kind: folder.kind, path })
        await persist(list(), [...folders.values(), record])
        folders.set(key, record)
      })
    },
    read,
    list,
    update(id: string, source: string, expectedRevision: number, trusted = false) {
      return enqueue(async () => {
        const current = requireRevision(id, expectedRevision)
        const declaration = inspectScript(source)
        if (declaration.kind !== current.kind) throw new Error('不能更改脚本文档类型')
        if (declaration.kind === 'library') {
          return saveLibrary(
            {
              ...current,
              kind: 'library',
              source,
              trusted,
              revision: current.revision + 1,
              definition: { name: declaration.name },
            },
            current,
          )
        }
        const prepared = await prepare(source, trusted)
        try {
          const { definition } = prepared
          assertAvailable(definition, current.id)
          const revision = current.revision + 1
          await persist(
            list().map((item) =>
              item.id === current.id ? { ...item, source, revision, definition, trusted } : item,
            ),
          )
          return await publish(
            current.id,
            source,
            prepared,
            revision,
            true,
            trusted,
            'user',
            current.folder,
          )
        } finally {
          if (handles.get(current.id) !== prepared.handle) await worker.release(prepared.handle)
        }
      })
    },
    remove(id: string, expectedRevision: number) {
      return enqueue(async () => {
        const current = requireRevision(id, expectedRevision)
        if (current.kind === 'library') {
          const catalog = libraryCatalog(list())
          const references = list().filter(
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
          await persist(list().filter((item) => item.id !== id))
          libraryDocuments.delete(id)
          return
        }
        await persist(list().filter((item) => item.id !== current.id))
        removeScriptIndicatorDefinition(current.id)
        output.remove(current.id)
        const handle = handles.get(current.id)
        if (handle) {
          handles.delete(current.id)
          await worker.release(handle)
        }
      })
    },
    dispose() {
      output.dispose()
      worker.dispose()
      handles.clear()
      debugOutputs.clear()
    },
  })
}
