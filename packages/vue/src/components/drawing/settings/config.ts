import type { DrawingObject, DrawingStyle } from '@363045841yyt/klinechart-core/controllers'

import arrow from './arrow.json'
import crossLine from './cross-line.json'
import disjointChannel from './disjoint-channel.json'
import extendedLine from './extended-line.json'
import fibRetracement from './fib-retracement.json'
import flatLine from './flat-line.json'
import horizontalLine from './horizontal-line.json'
import horizontalRay from './horizontal-ray.json'
import infoLine from './info-line.json'
import parallelChannel from './parallel-channel.json'
import ray from './ray.json'
import rectangle from './rectangle.json'
import regressionChannel from './regression-channel.json'
import trendLine from './trend-line.json'
import verticalLine from './vertical-line.json'

/** 弹窗和模板共用的可编辑颜色字段，UI 控件与名称只在这里定义。 */
export const drawingColorFields = {
  fill: { label: '背景颜色' },
  stroke: { label: '线条颜色' },
} as const satisfies Partial<Record<keyof DrawingStyle, { label: string }>>

export type DrawingColorField = keyof typeof drawingColorFields
export type DrawingTextTarget = 'line' | 'area'

export type DrawingSettingsConfig = {
  style: ReadonlyArray<DrawingColorField>
  text: readonly [] | readonly [DrawingTextTarget]
}

/** JSON 是运行时数据：校验字段，避免配置写错后悄悄不显示控件。 */
export function parseDrawingSettingsConfig(
  kind: DrawingObject['kind'],
  input: unknown,
): DrawingSettingsConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`Invalid drawing settings: ${kind}`)
  }
  const { style, text } = input as Record<string, unknown>
  if (
    Object.keys(input).some((key) => key !== 'style' && key !== 'text') ||
    !Array.isArray(style) ||
    style.some((key) => typeof key !== 'string' || !Object.hasOwn(drawingColorFields, key)) ||
    new Set(style).size !== style.length ||
    !Array.isArray(text) ||
    text.length > 1 ||
    text.some((target) => target !== 'line' && target !== 'area')
  ) {
    throw new Error(`Invalid drawing settings: ${kind}`)
  }
  return { style: style as DrawingColorField[], text: text as [] | [DrawingTextTarget] }
}

export const drawingSettingsConfigs: Record<DrawingObject['kind'], DrawingSettingsConfig> = {
  'trend-line': parseDrawingSettingsConfig('trend-line', trendLine),
  ray: parseDrawingSettingsConfig('ray', ray),
  'extended-line': parseDrawingSettingsConfig('extended-line', extendedLine),
  'fib-retracement': parseDrawingSettingsConfig('fib-retracement', fibRetracement),
  rectangle: parseDrawingSettingsConfig('rectangle', rectangle),
  arrow: parseDrawingSettingsConfig('arrow', arrow),
  'horizontal-line': parseDrawingSettingsConfig('horizontal-line', horizontalLine),
  'horizontal-ray': parseDrawingSettingsConfig('horizontal-ray', horizontalRay),
  'vertical-line': parseDrawingSettingsConfig('vertical-line', verticalLine),
  'cross-line': parseDrawingSettingsConfig('cross-line', crossLine),
  'info-line': parseDrawingSettingsConfig('info-line', infoLine),
  'parallel-channel': parseDrawingSettingsConfig('parallel-channel', parallelChannel),
  'regression-channel': parseDrawingSettingsConfig('regression-channel', regressionChannel),
  'flat-line': parseDrawingSettingsConfig('flat-line', flatLine),
  'disjoint-channel': parseDrawingSettingsConfig('disjoint-channel', disjointChannel),
}
