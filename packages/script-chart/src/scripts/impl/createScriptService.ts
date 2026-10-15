/** 通过 core 定义仓库提交完整脚本文档，不维护影子源码仓库。 */
import {
  getIndicatorDescriptor,
  getRegisteredIndicatorDefinition,
  getRegisteredIndicatorDefinitions,
  registerPlotIndicator,
  removeScriptIndicatorDefinition,
  updatePlotIndicator,
} from '@363045841yyt/klinechart-core'
import {
  type PreparedQuickJSScript,
  preloadQuickJS,
  prepareQuickJSScript,
  type QuickJSLibrary,
  type QuickJSScriptDefinition,
} from '@363045841yyt/klinechart-script'
import type { ScriptDocument, ScriptService, ScriptServiceOptions } from '../types.js'
import { createScriptPersistence } from './scriptPersistence.js'

/** 应用级脚本服务：启动恢复源码，读写统一经过 core 定义仓库。 */
export async function createScriptService(
  libraries: readonly QuickJSLibrary[] = [],
  options: ScriptServiceOptions = {},
): Promise<ScriptService> {
  await preloadQuickJS()
  const persistence = options.persistence ?? createScriptPersistence()
  const restored = await persistence.load()
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
      id: metadata.displayName,
      identity: document.identity,
      revision: document.revision,
      source: document.source,
      definition: document.definition,
    })
  }

  /** 校验和编译全部完成后，以单个定义快照提交，执行闭包绑定该版本源码。 */
  function publish(
    source: string,
    prepared: PreparedQuickJSScript,
    revision: number,
    update: boolean,
    identity: ScriptDocument['identity'] = 'user',
  ): ScriptDocument {
    const { definition } = prepared
    const id = definition.displayName ?? definition.name
    const document = Object.freeze({ revision, source, definition, identity })
    const commit = update ? updatePlotIndicator : registerPlotIndicator
    commit({
      ...definition,
      source: 'script',
      document,
      compute: (bars, params) => prepared.run(bars, params),
    })
    return Object.freeze({ id, ...document })
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
    return Object.freeze(
      getRegisteredIndicatorDefinitions().flatMap((metadata) => {
        const document = read(metadata.name)
        return document ? [document] : []
      }),
    )
  }
  /** 在注册前检查全部身份，避免写入一个无法注册的持久化文档。 */
  function assertAvailable(definition: QuickJSScriptDefinition): void {
    for (const id of [definition.name, definition.displayName ?? definition.name]) {
      if (!/[\p{L}\p{N}]/u.test(id)) throw new Error('脚本名称必须包含字母或数字')
      if (getIndicatorDescriptor(id)) throw new Error(`脚本名称已存在：${id}`)
    }
  }
  /** 持久化完成后才发布运行定义；保存失败保留当前版本。 */
  async function persist(documents: readonly ScriptDocument[]): Promise<void> {
    if (
      !(await persistence.save(
        documents
          .filter((item) => item.identity === 'user')
          .map(({ source, revision }) => ({ source, revision })),
      ))
    ) {
      throw new Error('用户脚本保存失败')
    }
  }
  for (const source of options.builtinSources ?? []) {
    publish(source, prepareQuickJSScript(source, libraries), 1, false, 'builtin')
  }
  for (const document of restored ?? []) {
    const prepared = prepareQuickJSScript(document.source, libraries)
    const { definition } = prepared
    assertAvailable(definition)
    publish(document.source, prepared, document.revision, false)
  }

  return Object.freeze({
    create(source: string) {
      return enqueue(async () => {
        const prepared = prepareQuickJSScript(source, libraries)
        const { definition } = prepared
        assertAvailable(definition)
        const document: ScriptDocument = {
          id: definition.displayName ?? definition.name,
          identity: 'user',
          source,
          revision: 1,
          definition,
        }
        await persist([...list(), document])
        return publish(source, prepared, 1, false)
      })
    },
    read,
    list,
    update(id: string, source: string, expectedRevision: number) {
      return enqueue(async () => {
        const current = requireRevision(id, expectedRevision)
        const prepared = prepareQuickJSScript(source, libraries)
        const { definition } = prepared
        if (
          definition.name !== current.definition.name ||
          (definition.displayName ?? definition.name) !== current.id
        ) {
          throw new Error('已有脚本的 name 和 displayName 是固定身份，请创建新脚本')
        }
        const revision = current.revision + 1
        await persist(
          list().map((item) => (item.id === current.id ? { ...item, source, revision } : item)),
        )
        return publish(source, prepared, revision, true)
      })
    },
    remove(id: string, expectedRevision: number) {
      return enqueue(async () => {
        const current = requireRevision(id, expectedRevision)
        await persist(list().filter((item) => item.id !== current.id))
        removeScriptIndicatorDefinition(current.definition.name)
      })
    },
  })
}
