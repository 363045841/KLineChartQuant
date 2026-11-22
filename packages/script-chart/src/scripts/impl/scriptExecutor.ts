/**
 * 脚本编译与执行：持有编译句柄、按提交快照生成指标定义、转发调试输出。
 *
 * 只依赖文档读模型和 Worker，不接触持久化、目录与注册表；注册由调用方完成。
 */
import { createPlotIndicatorDefinition, generateUUID } from '@363045841yyt/klinechart-core'
import {
  type Bar,
  type ComputeRange,
  type IndicatorDefinition,
  type IndicatorMarketContext,
  type IndicatorSourceDocument,
  type ScriptRunOptions,
} from '@363045841yyt/klinechart-plot-contracts'
import {
  type PreparedScriptDefinition,
  type QuickJSLibrary,
  resolveScriptLibraries,
} from '@363045841yyt/klinechart-script'
import { createScriptWorkerPool } from '@363045841yyt/klinechart-script/worker'
import type { ScriptDocument } from '../types.js'
import type { createScriptLog } from './createScriptLog.js'
import { prepareScriptMarketData } from './prepareScriptMarketData.js'
import type { ScriptDocumentStore } from './scriptDocumentStore.js'

/** 一次编译的产物；提交成功前不进入运行表。 */
export interface CompiledScript {
  readonly handle: string
  readonly definition: PreparedScriptDefinition
}

/** 生成指标定义所需的提交信息；与持久化文档一一对应。 */
export interface CompiledScriptIdentity {
  readonly id: string
  readonly source: string
  readonly revision: number
  readonly identity: IndicatorSourceDocument['identity']
  readonly trusted: boolean
  readonly folder: string
}

/** 执行器实例：编译、绑定计算入口、运行与句柄回收的唯一入口。 */
export type ScriptExecutor = ReturnType<typeof createScriptExecutor>

/** 单个编译句柄的源码与日志频道；提交后频道改为定义 id。 */
interface CompiledEntry {
  readonly source: string
  readonly libraries: readonly QuickJSLibrary[]
  readonly trusted: boolean
  logId?: string
}

/**
 * 创建执行器。
 *
 * @param documents 文档读模型，用于生成库目录
 * @param output 输出仓库，调试日志按句柄或定义身份转发
 */
