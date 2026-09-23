/**
 * 默认图形定义注册入口：汇总各工厂并注册到 DrawingDefinitionRegistry。
 */

import type { DrawingDefinitionRegistry } from '../DrawingDefinitionRegistry.js'
import { createArrowDefinition } from './arrow.js'
import {
  createDisjointChannelDefinition,
  createFlatLineDefinition,
  createParallelChannelDefinition,
  createRegressionChannelDefinition,
} from './channels.js'
import { createFibRetracementDefinition } from './fibRetracement.js'
import { createInfoLineDefinition } from './infoLine.js'
import { createRectangleDefinition } from './rectangle.js'
import { createSingleAnchorLineDefinition } from './singleAnchorLine.js'
import { createTwoPointLineDefinition } from './twoPointLine.js'

/** 注册内置绘图工具的全部图形定义。 */
export function registerDefaultDrawingDefinitions(registry: DrawingDefinitionRegistry): void {
  registry.register(createTwoPointLineDefinition('trend-line', 'none'))
  registry.register(createTwoPointLineDefinition('ray', 'right'))
  registry.register(createTwoPointLineDefinition('extended-line', 'both'))
  registry.register(createFibRetracementDefinition())
  registry.register(createRectangleDefinition())
  registry.register(createArrowDefinition())
  registry.register(createSingleAnchorLineDefinition('horizontal-line'))
  registry.register(createSingleAnchorLineDefinition('horizontal-ray'))
  registry.register(createSingleAnchorLineDefinition('vertical-line'))
  registry.register(createSingleAnchorLineDefinition('cross-line'))
  registry.register(createInfoLineDefinition())
  registry.register(createParallelChannelDefinition())
  registry.register(createRegressionChannelDefinition())
  registry.register(createFlatLineDefinition())
  registry.register(createDisjointChannelDefinition())
}
