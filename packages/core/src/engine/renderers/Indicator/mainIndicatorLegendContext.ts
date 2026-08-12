import type { PluginHost, RenderContext } from '../../../foundation/plugin/index'
import { resolveThemeColors } from '../../../foundation/tokens/index'
import type { KLineData, TimeShareData } from '../../../foundation/types/price'
import { symbolSpecIdentityKey } from '../../data/symbolIdentity'
import type { TitleInfo, TitleValueItem } from '../../indicators/indicatorMetadata'
import type { IndicatorScheduler } from '../../indicators/scheduler'

/** 图例渲染模式：canvas 默认绘制；external 仅发布上下文，不画 Canvas 文字 */
export type LegendRenderMode = 'canvas' | 'external'

export interface LegendLayout {
  x: number
  y: number
  lineHeight: number
  gap: number
  paneWidth: number
  compact: boolean
}

/** 当前 K 线及图例派生的展示字段，保留 KLineData 自定义属性。 */
export type LegendCurrentBar = Omit<KLineData, 'volume'> & {
  volume: number | null
  // 成交量+单位格式化文本(eg. 1.23亿)
  volumeText: string | null
  color: string
}

export interface LegendTimeshareRow {
  price: number
  average: number
  changeAmount: number
  changePercent: number
  volume: number | null
  /** 带手数单位的成交量文本。 */
  volumeText: string | null
  amount: number | null
  amountText: string | null
  changeColor: string
}

export interface LegendIndicatorRow {
  name: string
  params?: number[]
  values?: TitleValueItem[]
}

export interface LegendComparisonRow {
  symbol: string
  percent: number
  color: string
  percentColor: string
}

/**
 * 主图左上角图例完整上下文。
 * Canvas 绘制与 Vue legend slot 共用同一份数据。
 */
export interface LegendTemplateContext {
  period: string
  index: number
  hasCrosshair: boolean
  layout: LegendLayout
  colors: {
    textPrimary: string
    textTertiary: string
    up: string
    down: string
  }
  /** 十字线指向的当前 K 线展示行（含 volumeText / color 与自定义字段） */
  currentBar: LegendCurrentBar | null
  timeshare: LegendTimeshareRow | null
  indicators: ReadonlyArray<LegendIndicatorRow>
  comparisons: ReadonlyArray<LegendComparisonRow>
  /** 当前索引处的原始 K 线（分时模式下可能无 close） */
  bar: KLineData | TimeShareData | null
}

export interface BuildLegendTemplateContextInput {
  context: RenderContext
  host: PluginHost | null
  yPaddingPx: number
}

