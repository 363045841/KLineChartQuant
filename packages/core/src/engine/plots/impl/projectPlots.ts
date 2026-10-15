/** 把计算器的数值序列投影为 Plot；统一处理显隐、位移、颜色和可见范围。 */

import {
  createFill,
  createPlot,
  isPricePlot,
  PlotKind,
  validatePlotFills,
} from '@363045841yyt/klinechart-plot-contracts'
import type { VisibleRange } from '@/engine/viewport/viewport.js'
import type { ColorTokens } from '@/foundation/tokens/index.js'
import type {
  IndicatorPlotDefinition,
  Plot,
  PlotFill,
  PlotPoint,
  PlotRenderState,
  PlotSpec,
} from '../types.js'
import { isPlotCollection } from './readPlotState.js'

/** 读取计算结果的具名字段，不猜测或转换数值。 */
export function readPlotField(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined
  return Reflect.get(value, key)
}

/** 从声明指定的数组中取绘图数据。 */
function sourceArray(
  raw: unknown,
  spec: PlotSpec,
  params: Readonly<Record<string, unknown>>,
): readonly unknown[] {
  let source = spec.seriesKey ? readPlotField(raw, spec.seriesKey) : raw
  if (spec.periodParam) {
    const period = params[spec.periodParam]
    if (typeof period !== 'number') throw new TypeError(`Missing Plot period: ${spec.periodParam}`)
    source = readPlotField(source, String(period))
  }
  if (!Array.isArray(source)) throw new TypeError(`Plot ${spec.id} requires an array`)
  return source
}

/** 投影一个指标实例，计算数据保留在结果池，绘图端只消费 Plot。 */
export function projectPlots(
  definition: IndicatorPlotDefinition,
  raw: unknown,
  params: Readonly<Record<string, unknown>>,
  range: VisibleRange,
  timestamp: number,
  colors: ColorTokens,
): PlotRenderState {
  const collection = definition.source === 'collection'
  const { plots, fills } = collection
    ? readCollectionPlots(raw)
    : buildSeriesPlots(definition, raw, params, colors)
  // 生产端与投影端各校验一次填充边界，绘制端不再重复。
  validatePlotFills(plots, fills)
  return {
    kind: 'plots',
    timestamp,
    params,
    plots,
    fills,
    ...plotRange(definition, plots, fills, range),
    guides: collection
      ? []
      : (definition.guides ?? []).map((guide) => ({
          value: guide.value,
          color: guide.color(colors),
          dash: guide.dash ?? [4, 4],
        })),
  }
}

/** 读取脚本产出的完整 PlotCollection，外来的结构与填充引用在此收口。 */
function readCollectionPlots(raw: unknown): { plots: readonly Plot[]; fills: readonly PlotFill[] } {
  if (!isPlotCollection(raw)) throw new TypeError('Expected PlotCollection')
  return { plots: raw.plots, fills: raw.fills }
}

