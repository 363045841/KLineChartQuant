/** 将统一图例上下文转换为 DOM 与外部模板共用的展示行。 */

import { MAIN_PANE_ID } from '@/engine/pane/types.js'
import type { LegendIndicatorRow, LegendRow, LegendTemplateContext, LegendText } from '../types.js'

/** 左上角统一展示主品种行情、指标数值与比较品种真实行情。 */
export function projectMainLegendRows(legend: LegendTemplateContext, paneTop: number): LegendRow[] {
  const rows: LegendRow[] = []
  const { layout, colors } = legend
  /** 用同一行号维护紧凑布局和指标的位置。 */
  function add(
    key: string,
    texts: LegendText[],
    indicator?: LegendRow['indicator'],
    hidden?: boolean,
    comparison?: LegendRow['comparison'],
    loading?: boolean,
  ): void {
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
      indicator,
      hidden,
      comparison,
      loading,
    })
  }
  const ts = legend.timeshare
  if (ts) {
    const price = [
      { text: `现价 ${ts.price.toFixed(2)}`, color: ts.changeColor },
      { text: `均价 ${ts.average.toFixed(2)}`, color: colors.textPrimary },
    ]
    const change = [
      {
        text: `涨跌 ${ts.changeAmount > 0 ? '+' : ''}${ts.changeAmount.toFixed(2)}`,
        color: ts.changeColor,
      },
      {
        text: `涨幅 ${ts.changePercent > 0 ? '+' : ''}${ts.changePercent.toFixed(2)}%`,
        color: ts.changeColor,
      },
    ]
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
  const bar = legend.currentBar
  if (bar) {
    const ohl = [
      { text: `O ${bar.open.toFixed(2)}`, color: bar.color },
      { text: `H ${bar.high.toFixed(2)}`, color: colors.textPrimary },
      { text: `L ${bar.low.toFixed(2)}`, color: colors.textPrimary },
    ]
    const close = [
      { text: `C ${bar.close.toFixed(2)}`, color: bar.color },
      ...(bar.volumeText ? [{ text: `Vol ${bar.volumeText}`, color: colors.textPrimary }] : []),
    ]
    if (layout.compact) {
      add('bar-ohl', ohl)
      add('bar-close', close)
    } else add('bar', [...ohl, ...close])
  }
  for (const title of legend.indicators) {
    add(
      title.instanceId,
      projectIndicatorTexts(title, colors),
      { instanceId: title.instanceId, definitionId: title.definitionId },
      title.hidden,
      undefined,
      title.loading,
    )
  }
  for (const comparison of legend.comparisons) {
    if (!comparison.identity) continue
    const name = comparison.name?.trim()
    add(
      `comparison:${comparison.identity}`,
      [
        { text: '●', color: comparison.color },
        {
          text:
            name && name !== comparison.symbol ? `${comparison.symbol} ${name}` : comparison.symbol,
          color: colors.textPrimary,
        },
        {
          text: comparison.price === null ? '现价 —' : `现价 ${comparison.price.toFixed(2)}`,
          color: comparison.color,
        },
        {
          text:
            comparison.percent === null
              ? '涨幅 —'
              : `涨幅 ${comparison.percent > 0 ? '+' : ''}${comparison.percent.toFixed(2)}%`,
          color: comparison.percentColor,
        },
      ],
      undefined,
      comparison.hidden,
      { identity: comparison.identity },
    )
  }
  return rows
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
