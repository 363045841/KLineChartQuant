/** 实例级 Provider 拨测：逐目标复用、超时与配置身份失效。 */
import { createSignal, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import type { MarketDataProviderRegistry } from '../../provider/impl/registry.js'
import type { MarketDataProvider, SourceProbeResult } from '../../provider/types.js'
import type { MarketHealthOptions, MarketProviderHealth } from '../types.js'

interface ProbeRequest {
  readonly provider: MarketDataProvider
  readonly version: number
  readonly controller: AbortController
  readonly promise: Promise<void>
}

/** 健康状态只归属于管理实例，不随消费者组件卸载而取消。 */
export class MarketDataHealth {
  private readonly signal = createSignal<Readonly<Record<string, MarketProviderHealth>>>({})
  readonly state: ReadonlySignal<Readonly<Record<string, MarketProviderHealth>>> = this.signal
  private readonly requests = new Map<string, ProbeRequest>()
  private readonly unsubscribe: () => void
  private disposed = false

  constructor(
    private readonly registry: MarketDataProviderRegistry,
    private readonly ttlMs = 15_000,
    private readonly timeoutMs = 5_000,
  ) {
    this.unsubscribe = registry.state.subscribe(() => this.invalidateChangedConnections())
  }

  /** 每个目标分别判断 TTL；已进行中的同身份请求直接复用。 */
  refresh(options: MarketHealthOptions = {}): Promise<void> {
    if (this.disposed) return Promise.resolve()
    return Promise.all(
      this.registry
        .getAll()
        .filter((provider) => !options.names || options.names.has(provider.source.id))
        .map((provider) => this.probe(provider, options.force ?? false)),
    ).then(() => undefined)
  }

  private probe(provider: MarketDataProvider, force: boolean): Promise<void> {
    const id = provider.source.id
    const version = this.registry.getConnection(id).version
    const active = this.requests.get(id)
    if (active && active.provider === provider && active.version === version) return active.promise
    const cached = this.signal.peek()[id]
    if (
      !force &&
      cached &&
      cached.status !== 'checking' &&
      cached.connectionVersion === version &&
      Date.now() - cached.checkedAt < this.ttlMs
    )
      return Promise.resolve()
    active?.controller.abort()
    const controller = new AbortController()
    this.signal.set({
      ...this.signal.peek(),
      [id]: {
        status: 'checking',
        checkedAt: Date.now(),
        connectionVersion: version,
      },
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const aborted = new Promise<SourceProbeResult>((resolve) => {
      controller.signal.addEventListener(
        'abort',
        () =>
          resolve({
            status: 'offline',
            checkedAt: Date.now(),
            message: 'Connection probe timed out or cancelled',
          }),
        { once: true },
      )
      timer = setTimeout(() => controller.abort(), this.timeoutMs)
    })
    const promise = Promise.race([
      Promise.resolve().then(() => provider.probe(controller.signal)),
      aborted,
    ])
      .catch(
        (error: unknown): SourceProbeResult => ({
          status: 'offline',
          checkedAt: Date.now(),
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      .then((result) => {
        if (
          this.disposed ||
          this.requests.get(id)?.controller !== controller ||
          this.registry.get(id) !== provider ||
          this.registry.getConnection(id).version !== version
        )
          return
        this.signal.set({
          ...this.signal.peek(),
          [id]: {
            status: result.status,
            checkedAt: Date.now(),
            connectionVersion: version,
            ...(result.latencyMs === undefined ? {} : { latencyMs: result.latencyMs }),
            ...(result.message ? { message: result.message } : {}),
          },
        })
      })
      .finally(() => {
        clearTimeout(timer)
        if (this.requests.get(id)?.controller === controller) this.requests.delete(id)
      })
    this.requests.set(id, { provider, version, controller, promise })
    return promise
  }

  /** 改址、注销或替换 Provider 后清除旧状态，旧请求不能覆盖新连接。 */
  private invalidateChangedConnections(): void {
    const next = { ...this.signal.peek() }
    let changed = false
    for (const [id, entry] of Object.entries(next)) {
      const provider = this.registry.get(id)
      const request = this.requests.get(id)
      if (
        !provider ||
        this.registry.getConnection(id).version !== entry.connectionVersion ||
        (request && request.provider !== provider)
      ) {
        this.requests.delete(id)
        request?.controller.abort()
        delete next[id]
        changed = true
      }
    }
    if (changed) this.signal.set(next)
  }

  /** 只有实例所有者可以释放全部拨测。 */
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    for (const request of this.requests.values()) request.controller.abort()
    this.requests.clear()
    this.signal.set({})
  }
}
