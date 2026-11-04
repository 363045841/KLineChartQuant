/**
 * 实时订阅池：全仓唯一的连接管理入口。
 *
 * 池把逻辑订阅聚合成连接，按品种扇出帧；连接集合变化时才重建连接。
 * 连接实现只有 SSE 一份，宿主数据源可注入自己的连接工厂。
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import { marketDataProviderRegistry, type MarketDataProviderRegistry } from '../../provider/impl/registry.js'
import type {
  LiveFrame,
  RealtimeChannel,
  RealtimeConnection,
  RealtimeConnectionRequest,
  RealtimeStatus,
  RealtimeSubscription,
  RealtimeSubscriptionPool,
  RealtimeSubscriptionRequest,
} from '../types.js'
import { createSseConnection, type LiveEventSource } from './sseConnection.js'

export interface RealtimeSubscriptionPoolOptions {
  /** 从注册表读取数据源生效地址。 */
  resolveBaseUrl(sourceId: string): string
  /** 宿主自带的连接工厂；返回 undefined 时使用默认 SSE 实现。 */
  resolveConnection?(request: RealtimeConnectionRequest): RealtimeConnection | undefined
  /** EventSource 工厂；测试注入替身。 */
  createEventSource?(url: string): LiveEventSource
  /** 订阅集合变化的合并执行器；默认微任务，测试可同步执行。 */
  defer?(run: () => void): void
}

/** 一条逻辑订阅的句柄；关闭后自行从连接上摘除。 */
class PooledSubscription implements RealtimeSubscription {
  private readonly frameCbs = new Set<(frame: LiveFrame) => void>()
  private readonly statusCbs = new Set<(status: RealtimeStatus) => void>()
  private readonly errorCbs = new Set<(error: Error) => void>()
  private closed = false

  constructor(
    readonly request: RealtimeSubscriptionRequest,
    private readonly detach: (handle: PooledSubscription) => void,
  ) {}

  onFrame(callback: (frame: LiveFrame) => void): () => void {
    this.frameCbs.add(callback)
    return () => this.frameCbs.delete(callback)
  }

  onStatus(callback: (status: RealtimeStatus) => void): () => void {
    this.statusCbs.add(callback)
    return () => this.statusCbs.delete(callback)
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorCbs.add(callback)
    return () => this.errorCbs.delete(callback)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.frameCbs.clear()
    this.statusCbs.clear()
    this.errorCbs.clear()
    this.detach(this)
  }

  /** 投递帧；句柄关闭后静默丢弃。 */
  dispatchFrame(frame: LiveFrame): void {
    if (this.closed) return
    for (const callback of this.frameCbs) callback(frame)
  }

  /** 投递连接状态；句柄关闭后静默丢弃。 */
  dispatchStatus(status: RealtimeStatus): void {
    if (this.closed) return
    for (const callback of this.statusCbs) callback(status)
  }

  /** 投递解析错误；句柄关闭后静默丢弃。 */
  dispatchError(error: Error): void {
    if (this.closed) return
    for (const callback of this.errorCbs) callback(error)
  }
}

/** 连接键：报价按来源，K 线按来源 + 序列参数；同键订阅共享一条连接。 */
function connectionKey(request: RealtimeSubscriptionRequest): string {
  if (request.channel === 'quotes') return `${request.sourceId}|quotes`
  return `${request.sourceId}|bars|${request.period}|${request.barAggregation}|${request.adjustment}`
}

/** 校验订阅身份：K 线必须带齐序列参数，报价忽略序列参数。 */
function assertRequest(request: RealtimeSubscriptionRequest): void {
  if (!request.sourceId || !request.instrumentId)
    throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_PARAM, 'Live subscription requires sourceId and instrumentId')
  if (request.channel === 'quotes') return
  if (request.period === undefined || request.barAggregation === undefined || request.adjustment === undefined)
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Bars subscription requires period, barAggregation and adjustment',
    )
}

