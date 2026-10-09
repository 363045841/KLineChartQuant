/** 将统一图例上下文转换为 DOM 与外部模板共用的展示行。 */

import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type {
  LegendComparisonRow,
  LegendIndicatorRow,
  LegendRow,
  LegendTemplateContext,
  LegendText,
} from '../types.js'

/** 行可选元信息：指标/比较身份、隐藏态与加载态。 */
interface LegendRowMeta {
  indicator?: LegendRow['indicator']
  comparison?: LegendRow['comparison']
  hidden?: boolean
  loading?: boolean
}

type AddRow = (key: string, texts: LegendText[], meta?: LegendRowMeta) => void

/** 正数补 + 号，其余按两位小数展示。 */
function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

/** 左上角统一展示主品种行情、指标数值与比较品种真实行情。 */
export function projectMainLegendRows(legend: LegendTemplateContext, paneTop: number): LegendRow[] {
  const { layout, colors } = legend
  const rows: LegendRow[] = []
  /** 用同一行号维护紧凑布局和指标的位置。 */
  const add: AddRow = (key, texts, meta = {}) => {
    rows.push({
      key,
      paneId: MAIN_PANE_ID,
      x: layout.x,
      y: paneTop + layout.y + rows.length * layout.lineHeight,
      maxWidth: Math.max(0, layout.paneWidth - layout.x),
      height: layout.lineHeight,
      gap: layout.gap,
      texts,
      actions: [],
      ...meta,
    })
  }

  if (legend.timeshare) pushTimeshareRows(legend.timeshare, layout.compact, colors, add)
  if (legend.currentBar) pushBarRows(legend.currentBar, layout.compact, colors, add)
  for (const title of legend.indicators) {
    add(title.instanceId, projectIndicatorTexts(title, colors), {
      indicator: { instanceId: title.instanceId, definitionId: title.definitionId },
      hidden: title.hidden,
      loading: title.loading,
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

/** 分时行情行：窄屏拆成两行，宽屏合并为一行。 */
function pushTimeshareRows(
  ts: NonNullable<LegendTemplateContext['timeshare']>,
  compact: boolean,
  colors: LegendTemplateContext['colors'],
  add: AddRow,
): void {
  const price = [
    { text: `现价 ${ts.price.toFixed(2)}`, color: ts.changeColor },
    { text: `均价 ${ts.average.toFixed(2)}`, color: colors.textPrimary },
  ]
  const change = [
    { text: `涨跌 ${signed(ts.changeAmount)}`, color: ts.changeColor },
    { text: `涨幅 ${signed(ts.changePercent)}%`, color: ts.changeColor },
  ]
  const volume = ts.volumeText
    ? [{ text: `成交量 ${ts.volumeText}`, color: colors.textPrimary }]
    : []
  const amount = ts.amountText
    ? [{ text: `成交额 ${ts.amountText}`, color: colors.textPrimary }]
    : []
  if (compact) {
    add('timeshare-price', [...price, ...volume])
    add('timeshare-change', [...change, ...amount])
  } else add('timeshare', [...price, ...change, ...volume, ...amount])
}

/** K 线行情行：窄屏拆成 OHLC 与收盘两行，宽屏合并。 */
function pushBarRows(
  bar: NonNullable<LegendTemplateContext['currentBar']>,
  compact: boolean,
  colors: LegendTemplateContext['colors'],
  add: AddRow,
): void {
  const ohl = [
    { text: `O ${bar.open.toFixed(2)}`, color: bar.color },
    { text: `H ${bar.high.toFixed(2)}`, color: colors.textPrimary },
    { text: `L ${bar.low.toFixed(2)}`, color: colors.textPrimary },
  ]
  const close = [
    { text: `C ${bar.close.toFixed(2)}`, color: bar.color },
    ...(bar.volumeText ? [{ text: `Vol ${bar.volumeText}`, color: colors.textPrimary }] : []),
  ]
  if (compact) {
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
      text: comparison.price === null ? '现价 —' : `现价 ${comparison.price.toFixed(2)}`,
      color: comparison.color,
    },
    {
      text: comparison.percent === null ? '涨幅 —' : `涨幅 ${signed(comparison.percent)}%`,
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
      ? [{ text: `(${title.params.join(',')})`, color: colors.textTertiary, gapBefore: 4 }]
      : []),
    ...(title.values?.map((item) => ({
      text: `${item.label} ${item.formattedValue ?? item.value.toFixed(3)}`,
      color: item.color,
    })) ?? []),
  ]
}
