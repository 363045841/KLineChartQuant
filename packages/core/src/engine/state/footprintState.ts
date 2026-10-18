/** 足迹主序列状态：从行情、视图和设置派生输入，集中保存异步聚合结果。 */
import { seriesSelectionKey } from '@/data/buffer/impl/seriesRepository.js'
import { TRADE_STATUS } from '@/data/trades/types.js'
import type { ChartSettings } from '@/foundation/config/chartSettings.js'
import { computed, createSubState, type ReadonlySignal } from '@/foundation/reactivity/signal.js'
import { ChartDataViewId, type ChartDataView } from '@/engine/chartModel/index.js'
import { supportsRawTradeStream } from '@/engine/data/marketRuntime/types.js'
import {
  FOOTPRINT_DEFAULT_PARAMS,
  FOOTPRINT_SHAPE,
  FOOTPRINT_TEXT_MODES,
  type FootprintRenderState,
  type FootprintParams,
} from '@/components/footprint/types.js'
import type { FootprintInput, FootprintOptions, FootprintResult } from '@/components/footprint/runtime/types.js'
import { ACTIVE_BUFFER_KIND, type DataStateModule } from './dataState.js'

/** 计算参数按字段比较；成交更新不序列化行情或批次。 */
function sameParams(a: FootprintParams, b: FootprintParams): boolean {
  return (
    a.rowMode === b.rowMode &&
    a.rowPeriod === b.rowPeriod &&
    a.targetRows === b.targetRows &&
    a.ticksPerRow === b.ticksPerRow &&
    a.imbalanceRatio === b.imbalanceRatio &&
    a.metric === b.metric
  )
}

/** 配置边界补齐默认值；绘制与执行端不再各自解释参数。 */
function resolveOptions(settings: ChartSettings): FootprintOptions {
  return {
    params: {
      rowMode: settings.footprintRowMode ?? FOOTPRINT_DEFAULT_PARAMS.rowMode,
      rowPeriod: settings.footprintRowPeriod ?? FOOTPRINT_DEFAULT_PARAMS.rowPeriod,
      targetRows: settings.footprintTargetRows ?? FOOTPRINT_DEFAULT_PARAMS.targetRows,
      ticksPerRow: settings.footprintTicksPerRow ?? FOOTPRINT_DEFAULT_PARAMS.ticksPerRow,
      imbalanceRatio: settings.footprintImbalanceRatio ?? FOOTPRINT_DEFAULT_PARAMS.imbalanceRatio,
      metric: settings.footprintMetric ?? FOOTPRINT_DEFAULT_PARAMS.metric,
    },
    textMode: settings.footprintTextMode ?? FOOTPRINT_TEXT_MODES.BidAsk,
  }
}

/** 创建内核子状态；网络仍由数据层负责，计算执行器只提交带身份的结果。 */
export function createFootprintState(deps: {
  readonly data: DataStateModule
  readonly settings$: ReadonlySignal<ChartSettings>
  readonly dataView$: ReadonlySignal<ChartDataView>
}) {
  const { signals, readonly } = createSubState({ result: null as FootprintResult | null })
  /** 用户选择足迹形态且处于 K 线视图。 */
  const selected = computed(
    () =>
      deps.dataView$() === ChartDataViewId.KLine &&
      deps.settings$().klineShape === FOOTPRINT_SHAPE,
  )
  /** 无就绪会话时能力未知，不禁用；只有明确不支持原始逐笔成交的品种才不激活足迹。 */
  const supported = computed(() => {
    const market = deps.data.readonly.readyMarket()
    return market === null || supportsRawTradeStream(market)
  })
  /** 足迹实际生效：形态被选中且当前品种能提供原始逐笔成交。 */
  const enabled = computed(() => selected() && supported())
  let previousOptions: FootprintOptions | null = null
  const options = computed(() => {
    let next = resolveOptions(deps.settings$())
    if (previousOptions && sameParams(previousOptions.params, next.params)) {
      if (previousOptions.textMode === next.textMode) return previousOptions
      next = { ...next, params: previousOptions.params }
    }
    previousOptions = next
    return next
  })
  let previousInput: FootprintInput | null = null
  const input = computed<FootprintInput | null>(() => {
    if (!enabled()) {
      previousInput = null
      return null
    }
    const active = deps.data.readonly.activeBuffer()
    const market = deps.data.readonly.readyMarket()
    if (active.kind !== ACTIVE_BUFFER_KIND.bars || !market) {
      previousInput = null
      return null
    }
    const params = options().params
    const trades = deps.data.readonly.trades()
    const marketKey = seriesSelectionKey(market.selection)
    if (
      previousInput &&
      previousInput.marketKey === marketKey &&
      previousInput.data === active.data &&
      previousInput.params === params &&
      previousInput.trades === trades
    ) return previousInput
    previousInput = { marketKey, data: active.data, params, trades }
    return previousInput
  })
  const renderState = computed<FootprintRenderState | null>(() => {
    const current = input()
    if (!current) return null
    const result = readonly.result()
    const valid = result &&
      result.input.marketKey === current.marketKey &&
      result.input.data === current.data &&
      result.input.params === current.params
    // 在途成交仍可显示上次聚合内容，但加载、断线与缺口必须立即反映当前数据层状态。
    const series = valid ? (
      result.input === current ? result.series : {
        ...result.series,
        status: current.trades.status,
        message: current.trades.message,
      }
    ) : {
      bars: [],
      rowSize: '0',
      latestTimestamp: current.trades.latestTimestamp,
      status: current.trades.status === TRADE_STATUS.ready ? TRADE_STATUS.loading : current.trades.status,
      message: current.trades.message,
    }
    return {
      timestamp: current.trades.latestTimestamp,
      textMode: options().textMode,
      series,
    }
  })
  return {
    readonly: { enabled, supported, input, renderState },
    actions: {
      /** 只接受当前输入的计算提交；异步旧任务在内核边界失去写入资格。 */
      commit(result: FootprintResult | null): void {
        if (result === null || result.input === input.peek()) signals.result.set(result)
      },
    },
    /** 清除足迹结果，不修改用户选择的显示模式。 */
    dispose(): void {
      previousInput = null
      signals.result.set(null)
    },
  }
}

export type FootprintStateModule = ReturnType<typeof createFootprintState>
