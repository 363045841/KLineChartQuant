/** 把计算器的数值序列投影为 Plot；统一处理显隐、位移、颜色和可见范围。 */

import {
  createFill,
  createPlot,
  isOhlcPlot,
  isPricePlot,
  ohlcPlotStart,
  type PlotCollection,
  PlotKind,
  type ShapeSize,
  validatePlotFills,
} from '@363045841yyt/klinechart-plot-contracts'
import type { VisibleRange } from '@/engine/viewport/viewport.js'
import {
  type ColorTokens,
  createScriptColorResolver,
  type ScriptColorResolver,
} from '@/foundation/tokens/index.js'
import type {
  ArrowPlot,
  CharPlot,
  IndicatorPlotDefinition,
  OhlcPlot,
  OhlcPlotPoint,
  Plot,
  PlotFill,
  PlotPoint,
  PlotRenderState,
  PlotSpec,
  ShapePlot,
} from '../types.js'
import { queryPlotBounds } from './plotBoundsIndex.js'
import { isPlotCollection } from './readPlotState.js'

/** 读取计算结果的具名字段，不猜测或转换数值。 */
function readPlotField(value: unknown, key: string): unknown {
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
  const rawCollection = collection ? readCollection(raw) : undefined
  const resolveColor = createScriptColorResolver(colors)
  const { plots, fills } = rawCollection
    ? readCollectionPlots(rawCollection, resolveColor)
    : buildSeriesPlots(definition, raw, params, colors)
  // 生产端与投影端各校验一次填充边界，绘制端不再重复。
  validatePlotFills(plots, fills)
  return {
    kind: 'plots',
    timestamp,
    params,
    plots,
    fills,
    drawings: rawCollection?.drawings,
    ...plotRange(definition, plots, fills, range, rawCollection?.drawings),
    guides: rawCollection
      ? readCollectionHlines(rawCollection, resolveColor)
      : (definition.guides ?? []).map((guide) => ({
          value: guide.value,
          color: guide.color(colors),
          dash: guide.dash ?? [4, 4],
          width: guide.width ?? 1,
        })),
    guideFills: rawCollection ? readCollectionGuideFills(rawCollection, resolveColor) : [],
  }
}

/** 集合里除 OHLC、箭头和标记之外的图形；颜色解析只关心公共色与逐点颜色。 */
type ScalarColorPlot = Exclude<Plot, OhlcPlot | ShapePlot | CharPlot | ArrowPlot>

/** 集合型指标必须返回合法 PlotCollection；非法结构在这里统一拒绝。 */
function readCollection(raw: unknown): PlotCollection {
  if (!isPlotCollection(raw)) throw new TypeError('Expected PlotCollection')
  return raw
}

/** 读取脚本产出的完整 PlotCollection，外来的结构与填充引用在此收口，颜色同时换成主题色值。 */
function readCollectionPlots(
  collection: PlotCollection,
  resolveColor: ScriptColorResolver,
): { plots: readonly Plot[]; fills: readonly PlotFill[] } {
  return {
    plots: collection.plots.map((plot) => resolvePlotColors(plot, resolveColor)),
    fills: collection.fills.map((fill) => resolveFillColors(fill, resolveColor)),
  }
}

/** 脚本 hline 转为渲染层参考线：价格映射 value，颜色换成当前主题值。 */
function readCollectionHlines(
  collection: PlotCollection,
  resolve: ScriptColorResolver,
): { value: number; color: string; dash: readonly number[]; width: number }[] {
  return (collection.hlines ?? []).map((line) => ({
    value: line.price,
    color: resolve(line.color),
    dash: line.dash,
    width: line.width,
  }))
}

/** 水平线填充转为价格区间；引用的 id 必须指向本轮声明的水平线。 */
function readCollectionGuideFills(
  collection: PlotCollection,
  resolve: ScriptColorResolver,
): { from: number; to: number; color: string; visible: boolean }[] {
  const prices = new Map((collection.hlines ?? []).map((line) => [line.id, line.price]))
  return (collection.hlineFills ?? []).map((fill) => {
    const from = prices.get(fill.from)
    const to = prices.get(fill.to)
    if (from === undefined || to === undefined)
      throw new TypeError(`Unknown hline fill source: ${fill.id}`)
    return { from, to, color: resolve(fill.color), visible: fill.visible }
  })
}

