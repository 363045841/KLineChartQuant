/** 把计算器的数值序列投影为 Plot；统一处理显隐、位移、颜色和可见范围。 */

import {
  createFill,
  createPlot,
  isOhlcPlot,
  isPricePlot,
  ohlcPlotStart,
  PlotKind,
  type ShapeSize,
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
    drawings: collection && isPlotCollection(raw) ? raw.drawings : undefined,
    ...plotRange(definition, plots, fills, range, collection && isPlotCollection(raw) ? raw.drawings : undefined),
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
    const kind = spec.kind ?? PlotKind.Line
    // 数值像素柱宽只属于 histogram；columns 忽略 size，其余 kind 只接受枚举档位。
    const size = kind === 'histogram' || kind === 'columns' ? undefined : enumPlotSize(spec.size)
    const base = {
      // 共享绘画声明用 name，core 的 PlotSpec 身份字段是 id，这里做一次映射。
      name: spec.id,
      label: typeof spec.label === 'function' ? spec.label(params) : (spec.label ?? spec.id),
      data,
      color: spec.color(colors),
      visible: !spec.show || params[spec.show] !== false,
      offset: spec.offset?.(params) ?? 0,
    }
    switch (kind) {
      case 'line':
      case 'linebr':
        return createPlot({ ...base, kind, dash: spec.dash, size }, data)
      case 'stepline':
      case 'steplinebr':
        return createPlot({ ...base, kind, dash: spec.dash, size }, data)
      case 'histogram':
        return createPlot(
          { ...base, kind: 'histogram', baseline: spec.baseline, size: spec.size },
          data,
        )
      case 'columns':
        return createPlot({ ...base, kind: 'columns', baseline: spec.baseline }, data)
      case 'points':
        return createPlot({ ...base, kind: 'points', size }, data)
      case 'char':
        return createPlot(
          {
            ...base,
            kind: 'char',
            char: spec.char,
            location: spec.location,
            text: spec.text,
            textColor: spec.textColor,
            size,
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
            size,
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
            text: spec.text,
            textColor: spec.textColor,
            size,
          },
          data,
        )
    }
  })
  const fills = (definition.fills ?? []).map((fill) => {
    const from = plots.find((plot) => plot.id === fill.from)
    const to = plots.find((plot) => plot.id === fill.to)
    if (!from || !to) throw new TypeError(`Unknown fill source: ${fill.id}`)
    const count = Math.max(from.data.length + from.offset, to.data.length + to.offset)
    const fillColors = Array.from({ length: count }, (_, index) =>
      fill.color(
        colors,
        from.data[index - from.offset]?.value,
        to.data[index - to.offset]?.value,
        index,
      ),
    )
    return createFill(
      {
        name: fill.id,
        from: fill.from,
        to: fill.to,
        visible: !fill.show || params[fill.show] !== false,
      },
      fillColors,
    )
  })
  return { plots, fills }
}

/** 布尔条件在数值列里只留下 1 或 na；相对定位的 Shape 用位置而非值。 */
function toNa(condition: boolean): number {
  return condition ? 1 : Number.NaN
}

/** 数值像素柱宽只对 histogram 有意义；其余 kind 只接受枚举档位，误用直接报错。 */
function enumPlotSize(size: ShapeSize | number | undefined): ShapeSize | undefined {
  if (typeof size !== 'number') return size
  throw new TypeError('Numeric Plot size is only supported by histogram')
}

