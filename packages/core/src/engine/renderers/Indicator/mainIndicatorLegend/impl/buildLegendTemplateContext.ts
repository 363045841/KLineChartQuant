/**
 * 构建主图图例的模板上下文：把帧数据投影为行情、指标与对比展示行。
 */

import { symbolSpecIdentityKey } from '@/engine/data/symbolIdentity.js'
import { getRegisteredIndicatorDefinition } from '@/engine/indicators/indicatorDefinitionRegistry.js'
import type { TitleInfo } from '@/engine/indicators/indicatorMetadata.js'
import {
  INDICATOR_INSTANCE_CATALOG_SERVICE,
  type IndicatorInstanceCatalog,
} from '@/engine/indicators/instances/api/indicatorRenderBinding.js'
import { resolveLegendValueIndex } from '@/engine/renderers/legend/impl/resolveLegendValueIndex.js'
import type { PluginHost, RenderContext } from '@/foundation/plugin/index.js'
import { resolveThemeColors } from '@/foundation/tokens/index.js'
import { ChartDataViewId, isTimeShareDataView } from '@/foundation/types/chartView.js'
import type { KLineData, TimeShareData } from '@/foundation/types/price.js'
import type {
  LegendComparisonRow,
  LegendIndicatorRow,
  LegendLayout,
  LegendTemplateContext,
  LegendTimeshareRow,
} from '../types.js'

/** 构建图例上下文的输入：一帧渲染上下文 + 可选的主图指标可见过滤。 */
export interface BuildLegendTemplateContextInput {
  context: RenderContext
  host: PluginHost | null
  yPaddingPx: number
  /** 由视图状态投影的可见主图指标；null 表示兼容独立图例实例。 */
  visibleIndicatorIds?: ReadonlySet<string> | null
}

