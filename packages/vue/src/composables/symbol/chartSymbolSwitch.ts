/** 图表主品种切换：把统一品种描述收敛到当前周期/复权并写入控制器。 */

import {
  type ChartController,
  isTimeShareDataView,
  type SymbolInfo,
  type SymbolSpec,
  TIME_SHARE_PERIOD,
} from '@363045841yyt/klinechart-core/controllers'
import {
  type InstrumentDescriptor,
  isKLineAdjustment,
  isKLinePeriod,
  KLineAdjustment,
  KLinePeriod,
} from '@363045841yyt/klinechart-core/market-data'

/** 切换前图表所处的周期、复权与日期边界；调用方缺省时从控制器读取。 */
export interface ChartSymbolSelection {
  /** 当前周期；分时模式使用 `timeshare`。 */
  period: string
  adjust: KLineAdjustment
  /** 沿用当前主品种的日期边界，切换品种不重置时间范围。 */
  bounds?: Pick<SymbolSpec, 'startDate' | 'endDate'>
}

/** 将统一品种转换为旧 controller 目录结构，仅用于兼容边界。 */
export function toLegacySymbolInfo(item: InstrumentDescriptor): SymbolInfo {
  return {
    id: item.id,
    instrumentType: item.instrumentType,
    sessionId: item.sessionId,
    capabilities: item.capabilities,
    tickSize: item.tickSize,
    lotSize: item.lotSize,
    currency: item.currency,
    symbol: item.symbol,
    market: item.sessionId ?? '',
    description: item.name,
    exchange: item.exchange,
    source: item.sourceId,
    params: item.providerRef,
  }
}

/**
 * 读取控制器当前的主品种选择。
 * @param controller 图表控制器
 * @returns 周期、复权与日期边界
 */
export function readChartSymbolSelection(controller: ChartController): ChartSymbolSelection {
  const active = controller.symbols.peek()[0]
  return {
    period: isTimeShareDataView(controller.chartMode.peek())
      ? TIME_SHARE_PERIOD
      : (active?.period ?? KLinePeriod.Daily),
    adjust:
      active?.adjust !== undefined && isKLineAdjustment(active.adjust)
        ? active.adjust
        : KLineAdjustment.None,
    bounds: active,
  }
}

/** 品种能力之外的周期/复权在切换时收敛，避免请求不受支持的序列。 */
function resolveSelection(
  item: InstrumentDescriptor,
  current: ChartSymbolSelection,
): Pick<ChartSymbolSelection, 'period' | 'adjust'> {
  const capabilities = item.capabilities
  const periods = capabilities?.bars?.periods ?? []
  const periodSupported =
    current.period === TIME_SHARE_PERIOD
      ? capabilities?.timeShare === true
      : isKLinePeriod(current.period) && periods.includes(current.period)
  const period = periodSupported
    ? current.period
    : (periods[0] ?? (capabilities?.timeShare ? TIME_SHARE_PERIOD : current.period))

  const adjustments = capabilities?.bars?.adjustments ?? []
  const adjust =
    adjustments.length > 0 && !adjustments.includes(current.adjust)
      ? adjustments[0]!
      : current.adjust
  return { period, adjust }
}

/** 按收敛后的选择构造主品种描述，日期边界沿用切换前的图表。 */
function buildSymbolSpec(item: InstrumentDescriptor, selection: ChartSymbolSelection): SymbolSpec {
  return {
    id: item.id,
    instrument: item,
    symbol: item.symbol,
    market: item.sessionId ?? '',
    exchange: item.exchange,
    period: selection.period,
    source: item.sourceId,
    params: item.providerRef,
    startDate: selection.bounds?.startDate ?? '',
    endDate: selection.bounds?.endDate ?? '',
    adjust: selection.adjust,
  }
}

/**
 * 把品种切换为图表主品种。
 * @param controller 图表控制器
 * @param item 目标品种
 * @param current 图表当前选择；缺省时从控制器读取，独立调用方无需重复推导
 */
export function switchChartSymbol(
  controller: ChartController,
  item: InstrumentDescriptor,
  current: ChartSymbolSelection = readChartSymbolSelection(controller),
): void {
  const selection = { ...current, ...resolveSelection(item, current) }
  // 先对齐周期，再写入主序列，保证缓冲区按新周期建立。
  if (selection.period !== current.period) controller.setCurrentPeriod(selection.period)
  controller.registerSymbols([toLegacySymbolInfo(item)])
  controller.setSymbols([buildSymbolSpec(item, selection)])
}
