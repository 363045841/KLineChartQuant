/**
 * 会话级计算行情：按 feed 提供的就绪会话读取脚本所需 K 线。
 *
 * 它不持有图表、不订阅实时流；每次需求按 feed 的 bars 区间补齐历史，
 * 下一次计算发现尾部落后时再重新获取，实时性由计算频率保证。
 */
import type { IndicatorBarsRequest } from '@363045841yyt/klinechart-plot-contracts'
import { MarketDataCache } from '@/data/buffer/impl/marketDataCache.js'
import {
  type BarsSelection,
  instrumentKeyFromSpec,
  SERIES_SELECTION_KIND,
  seriesSelectionKey,
} from '@/data/buffer/impl/seriesRepository.js'
import type { BarAggregation, InstrumentDescriptor, KLineAdjustment, KLinePeriod } from '@/data/provider/types.js'
import { IndicatorBarsRepository } from '@/engine/data/marketRuntime/impl/indicatorBarsRepository.js'
import { createScriptTimeContext } from '@/engine/data/marketRuntime/impl/scriptTimeContext.js'
import type { CalculationMarket, CalculationMarketOptions } from '../types.js'

/** 把任意品种描述换算为 Repository 的 K 线选择；不依赖图表当前品种。 */
function resolveSelection(
  instrument: InstrumentDescriptor,
  period: KLinePeriod,
  adjustment: KLineAdjustment,
  barAggregation: BarAggregation,
): BarsSelection {
  return {
    kind: SERIES_SELECTION_KIND.bars,
    instrumentKey: instrumentKeyFromSpec({ instrument, period, adjust: adjustment }),
    source: instrument.source,
    period,
    adjustment,
    barAggregation,
  }
}

/**
 * 创建会话级计算行情。
 *
 * @param options 行情来源注册表与市场时段配置
 * @returns 只读行情上下文、租约回收与释放
 */
export function createCalculationMarket(options: CalculationMarketOptions): CalculationMarket {
  const cache = new MarketDataCache(options.registry)
  const { marketSessions } = options
  /** 当前被脚本需求持有的 Buffer；租约退出时按选择删除。 */
  const retained = new Map<string, { selection: BarsSelection; owners: ReadonlySet<string> }>()
  const bars = new IndicatorBarsRepository({
    cache,
    registry: options.registry,
    sessions: marketSessions,
    resolveSelection,
    // 计算只读取历史：记录需求持有关系，不建立实时流。
    bind: (owners, target) => {
      retained.set(seriesSelectionKey(target.selection), { selection: target.selection, owners })
    },
  })
  let disposed = false

  return {
    context(owner, data, session) {
      return Object.freeze({
        symbol: session === undefined ? '' : session.instrument.symbol,
        ...(session === undefined
          ? {}
          : { time: createScriptTimeContext(session, marketSessions) }),
        loadBars: (request: IndicatorBarsRequest, signal?: AbortSignal) =>
          bars.read(owner, data, request, session ?? null, signal, session !== undefined),
      })
    },
    retain(owners) {
      if (disposed) return
      bars.retain(owners)
      for (const [key, demanded] of retained) {
        if (demanded.owners.size > 0) continue
        retained.delete(key)
        cache.repository.delete(demanded.selection)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      retained.clear()
      bars.clear()
      cache.destroy()
    },
  }
}
