/**
 * 行情序列身份契约：选择、稳定键与跨来源身份。
 *
 * 不持有 Buffer、不访问 Provider；仓库实现与消费者都从这里取身份定义。
 */
import type { SymbolSpec } from '@/controllers/types.js'
import type {
  BarAggregation,
  KLineAdjustment,
  KLinePeriod,
  TradingDate,
} from '../provider/types.js'

export type InstrumentKey = string
export type Source = string
export type TradingDateKey = TradingDate | typeof LATEST_TRADING_DATE

export const LATEST_TRADING_DATE = 'latest'

/** 序列选择判别字段字面量；判别种类时引用它，不在业务代码里散落字符串。 */
export const SERIES_SELECTION_KIND = {
  bars: 'bars',
  timeShare: 'timeShare',
  trades: 'trades',
} as const

/** 当前图表消费的强类型序列选择。 */
export type SeriesSelection =
  | {
      readonly kind: typeof SERIES_SELECTION_KIND.bars
      readonly instrumentKey: InstrumentKey
      readonly source: Source
      readonly period: KLinePeriod
      readonly adjustment: KLineAdjustment
      readonly barAggregation: BarAggregation
    }
  | {
      readonly kind: typeof SERIES_SELECTION_KIND.timeShare
      readonly instrumentKey: InstrumentKey
      readonly source: Source
      readonly tradingDate: TradingDateKey
    }

/** 原始成交按品种和来源复用，不绑定 K 线周期或足迹参数。 */
export interface TradesSelection {
  readonly kind: typeof SERIES_SELECTION_KIND.trades
  readonly instrumentKey: InstrumentKey
  readonly source: Source
}

/** 按判别字段收窄后的 K 线选择。 */
export type BarsSelection = Extract<SeriesSelection, { kind: typeof SERIES_SELECTION_KIND.bars }>

/** 按判别字段收窄后的分时选择。 */
export type TimeShareSelection = Extract<
  SeriesSelection,
  { kind: typeof SERIES_SELECTION_KIND.timeShare }
>

/** 统一身份字段，去除首尾空白并避免分隔符碰撞。 */
function identityPart(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase()
}

/** 从业务品种生成跨来源共享的市场身份。 */
export function instrumentKeyFromSpec(spec: SymbolSpec): InstrumentKey {
  const { instrument } = spec
  return JSON.stringify([
    identityPart(instrument.sessionId ?? instrument.exchange),
    identityPart(instrument.exchange),
    identityPart(instrument.symbol),
  ])
}

/** 读取请求指定的来源；品种模型始终携带来源。 */
export function sourceFromSpec(spec: SymbolSpec): Source {
  return spec.instrument.source
}

/** 生成可用于订阅表和兼容诊断字段的稳定选择键。 */
export function seriesSelectionKey(selection: SeriesSelection | TradesSelection): string {
  if (selection.kind === SERIES_SELECTION_KIND.trades)
    return JSON.stringify([selection.kind, selection.instrumentKey, selection.source])
  return selection.kind === SERIES_SELECTION_KIND.bars
    ? JSON.stringify([
        selection.kind,
        selection.instrumentKey,
        selection.source,
        selection.period,
        selection.adjustment,
        selection.barAggregation,
      ])
    : JSON.stringify([
        selection.kind,
        selection.instrumentKey,
        selection.source,
        selection.tradingDate,
      ])
}
