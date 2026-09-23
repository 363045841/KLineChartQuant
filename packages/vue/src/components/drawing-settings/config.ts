import type { DrawingObject } from '@363045841yyt/klinechart-core/controllers'

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

type DrawingSettingsConfig = {
  style: ReadonlyArray<string>
  text: ReadonlyArray<string>
}

export const drawingSettingsConfigs: Record<DrawingObject['kind'], DrawingSettingsConfig> = {
  'trend-line': trendLine,
  ray,
  'extended-line': extendedLine,
  'fib-retracement': fibRetracement,
  rectangle,
  arrow,
  'horizontal-line': horizontalLine,
  'horizontal-ray': horizontalRay,
  'vertical-line': verticalLine,
  'cross-line': crossLine,
  'info-line': infoLine,
  'parallel-channel': parallelChannel,
  'regression-channel': regressionChannel,
  'flat-line': flatLine,
  'disjoint-channel': disjointChannel,
}
