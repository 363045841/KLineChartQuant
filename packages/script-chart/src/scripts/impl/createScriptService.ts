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
import { DEFAULT_REQUEST_BARS } from '@363045841yyt/klinechart-plot-contracts'
import { type QuickJSLibrary, type QuickJSScriptDefinition } from '@363045841yyt/klinechart-script'
import { createScriptWorker } from '@363045841yyt/klinechart-script/worker'
import type { ScriptDocument, ScriptService, ScriptServiceOptions } from '../types.js'
import { createScriptOutput } from './createScriptOutput.js'
import { createScriptPersistence } from './scriptPersistence.js'

/** 应用级脚本服务：启动恢复源码，读写统一经过 core 定义仓库。 */
export async function createScriptService(
  libraries: readonly QuickJSLibrary[] = [],
  options: ScriptServiceOptions = {},
): Promise<ScriptService> {
  const persistence = options.persistence ?? createScriptPersistence()
  const restored = await persistence.load()
  const handles = new Map<string, string>()
  const output = createScriptOutput()
  const worker = createScriptWorker(undefined, (handle, events) => {
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
      id: metadata.name,
      identity: document.identity,
      revision: document.revision,
      source: document.source,
      trusted: document.trusted === true,
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
  ): Promise<ScriptDocument> {
    const { definition } = prepared
    const document = Object.freeze({ revision, source, definition, identity, trusted })
    const commit = update ? updatePlotIndicator : registerPlotIndicator
    commit({
      ...definition,
      id,
      source: 'script',
      document,
      compute: async (bars, params, market) => {
        if (market === undefined) return worker.run(prepared.handle, bars, params)
        const requests = await worker.requests(prepared.handle, params, market.symbol)
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
        return worker.run(prepared.handle, bars, params, { symbol: market.symbol, snapshots })
      },
    })
    const previous = handles.get(id)
    handles.set(id, prepared.handle)
    if (previous) await worker.release(previous)
    return Object.freeze({ id, ...document })
  }

  /** 每次准备使用独立句柄，保存失败或过期提交不会覆盖当前可执行版本。 */
  async function prepare(source: string, trusted: boolean) {
    const handle = generateUUID()
    const definition = await worker.prepare(handle, source, libraries, trusted)
    return { handle, definition }
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
  /** 在注册前检查身份，避免写入一个无法注册的持久化文档。 */
  function assertAvailable(definition: QuickJSScriptDefinition, currentId?: string): void {
    const name = definition.name
    if (!/[\p{L}\p{N}]/u.test(name)) throw new Error('脚本名称必须包含字母或数字')
    const existing = getIndicatorDescriptor(name)
    if (existing && existing.name !== currentId) throw new Error(`脚本名称已存在：${name}`)
  }
  /** 持久化完成后才发布运行定义；保存失败保留当前版本。 */
  async function persist(documents: readonly ScriptDocument[]): Promise<void> {
    if (
      !(await persistence.save(
        documents
          .filter((item) => item.identity === 'user')
          .map(({ id, source, revision, trusted }) => ({ id, source, revision, trusted })),
      ))
    ) {
      throw new Error('用户脚本保存失败')
    }
  }
  try {
    for (const source of options.builtinSources ?? []) {
      const prepared = await prepare(source, true)
      // 内置脚本随包发布且只读，可信是它的固有属性，不是用户选择。
      await publish(prepared.definition.name, source, prepared, 1, false, true, 'builtin')
    }
    for (const document of restored ?? []) {
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
      )
    }
  } catch (error) {
    worker.dispose()
    throw error
  }

  return Object.freeze({
    output: output.source,
    create(source: string, trusted = false) {
      return enqueue(async () => {
        const id = `script_${generateUUID()}`
        const prepared = await prepare(source, trusted)
        try {
          const { definition } = prepared
          assertAvailable(definition)
          const document: ScriptDocument = {
            id,
            identity: 'user',
            source,
            revision: 1,
            definition,
            trusted,
          }
          await persist([...list(), document])
          return await publish(document.id, source, prepared, 1, false, trusted)
        } finally {
          if (handles.get(id) !== prepared.handle) await worker.release(prepared.handle)
        }
      })
    },
    read,
    list,
    update(id: string, source: string, expectedRevision: number, trusted = false) {
      return enqueue(async () => {
        const current = requireRevision(id, expectedRevision)
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
          return await publish(current.id, source, prepared, revision, true, trusted)
        } finally {
          if (handles.get(current.id) !== prepared.handle) await worker.release(prepared.handle)
        }
      })
    },
    remove(id: string, expectedRevision: number) {
      return enqueue(async () => {
        const current = requireRevision(id, expectedRevision)
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
    },
  })
}
