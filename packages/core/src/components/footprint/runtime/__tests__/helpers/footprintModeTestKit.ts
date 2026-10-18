/** 模式链路测试复用真实内核和执行核心，统一管理市场切换与资源释放。 */
import { onTestFinished } from 'vitest'
import type { SourceCapabilities } from '@/data/provider/types.js'
import { createTestChartStateKernel } from '@/engine/state/__tests__/helpers/createTestChartStateKernel.js'
import { ACTIVE_BUFFER_KIND } from '@/engine/state/dataState.js'
import { SERIES_SELECTION_KIND, type BarsSelection } from '@/data/buffer/impl/seriesRepository.js'
import { tradeInstrument } from '@/data/trades/__tests__/helpers/tradeTestKit.js'
import type { ReadyMarketSession } from '@/engine/data/marketRuntime/types.js'
import { createFootprintRuntime } from '../../impl/createFootprintRuntime.js'
import { FOOTPRINT_ROW_MODES, FOOTPRINT_SHAPE } from '../../../types.js'
import { data } from '../../../__tests__/helpers/footprintTestKit.js'

/** 默认就绪会话同时声明源级与品种级原始成交流能力。 */
const RAW_TRADE_CAPABILITIES: SourceCapabilities = {
  assetClasses: ['crypto'],
  trades: { raw: true, live: true },
}

/** 真实内核与 inline 执行核心组成模式链路，统一释放所有监听与缓存。 */
export function createFootprintHarness() {
  const kernel = createTestChartStateKernel({ initialSettings: {
    klineShape: FOOTPRINT_SHAPE, footprintRowMode: FOOTPRINT_ROW_MODES.Fixed, footprintTicksPerRow: 1,
  } })
  /** 按真实活动快照契约切换周期或能力；数据层同时清除旧市场的成交。 */
  function selectPeriod(
    period: BarsSelection['period'],
    capabilities: SourceCapabilities = RAW_TRADE_CAPABILITIES,
  ): void {
    const selection: BarsSelection = {
      kind: SERIES_SELECTION_KIND.bars, instrumentKey: tradeInstrument.id, sourceId: tradeInstrument.sourceId,
      period, adjustment: 'none', barAggregation: 'original',
    }
    const market: ReadyMarketSession = {
      selection, instrument: tradeInstrument, capabilities,
    }
    kernel.data.actions.applyActiveBufferSnapshot({
      kind: ACTIVE_BUFFER_KIND.bars, selection, data, loading: false, error: null,
      timezone: 'UTC', timeShareRange: null, timeSharePreClose: null,
    }, market)
  }
  selectPeriod('1min')
  const runtime = createFootprintRuntime({ input$: kernel.footprint.readonly.input, commit: kernel.footprint.actions.commit, createWorker: () => null })
  onTestFinished(() => { runtime.dispose(); kernel.dispose() })
  return { kernel, runtime, selectPeriod }
}
