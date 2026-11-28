/**
 * 统一品种模型与图表 SymbolSpec 的唯一转换入口。
 *
 * 品种切换、对比品种和嵌入工作台的初始化都从这里构造，避免各处重复拼装字段。
 */
import type { SymbolInfo } from '@363045841yyt/klinechart-core/controllers'
import type { SymbolSpec } from '@363045841yyt/klinechart-core'
import type {
  InstrumentDescriptor,
  KLineAdjustment,
} from '@363045841yyt/klinechart-core/market-data'

/** 一次品种切换需要保留的图表上下文。 */
export interface SymbolSpecSelection {
  readonly period: string
  readonly adjust: KLineAdjustment
  /** 当前品种的日期边界；缺省表示不限制范围。 */
  readonly bounds?: Pick<SymbolSpec, 'startDate' | 'endDate'>
}

/** 由统一品种模型构造图表品种；日期边界只在显式提供时写入。 */
export function toSymbolSpec(
  item: InstrumentDescriptor,
  selection: SymbolSpecSelection,
): SymbolSpec {
  return {
    instrument: item,
    period: selection.period,
    adjust: selection.adjust,
    ...(selection.bounds === undefined
      ? {}
      : { startDate: selection.bounds.startDate, endDate: selection.bounds.endDate }),
  }
}

/** 为没有稳定 ID 的旧搜索结果生成确定性身份。 */
export function legacyInstrumentId(
  source: string,
  symbol: string,
  exchange: string,
  providerRef?: Readonly<Record<string, string | number | boolean>>,
): string {
  const params = Object.entries(providerRef ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  return `legacy:${source}:${exchange}:${symbol}:${JSON.stringify(params)}`
}

/** 将旧 controller 目录条目转换为 UI 使用的统一品种模型。 */
export function fromSymbolInfo(info: SymbolInfo): InstrumentDescriptor {
  return {
    id:
      info.id ??
      legacyInstrumentId(info.source ?? '', info.symbol, info.exchange ?? '', info.params),
    source: info.source ?? '',
    symbol: info.symbol,
    name: info.description ?? info.symbol,
    instrumentType: info.instrumentType ?? 'unknown',
    exchange: info.exchange ?? '',
    sessionId: info.sessionId ?? (info.market || undefined),
    providerRef: info.params,
    tickSize: info.tickSize,
    lotSize: info.lotSize,
    currency: info.currency,
    capabilities: info.capabilities ?? {},
  }
}

/**
 * 业务品种自带的统一品种模型。
 *
 * @param spec 业务品种
 * @returns 用于展示与能力判断的品种描述
 */
export function symbolItemForSpec(spec: SymbolSpec): InstrumentDescriptor {
  return spec.instrument
}