/** 仅重算可见范围，不重新分配全量绘图点。 */
export function updatePlotRange(
  state: PlotRenderState,
  definition: IndicatorPlotDefinition,
  range: VisibleRange,
  timestamp: number,
): PlotRenderState {
  return { ...state, timestamp, ...plotRange(definition, state.plots, state.fills, range, state.drawings) }
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

/** 一根 Plot 的价格上下界。 */
interface PriceBounds {
  min: number
  max: number
}

/** 参与价格范围的 Plot：自身可见，或被某个可见填充引用。 */
function isRangeSource(plot: Plot, fillSources: ReadonlySet<string>): boolean {
  return (plot.visible || fillSources.has(plot.id)) && isPricePlot(plot)
}

/**
 * 取一根 Plot 在可见范围内的价格上下界；范围内没有有效数值时返回 undefined。
 * histogram / columns 从 baseline 起算，基线一并计入边界。
 */
function plotValueBounds(plot: Plot, range: VisibleRange): PriceBounds | undefined {
  const start = Math.max(isOhlcPlot(plot) ? ohlcPlotStart(plot) : 0, range.start - plot.offset)
  const end = Math.min(plot.data.length, range.end - plot.offset)
  let min = Infinity
  let max = -Infinity
  let hasValues = false
  if (isOhlcPlot(plot)) {
    for (let index = start; index < end; index++) {
      const point = plot.data[index]
      if (!point) continue
      hasValues = true
      min = Math.min(min, point.low)
      max = Math.max(max, point.high)
    }
    return hasValues ? { min, max } : undefined
  }
  for (let index = start; index < end; index++) {
    const value = plot.data[index]?.value
    if (value === undefined || !Number.isFinite(value)) continue
    hasValues = true
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  if (!hasValues) return undefined
  if (plot.kind === 'histogram' || plot.kind === 'columns') {
    return { min: Math.min(min, plot.baseline), max: Math.max(max, plot.baseline) }
  }
  return { min, max }
}

/** 缺省边界直接采用值域，否则按声明模式应用边界。 */
function resolveBound(
  value: number,
  bound: number | undefined,
  mode: RangeBoundMode,
  side: 'min' | 'max',
): number {
  if (bound === undefined) return value
  return applyRangeBound(value, bound, mode, side)
}

/** 汇总所有参与价格范围的 Plot 的上下界；都不参与时保持空区间。 */
function accumulateBounds(
  plots: readonly Plot[],
  fillSources: ReadonlySet<string>,
  range: VisibleRange,
): PriceBounds {
  const bounds = { min: Infinity, max: -Infinity }
  for (const plot of plots) {
    if (!isRangeSource(plot, fillSources)) continue
    const plotBounds = plotValueBounds(plot, range)
    if (!plotBounds) continue
    bounds.min = Math.min(bounds.min, plotBounds.min)
    bounds.max = Math.max(bounds.max, plotBounds.max)
  }
  return bounds
}

/** 图形与坐标轴使用同一套显隐、位移和填充边界规则。 */
function plotRange(
  definition: IndicatorPlotDefinition,
  plots: readonly Plot[],
  fills: readonly PlotFill[],
  range: VisibleRange,
  drawings: import('@363045841yyt/klinechart-plot-contracts').PlotCollection['drawings'] = [],
) {
  const fillSources = new Set(
    fills.filter((fill) => fill.visible).flatMap((fill) => [fill.from, fill.to]),
  )
  const bounds = accumulateBounds(plots, fillSources, range)
  // 纯 drawing 副图也必须有价格范围；对象仅在其区间与可见区相交时参与。
  for (const drawing of drawings) {
    if (!drawing.visible || !drawing.anchors.every((anchor) =>
      Number.isFinite(anchor.price) &&
      (anchor.logicalIndex === undefined || Number.isFinite(anchor.logicalIndex)) &&
      (anchor.time === undefined || Number.isFinite(typeof anchor.time === 'number' ? anchor.time : Date.parse(anchor.time)))
    )) continue
    const indices = drawing.anchors.map((anchor) => anchor.logicalIndex)
    const finiteIndices = indices.filter((index): index is number => index !== undefined && Number.isFinite(index))
    if (finiteIndices.length === indices.length && finiteIndices.length > 0 &&
      (Math.max(...finiteIndices) < range.start || Math.min(...finiteIndices) >= range.end) &&
      (drawing.extend === undefined || drawing.extend === 'none')) continue
    for (const anchor of drawing.anchors) {
      bounds.min = Math.min(bounds.min, anchor.price)
      bounds.max = Math.max(bounds.max, anchor.price)
    }
  }
  const padding =
    bounds.min <= bounds.max ? (bounds.max - bounds.min) * (definition.padding ?? 0.05) : 0
  return {
    visibleMin: bounds.min,
    visibleMax: bounds.max,
    valueMin: resolveBound(
      bounds.min - padding,
      definition.range?.min,
      definition.range?.mode,
      'min',
    ),
    valueMax: resolveBound(
      bounds.max + padding,
      definition.range?.max,
      definition.range?.mode,
      'max',
    ),
  }
}
