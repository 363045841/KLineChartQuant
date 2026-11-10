/** 构建主图图例的模板上下文：把帧数据投影为行情与对比展示行。 */

import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import type { TitleInfo } from '@/engine/indicators/indicatorMetadata.js'
import type { IndicatorInstanceDescriptor } from '@/engine/indicators/instances/api/indicatorRenderBinding.js'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/pipeline/index.js'
import { PANE_HEADER_INSET_PX } from '@/engine/pane/types.js'
import type { PluginHost, RenderContext } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ChartDataViewId, isTimeShareDataView } from '@/foundation/types/chartView.js'
import { isKLineDataArray, isTimeShareDataArray, type KLineData } from '@/foundation/types/price.js'
import {
  type LegendComparisonRow,
  type LegendIndicatorRow,
  type LegendLayout,
  type LegendTemplateContext,
  type LegendTimeshareRow,
} from '../types.js'
import { projectLegendColors } from './legendColors.js'
import { LEGEND_COMPACT_WIDTH_PX, LEGEND_GAP_PX, LEGEND_ROW_HEIGHT_PX } from './legendGeometry.js'
import { formatLegendQuantity, legendChangeColor, resolveLegendChange } from './legendQuote.js'
import { resolveLegendValueIndex } from './resolveLegendValueIndex.js'

/** 主图图例左、上内边距与 pane 标题共用同一基准。 */
const LEGEND_INSET = PANE_HEADER_INSET_PX

/** 构建图例上下文的输入：一帧渲染上下文。 */
export interface ProjectLegendContextInput {
  context: RenderContext
  host: PluginHost | null
}

export function projectLegendContext(
  input: ProjectLegendContextInput,
): LegendTemplateContext | null {
  const { context } = input
  if (!context.data.length) return null

  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const targetIndex = resolveLegendValueIndex(context.crosshairIndex, context.data.length)
  const layout: LegendLayout = {
    x: LEGEND_INSET,
    y: LEGEND_INSET,
    lineHeight: LEGEND_ROW_HEIGHT_PX,
    gap: LEGEND_GAP_PX,
    paneWidth: context.paneWidth,
    compact: context.paneWidth < LEGEND_COMPACT_WIDTH_PX,
  }

  const klineData = isKLineDataArray(context.data) ? context.data : []
  const bar = klineData[targetIndex] ?? null

  return {
    rows: [],
    period: context.period,
    index: targetIndex,
    hasCrosshair: typeof context.crosshairIndex === 'number',
    layout,
    colors: projectLegendColors(colors),
    currentBar: projectCurrentBar(context, klineData, targetIndex, colors),
    timeshare: projectTimeshareRow(context, targetIndex, colors),
    comparisons: collectComparisonRows(context, bar, colors),
    bar,
  }
}

/** 分时行情行：按前收计算涨跌；前收无效时保留行情，只省略涨跌。 */
function projectTimeshareRow(
  context: RenderContext,
  targetIndex: number,
  colors: ColorTokens,
): LegendTimeshareRow | null {
  if (!isTimeShareDataView(context.dataView)) return null
  const item = isTimeShareDataArray(context.data) ? context.data[targetIndex] : undefined
  if (!item) return null

  const volume =
    typeof item.volume === 'number' && Number.isFinite(item.volume) ? item.volume : null
  const amount =
    typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null
  return {
    price: item.price,
    average: item.average,
    change: resolveLegendChange(item.price, context.timeShareBaseline, colors),
    volume,
    volumeText: volume === null ? null : formatLegendQuantity(volume),
    amount,
    amountText: amount === null ? null : formatLegendQuantity(amount),
  }
}

