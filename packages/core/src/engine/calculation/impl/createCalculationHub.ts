/**
 * 计算中枢：按数据身份与计算身份去重、调度并提交结果。
 *
 * 不持有图表、Pane、视口或实例身份；消费者注册计划，Hub 只负责：
 * 合并同一计算键、按行情需要保留更新顺序、提交结果。
 */
import { type ComputeRange, resolveComputeRange } from '@363045841yyt/klinechart-plot-contracts'
import { seriesSelectionKey } from '@/data/buffer/seriesSelection.js'
import type { KLineData } from '@/foundation/types/price.js'
import type {
  CalculationClient,
  CalculationClientHandlers,
  CalculationCommit,
  CalculationDefinition,
  CalculationFailure,
  CalculationHub,
  CalculationHubOptions,
  CalculationRequest,
  CalculationResult,
  FeedKey,
  FeedPlan,
  FeedSnapshot,
} from '../types.js'
import { createCalculationKey } from './canonical.js'

/** 预览结果保留份数；超出后按最久未使用淘汰。 */
const PREVIEW_RESULT_LIMIT = 16

interface ClientState {
  readonly id: string
  readonly handlers: CalculationClientHandlers
  plan: readonly FeedPlan[]
  planVersion: number
  /** feed 上一次已提交的修订身份；避免同一版本重复回调。 */
  readonly committed: Map<FeedKey, string>
  disposed: boolean
}

interface DesiredRequest {
  readonly feed: FeedKey
  readonly request: CalculationRequest
  readonly clients: Set<string>
}

interface Work {
  readonly internalKey: string
  readonly feedKey: FeedKey
  readonly request: CalculationRequest
  readonly snapshot: FeedSnapshot
  readonly controller: AbortController
  readonly completion: Promise<CalculationResult | null>
  readonly complete: (result: CalculationResult | null) => void
}

interface Lane {
  running?: Work
  readonly queued: Work[]
}

/** 判断已提交结果是否仍对应当前行情修订。 */
function isFresh(result: CalculationResult | undefined, feed: FeedSnapshot): boolean {
  return result !== undefined && result.dataRevision === feed.dataRevision
}

/** 冻结消费者计划，防止提交后外部修改。 */
function freezePlan(plan: readonly FeedPlan[]): readonly FeedPlan[] {
  return Object.freeze(
    plan.map((entry) =>
      Object.freeze({ feed: entry.feed, requests: Object.freeze([...entry.requests]) }),
    ),
  )
}

/** 把执行异常转成可传输的结果错误。 */
function toFailure(error: unknown): CalculationFailure {
  const message = error instanceof Error ? error.message : String(error)
  if (!(error instanceof Error)) return Object.freeze({ message })
  return Object.freeze({
    message,
    ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
    ...('plotId' in error && typeof error.plotId === 'string' ? { plotId: error.plotId } : {}),
    ...('barIndex' in error && typeof error.barIndex === 'number'
      ? { barIndex: error.barIndex }
      : {}),
  })
}