/** 成交量按中文 “万/亿” 缩写，保留两位小数。 */
export function formatVolumeShort(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

/** 成交额按中文 “万/亿” 缩写，保留两位小数。 */
export function formatAmountShort(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

export function buildLegendTemplateContext(
  input: BuildLegendTemplateContextInput,
): LegendTemplateContext | null {
  const { context, host, yPaddingPx, visibleIndicatorIds } = input
  const klineData = context.data as KLineData[]
  if (!klineData.length) return null

  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const lineHeight = 24
  const legendX = 12
  const gap = 10
  const legendYOffset = 6
  const compact = context.paneWidth < 400
  const crosshairIndex = context.crosshairIndex
  const hasCrosshair = typeof crosshairIndex === 'number'
  const targetIndex = resolveLegendValueIndex(crosshairIndex, klineData.length)

  const layout: LegendLayout = {
    x: legendX,
    y: yPaddingPx / 2 + legendYOffset,
    lineHeight,
    gap,
    paneWidth: context.paneWidth,
    compact,
  }

  let timeshare: LegendTimeshareRow | null = null
  if (isTimeShareDataView(context.dataView)) {
    const tsData = context.data as TimeShareData[]
    const rawPreClose = context.settings?.preClose as number | undefined
    const preClose =
      typeof rawPreClose === 'number' && Number.isFinite(rawPreClose) && rawPreClose > 0
        ? rawPreClose
        : null
    const item = tsData[targetIndex]
    if (item && preClose !== null) {
      const changeAmount = item.price - preClose
      const changePercent = (changeAmount / preClose) * 100
      const volume =
        typeof item.volume === 'number' && Number.isFinite(item.volume) ? item.volume : null
      const amount =
        typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount : null
      timeshare = {
        price: item.price,
        average: item.average,
        changeAmount,
        changePercent,
        volume,
        volumeText: volume === null ? null : `${formatVolumeShort(volume)}手`,
        amount,
        amountText: amount === null ? null : formatAmountShort(amount),
        changeColor: changeAmount >= 0 ? colors.candleUpBody : colors.candleDownBody,
      }
    }
  }

  let currentBar: LegendTemplateContext['currentBar'] = null
  // OHLC 行始终占据同一位置，进入/离开画布不再推动指标 Legend，保证 DOM hover 稳定。
  if (context.dataView === ChartDataViewId.KLine) {
    const k = klineData[targetIndex]
    if (k && typeof k.close === 'number') {
      const isUp = k.close >= k.open
      currentBar = {
        ...k,
        volume: typeof k.volume === 'number' ? k.volume : null,
        volumeText: typeof k.volume === 'number' ? formatVolumeShort(k.volume) : null,
        color: isUp ? colors.candleUpBody : colors.candleDownBody,
      }
    }
  }

  const indicators = collectIndicatorRows(
    host,
    context.indicatorStateReader,
    context.indicatorAvailability,
    klineData,
    targetIndex,
    colors,
    visibleIndicatorIds,
  )
  const comparisons = collectComparisonRows(context, klineData, targetIndex, colors)

  return {
    period: context.period,
    index: targetIndex,
    hasCrosshair,
    layout,
    colors: {
      textPrimary: colors.text.primary,
      textTertiary: colors.text.tertiary,
      up: colors.candleUpBody,
      down: colors.candleDownBody,
    },
    currentBar,
    timeshare,
    indicators,
    comparisons,
    bar: klineData[targetIndex] ?? null,
  }
}

function collectIndicatorRows(
  host: PluginHost | null,
  stateReader: RenderContext['indicatorStateReader'],
  availability: RenderContext['indicatorAvailability'],
  klineData: KLineData[],
  targetIndex: number,
  colors: ReturnType<typeof resolveThemeColors>,
  visibleIndicatorIds: ReadonlySet<string> | null | undefined,
): LegendIndicatorRow[] {
  if (!host || !stateReader || typeof host.getService !== 'function') return []
  const catalog = host.getService<IndicatorInstanceCatalog>(INDICATOR_INSTANCE_CATALOG_SERVICE)
  if (!catalog) return []

  const rows: LegendIndicatorRow[] = []
  for (const instance of catalog.listMainInstances()) {
    if (visibleIndicatorIds != null && !visibleIndicatorIds.has(instance.definitionId)) continue
    const meta = getRegisteredIndicatorDefinition(instance.definitionId)
    if (!meta) continue
    const loading = availability?.isLoading(instance.instanceId) === true
    // 加载中的实例即使暂无标题投影也要占位，否则加载圈无处可挂。
    const titleInfo: TitleInfo | null = meta.getTitleInfo
      ? meta.getTitleInfo(
          klineData,
          targetIndex,
          instance.params as Record<string, number | boolean | string>,
          stateReader,
          instance.instanceId,
          instance.paneId,
          colors,
        )
      : null
    if (!titleInfo && !loading) continue
    rows.push({
      instanceId: instance.instanceId,
      definitionId: instance.definitionId,
      hidden: instance.hidden,
      loading,
      name: titleInfo?.name ?? meta.displayName,
      params: titleInfo?.params,
      values: titleInfo?.values,
    })
  }
  return rows
}

/** 比较图例使用折线投影的自身起点，以时间戳读取主图当前位置的真实价格。 */
function collectComparisonRows(
  context: RenderContext,
  klineData: KLineData[],
  targetIndex: number,
  colors: ReturnType<typeof resolveThemeColors>,
): LegendComparisonRow[] {
  const comparisonSymbols = context.comparisonSymbols
  const projection = context.comparisonProjection
  const targetBar = klineData[targetIndex]
  if (!comparisonSymbols?.length) return []
  const comparisonData = context.comparisonData

  const rows: LegendComparisonRow[] = []
  const comparisonColors = context.comparisonColors

  for (const spec of comparisonSymbols) {
    const identity = symbolSpecIdentityKey(spec)
    const data = comparisonData?.get(identity)
    const series = projection?.series.find((item) => item.identity === identity)
    const cmpItem = data?.find((item) => item.timestamp === targetBar?.timestamp)
    const percent =
      series && cmpItem && Number.isFinite(cmpItem.close) && cmpItem.close > 0
        ? ((cmpItem.close - series.baselineClose) / series.baselineClose) * 100
        : 0
    const color = comparisonColors?.get(identity) ?? colors.palette.i2
    rows.push({
      identity,
      hidden: context.comparisonHidden?.get(identity) === true,
      symbol: spec.symbol,
      ...(spec.instrument?.name ? { name: spec.instrument.name } : {}),
      percent,
      color,
      percentColor:
        percent > 0
          ? colors.candleUpBody
          : percent < 0
            ? colors.candleDownBody
            : colors.text.primary,
    })
  }
  return rows
}
