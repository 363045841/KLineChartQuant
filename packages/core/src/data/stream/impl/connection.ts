/** 连接驱动：唯一持有状态、定时器与传输实例的地方；副作用按 effect 顺序执行。 */

import { createSignal } from '@/foundation/reactivity/signal.js'
import type {
  StreamConnection,
  StreamEvent,
  StreamFrame,
  StreamPhase,
  StreamRequest,
  StreamSubscription,
  StreamSubscriptionRequest,
  StreamTransport,
  StreamTransportFactory,
  StreamTransportHandlers,
} from '../types.js'
import {
  type MachineEffect,
  type MachineEvent,
  type MachineState,
  initialState,
  transition,
} from './machine.js'
import {
  DEFAULT_BACKOFF,
  type BackoffPolicy,
  STREAM_STALE_MS,
  STREAM_WATCHDOG_MS,
  backoffDelay,
} from './policy.js'
import { assertSubscription } from './protocol.js'

/** 时间、随机与定时器注入点；测试用假实现替代。 */
export interface StreamScheduler {
  now(): number
  random(): number
  schedule(delayMs: number, run: () => void): () => void
}

export const defaultScheduler: StreamScheduler = {
  now: () => Date.now(),
  random: () => Math.random(),
  schedule(delayMs, run) {
    const timer = setTimeout(run, delayMs)
    return () => clearTimeout(timer)
  },
}

/** 连接配置；品种集合由订阅动态派生。 */
export interface ConnectionOptions {
  readonly source: string
  readonly channel: StreamRequest['channel']
  readonly period?: StreamRequest['period']
  readonly adjustment?: StreamRequest['adjustment']
  readonly barAggregation?: StreamRequest['barAggregation']
  readonly createTransport: StreamTransportFactory
  readonly scheduler?: StreamScheduler
  readonly policy?: BackoffPolicy
  readonly staleMs?: number
  readonly watchdogMs?: number
  /** 最后一个订阅离开时回调；由注册表决定销毁。 */
  readonly onEmpty: () => void
}

/** 注册表持有的连接：在对外表面之外增加唤醒与空判定。 */
export interface ManagedConnection extends StreamConnection {
  resume(): void
  isEmpty(): boolean
}

/** 一条逻辑订阅的句柄；关闭后不再收到任何事件。 */
class Subscription implements StreamSubscription {
  private readonly frameCallbacks = new Set<(frame: StreamFrame) => void>()
  private readonly eventCallbacks = new Set<(event: StreamEvent) => void>()
  private closed = false

  constructor(
    readonly request: StreamSubscriptionRequest,
    private readonly detach: (handle: Subscription) => void,
  ) {}

  onFrame(callback: (frame: StreamFrame) => void): () => void {
    if (this.closed) return () => {}
    this.frameCallbacks.add(callback)
    return () => {
      this.frameCallbacks.delete(callback)
    }
  }