/** K 线当前柱：OHLC、涨跌幅与成交量文本，进入/离开画布不推动指标行位置。 */
function projectCurrentBar(
  context: RenderContext,
  klineData: ReadonlyArray<KLineData>,
  targetIndex: number,
  colors: ColorTokens,
): LegendTemplateContext['currentBar'] {
  if (context.dataView !== ChartDataViewId.KLine) return null
  const bar = klineData[targetIndex]
  if (!bar || typeof bar.close !== 'number') return null
  return {
    ...bar,
    volume: typeof bar.volume === 'number' ? bar.volume : null,
    volumeText: typeof bar.volume === 'number' ? formatLegendQuantity(bar.volume) : null,
    color: bar.close >= bar.open ? colors.candleUpBody : colors.candleDownBody,
    change: resolveLegendChange(
      bar.close,
      targetIndex > 0 ? klineData[targetIndex - 1]?.close : null,
      colors,
    ),
  }
}

/**
 * 主副图指标从同一实例目录及帧读取器生成标题。
 *
 * 只要定义已注册就返回一行：当前位置没有取值只表现为没有 values，
 * 不回退隐藏整个指标。主副图据此保持一致的可见性。
 */
export function projectIndicator(
  instance: IndicatorInstanceDescriptor,
  stateReader: RenderContext['indicatorStateReader'],
  availability: RenderContext['indicatorAvailability'],
  data: KLineData[],
  index: number,
  colors: ColorTokens,
): LegendIndicatorRow | null {
  const meta = getRegisteredIndicatorDefinition(instance.definitionId)
  if (!meta) return null
  const error = stateReader?.get<{ error?: { message: string } }>(instance.instanceId)?.error
    ?.message
  const loading = !error && availability?.isLoading(instance.instanceId) === true
  const params: Record<string, number | boolean | string> = {}
  for (const [key, value] of Object.entries(instance.params)) {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
      params[key] = value
  }
  const titleInfo: TitleInfo | null =
    !error && meta.getTitleInfo && stateReader
      ? meta.getTitleInfo(
          data,
          index,
          params,
          stateReader,
          instance.instanceId,
          instance.paneId,
          colors,
        )
      : null
  return {
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    hidden: instance.hidden,
    loading,
    error,
    name: titleInfo?.name ?? meta.displayName,
    params:
      titleInfo?.params ??
      (error ? Object.values(params).filter((value) => typeof value !== 'boolean') : undefined),
    values: titleInfo?.values,
  }
}

/** 比较图例以时间戳读取主图当前位置的真实行情，涨幅沿用折线基准。 */
function collectComparisonRows(
  context: RenderContext,
  targetBar: KLineData | null,
  colors: ColorTokens,
): LegendComparisonRow[] {
  const comparisonSymbols = context.comparisonSymbols
  if (!comparisonSymbols?.length) return []
  return comparisonSymbols.map((spec) => projectComparisonRow(spec, context, targetBar, colors))
}

/** 单个比较品种：价格、比较基准涨幅与图例配色。 */
function projectComparisonRow(
  spec: NonNullable<RenderContext['comparisonSymbols']>[number],
  context: RenderContext,
  targetBar: KLineData | null,
  colors: ColorTokens,
): LegendComparisonRow {
  const identity = symbolSpecIdentityKey(spec)
  const data = context.comparisonData?.get(identity)
  const series = context.comparisonProjection?.series.find((item) => item.identity === identity)
  const cmpItem = data?.find((item) => item.timestamp === targetBar?.timestamp)
  const price =
    cmpItem && Number.isFinite(cmpItem.close) && cmpItem.close > 0 ? cmpItem.close : null
  const baseline = series?.baselineClose
  const percent =
    price !== null && baseline !== undefined && Number.isFinite(baseline) && baseline > 0
      ? ((price - baseline) / baseline) * 100
      : null
  return {
    identity,
    hidden: context.comparisonHidden?.get(identity) === true,
    symbol: spec.symbol,
    price,
    bar: cmpItem ?? null,
    ...(spec.instrument?.name ? { name: spec.instrument.name } : {}),
    percent,
    color: context.comparisonColors?.get(identity) ?? colors.palette.i2,
    percentColor: legendChangeColor(percent, colors),
  }
}
