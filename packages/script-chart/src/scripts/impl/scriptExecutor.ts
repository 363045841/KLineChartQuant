/**
 * 脚本编译与执行：持有临时句柄、按提交快照发布定义、转发调试输出。
 *
 * 只依赖文档读模型和 Worker，不接触持久化与目录。
 */
import {
  generateUUID,
  registerPlotIndicator,
  updatePlotIndicator,
} from '@363045841yyt/klinechart-core'
import {
  type Bar,
  DEFAULT_REQUEST_BARS,
  type IndicatorMarketContext,
  type ScriptRunOptions,
} from '@363045841yyt/klinechart-plot-contracts'
import {
  type QuickJSScriptDefinition,
  resolveScriptLibraries,
} from '@363045841yyt/klinechart-script'
import { createScriptWorker } from '@363045841yyt/klinechart-script/worker'
import type { ScriptDocument } from '../types.js'
import type { createScriptOutput } from './createScriptOutput.js'
import type { ScriptDocumentStore } from './scriptDocumentStore.js'

/** 一次准备的编译句柄；提交成功前不进入运行表。 */
export interface PreparedScript {
  readonly handle: string
  readonly definition: QuickJSScriptDefinition
}

/** 执行器实例：编译、发布、运行与句柄回收的唯一入口。 */
export type ScriptExecutor = ReturnType<typeof createScriptExecutor>

/**
 * 创建执行器。
 *
 * @param documents 文档读模型，用于生成库目录
 * @param output 输出仓库，调试日志按句柄或定义身份转发
 */
export function createScriptExecutor(
  documents: ScriptDocumentStore,
  output: ReturnType<typeof createScriptOutput>,
) {
  const handles = new Map<string, string>()
  const debugOutputs = new Map<string, string>()
  const worker = createScriptWorker(undefined, (handle, events) => {
    const outputId = debugOutputs.get(handle)
    if (outputId !== undefined) output.append(outputId, events)
    for (const [id, active] of handles) {
      if (active === handle) output.append(id, events)
    }
  })

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
  async function prepare(
    source: string,
    trusted: boolean,
    snapshot?: readonly ScriptDocument[],
  ): Promise<PreparedScript> {
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
    return { handle, definition }
  }

  /** 校验和编译全部完成后，以单个定义快照提交，执行闭包绑定该版本源码。 */
  async function publish(
    id: string,
    source: string,
    prepared: PreparedScript,
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

  /** 直接执行一份草稿，不注册也不持久化定义。 */
  async function run(options: ScriptRunOptions): Promise<void> {
    output.source.clear(options.outputId)
    const prepared = await prepare(options.source, options.trusted)
    debugOutputs.set(prepared.handle, options.outputId)
    try {
      await compute(prepared.handle, options.bars, {}, options.market)
    } finally {
      debugOutputs.delete(prepared.handle)
      await worker.release(prepared.handle)
    }
  }

  /** 释放一个尚未提交的准备句柄。 */
  async function releaseHandle(handle: string): Promise<void> {
    await worker.release(handle)
  }

  /** 未成为该定义的当前句柄时立即释放，避免保存失败泄漏 Worker。 */
  async function releasePrepared(id: string | null, handle: string): Promise<void> {
    if (id !== null && handles.get(id) === handle) return
    await worker.release(handle)
  }

  /** 释放已提交定义的执行句柄。 */
  async function releaseDefinition(id: string): Promise<void> {
    const handle = handles.get(id)
    if (handle === undefined) return
    handles.delete(id)
    await worker.release(handle)
  }

  function dispose(): void {
    worker.dispose()
    handles.clear()
    debugOutputs.clear()
  }

  return {
    prepare,
    publish,
    compute,
    run,
    releaseHandle,
    releasePrepared,
    releaseDefinition,
    dispose,
  }
}