/** 绘图点只替换显式给出的颜色，缺省继续沿用所在 Plot 的颜色。 */
function resolvePointColors(point: PlotPoint, resolve: ScriptColorResolver): PlotPoint {
  return {
    value: point.value,
    ...(point.color === undefined ? {} : { color: resolve(point.color) }),
    ...(point.textColor === undefined ? {} : { textColor: resolve(point.textColor) }),
  }
}

/** OHLC 点用 null 表示该 bar 不绘制，null 不参与颜色解析。 */
function resolveOhlcPointColors(point: OhlcPlotPoint, resolve: ScriptColorResolver): OhlcPlotPoint {
  return {
    ...point,
    color: point.color === null ? null : resolve(point.color),
    wickColor: point.wickColor === null ? null : resolve(point.wickColor),
    borderColor: point.borderColor === null ? null : resolve(point.borderColor),
  }
}

/** 按图形类别分流：折线与柱状共用一套颜色字段，OHLC、箭头、标记各有专属字段。 */
function resolvePlotColors(plot: Plot, resolve: ScriptColorResolver): Plot {
  if (isOhlcPlot(plot)) return resolveOhlcColors(plot, resolve)
  if (plot.kind === 'arrow') return resolveArrowColors(plot, resolve)
  if (plot.kind === 'shape' || plot.kind === 'char') return resolveMarkerColors(plot, resolve)
  return resolveScalarColors(plot, resolve)
}

/** OHLC 只有图形色，逐 bar 的实体、影线和边框色各自独立。 */
function resolveOhlcColors(plot: OhlcPlot, resolve: ScriptColorResolver): OhlcPlot {
  return {
    ...plot,
    color: resolve(plot.color),
    data: plot.data.map((point) =>
      point === undefined ? undefined : resolveOhlcPointColors(point, resolve),
    ),
  }
}

/** 箭头的上下方向色决定图形颜色，公共色供图例使用。 */
function resolveArrowColors(plot: ArrowPlot, resolve: ScriptColorResolver): ArrowPlot {
  return {
    ...plot,
    color: resolve(plot.color),
    colorUp: resolve(plot.colorUp),
    colorDown: resolve(plot.colorDown),
    data: plot.data.map((point) =>
      point === undefined ? undefined : resolvePointColors(point, resolve),
    ),
  }
}

/** 形状与字符标记额外带文字色。 */
function resolveMarkerColors(
  plot: ShapePlot | CharPlot,
  resolve: ScriptColorResolver,
): ShapePlot | CharPlot {
  return {
    ...plot,
    color: resolve(plot.color),
    textColor: resolve(plot.textColor),
    data: plot.data.map((point) =>
      point === undefined ? undefined : resolvePointColors(point, resolve),
    ),
  }
}

/** 折线、阶梯线、柱状与散点只有公共色与逐点颜色。 */
function resolveScalarColors(plot: ScalarColorPlot, resolve: ScriptColorResolver): ScalarColorPlot {
  return {
    ...plot,
    color: resolve(plot.color),
    data: plot.data.map((point) =>
      point === undefined ? undefined : resolvePointColors(point, resolve),
    ),
  }
}