/** 从计算结果的数组字段构建 Plot 与填充；样式与填充默认值统一由契约补齐。 */
function buildSeriesPlots(
  definition: IndicatorPlotDefinition,
  raw: unknown,
  params: Readonly<Record<string, unknown>>,
  colors: ColorTokens,
): { plots: Plot[]; fills: PlotFill[] } {
  const plots = definition.series.map((spec) => {
    const source = sourceArray(raw, spec, params)
    let previous: number | undefined
    const data: (PlotPoint | undefined)[] = source.map((item) => {
      const value = spec.field ? readPlotField(item, spec.field) : item
      if (value === undefined || value === null) return undefined
      // 布尔条件只表达有无信号；false 与 NaN 同为 na，不再退化成 0。
      const numeric =
        (spec.kind === 'shape' || spec.kind === 'char') && typeof value === 'boolean'
          ? toNa(value)
          : value
      if (typeof numeric !== 'number')
        throw new TypeError(`Plot ${spec.id} requires numeric values`)
      const color = spec.pointColor?.(numeric, previous, colors, item)
      previous = numeric
      return { value: numeric, color }
    })
    const base = {
      id: spec.id,
      label: typeof spec.label === 'function' ? spec.label(params) : (spec.label ?? spec.id),
      data,
      color: spec.color(colors),
      visible: !spec.show || params[spec.show] !== false,
      offset: spec.offset?.(params) ?? 0,
    }
    switch (spec.kind ?? PlotKind.Line) {
      case 'line':
        return createPlot({ ...base, kind: 'line', width: spec.width, dash: spec.dash }, data)
      case 'histogram':
        return createPlot({ ...base, kind: 'histogram', baseline: spec.baseline }, data)
      case 'points':
        return createPlot({ ...base, kind: 'points', radius: spec.radius }, data)
      case 'char':
        return createPlot(
          {
            ...base,
            kind: 'char',
            char: spec.char,
            location: spec.location,
            size: spec.size,
            text: spec.text,
            textColor: spec.textColor,
          },
          data,
        )
      case 'arrow':
        return createPlot(
          {
            ...base,
            kind: 'arrow',
            colorUp: spec.colorUp,
            colorDown: spec.colorDown,
            minHeight: spec.minHeight,
            maxHeight: spec.maxHeight,
          },
          data,
        )
      case 'shape':
        return createPlot(
          {
            ...base,
            kind: 'shape',
            style: spec.style,
            location: spec.location,
            size: spec.size,
            text: spec.text,
            textColor: spec.textColor,
          },
          data,
        )
    }
  })
  const fills = (definition.fills ?? []).map((fill) =>
    createFill({
      id: fill.id,
      from: fill.from,
      to: fill.to,
      visible: !fill.show || params[fill.show] !== false,
      color: fill.color(colors),
      reverseColor: fill.reverseColor(colors),
      opacity: fill.opacity,
    }),
  )
  return { plots, fills }
}

/** 布尔条件在数值列里只留下 1 或 na；相对定位的 Shape 用位置而非值。 */
function toNa(condition: boolean): number {
  return condition ? 1 : Number.NaN
}

/** 仅重算可见范围，不重新分配全量绘图点。 */
export function updatePlotRange(
  state: PlotRenderState,
  definition: IndicatorPlotDefinition,
  range: VisibleRange,
  timestamp: number,
): PlotRenderState {
  return { ...state, timestamp, ...plotRange(definition, state.plots, state.fills, range) }
}

/** 固定上下界模式；undefined 与 'fixed' 都表示直接替换。 */
type RangeBoundMode = NonNullable<IndicatorPlotDefinition['range']>['mode']

/**
 * 应用声明边界：include 向外扩展，clamp 向内收紧，其余（fixed / 缺省）直接替换。
 * `side` 决定取 min 还是 max 语义。
 */
function applyRangeBound(
  value: number,
  bound: number,
  mode: RangeBoundMode,
  side: 'min' | 'max',
): number {
  if (mode === 'include') return side === 'min' ? Math.min(value, bound) : Math.max(value, bound)
  if (mode === 'clamp') return side === 'min' ? Math.max(value, bound) : Math.min(value, bound)
  return bound
}

/** 图形与坐标轴使用同一套显隐、位移和填充边界规则。 */
function plotRange(
  definition: IndicatorPlotDefinition,
  plots: readonly Plot[],
  fills: readonly PlotFill[],
  range: VisibleRange,
) {
  const fillSources = new Set(
    fills.filter((fill) => fill.visible).flatMap((fill) => [fill.from, fill.to]),
  )
  let min = Infinity
  let max = -Infinity
  for (const plot of plots) {
    if (!plot.visible && !fillSources.has(plot.id)) continue
    if (!isPricePlot(plot)) continue
    const start = Math.max(0, range.start - plot.offset)
    const end = Math.min(plot.data.length, range.end - plot.offset)
    let hasValues = false
    for (let index = start; index < end; index++) {
      const value = plot.data[index]?.value
      if (value === undefined || !Number.isFinite(value)) continue
      hasValues = true
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    if (plot.kind === 'histogram' && hasValues) {
      min = Math.min(min, plot.baseline)
      max = Math.max(max, plot.baseline)
    }
  }
  const padding = min <= max ? (max - min) * (definition.padding ?? 0.05) : 0
  const bounds = definition.range
  const valueMin =
    bounds?.min === undefined
      ? min - padding
      : applyRangeBound(min - padding, bounds.min, bounds.mode, 'min')
  const valueMax =
    bounds?.max === undefined
      ? max + padding
      : applyRangeBound(max + padding, bounds.max, bounds.mode, 'max')
  return {
    visibleMin: min,
    visibleMax: max,
    valueMin,
    valueMax,
  }
}
