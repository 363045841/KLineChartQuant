/**
 * 警报运行时：组合警报服务、行情订阅与持久化，独立于图表生命周期。
 *
 * 时钟取自共享运行时，规则容量与错误出口由宿主给出；本文件不提供默认值。
 */
import type { MarketRuntime } from '@/engine/runtime/index.js'
import { ORIGINAL_BAR_AGGREGATION } from '@/data/provider/types.js'
import type { DocumentStore } from '@/foundation/persistence/types.js'
import type { AlertService, AlertLimits } from '../types.js'
import type { AlertDocument } from './alertCodec.js'
import { createAlertService } from './createAlertService.js'

export interface AlertRuntimeOptions {
  readonly runtime: MarketRuntime
  readonly document: DocumentStore<AlertDocument>
  /** 规则与触发记录的容量策略。 */
  readonly limits: AlertLimits
  /** 持久化与投递失败的唯一出口。 */
  readonly onError: (error: unknown) => void
}

/**
 * 创建独立警报运行时。
 *
 * @param options - 共享运行时、存储、容量与错误出口
 * @returns 与图表无关的警报运行时
 */
export function createAlertRuntime(options: AlertRuntimeOptions): Promise<AlertService> {
  return createAlertService({
    hub: options.runtime.calculation,
    definitions: options.runtime.definitions,
    document: options.document,
    acquireBars: (symbol) => options.runtime.data.bars(symbol, {
      aggregation: ORIGINAL_BAR_AGGREGATION,
      initialBars: 500,
    }).dispose,
    clock: options.runtime.clock,
    limits: options.limits,
    onError: options.onError,
  })
}
