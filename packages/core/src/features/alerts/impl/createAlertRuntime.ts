/**
 * 警报运行时：组合警报服务、行情订阅与持久化，独立于图表生命周期。
 *
 * 时钟取自共享运行时，规则容量与错误出口由宿主给出；本文件不提供默认值。
 */
import type { MarketRuntime } from '@/engine/runtime/index.js'
import type { DocumentStore } from '@/foundation/persistence/types.js'
import type { AlertService, AlertLimits } from '../types.js'
import type { AlertFiresDocument, AlertRulesDocument } from './alertCodec.js'
import { createAlertFeeds } from './createAlertFeeds.js'
import { createAlertService } from './createAlertService.js'

export interface AlertRuntimeOptions {
  readonly runtime: MarketRuntime
  readonly rules: DocumentStore<AlertRulesDocument>
  readonly fires: DocumentStore<AlertFiresDocument>
  /** 规则与触发记录的容量策略。 */
  readonly limits: AlertLimits
  /** 持久化与投递失败的唯一出口。 */
  readonly onError: (error: unknown) => void
}

export interface AlertRuntime {
  readonly service: AlertService
  dispose(): Promise<void>
}

/**
 * 创建独立警报运行时。
 *
 * @param options - 共享运行时、存储、容量与错误出口
 * @returns 与图表无关的警报运行时
 */
export async function createAlertRuntime(options: AlertRuntimeOptions): Promise<AlertRuntime> {
  const feeds = createAlertFeeds({
    data: options.runtime.data,
    hub: options.runtime.calculation,
    registry: options.runtime.market.registry,
    onError: (_symbol, error) => options.onError(error),
  })
  const service = await createAlertService({
    hub: options.runtime.calculation,
    definitions: options.runtime.definitions,
    rules: options.rules,
    fires: options.fires,
    feeds,
    clock: options.runtime.clock,
    limits: options.limits,
    onError: options.onError,
  })
  let disposed = false
  return {
    service,
    async dispose() {
      if (disposed) return
      disposed = true
      await service.dispose()
      feeds.dispose()
      await Promise.allSettled([options.rules.dispose(), options.fires.dispose()])
    },
  }
}