  onEvent(callback: (event: StreamEvent) => void): () => void {
    if (this.closed) return () => {}
    this.eventCallbacks.add(callback)
    return () => {
      this.eventCallbacks.delete(callback)
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.frameCallbacks.clear()
    this.eventCallbacks.clear()
    this.detach(this)
  }

  dispatchFrame(frame: StreamFrame): void {
    if (this.closed) return
    for (const callback of [...this.frameCallbacks]) callback(frame)
  }

  dispatchEvent(event: StreamEvent): void {
    if (this.closed) return
    for (const callback of [...this.eventCallbacks]) callback(event)
  }
}

/**
 * 创建一条受控连接。
 *
 * 状态机决定何时建流、何时退避；这里只负责把 effect 变成真实动作，
 * 并把传输上报的事实送回状态机。存活判定用墙钟差，不受标签页定时器节流影响。
 *
 * @param options - 连接配置与依赖
 * @returns 受控连接；`resume` 供页面唤醒时立即重试
 */
export function createConnection(options: ConnectionOptions): ManagedConnection {
  const scheduler = options.scheduler ?? defaultScheduler
  const policy = options.policy ?? DEFAULT_BACKOFF
  const staleMs = options.staleMs ?? STREAM_STALE_MS
  const watchdogMs = options.watchdogMs ?? STREAM_WATCHDOG_MS

  let state: MachineState = initialState()
  let transport: StreamTransport | null = null
  let retryTimer: (() => void) | null = null
  let watchdogTimer: (() => void) | null = null
  let lastActivity = 0
  let rebuildQueued = false
  let disposed = false

  const phase = createSignal<StreamPhase>('stopped')
  const handles = new Map<string, Set<Subscription>>()

  /** 当前连接承载的品种集合；顺序固定，避免同一集合产生不同请求。 */
  const instrumentIds = (): ReadonlyArray<string> => [...handles.keys()].sort()

  /** 广播连接事件；每个订阅句柄各自决定如何处理。 */
  const emit = (event: StreamEvent): void => {
    for (const set of handles.values()) for (const handle of set) handle.dispatchEvent(event)
  }

  /** 按品种路由帧；连接级帧只刷新存活时间。 */
  const dispatchFrame = (frame: StreamFrame): void => {
    lastActivity = scheduler.now()
    if (frame.type === 'hello' || frame.type === 'ping') return
    if (frame.type === 'error') {
      // 错误帧结束当前连接；重试与否由协议给出的可重试标记决定。
      run({
        kind: 'closed',
        now: scheduler.now(),
        retryable: frame.retryable,
        message: `${frame.code}: ${frame.message}`,
      })
      return
    }
    const set = handles.get(frame.instrumentId)
    if (set === undefined) return
    for (const handle of [...set]) handle.dispatchFrame(frame)
  }

  /** 打开一条新传输；同步失败按可重试关闭处理。 */
  const open = (): void => {
    const ids = instrumentIds()
    if (ids.length === 0) return
    const request: StreamRequest = {
      source: options.source,
      channel: options.channel,
      instrumentIds: ids,
      ...(options.period === undefined ? {} : { period: options.period }),
      ...(options.adjustment === undefined ? {} : { adjustment: options.adjustment }),
      ...(options.barAggregation === undefined ? {} : { barAggregation: options.barAggregation }),
    }
    const handlers: StreamTransportHandlers = {
      onOpen: () => {
        if (disposed) return
        lastActivity = scheduler.now()
        run({ kind: 'opened', now: scheduler.now() })
      },
      onFrame: (frame) => {
        if (!disposed) dispatchFrame(frame)
      },
      onClose: (close) => {
        run({
          kind: 'closed',
          now: scheduler.now(),
          retryable: close.retryable,
          message: close.message,
        })
      },
    }
    try {
      const created = options.createTransport(request, handlers)
      transport = created
      created.open()
    } catch (error) {
      transport = null
      run({
        kind: 'closed',
        now: scheduler.now(),
        retryable: true,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** 关闭当前传输；关闭动作幂等。 */
  const closeTransport = (): void => {
    const current = transport
    transport = null
    current?.close()
  }

  /** 看门狗只在 online 期运行；每次检查后按墙钟判断是否僵死。 */
  const watchdog = (): void => {
    watchdogTimer = null
    if (disposed || state.phase !== 'online') return
    if (scheduler.now() - lastActivity > staleMs) {
      run({ kind: 'closed', now: scheduler.now(), retryable: true, message: 'Stream stalled' })
      return
    }
    watchdogTimer = scheduler.schedule(watchdogMs, watchdog)
  }

  const setWatchdog = (active: boolean): void => {
    if (watchdogTimer !== null) {
      watchdogTimer()
      watchdogTimer = null
    }
    if (active) watchdogTimer = scheduler.schedule(watchdogMs, watchdog)
  }

  /** 退避等待；到期后立即尝试下一次连接。 */
  const backoff = (attempt: number): void => {
    if (retryTimer !== null) {
      retryTimer()
      retryTimer = null
    }
    retryTimer = scheduler.schedule(backoffDelay(attempt, scheduler.random, policy), () => {
      retryTimer = null
      run({ kind: 'connect', now: scheduler.now() })
    })
  }

  /** 执行一项副作用；顺序由状态机给出。 */
  const apply = (effect: MachineEffect): void => {
    switch (effect.kind) {
      case 'open':
        open()
        return
      case 'close':
        closeTransport()
        return
      case 'backoff':
        backoff(effect.attempt)
        return
      case 'cancel':
        if (retryTimer !== null) {
          retryTimer()
          retryTimer = null
        }
        return
      case 'watchdog':
        setWatchdog(effect.active)
        return
      case 'emit':
        emit(effect.event)
        return
    }
  }

  /** 唯一的状态入口：先迁移、再更新对外信号、最后执行副作用。 */
  const run = (event: MachineEvent): void => {
    if (disposed) return
    const [next, effects] = transition(state, event, policy)
    state = next
    if (phase.peek() !== next.phase) phase.set(next.phase)
    for (const effect of effects) apply(effect)
  }

  /** 合并同一轮的订阅集合变化，避免逐条订阅触发多次重连。 */
  const scheduleRebuild = (): void => {
    if (rebuildQueued || disposed) return
    rebuildQueued = true
    queueMicrotask(() => {
      rebuildQueued = false
      if (disposed || handles.size === 0) return
      if (state.phase === 'online' || state.phase === 'connecting') run({ kind: 'force' })
    })
  }

  /** 新增订阅；首条订阅触发连接，后续变化合并重建。 */
  const subscribe = (request: StreamSubscriptionRequest): StreamSubscription => {
    if (disposed) throw new TypeError('Stream connection is disposed')
    assertSubscription(request)
    const key = request.instrumentId
    let set = handles.get(key)
    if (set === undefined) {
      set = new Set()
      handles.set(key, set)
    }
    const handle = new Subscription(request, (closed) => {
      const current = handles.get(key)
      if (current === undefined) return
      current.delete(closed)
      if (current.size === 0) handles.delete(key)
      if (handles.size === 0) {
        run({ kind: 'stop', reason: 'no-subscribers' })
        options.onEmpty()
        return
      }
      scheduleRebuild()
    })
    set.add(handle)
    if (handles.size === 1) run({ kind: 'connect', now: scheduler.now() })
    else scheduleRebuild()
    return handle
  }

  return {
    phase,
    subscribe,
    forceReconnect() {
      run({ kind: 'force' })
    },
    resume() {
      run({ kind: 'resume' })
    },
    isEmpty() {
      return handles.size === 0
    },
    dispose() {
      if (disposed) return
      run({ kind: 'stop', reason: 'disposed' })
      disposed = true
      if (retryTimer !== null) retryTimer()
      if (watchdogTimer !== null) watchdogTimer()
      retryTimer = null
      watchdogTimer = null
      handles.clear()
    },
  }
}