/** 创建计算中枢；所有状态在闭包内，销毁后调用变为无副作用。 */
export function createCalculationHub(options: CalculationHubOptions): CalculationHub {
  const feeds = new Map<FeedKey, FeedSnapshot>()
  const clients = new Map<string, ClientState>()
  const desired = new Map<string, DesiredRequest>()
  const store = new Map<string, CalculationResult>()
  const lanes = new Map<string, Lane>()
  const calculators = new Map<string, CalculationDefinition & { dispose?(): void }>()
  /** 预览结果的有界保留顺序；不参与任何消费者提交。 */
  const previewKeys = new Set<string>()
  let disposed = false

  /** 全局结果键：数据身份 + 消费者本地键，互不串号。 */
  function internalKey(feed: FeedKey, localKey: string): string {
    return createCalculationKey(feed, localKey)
  }

  /** 取或创建单任务计算器；版本身份变化时替换旧会话，失败由执行阶段报错。 */
  function ensureCalculator(internal: string, definitionId: string) {
    const definition = options.resolveDefinition(definitionId)
    if (!definition) return undefined
    const existing = calculators.get(internal)
    if (existing?.identity === definition.identity) return existing
    if (existing) {
      existing.dispose?.()
      calculators.delete(internal)
    }
    const compute = definition.createCompute?.()
    const entry = {
      ...definition,
      compute: compute ?? definition.compute,
      dispose: compute?.dispose,
    }
    calculators.set(internal, entry)
    return entry
  }

  /** 释放不再被任何计划或预览引用的计算器与结果。 */
  function pruneOwned(): void {
    for (const [key, lane] of lanes) {
      if (desired.has(key) || previewKeys.has(key)) continue
      cancelLane(lane)
      lanes.delete(key)
    }
    for (const [key, calculator] of calculators) {
      if (desired.has(key) || lanes.has(key)) continue
      calculator.dispose?.()
      calculators.delete(key)
    }
    for (const key of store.keys()) {
      if (desired.has(key) || previewKeys.has(key)) continue
      store.delete(key)
    }
  }

  /** 按全部消费者计划重建引用表；计划很小，整表重建比增量维护更可靠。 */
  function rebuildDesired(): void {
    desired.clear()
    for (const client of clients.values()) {
      if (client.disposed) continue
      for (const entry of client.plan) {
        for (const request of entry.requests) {
          const key = internalKey(entry.feed, request.key)
          const current = desired.get(key)
          if (current) {
            current.clients.add(client.id)
            continue
          }
          desired.set(key, {
            feed: entry.feed,
            request,
            clients: new Set([client.id]),
          })
        }
      }
    }
    pruneOwned()
  }

  /** 向拥有该任务的全部消费者上报等待状态。 */
  function reportPending(key: string, pending: boolean): void {
    const entry = desired.get(key)
    if (!entry) return
    for (const clientId of entry.clients) {
      const client = clients.get(clientId)
      const owners = client?.plan
        .find((plan) => plan.feed === entry.feed)
        ?.requests.filter((request) => request.key === entry.request.key)
        .flatMap((request) => request.owners ?? [])
      if (owners?.length) client?.handlers.onPending?.(owners, pending)
    }
  }

  /** 向全部消费者上报非任务型错误。 */
  function reportError(error: unknown): void {
    for (const client of clients.values()) client.handlers.onError?.(error)
  }

  /** 执行一个任务；取消或失败都转成结果，调度器不需要区分错误来源。 */
  async function execute(
    request: CalculationRequest,
    feed: FeedSnapshot,
    signal: AbortSignal,
  ): Promise<CalculationResult | null> {
    if (signal.aborted) return null
    const feedKey = seriesSelectionKey(feed.identity)
    const internal = internalKey(feedKey, request.key)
    const calculator = ensureCalculator(internal, request.definitionId)
    const base = {
      key: request.key,
      definitionId: request.definitionId,
      dataRevision: feed.dataRevision,
      timestamps: feed.timestamps,
      ...(feed.closedBarTime === undefined ? {} : { closedBarTime: feed.closedBarTime }),
    }
    if (!calculator) {
      return Object.freeze({
        ...base,
        series: undefined,
        alerts: Object.freeze([]),
        error: Object.freeze({
          message: `Unknown calculation definition: ${request.definitionId}`,
        }),
      })
    }
    let range: ComputeRange
    try {
      range = resolveComputeRange(feed.change, calculator.dependency, feed.data.length)
    } catch (error) {
      return Object.freeze({
        ...base,
        series: undefined,
        alerts: Object.freeze([]),
        error: toFailure(error),
      })
    }
    const context = options.marketData?.(feed.data, feed.market)
    try {
      const output = await calculator.compute(
        feed.data,
        request.inputs,
        context ? { ...context, signal } : undefined,
        range,
        feed.live,
      )
      if (signal.aborted) return null
      return Object.freeze({
        ...base,
        series: output.series,
        alerts: Object.freeze(output.alerts ?? []),
      })
    } catch (error) {
      if (signal.aborted) return null
      return Object.freeze({
        ...base,
        series: undefined,
        alerts: Object.freeze([]),
        error: toFailure(error),
      })
    }
  }

  /** 提交一个消费者在某份行情上的完整结果；不完整就等下一次任务完成。 */
  function commitClient(client: ClientState, feedKey: FeedKey): void {
    if (disposed || client.disposed || !client.handlers.onCommit) return
    const feed = feeds.get(feedKey)
    if (!feed) return
    const entry = client.plan.find((item) => item.feed === feedKey)
    if (!entry) return
    const revision = `${feed.dataRevision}:${client.planVersion}`
    if (client.committed.get(feedKey) === revision) return
    const results = new Map<string, CalculationResult>()
    for (const request of entry.requests) {
      const stored = store.get(internalKey(feedKey, request.key))
      if (!isFresh(stored, feed)) return
      results.set(request.key, stored!)
    }
    client.committed.set(feedKey, revision)
    client.handlers.onCommit({
      feed: feedKey,
      dataRevision: feed.dataRevision,
      results,
    })
  }

  /** 该行情上的全部消费者都尝试提交；零任务也会得到一次提交。 */
  function commitFeed(feedKey: FeedKey): void {
    for (const client of clients.values()) commitClient(client, feedKey)
  }

  /** 创建一次待执行任务；取消只回滚本任务，不污染已提交结果。 */
  function createWork(feedKey: FeedKey, feed: FeedSnapshot, request: CalculationRequest): Work {
    let complete!: Work['complete']
    const completion = new Promise<CalculationResult | null>((resolve) => {
      complete = resolve
    })
    return {
      internalKey: internalKey(feedKey, request.key),
      feedKey,
      request,
      snapshot: feed,
      controller: new AbortController(),
      completion,
      complete,
    }
  }

  /** 执行一个任务，结束后把队首推进到最新一版。 */
  async function runWork(work: Work): Promise<void> {
    const lane = lanes.get(work.internalKey)
    if (!lane || lane.running !== work) return
    reportPending(work.internalKey, true)
    let result: CalculationResult | null = null
    try {
      result = await execute(work.request, work.snapshot, work.controller.signal)
    } catch (error) {
      reportError(error)
    } finally {
      reportPending(work.internalKey, false)
    }
    work.complete(result)
    const current = lanes.get(work.internalKey)
    if (disposed || current !== lane || lane.running !== work) return
    if (result) {
      store.set(work.internalKey, result)
      for (const id of desired.get(work.internalKey)?.clients ?? []) {
        try {
          clients.get(id)?.handlers.onResult?.(work.feedKey, result)
        } catch (error) {
          reportError(error)
        }
      }
    }
    if (lanes.get(work.internalKey) !== current) return
    current.running = undefined
    const next = current.queued.shift()
    if (next) {
      current.running = next
      void runWork(next)
      return
    }
    lanes.delete(work.internalKey)
    if (!desired.has(work.internalKey)) {
      calculators.get(work.internalKey)?.dispose?.()
      calculators.delete(work.internalKey)
    }
    commitFeed(work.feedKey)

    // 运行期间行情又前进了：用最新快照再排一版，旧结果不会被提交。
    const live = feeds.get(work.feedKey)
    const pending = desired.get(work.internalKey)
    if (live && pending && !isFresh(store.get(work.internalKey), live)) {
      startWork(pending.feed, live, pending.request, work.internalKey)
    }
  }

  /** 启动任务：同键已有运行时只保留最新一版等待。 */
  function startWork(
    feedKey: FeedKey,
    feed: FeedSnapshot,
    request: CalculationRequest,
    internal: string,
  ): Work {
    const existing = lanes.get(internal)
    if (existing?.running) {
      const matching = [existing.running, ...existing.queued].find(
        (work) => work.snapshot.dataRevision === feed.dataRevision,
      )
      if (matching) return matching
      const ordered = [...(desired.get(internal)?.clients ?? [])].some(
        (id) => clients.get(id)?.handlers.onResult,
      )
      if (!ordered && !previewKeys.has(internal)) {
        for (const work of existing.queued.splice(0)) work.complete(null)
      }
      const work = createWork(feedKey, feed, request)
      existing.queued.push(work)
      return work
    }
    const work = createWork(feedKey, feed, request)
    if (existing) existing.running = work
    else lanes.set(internal, { running: work, queued: [] })
    void runWork(work)
    return work
  }

  /** 取消整条队列并唤醒等待结果的读取者。 */
  function cancelLane(lane: Lane): void {
    lane.running?.controller.abort()
    lane.running?.complete(null)
    for (const work of lane.queued) work.complete(null)
  }

  /** 为一份行情排入所有过期请求。 */
  function scheduleFeed(feedKey: FeedKey): void {
    const feed = feeds.get(feedKey)
    if (!feed) return
    for (const [key, entry] of desired) {
      if (entry.feed !== feedKey) continue
      if (isFresh(store.get(key), feed)) continue
      startWork(feedKey, feed, entry.request, key)
    }
  }

  /** 预览结果有界；被淘汰的身份同时从结果仓库移除。 */
  function rememberPreview(key: string): void {
    previewKeys.delete(key)
    previewKeys.add(key)
    while (previewKeys.size > PREVIEW_RESULT_LIMIT) {
      const oldest = previewKeys.keys().next().value
      if (oldest === undefined) break
      previewKeys.delete(oldest)
      if (!desired.has(oldest)) store.delete(oldest)
    }
  }

  /** 释放某份行情上的任务、结果与提交记录。 */
  function releaseFeed(feedKey: FeedKey): void {
    for (const [key, lane] of lanes) {
      if (lane.running?.feedKey !== feedKey) continue
      cancelLane(lane)
      lanes.delete(key)
    }
    for (const key of [...store.keys()]) {
      if (key.startsWith(`${feedKey}\u0000`)) store.delete(key)
    }
    for (const key of [...previewKeys]) {
      if (key.startsWith(`${feedKey}\u0000`)) previewKeys.delete(key)
    }
    for (const client of clients.values()) client.committed.delete(feedKey)
  }

  return {
    createClient(id, handlers): CalculationClient {
      if (disposed) throw new Error('Calculation hub is disposed')
      if (clients.has(id)) throw new TypeError(`Duplicate calculation client: ${id}`)
      const client: ClientState = {
        id,
        handlers,
        plan: Object.freeze([]),
        planVersion: 0,
        committed: new Map(),
        disposed: false,
      }
      clients.set(id, client)
      return {
        setPlan(plan) {
          if (disposed || client.disposed) return
          client.plan = freezePlan(plan)
          client.planVersion++
          rebuildDesired()
          for (const entry of client.plan) {
            scheduleFeed(entry.feed)
            commitFeed(entry.feed)
          }
        },
        dispose() {
          if (client.disposed) return
          client.disposed = true
          clients.delete(id)
          rebuildDesired()
        },
      }
    },

    updateFeed(snapshot) {
      if (disposed) return
      const feedKey = seriesSelectionKey(snapshot.identity)
      feeds.set(feedKey, snapshot)
      scheduleFeed(feedKey)
      commitFeed(feedKey)
    },

    readDataRevision(feed) {
      return feeds.get(feed)?.dataRevision
    },

    removeFeed(feedKey) {
      if (disposed) return
      feeds.delete(feedKey)
      releaseFeed(feedKey)
    },

    async submit(feedKey, request, signal) {
      signal.throwIfAborted()
      if (disposed) throw new Error('Calculation hub is disposed')
      const feed = feeds.get(feedKey)
      if (!feed) throw new Error(`Calculation feed is not registered: ${feedKey}`)
      const internal = internalKey(feedKey, request.key)
      const stored = store.get(internal)
      if (isFresh(stored, feed)) return stored!
      rememberPreview(internal)
      const work = startWork(feedKey, feed, request, internal)
      let abort!: () => void
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason)
      })
      signal.addEventListener('abort', abort, { once: true })
      try {
        const result = await Promise.race([work.completion, cancelled])
        if (!result) throw new DOMException('Calculation superseded', 'AbortError')
        return result
      } finally {
        signal.removeEventListener('abort', abort)
      }
    },

    peek(feedKey, key) {
      return store.get(internalKey(feedKey, key))
    },

    invalidateDefinitions(definitionIds) {
      if (disposed || definitionIds.length === 0) return
      const changed = new Set(definitionIds)
      for (const [key, stored] of store) {
        if (changed.has(stored.definitionId)) store.delete(key)
      }
      for (const [key, calculator] of calculators) {
        if (!changed.has(calculator.definitionId)) continue
        const lane = lanes.get(key)
        if (lane) cancelLane(lane)
        lanes.delete(key)
        calculator.dispose?.()
        calculators.delete(key)
      }
      for (const client of clients.values()) client.committed.clear()
      for (const feedKey of feeds.keys()) {
        scheduleFeed(feedKey)
        commitFeed(feedKey)
      }
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const lane of lanes.values()) cancelLane(lane)
      lanes.clear()
      for (const calculator of calculators.values()) calculator.dispose?.()
      calculators.clear()
      store.clear()
      previewKeys.clear()
      feeds.clear()
      clients.clear()
      desired.clear()
    },
  }
}
