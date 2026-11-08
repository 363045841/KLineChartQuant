/**
 * 实时订阅池：全仓唯一的连接管理入口。
 *
 * 配置、健康状态和订阅需求单向驱动连接；传输没有独立的重连生命周期。
 */

import { GENERIC_ERROR_CODES, KLineChartError } from '@/errors.js'
import type { MarketProviderHealth } from '../../management/types.js'
import type { MarketDataProvider } from '../../provider/types.js'
import type {
  LiveFrame,
  RealtimeChannel,
  RealtimeConnection,
  RealtimeConnectionRequest,
  RealtimeStatus,
  RealtimeSubscription,
  RealtimeSubscriptionPool,
  RealtimeSubscriptionPoolOptions,
  RealtimeSubscriptionRequest,
} from '../types.js'
import { createRealtimeCallbackHub } from './callbackHub.js'

/** 一条逻辑订阅的句柄；关闭后自行从连接上摘除。 */
class PooledSubscription implements RealtimeSubscription {
  private readonly hub = createRealtimeCallbackHub()
  private closed = false

  constructor(
    readonly request: RealtimeSubscriptionRequest,
    private readonly detach: (handle: PooledSubscription) => void,
  ) {}

  onFrame(callback: (frame: LiveFrame) => void): () => void {
    return this.hub.onFrame(callback)
  }

  onStatus(callback: (status: RealtimeStatus) => void): () => void {
    return this.hub.onStatus(callback)
  }

  onError(callback: (error: Error) => void): () => void {
    return this.hub.onError(callback)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.hub.close()
    this.detach(this)
  }

  /** 投递帧；句柄关闭后静默丢弃。 */
  dispatchFrame(frame: LiveFrame): void {
    this.hub.emitFrame(frame)
  }

  /** 投递连接状态；句柄关闭后静默丢弃。 */
  dispatchStatus(status: RealtimeStatus): void {
    this.hub.emitStatus(status)
  }

  /** 投递解析错误；句柄关闭后静默丢弃。 */
  dispatchError(error: Error): void {
    this.hub.emitError(error)
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
    throw new KLineChartError(
      GENERIC_ERROR_CODES.INVALID_PARAM,
      'Live subscription requires sourceId and instrumentId',
    )
  if (request.channel === 'quotes') return
  if (
    request.period === undefined ||
    request.barAggregation === undefined ||
    request.adjustment === undefined
  )
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
  private status: RealtimeStatus = 'disconnected'
  private provider: MarketDataProvider | undefined
  private version = -1
  private failedHealth: MarketProviderHealth | undefined
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
  scheduleSync(): void {
    if (this.scheduled || this.destroyed) return
    this.scheduled = true
    this.defer(() => {
      this.scheduled = false
      this.sync()
    })
  }

  /** 唯一启停入口：来源可用且存在需求才连接，失败后等待新的健康确认。 */
  private sync(): void {
    if (this.destroyed) return
    const sourceId = this.template.sourceId
    const provider = this.options.registry.get(sourceId)
    if (provider === undefined) {
      this.broadcastStatus('disconnected')
      this.destroy()
      this.release()
      return
    }
    const version = this.options.registry.getConnection(sourceId).version
    if (provider !== this.provider || version !== this.version) {
      this.closeConnection()
      this.provider = provider
      this.version = version
      this.failedHealth = undefined
    }
    const health = this.options.health.peek()[sourceId]
    if (
      !this.options.registry.getConfig(sourceId).enabled ||
      health === undefined ||
      health.connectionVersion !== version ||
      (health.status !== 'online' && health.status !== 'degraded')
    ) {
      this.closeConnection()
      this.failedHealth = undefined
      return
    }
    if (this.failedHealth === health) return
    const instrumentIds = [...this.handles.keys()].sort()
    if (instrumentIds.length === 0) return
    if (this.connection !== null && sameInstruments(this.applied, instrumentIds)) return
    this.rebuild(instrumentIds, health)
  }

  /** 重建连接并绑定当前实例，旧连接的迟到事件不能影响新连接。 */
  private rebuild(instrumentIds: ReadonlyArray<string>, health: MarketProviderHealth): void {
    this.closeConnection()
    this.applied = instrumentIds
    this.broadcastStatus('connecting')
    const request: RealtimeConnectionRequest = { ...this.template, instrumentIds }
    try {
      const connection = this.options.createConnection(request)
      this.connection = connection
      connection.onFrame((frame) => {
        if (this.connection === connection) this.dispatchFrame(frame)
      })
      connection.onStatus((status) => {
        if (this.connection !== connection) return
        if (status === 'disconnected') {
          // 失败之前的健康确认不能作为失败之后的恢复信号。
          this.failedHealth = this.options.health.peek()[this.template.sourceId]
          this.closeConnection()
        } else this.broadcastStatus(status)
      })
      connection.onError((error) => {
        if (this.connection === connection) this.broadcastError(error)
      })
      connection.connect()
    } catch (error) {
      this.failedHealth = health
      this.closeConnection()
      this.broadcastError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  /** 先解除当前实例身份，再销毁传输，隔离销毁过程中的回调。 */
  private closeConnection(): void {
    const connection = this.connection
    this.connection = null
    connection?.destroy()
    this.applied = []
    this.broadcastStatus('disconnected')
  }

  /** 按品种扇出帧；已退订品种的迟到帧直接丢弃。 */
  private dispatchFrame(frame: LiveFrame): void {
    const set = this.handles.get(frame.instrumentId)
    if (set === undefined) return
    for (const handle of [...set]) handle.dispatchFrame(frame)
  }

  /** 连接状态对所有订阅者一致。 */
  private broadcastStatus(status: RealtimeStatus): void {
    if (this.status === status) return
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
    const connection = this.connection
    this.connection = null
    connection?.destroy()
    for (const set of this.handles.values()) for (const handle of set) handle.close()
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
  /** 上游输入只触发同一个同步入口，不直接操作传输。 */
  const sync = () => {
    for (const connection of connections.values()) connection.scheduleSync()
  }
  const unsubscribeRegistry = options.registry.state.subscribe(sync)
  const unsubscribeHealth = options.health.subscribe(sync)

  return {
    subscribe(request) {
      if (disposed)
        throw new KLineChartError(GENERIC_ERROR_CODES.INVALID_STATE, 'Realtime pool is disposed')
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
      unsubscribeRegistry()
      unsubscribeHealth()
      for (const connection of connections.values()) connection.destroy()
      connections.clear()
    },
  }
}
