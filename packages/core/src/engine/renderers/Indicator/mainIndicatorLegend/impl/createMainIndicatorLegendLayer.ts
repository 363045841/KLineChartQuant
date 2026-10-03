/** 构建主图 DOM Legend 行，Canvas 不再绘制标题文本。 */

import { MAIN_PANE_ID } from '@/engine/paneIds.js'
import type { LegendRow, LegendText } from '@/engine/renderers/legend/types.js'
import type { PluginHost, RenderContext } from '@/foundation/plugin/index.js'
import { RENDERER_PRIORITY } from '@/foundation/plugin/index.js'
import type { Layer } from '@/rendering/scene/types.js'
import { createIndicatorRendererLayer } from '../../shared/indicatorRendererLayer.js'
import type { LegendTemplateContext, MainIndicatorLegendOptions } from '../types.js'
import { buildLegendTemplateContext } from './buildLegendTemplateContext.js'

/** 构建数据并交给独立 DOM renderer。 */
export function createMainIndicatorLegendLayer(
  options: MainIndicatorLegendOptions,
  getPluginHost: () => PluginHost | null,
): Layer<RenderContext> {
  return createIndicatorRendererLayer({
    name: 'mainIndicatorLegend',
    paneId: MAIN_PANE_ID,
    role: 'overlay',
    z: RENDERER_PRIORITY.FOREGROUND,
    draw(context) {
      const config = options.getLegendOptions?.()
      const viewIds = options.getVisibleIndicatorIds?.()
      // 用户筛选与当前视图的可见指标取交集；两者同为规范 ID（displayName）。
      const configuredIds = config?.visibleIndicatorIds
      const visibleIds = configuredIds
        ? configuredIds.filter((id) => !viewIds || viewIds.includes(id))
        : viewIds
      const legend = buildLegendTemplateContext({
        context,
        host: getPluginHost(),
        yPaddingPx: options.yPaddingPx,
        visibleIndicatorIds: visibleIds ? new Set(visibleIds) : null,
      })
      options.onContext?.(legend)
      // 是否收起由 DOM renderer 自行切换显示，渲染层只发布完整行。
      context.publishLegendRows?.(
        MAIN_PANE_ID,
        config?.visible !== false && legend ? buildMainLegendRows(legend, context.pane.top) : [],
      )
    },
  })
}

/** 将主图行情、指标及叠加商品转换为按行展示的 DOM 文本。 */
export function buildMainLegendRows(legend: LegendTemplateContext, paneTop: number): LegendRow[] {
  const rows: LegendRow[] = []
  const { layout, colors } = legend
  /** 用同一行号维护紧凑布局和指标的位置。 */
  function add(
    key: string,
    texts: LegendText[],
    indicator?: LegendRow['indicator'],
    hidden?: boolean,
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
      indicator,
      hidden,
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
      [
        { text: title.name, color: colors.textPrimary },
        ...(title.params?.length
          ? [{ text: `(${title.params.join(',')})`, color: colors.textTertiary, gapBefore: 4 }]
          : []),
        ...(title.values?.map((item) => ({
          text: `${item.label} ${item.formattedValue ?? item.value.toFixed(3)}`,
          color: item.color,
        })) ?? []),
      ],
      { instanceId: title.instanceId, definitionId: title.definitionId },
      title.hidden,
    )
  }
  for (const comparison of legend.comparisons) {
    const name = comparison.name?.trim()
    add(`comparison:${comparison.symbol}`, [
      { text: '●', color: comparison.color },
      {
        text:
          name && name !== comparison.symbol ? `${comparison.symbol} ${name}` : comparison.symbol,
        color: colors.textPrimary,
      },
      {
        text: `${comparison.percent > 0 ? '+' : ''}${comparison.percent.toFixed(2)}%`,
        color: comparison.percentColor,
      },
    ])
  }
  return rows
}
