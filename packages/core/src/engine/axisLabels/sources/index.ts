/**
 * 标签来源清单：单帧执行的唯一顺序。
 *
 * 增删来源只改本文件；其余模块不引用具体来源。
 */

import type { AxisLabelSource } from '../types.js'
import { crosshairSource } from './crosshair.js'
import { drawingSelectionSource } from './drawingSelection.js'
import { indicatorOutputsSource } from './indicatorOutputs.js'
import { lastPriceSource } from './lastPrice.js'
import { ticksSource } from './ticks.js'

/** 与单个 Pane 相关的来源，按 scope 逐个执行。 */
export const PANE_LABEL_SOURCES: readonly AxisLabelSource[] = [
  ticksSource,
  indicatorOutputsSource,
  crosshairSource,
  lastPriceSource,
  drawingSelectionSource,
]

/** 时间轴与 Pane 无关，整帧只执行一次。 */
export { timeAxisSource } from './timeAxis.js'