/** 填充按 bar 存色，null 表示该 bar 不填充。 */
function resolveFillColors(fill: PlotFill, resolve: ScriptColorResolver): PlotFill {
  return {
    ...fill,
    colors: fill.colors.map((color) => (color === null ? null : resolve(color))),
  }
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
    // 颜色与 Plot.data 同下标保存；显示位移由渲染器在取样时扣除。
    const count = Math.max(from.data.length, to.data.length)
    const fillColors = Array.from({ length: count }, (_, index) =>
      fill.color(colors, from.data[index]?.value, to.data[index]?.value, index),
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
  return {
    ...state,
    timestamp,
    ...plotRange(definition, state.plots, state.fills, range, state.drawings),
  }
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
 *
 * 区间极值走块索引（`queryPlotBounds`），滚动时不逐根扫描；offset 与 OHLC 的
 * `showLast` 裁剪仍在这里换算成数据下标。
 */
function plotValueBounds(plot: Plot, range: VisibleRange): PriceBounds | undefined {
  const start = Math.max(isOhlcPlot(plot) ? ohlcPlotStart(plot) : 0, range.start - plot.offset)
  const end = Math.min(plot.data.length, range.end - plot.offset)
  const bounds = queryPlotBounds(plot, start, end)
  if (!bounds) return undefined
  if (plot.kind === 'histogram' || plot.kind === 'columns') {
    return { min: Math.min(bounds.min, plot.baseline), max: Math.max(bounds.max, plot.baseline) }
  }
  return bounds
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

/** 图元是否参与价格范围：自身可见，且有效锚点落在可见区间或带 extend。 */
function drawingContributes(
  drawing: import('@363045841yyt/klinechart-plot-contracts').DrawingObject,
  range: VisibleRange,
): boolean {
  const valid = drawing.anchors.every(
    (anchor) =>
      Number.isFinite(anchor.price) &&
      (anchor.logicalIndex === undefined || Number.isFinite(anchor.logicalIndex)) &&
      (anchor.time === undefined ||
        Number.isFinite(typeof anchor.time === 'number' ? anchor.time : Date.parse(anchor.time))),
  )
  if (!drawing.visible || !valid) return false
  const indices = drawing.anchors.map((anchor) => anchor.logicalIndex)
  const finiteIndices = indices.filter(
    (index): index is number => index !== undefined && Number.isFinite(index),
  )
  if (finiteIndices.length !== indices.length || finiteIndices.length === 0) return true
  if (drawing.extend !== undefined && drawing.extend !== 'none') return true
  return Math.max(...finiteIndices) >= range.start && Math.min(...finiteIndices) < range.end
}

/** 纯 drawing 副图也必须有价格范围；只并入可见区间内的图元锚点。 */
function accumulateDrawingBounds(
  bounds: PriceBounds,
  drawings: ReadonlyArray<import('@363045841yyt/klinechart-plot-contracts').DrawingObject>,
  range: VisibleRange,
): void {
  for (const drawing of drawings) {
    if (!drawingContributes(drawing, range)) continue
    for (const anchor of drawing.anchors) {
      bounds.min = Math.min(bounds.min, anchor.price)
      bounds.max = Math.max(bounds.max, anchor.price)
    }
  }
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
  accumulateDrawingBounds(bounds, drawings, range)
  const padding =
    bounds.min <= bounds.max ? (bounds.max - bounds.min) * (definition.padding ?? 0.05) : 0
  // 柱体基线构成可见值域边界时固定该侧；跨基线的数据仍在两侧正常留白。
  const baselines = plots.filter(
    (plot) =>
      isRangeSource(plot, fillSources) &&
      (plot.kind === 'histogram' || plot.kind === 'columns') &&
      plotValueBounds(plot, range) !== undefined,
  )
  const pinMin = baselines.some(
    (plot) =>
      (plot.kind === 'histogram' || plot.kind === 'columns') && plot.baseline === bounds.min,
  )
  const pinMax = baselines.some(
    (plot) =>
      (plot.kind === 'histogram' || plot.kind === 'columns') && plot.baseline === bounds.max,
  )
  return {
    visibleMin: bounds.min,
    visibleMax: bounds.max,
    valueMin: resolveBound(
      bounds.min - (pinMin ? 0 : padding),
      definition.range?.min,
      definition.range?.mode,
      'min',
    ),
    valueMax: resolveBound(
      bounds.max + (pinMax ? 0 : padding),
      definition.range?.max,
      definition.range?.mode,
      'max',
    ),
  }
}
