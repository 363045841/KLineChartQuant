/** 指标行情需求的共享生命周期：负责去重、持有者和取消，不处理行情加载。 */
import type { KLineBuffer } from '@/data/buffer/types.js'
import type { ReadyMarketSession } from '../types.js'

export interface IndicatorBarsDemand {
  readonly owners: Set<string>
  readonly session: ReadyMarketSession
  readonly abort: AbortController
  readonly from: number
  readonly to: number
  readonly ready: Promise<void>
  target?: ReadyMarketSession
  buffer?: KLineBuffer
}

/** 让调用者取消等待，不影响共享需求本身。 */
export function waitForDemand<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

/** 共享同一身份的需求任务，并只在最后一个 owner 离开时取消。 */
export class IndicatorBarsDemandRegistry {
  private readonly demands = new Map<string, IndicatorBarsDemand>()

  /** 在启动异步加载前登记需求，使并发读取共享同一准备任务。 */
  acquire(
    key: string,
    input: Pick<IndicatorBarsDemand, 'owners' | 'session' | 'from' | 'to'>,
    load: (demand: IndicatorBarsDemand) => Promise<void>,
  ): IndicatorBarsDemand {
    const existing = this.demands.get(key)
    if (existing) {
      for (const owner of input.owners) existing.owners.add(owner)
      return existing
    }
    const created: IndicatorBarsDemand = {
      ...input,
      abort: new AbortController(),
      ready: Promise.resolve().then(() => load(created)),
    }
    this.demands.set(key, created)
    void created.ready.catch(() => {
      if (this.isCurrent(key, created)) this.demands.delete(key)
    })
    return created
  }

  /** 判断等待期间需求是否已被替换。 */
  isCurrent(key: string, demand: IndicatorBarsDemand): boolean {
    return this.demands.get(key) === demand
  }

  /** 已完成需求的范围不足时移除条目，下一轮继承其 owner 重新加载。 */
  delete(key: string): void {
    this.demands.delete(key)
  }

  /** 根据使用者完整快照回收无主任务。 */
  retain(owners: ReadonlySet<string>): void {
    for (const [key, demand] of this.demands) {
      for (const id of demand.owners) if (!owners.has(id)) demand.owners.delete(id)
      if (demand.owners.size) continue
      demand.abort.abort()
      this.demands.delete(key)
    }
  }

  /** 会话销毁时终止全部准备任务。 */
  clear(): void {
    for (const demand of this.demands.values()) demand.abort.abort()
    this.demands.clear()
  }
}