/** 两条连接是否承载同一组品种；顺序无关。 */
function sameInstruments(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

/** 一条物理连接及其上的逻辑订阅。 */
class PooledConnection {
  private readonly handles = new Map<string, Set<PooledSubscription>>()
  private connection: RealtimeConnection | null = null
  private applied: ReadonlyArray<string> = []
  private status: RealtimeStatus = 'connecting'
  private scheduled = false
  private destroyed = false

  constructor(
    private readonly template: Omit<RealtimeConnectionRequest, 'instrumentIds'>,
    private readonly options: RealtimeSubscriptionPoolOptions,
    private readonly defer: (run: () => void) => void,
    private readonly release: () => void,
  ) {}

  /** 登记一条逻辑订阅；新订阅立刻得到当前连接状态。 */
  add(handle: PooledSubscription): void {
    const instrumentId = handle.request.instrumentId
    let set = this.handles.get(instrumentId)
    if (set === undefined) {
      set = new Set()
      this.handles.set(instrumentId, set)
    }
    set.add(handle)
    this.scheduleSync()
    // 状态回放排在本轮连接同步之后，调用方有时间注册回调。
    this.defer(() => handle.dispatchStatus(this.status))
  }

  /** 摘除一条逻辑订阅；最后一条离开时销毁连接。 */
  remove(handle: PooledSubscription): void {
    if (this.destroyed) return
    const instrumentId = handle.request.instrumentId
    const set = this.handles.get(instrumentId)
    if (set === undefined) return
    set.delete(handle)
    if (set.size === 0) this.handles.delete(instrumentId)
    if (this.handles.size === 0) {
      this.destroy()
      this.release()
      return
    }
    this.scheduleSync()
  }

  /** 合并同一轮变化，避免逐条订阅触发多次重连。 */
  private scheduleSync(): void {
    if (this.scheduled || this.destroyed) return
    this.scheduled = true
    this.defer(() => {
      this.scheduled = false
      this.sync()
    })
  }

  /** 连接上的品种集合变化时才重建连接。 */
  private sync(): void {
    if (this.destroyed) return
    const instrumentIds = [...this.handles.keys()].sort()
    if (instrumentIds.length === 0) return
    if (this.connection !== null && sameInstruments(this.applied, instrumentIds)) return
    this.rebuild(instrumentIds)
  }

  /** 用新的品种集合重建连接；重建即重新同步快照。 */
  private rebuild(instrumentIds: ReadonlyArray<string>): void {
    this.connection?.destroy()
    this.applied = instrumentIds
    this.broadcastStatus('connecting')
    const request: RealtimeConnectionRequest = { ...this.template, instrumentIds }
    let connection: RealtimeConnection
    try {
      connection =
        this.options.resolveConnection?.(request) ??
        createSseConnection(
          request,
          this.options.resolveBaseUrl(request.sourceId),
          this.options.createEventSource,
        )
    } catch (error) {
      // 地址未配置或宿主工厂拒绝时只报告错误，不能让异常逃出合并队列。
      this.connection = null
      this.broadcastError(error instanceof Error ? error : new Error(String(error)))
      return
    }
    connection.onFrame((frame) => this.dispatchFrame(frame))
    connection.onStatus((status) => this.broadcastStatus(status))
    connection.onError((error) => this.broadcastError(error))
    this.connection = connection
    connection.connect()
  }

  /** 按品种扇出帧；已退订品种的迟到帧直接丢弃。 */
  private dispatchFrame(frame: LiveFrame): void {
    const set = this.handles.get(frame.instrumentId)
    if (set === undefined) return
    for (const handle of [...set]) handle.dispatchFrame(frame)
  }

  /** 连接状态对所有订阅者一致。 */
  private broadcastStatus(status: RealtimeStatus): void {
    this.status = status
    for (const set of this.handles.values()) for (const handle of set) handle.dispatchStatus(status)
  }

  /** 解析错误只影响当前连接上的订阅者，不销毁连接。 */
  private broadcastError(error: Error): void {
    for (const set of this.handles.values()) for (const handle of set) handle.dispatchError(error)
  }

  /** 销毁连接并清空订阅；不回调订阅者。 */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.connection?.destroy()
    this.connection = null
    this.handles.clear()
  }
}

/** 创建实时订阅池；池的全部状态只在这里。 */
export function createRealtimeSubscriptionPool(
  options: RealtimeSubscriptionPoolOptions,
): RealtimeSubscriptionPool {
  const connections = new Map<string, PooledConnection>()
  const defer = options.defer ?? ((run: () => void) => queueMicrotask(run))
  let disposed = false

  return {
    subscribe(request) {
      if (disposed) throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'Realtime pool is disposed')
      assertRequest(request)
      const key = connectionKey(request)
      const connection =
        connections.get(key) ??
        (() => {
          const { sourceId, channel, period, barAggregation, adjustment } = request
          const created = new PooledConnection(
            { sourceId, channel, period, barAggregation, adjustment },
            options,
            defer,
            () => connections.delete(key),
          )
          connections.set(key, created)
          return created
        })()
      const handle = new PooledSubscription(request, (closed) => connection.remove(closed))
      connection.add(handle)
      return handle
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const connection of connections.values()) connection.destroy()
      connections.clear()
    },
  }
}

/** 每个注册表实例对应一个池；图表与自选共享同一份连接。 */
const pools = new WeakMap<MarketDataProviderRegistry, RealtimeSubscriptionPool>()

/**
 * 读取注册表所属的实时订阅池，首次访问时创建。
 *
 * @param registry - 行情数据源注册表
 */
export function realtimePoolFor(registry: MarketDataProviderRegistry): RealtimeSubscriptionPool {
  let pool = pools.get(registry)
  if (pool === undefined) {
    pool = createRealtimeSubscriptionPool({
      resolveBaseUrl: (sourceId) => registry.getConfig(sourceId).baseUrl ?? '',
      resolveConnection: (request) => registry.get(request.sourceId)?.realtime?.(request),
    })
    pools.set(registry, pool)
  }
  return pool
}

/** 默认注册表对应的共享池。 */
export const realtimeSubscriptionPool = realtimePoolFor(marketDataProviderRegistry)