export function formatVolumeShort(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

export function formatAmountShort(v: number): string {
  if (v >= 1e8) return (v / 1e8).toFixed(2) + '亿'
  if (v >= 1e4) return (v / 1e4).toFixed(2) + '万'
  return v.toFixed(2)
}

export function buildLegendTemplateContext(
  input: BuildLegendTemplateContextInput,
): LegendTemplateContext | null {
  const { context, host, yPaddingPx } = input
  const klineData = context.data as KLineData[]
  if (!klineData.length) return null

  const colors = resolveThemeColors(
    context.theme,
    context.isAsiaMarket,
    context.colorPresetSettings,
  )
  const fontSize = 12
  const lineHeight = fontSize + 6
  const legendX = 12
  const gap = 10
  const legendYOffset = 6
  const compact = context.paneWidth < 400
  const range = context.range
  const crosshairIndex = context.crosshairIndex
  const hasCrosshair = typeof crosshairIndex === 'number'
  const targetIndex = hasCrosshair ? crosshairIndex : Math.min(range.end - 1, klineData.length - 1)

  const layout: LegendLayout = {
    x: legendX,
    y: yPaddingPx / 2 + legendYOffset,
    lineHeight,
    gap,
    paneWidth: context.paneWidth,
    compact,
  }

  let timeshare: LegendTimeshareRow | null = null
  if (context.period === 'timeshare') {
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

  let currentBar: LegendCurrentBar | null = null
  if (hasCrosshair) {
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

  const indicators = collectIndicatorRows(host, klineData, targetIndex, colors)
  const comparisons = collectComparisonRows(context, klineData, targetIndex, range, colors)

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
  klineData: KLineData[],
  targetIndex: number,
  colors: ReturnType<typeof resolveThemeColors>,
): LegendIndicatorRow[] {
  if (!host || typeof host.getService !== 'function') return []
  const scheduler = host.getService<IndicatorScheduler>('indicatorScheduler')
  if (!scheduler) return []

  const rows: LegendIndicatorRow[] = []
  for (const meta of scheduler.getMainIndicators()) {
    if (!meta.getTitleInfo) continue
    if (!scheduler.isMainIndicatorActive(meta.name)) continue
    const params = scheduler.getMainIndicatorParams(meta.name) ?? {}
    const titleInfo: TitleInfo | null = meta.getTitleInfo(
      klineData,
      targetIndex,
      params as Record<string, number | boolean | string>,
      host,
      'main',
      colors,
    )
    if (!titleInfo) continue
    rows.push({
      name: titleInfo.name,
      params: titleInfo.params,
      values: titleInfo.values,
    })
  }
  return rows
}

function collectComparisonRows(
  context: RenderContext,
  klineData: KLineData[],
  targetIndex: number,
  range: { start: number; end: number },
  colors: ReturnType<typeof resolveThemeColors>,
): LegendComparisonRow[] {
  const comparisonSymbols = context.comparisonSymbols
  if (!comparisonSymbols?.length) return []

  const baseIndex = Math.max(0, range.start)
  const baseItem = klineData[baseIndex]
  if (!baseItem || !Number.isFinite(baseItem.close) || baseItem.close <= 0) return []

  const rows: LegendComparisonRow[] = []

  // 比较视图：主品种作为首行（色块颜色与主商品折线一致）
  const mainItem = klineData[targetIndex]
  if (mainItem && Number.isFinite(mainItem.close)) {
    const percent = ((mainItem.close - baseItem.close) / baseItem.close) * 100
    rows.push({
      symbol: context.primarySymbol ?? mainItem.symbol ?? '',
      percent,
      color: colors.palette.i1,
      percentColor:
        percent > 0
          ? colors.candleUpBody
          : percent < 0
            ? colors.candleDownBody
            : colors.text.primary,
    })
  }

  const comparisonData = context.comparisonData
  if (!comparisonData?.size) return rows

  const comparisonColors = context.comparisonColors
  const baseDate = baseItem.date ?? ''

  for (const spec of comparisonSymbols) {
    const identity = symbolSpecIdentityKey(spec)
    const data = comparisonData.get(identity)
    if (!data?.length) continue

    const baseline = baseDate
      ? findBaselineByDate(data, baseDate)
      : findBaselineByTimestamp(data, baseItem.timestamp)
    if (!baseline || baseline.close <= 0) continue

    const byDate = new Map<string, KLineData>()
    for (const item of data) {
      byDate.set(item.date ?? String(item.timestamp), item)
    }

    const key = mainItem?.date ?? String(mainItem?.timestamp ?? '')
    const cmpItem = byDate.get(key)
    if (!cmpItem || !Number.isFinite(cmpItem.close)) continue

    const percent = ((cmpItem.close - baseline.close) / baseline.close) * 100
    const color = comparisonColors?.get(identity) ?? colors.palette.i2
    rows.push({
      symbol: spec.symbol,
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

function findBaselineByDate(data: ReadonlyArray<KLineData>, date: string): KLineData | null {
  for (const item of data) {
    if (item.date && item.date >= date) return item
  }
  return null
}

function findBaselineByTimestamp(
  data: ReadonlyArray<KLineData>,
  timestamp: number,
): KLineData | null {
  for (const item of data) {
    if (item.timestamp >= timestamp) return item
  }
  return null
}
