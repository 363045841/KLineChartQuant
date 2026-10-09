/**
 * 构建主图图例的模板上下文：把帧数据投影为行情、指标与对比展示行。
 */

import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '@/engine/indicators/indicatorMetadata.js'
import {
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  type IndicatorInstanceCatalog,
  type IndicatorInstanceDescriptor,
} from '@/engine/indicators/instances/api/indicatorRenderBinding.js'
import type { PluginHost, RenderContext } from '@/foundation/plugin/index.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ChartDataViewId, isTimeShareDataView } from '@/foundation/types/chartView.js'
import { isKLineDataArray, isTimeShareDataArray, type KLineData } from '@/foundation/types/price.js'
import type {
  LegendComparisonRow,
  LegendIndicatorRow,
  LegendLayout,
  LegendTemplateContext,
  LegendTimeshareRow,
} from '../types.js'
import { resolveLegendValueIndex } from './resolveLegendValueIndex.js'

const LINE_HEIGHT = 24
const LEGEND_X = 12
const LEGEND_GAP = 10
const LEGEND_Y_OFFSET = 6
/** 窄于该宽度时行情行拆成两行，避免与指标挤在同一行。 */
const COMPACT_PANE_WIDTH = 400

/** 构建图例上下文的输入：一帧渲染上下文 + 可选的主图指标可见过滤。 */
export interface ProjectLegendContextInput {
  context: RenderContext
  host: PluginHost | null
  yPaddingPx: number
  /** 由视图状态投影的可见主图指标；null 表示不过滤。 */
  visibleIndicatorIds?: ReadonlySet<string> | null
}

/** 成交量/成交额按中文 “万/亿” 缩写，保留两位小数。 */
function formatLegendQuantity(value: number): string {
  if (value >= 1e8) return (value / 1e8).toFixed(2) + '亿'
  if (value >= 1e4) return (value / 1e4).toFixed(2) + '万'
  return value.toFixed(2)
}

/** 前收价只在为正的有限数时参与分时涨跌计算。 */
function resolvePreClose(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** 涨跌颜色：正为涨色、负为跌色，其余用正文色。 */
function signedColor(value: number | null, colors: ColorTokens): string {
  if (value === null || value === 0) return colors.text.primary
  return value > 0 ? colors.candleUpBody : colors.candleDownBody
}

export function projectLegendContext(
  input: ProjectLegendContextInput,
): LegendTemplateContext | null {
  const { context, host, yPaddingPx, visibleIndicatorIds } = input
  if (!context.data.length) return null

  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const targetIndex = resolveLegendValueIndex(context.crosshairIndex, context.data.length)
  const layout: LegendLayout = {
    x: LEGEND_X,
    y: yPaddingPx / 2 + LEGEND_Y_OFFSET,
    lineHeight: LINE_HEIGHT,
    gap: LEGEND_GAP,
    paneWidth: context.paneWidth,
    compact: context.paneWidth < COMPACT_PANE_WIDTH,
  }

  const klineData = isKLineDataArray(context.data) ? context.data : []
  const bar = klineData[targetIndex] ?? null

  return {
    rows: [],
    period: context.period,
    index: targetIndex,
    hasCrosshair: typeof context.crosshairIndex === 'number',
    layout,
    colors: {
      textPrimary: colors.text.primary,
      textTertiary: colors.text.tertiary,
      up: colors.candleUpBody,
      down: colors.candleDownBody,
    },
    currentBar: projectCurrentBar(context, klineData, targetIndex, colors),
    timeshare: projectTimeshareRow(context, targetIndex, colors),
    indicators: collectIndicatorRows(
      host,
      context,
      klineData,
      targetIndex,
      colors,
      visibleIndicatorIds,
    ),
    comparisons: collectComparisonRows(context, bar, colors),
    bar,
  }
}

/** 分时行情行：按前收计算涨跌，缺失前收时整行不展示。 */
function projectTimeshareRow(
  context: RenderContext,
  targetIndex: number,
  colors: ColorTokens,
): LegendTimeshareRow | null {
  if (!isTimeShareDataView(context.dataView)) return null
  const item = isTimeShareDataArray(context.data) ? context.data[targetIndex] : undefined
  const preClose = resolvePreClose(context.settings?.preClose)
  if (!item || preClose === null) return null

  const changeAmount = item.price - preClose
  const volume =
    typeof item.volume === 'number' && Number.isFinite(item.volume) ? item.volume : null
  const amount =
    typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null
  return {
    price: item.price,
    average: item.average,
    changeAmount,
    changePercent: (changeAmount / preClose) * 100,
    volume,
    volumeText: volume === null ? null : `${formatLegendQuantity(volume)}手`,
    amount,
    amountText: amount === null ? null : formatLegendQuantity(amount),
    changeColor: changeAmount >= 0 ? colors.candleUpBody : colors.candleDownBody,
  }
}

/** K 线当前柱：OHLC 与成交量文本，进入/离开画布不推动指标行位置。 */
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
  }
}

function collectIndicatorRows(
  host: PluginHost | null,
  context: RenderContext,
  klineData: KLineData[],
  targetIndex: number,
  colors: ColorTokens,
  visibleIndicatorIds: ReadonlySet<string> | null | undefined,
): LegendIndicatorRow[] {
  const stateReader = context.indicatorStateReader
  if (!host || !stateReader) return []
  const catalog = host.getService<IndicatorInstanceCatalog>(INDICATOR_INSTANCE_CATALOG_SERVICE)
  if (!catalog) return []

  const rows: LegendIndicatorRow[] = []
  for (const instance of catalog.listMainInstances()) {
    if (visibleIndicatorIds != null && !visibleIndicatorIds.has(instance.definitionId)) continue
    const row = projectIndicator(
      instance,
      stateReader,
      context.indicatorAvailability,
      klineData,
      targetIndex,
      colors,
    )
    if (row) rows.push(row)
  }
  return rows
}

/** 主副图指标从同一实例目录及帧读取器生成标题；加载时保留占位。 */
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
  const loading = availability?.isLoading(instance.instanceId) === true
  const params: Record<string, number | boolean | string> = {}
  for (const [key, value] of Object.entries(instance.params)) {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
      params[key] = value
  }
  const titleInfo: TitleInfo | null =
    meta.getTitleInfo && stateReader
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
  if (!titleInfo && !loading && instance.paneId === 'main') return null
  return {
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    hidden: instance.hidden,
    loading,
    name: titleInfo?.name ?? meta.displayName,
    params: titleInfo?.params,
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
    percentColor: signedColor(percent, colors),
  }
}
