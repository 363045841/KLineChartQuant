/** 轴标签测试共享夹具：从渲染上下文派生收集输入，并提供按轴取标签的读法。 */
import type { RenderContext } from '@/foundation/plugin/index'
import type { AxisLabel, AxisLabelScope, TimeAxisLabel } from '../index.js'

/**
 * 构造标签收集输入；只覆盖用例关心的差异。
 *
 * @param context 渲染上下文夹具
 * @param overrides 用例差异
 */
export function createLabelScope(
  context: RenderContext,
  overrides: Partial<AxisLabelScope> = {},
): AxisLabelScope {
  return {
    pane: context.pane,
    axes: [],
    data: context.data,
    dataView: context.dataView,
    period: context.period,
    timeFormatter: context.displayTimeFormatter,
    marketSession: context.marketSession,
    timeTicks: context.timeTicks,
    timeShareGeometry: context.timeShareGeometry,
    timeAxisWidth: context.paneWidth,
    worldXToLogical: (worldX) => context.coordinates.xToLogical(worldX - context.scrollLeft),
    crosshair: null,
    active: true,
    axisTicks: new Map(),
    drawingLabels: [],
    logicalToTime: (index) => context.coordinates.logicalToTime(index),
    indicatorState: { get: () => undefined },
    theme: { theme: 'light' },
    countdown: null,
    ...overrides,
  }
}

/** 只保留时间轴标签。 */
function timeLabels(labels: readonly AxisLabel[]): TimeAxisLabel[] {
  return labels.filter((label): label is TimeAxisLabel => label.kind === 'time')
}

/** 取时间轴刻度文本。 */
export function timeTickTexts(labels: readonly AxisLabel[]): string[] {
  return timeLabels(labels)
    .filter((label) => label.role === 'tick')
    .map((label) => label.text)
}

/** 取时间轴十字线签文本。 */
export function crosshairTimeText(labels: readonly AxisLabel[]): string | undefined {
  return timeLabels(labels).find((label) => label.role === 'marker')?.text
}
