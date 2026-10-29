/** 脚本文档读模型：指标来自 core 注册表，库由本服务持有；不维护第二份源码状态。 */
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  type IndicatorMetadata,
} from '@363045841yyt/klinechart-core'
import {
  builtinLibraries,
  type QuickJSLibrary,
  type QuickJSScriptDefinition,
} from '@363045841yyt/klinechart-script'
import type { ScriptDocument } from '../types.js'

/** 文档读模型实例；所有读取都从这里出，不缓存第二份源码。 */
export type ScriptDocumentStore = ReturnType<typeof createScriptDocumentStore>

/** 从已提交定义还原公开快照，读取无需重新执行用户脚本。 */
function fromMetadata(metadata: IndicatorMetadata | undefined): ScriptDocument | undefined {
  const document = metadata?.document
  if (!metadata || metadata.source !== 'script' || !document || !document.definition)
    return undefined
  // 定义在提交时已校验；公开元数据保存在同一不可变编译快照内。
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

/**
 * 创建文档读模型。
 *
 * @param hostLibraries 宿主注入的库源码，参与依赖解析但不进入用户仓库
 */
export function createScriptDocumentStore(hostLibraries: readonly QuickJSLibrary[]) {
  // 内置库随包发布，只做目录展示，不进入持久化和依赖目录。
  const builtinDocuments = new Map<string, ScriptDocument>(
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
  // 库没有图表定义，源码直接归本服务所有；指标仍从 core 的提交快照读取。
  const userLibraries = new Map<string, ScriptDocument>()

  /** 按 id 读取；库额外接受名称，供编辑器按名字查同名文档。 */
  function read(id: string): ScriptDocument | undefined {
    const builtin = builtinDocuments.get(id)
    if (builtin) return builtin
    const library =
      userLibraries.get(id) ??
      [...userLibraries.values()].find((item) => item.definition.name === id)
    if (library) return library
    return fromMetadata(getRegisteredIndicatorDefinition(id))
  }

  /** 从唯一注册表派生用户快照，不维护第二份源码状态。 */
  function list(): readonly ScriptDocument[] {
    return Object.freeze([
      ...getRegisteredIndicatorDefinitions().flatMap((metadata) => {
        const document = fromMetadata(metadata)
        return document ? [document] : []
      }),
      ...builtinDocuments.values(),
      ...userLibraries.values(),
    ])
  }

  /** 乐观并发校验，过期编辑会话不能覆盖新提交。 */
  function requireRevision(id: string, expected: number): ScriptDocument {
    const current = read(id)
    if (!current) throw new Error(`脚本不存在：${id}`)
    if (current.identity === 'builtin') throw new Error('内置脚本只读，请创建副本')
    if (current.revision !== expected) throw new Error(`脚本已更新，请重新打开：${id}`)
    return current
  }

  /** 在注册前检查身份，避免写入一个无法注册的持久化文档。 */
  function assertAvailable(definition: QuickJSScriptDefinition, currentId?: string): void {
    const name = definition.name
    if (!/[\p{L}\p{N}]/u.test(name)) throw new Error('脚本名称必须包含字母或数字')
    const existing = getIndicatorDescriptor(name)
    if (existing && existing.name !== currentId) throw new Error(`脚本名称已存在：${name}`)
    if ([...userLibraries.values()].some((item) => item.definition.name === name))
      throw new Error(`脚本名称已存在：${name}`)
  }

  /** 由当前文档快照生成库目录，不另存可变的加载列表。 */
  function catalog(documents: readonly ScriptDocument[] = list()): QuickJSLibrary[] {
    return [
      ...hostLibraries,
      ...documents
        .filter((item) => item.kind === 'library' && item.identity === 'user')
        .map((item) => ({ name: item.definition.name, source: item.source })),
    ]
  }

  /** 保存成功后才替换运行中的库快照。 */
  function setLibrary(document: ScriptDocument): void {
    userLibraries.set(document.id, Object.freeze(document))
  }

  function deleteLibrary(id: string): void {
    userLibraries.delete(id)
  }

  return {
    hostLibraries,
    read,
    list,
    requireRevision,
    assertAvailable,
    catalog,
    setLibrary,
    deleteLibrary,
  }
}