export function createScriptExecutor(
  documents: ScriptDocumentStore,
  log: ReturnType<typeof createScriptLog>,
) {
  /** 编译句柄 → 源码与日志频道；一张表同时承担源码快照与输出路由。 */
  const compiled = new Map<string, CompiledEntry>()
  /** 定义 id → 当前编译句柄；替换定义时据此释放旧句柄。 */
  const definitions = new Map<string, string>()
  /** 计算句柄 → 日志频道；每次运行只登记一次。 */
  const executionOwners = new Map<string, string>()
  const executions = new Set<() => void>()
  let disposed = false
  const worker = createScriptWorkerPool({
    onOutput: (handle, events) => {
      // 计算会话与编译句柄共用一条路由，未登记频道的句柄不产生输出。
      const channel = executionOwners.get(handle) ?? compiled.get(handle)?.logId
      if (channel !== undefined) log.append(channel, events)
    },
  })

  /** 调试和图表计算共用 Request 准备及 Worker 执行入口。 */
  async function compute(
    handle: string,
    bars: readonly Bar[],
    params: Readonly<Record<string, number | string | boolean>>,
    market?: IndicatorMarketContext,
    range?: ComputeRange,
  ) {
    if (market === undefined) return worker.run(handle, bars, params, undefined, range)
    const context = await prepareScriptMarketData(worker, handle, params, market)
    return worker.run(handle, bars, params, context, range, market.signal)
  }

  /**
   * 编译一份脚本源码：解析依赖库、确定可信状态并交给 Worker 编译。
   *
   * 每次编译使用独立句柄，提交失败不会覆盖当前可执行版本。
   */
  async function compile(
    source: string,
    trusted: boolean,
    snapshot?: readonly ScriptDocument[],
  ): Promise<CompiledScript> {
    const handle = generateUUID()
    const catalog = documents.catalog(snapshot)
    const resolved = resolveScriptLibraries(source, catalog)
    const hostLibraries = documents.hostLibraries
    const selected = [
      ...hostLibraries,
      ...resolved.filter((item) => !hostLibraries.some((host) => host.name === item.name)),
    ]
    const effectiveTrust =
      trusted &&
      resolved.every((library) => {
        const document = (snapshot ?? documents.list()).find(
          (item) => item.kind === 'library' && item.definition.name === library.name,
        )
        return document === undefined || document.trusted
      })
    const definition = await worker.prepare(handle, source, selected, effectiveTrust)
    compiled.set(handle, { source, libraries: selected, trusted: effectiveTrust })
    return { handle, definition }
  }

  /**
   * 把编译结果绑定成可注册的指标定义。
   *
   * 计算入口首次执行时才申请 Worker 句柄，目录定义不持有运行态；
   * 同一身份的新定义会替换旧句柄，旧句柄立即释放。
   */
  async function createDefinition(
    script: CompiledScript,
    identity: CompiledScriptIdentity,
  ): Promise<ReturnType<typeof createPlotIndicatorDefinition>> {
    const entry = compiled.get(script.handle)
    if (!entry) throw new Error('脚本编译句柄已释放')
    const createCompute = (): IndicatorDefinition<
      Readonly<Record<string, number | string | boolean>>
    >['compute'] & { dispose(): void } => {
      const handle = generateUUID()
      let preparation: Promise<PreparedScriptDefinition> | undefined
      let released = false
      const release = (): void => {
        if (released) return
        released = true
        executions.delete(release)
        executionOwners.delete(handle)
        if (preparation && !disposed) void worker.release(handle)
      }
      executions.add(release)
      const run: IndicatorDefinition<
        Readonly<Record<string, number | string | boolean>>
      >['compute'] = async (bars, params, market, range) => {
        if (disposed) throw new Error('脚本服务已销毁')
        if (released) throw new Error('脚本执行会话已释放')
        executionOwners.set(handle, identity.id)
        preparation ??= worker.prepare(
          handle,
          entry.source,
          entry.libraries,
          entry.trusted,
          'execution',
        )
        await preparation
        if (disposed) throw new Error('脚本服务已销毁')
        if (released) throw new Error('脚本执行会话已释放')
        return compute(handle, bars, params, market, range)
      }
      return Object.assign(run, { dispose: release })
    }
    const document = Object.freeze({
      revision: identity.revision,
      source: identity.source,
      definition: script.definition,
      identity: identity.identity,
      trusted: identity.trusted,
      folder: identity.folder,
    })
    const definition = createPlotIndicatorDefinition({
      ...script.definition,
      id: identity.id,
      source: 'script',
      document,
      createCompute,
      async compute(bars, params, market, range) {
        const execution = createCompute()
        try {
          return await execution(bars, params, market, range)
        } finally {
          execution.dispose()
        }
      },
    })
    const previous = definitions.get(identity.id)
    definitions.set(identity.id, script.handle)
    entry.logId = identity.id
    if (previous) await releaseHandle(previous)
    return definition
  }

  /** 直接执行一份草稿，不注册也不持久化定义。 */
  async function run(options: ScriptRunOptions): Promise<void> {
    log.source.clear(options.logId)
    const script = await compile(options.source, options.trusted)
    const entry = compiled.get(script.handle)
    if (!entry) throw new Error('脚本编译句柄已释放')
    entry.logId = options.logId
    try {
      await compute(script.handle, options.bars, {}, options.market)
    } finally {
      await releaseHandle(script.handle)
    }
  }

  /** 释放一个尚未成为当前定义的编译句柄。 */
  async function releaseHandle(handle: string): Promise<void> {
    compiled.delete(handle)
    await worker.release(handle)
  }

  /** 注册失败时丢弃编译结果；已成为当前定义则保留。 */
  async function abandon(id: string, handle: string): Promise<void> {
    if (definitions.get(id) === handle) return
    await releaseHandle(handle)
  }

  /** 释放已提交定义的执行句柄。 */
  async function releaseDefinition(id: string): Promise<void> {
    const handle = definitions.get(id)
    if (handle === undefined) return
    definitions.delete(id)
    await releaseHandle(handle)
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    for (const release of [...executions]) release()
    worker.dispose()
    definitions.clear()
    compiled.clear()
    executionOwners.clear()
  }

  return {
    compile,
    createDefinition,
    compute,
    run,
    releaseHandle,
    abandon,
    releaseDefinition,
    dispose,
  }
}
