/**
 * 警报运行时：组合警报服务、行情源与持久化，独立于图表生命周期。
 */
import type { MarketRuntime } from '@/engine/runtime/index.js'
import type { AlertRulesDocument, AlertFiresDocument } from './alertCodec.js'
import { createAlertFeedSource } from './createAlertFeedSource.js'
import { createAlertService } from './createAlertService.js'
import type { AlertService } from '../types.js'
import type { DocumentStore } from '@/foundation/persistence/index.js'

export interface AlertRuntimeOptions {
  readonly runtime: MarketRuntime
  readonly rules: DocumentStore<AlertRulesDocument>
  readonly fires: DocumentStore<AlertFiresDocument>
  readonly onError?: (error: unknown) => void
}

export interface AlertRuntime {
  readonly service: AlertService
  dispose(): Promise<void>
}

/** 创建独立警报运行时；调用方只依赖本对象，不直接接触 feed/store。 */
export async function createAlertRuntime(options: AlertRuntimeOptions): Promise<AlertRuntime> {
  const feeds = createAlertFeedSource({
    hub: options.runtime.calculation,
    registry: options.runtime.market.registry,
    stream: options.runtime.market.stream,
    onError: (_symbol, error) => options.onError?.(error),
  })
  const service = await createAlertService({
    hub: options.runtime.calculation,
    definitions: options.runtime.definitions,
    rules: options.rules,
    fires: options.fires,
    feeds,
    ...(options.onError === undefined ? {} : { onError: options.onError }),
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
