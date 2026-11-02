/** 将统一图例上下文转换为 DOM 与外部模板共用的展示行。 */

import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type {
  LegendComparisonRow,
  LegendIndicatorRow,
  LegendLayout,
  LegendRow,
  LegendTemplateContext,
  LegendText,
} from '../types.js'
import { LEGEND_PARAM_GAP_PX } from './legendGeometry.js'
import { formatLegendChange, formatLegendPrice, formatLegendSigned } from './legendQuote.js'
import { createLegendRow, type LegendRowContent } from './legendRow.js'

/** 行可选元信息：指标/比较身份、隐藏态与加载态。 */
type LegendRowMeta = Pick<
  LegendRowContent,
  'indicator' | 'comparison' | 'hidden' | 'loading' | 'error'
>

type AddRow = (key: string, texts: LegendText[], meta?: LegendRowMeta) => void

/** 左上角统一展示主品种行情、指标数值与比较品种真实行情。 */
export function projectMainLegendRows(legend: LegendTemplateContext, paneTop: number): LegendRow[] {
  const { layout, colors } = legend
  const rows: LegendRow[] = []
  /** 用同一行号维护紧凑布局和指标的位置。 */
  const add: AddRow = (key, texts, meta = {}) => {
    rows.push(
      createLegendRow(
        {
          paneId: MAIN_PANE_ID,
          paneTop,
          paneWidth: layout.paneWidth,
          index: rows.length,
        },
        { key, texts, ...meta },
        { inset: layout.x, height: layout.lineHeight, gap: layout.gap },
      ),
    )
  }

  if (legend.timeshare) pushTimeshareRows(legend.timeshare, layout, colors, add)
  if (legend.currentBar) pushBarRows(legend.currentBar, layout, colors, add)
  for (const title of legend.indicators) {
    add(title.instanceId, projectIndicatorTexts(title, colors), {
      indicator: { instanceId: title.instanceId, definitionId: title.definitionId },
      hidden: title.hidden,
      loading: title.loading,
      error: title.error,
    })
  }
  for (const comparison of legend.comparisons) {
    if (!comparison.identity) continue
    add(`comparison:${comparison.identity}`, projectComparisonTexts(comparison, colors), {
      comparison: { identity: comparison.identity },
      hidden: comparison.hidden,
    })
  }
  return rows
}

/** 分时行情行：涨跌读数与 K 线共用格式；窄屏拆成两行，宽屏合并为一行。 */
function pushTimeshareRows(
  ts: NonNullable<LegendTemplateContext['timeshare']>,
  layout: LegendLayout,
  colors: LegendTemplateContext['colors'],
  add: AddRow,
): void {
  const price = [
    { text: `现价 ${formatLegendPrice(ts.price)}`, color: ts.change?.color ?? colors.textPrimary },
    { text: `均价 ${formatLegendPrice(ts.average)}`, color: colors.textPrimary },
  ]
  const change = ts.change ? formatLegendChange(ts.change) : []
  const volume = ts.volumeText
    ? [{ text: `成交量 ${ts.volumeText}`, color: colors.textPrimary }]
    : []
  const amount = ts.amountText
    ? [{ text: `成交额 ${ts.amountText}`, color: colors.textPrimary }]
    : []
  if (layout.compact) {
    add('timeshare-price', [...price, ...volume])
    add('timeshare-change', [...change, ...amount])
  } else add('timeshare', [...price, ...change, ...volume, ...amount])
}

/** K 线行情行：窄屏拆成 OHLC 与收盘两行，宽屏合并；涨跌额与涨跌幅紧跟收盘价。 */
function pushBarRows(
  bar: NonNullable<LegendTemplateContext['currentBar']>,
  layout: LegendLayout,
  colors: LegendTemplateContext['colors'],
  add: AddRow,
): void {
  const ohl = [
    { text: `O ${formatLegendPrice(bar.open)}`, color: bar.color },
    { text: `H ${formatLegendPrice(bar.high)}`, color: colors.textPrimary },
    { text: `L ${formatLegendPrice(bar.low)}`, color: colors.textPrimary },
  ]
  const change = bar.change ? formatLegendChange(bar.change) : []
  const close = [
    { text: `C ${formatLegendPrice(bar.close)}`, color: bar.color },
    ...change,
    ...(bar.volumeText ? [{ text: `Vol ${bar.volumeText}`, color: colors.textPrimary }] : []),
  ]
  if (layout.compact) {
    add('bar-ohl', ohl)
    add('bar-close', close)
  } else add('bar', [...ohl, ...close])
}

/** 比较品种：色点、品种名、现价与比较基准涨幅；缺失值显示 —。 */
function projectComparisonTexts(
  comparison: LegendComparisonRow,
  colors: LegendTemplateContext['colors'],
): LegendText[] {
  const name = comparison.name?.trim()
  return [
    { text: '●', color: comparison.color },
    {
      text: name && name !== comparison.symbol ? `${comparison.symbol} ${name}` : comparison.symbol,
      color: colors.textPrimary,
    },
    {
      text: comparison.price === null ? '现价 —' : `现价 ${formatLegendPrice(comparison.price)}`,
      color: comparison.color,
    },
    {
      text:
        comparison.percent === null ? '涨幅 —' : `涨幅 ${formatLegendSigned(comparison.percent)}%`,
      color: comparison.percentColor,
    },
  ]
}

/** 主副图指标共享名称、参数与数值格式。 */
export function projectIndicatorTexts(
  title: LegendIndicatorRow,
  colors: LegendTemplateContext['colors'],
): LegendText[] {
  return [
    { text: title.name, color: colors.textPrimary },
    ...(title.params?.length
      ? [
          {
            text: `(${title.params.join(',')})`,
            color: colors.textTertiary,
            gapBefore: LEGEND_PARAM_GAP_PX,
          },
        ]
      : []),
    ...(title.values?.map((item) => ({
      text: `${item.label} ${item.formattedValue ?? item.value.toFixed(3)}`,
      color: item.color,
    })) ?? []),
  ]
}
