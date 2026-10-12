/** 把计算器的数值序列投影为 Plot；统一处理显隐、位移、颜色和可见范围。 */

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
  if (definition.source === 'collection') {
    if (!isPlotCollection(raw)) throw new TypeError('Expected PlotCollection')
    return {
      kind: 'plots',
      timestamp,
      params,
      plots: raw.plots,
      fills: raw.fills,
      ...plotRange(definition, raw.plots, raw.fills, range),
      guides: [],
    }
  }
  const plots: Plot[] = definition.series.map((spec) => {
    const source = sourceArray(raw, spec, params)
    let previous: number | undefined
    const data: (PlotPoint | undefined)[] = source.map((item) => {
      const value = spec.field ? readPlotField(item, spec.field) : item
      if (value === undefined || value === null) return undefined
      if (typeof value !== 'number') throw new TypeError(`Plot ${spec.id} requires numeric values`)
      const color = spec.pointColor?.(value, previous, colors, item)
      previous = value
      return { value, color }
    })
    const base = {
      id: spec.id,
      label: typeof spec.label === 'function' ? spec.label(params) : (spec.label ?? spec.id),
      data,
      color: spec.color(colors),
      visible: !spec.show || params[spec.show] !== false,
      offset: spec.offset?.(params) ?? 0,
    }
    switch (spec.kind) {
      case 'histogram':
        return { ...base, kind: 'histogram', baseline: spec.baseline ?? 0 }
      case 'points':
        return { ...base, kind: 'points', radius: spec.radius ?? 1.5 }
      default:
        return { ...base, kind: 'line', width: spec.width ?? 1, dash: spec.dash ?? [] }
    }
  })
  const fills = (definition.fills ?? []).map((fill) => ({
    id: fill.id,
    from: fill.from,
    to: fill.to,
    visible: !fill.show || params[fill.show] !== false,
    color: fill.color(colors),
    reverseColor: fill.reverseColor(colors),
    opacity: fill.opacity ?? 0.15,
  }))
  return {
    kind: 'plots',
    timestamp,
    plots,
    fills,
    params,
    ...plotRange(definition, plots, fills, range),
    guides: (definition.guides ?? []).map((guide) => ({
      value: guide.value,
      color: guide.color(colors),
      dash: guide.dash ?? [4, 4],
    })),
  }
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
  let valueMin = min - padding
  let valueMax = max + padding
  const bounds = definition.range
  if (bounds?.min !== undefined)
    valueMin =
      bounds.mode === 'include'
        ? Math.min(valueMin, bounds.min)
        : bounds.mode === 'clamp'
          ? Math.max(valueMin, bounds.min)
          : bounds.min
  if (bounds?.max !== undefined)
    valueMax =
      bounds.mode === 'include'
        ? Math.max(valueMax, bounds.max)
        : bounds.mode === 'clamp'
          ? Math.min(valueMax, bounds.max)
          : bounds.max
  return {
    visibleMin: min,
    visibleMax: max,
    valueMin,
    valueMax,
  }
}
