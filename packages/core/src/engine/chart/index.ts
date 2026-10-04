/** chart 模块唯一出口：图表装配层 `Chart` 与图表级公共类型。 */

export type { InteractionSnapshot } from './impl/chart.js'
export { Chart } from './impl/chart.js'
export type {
  ChartDom,
  ChartOptions,
  IndicatorInstance,
  IndicatorRole,
  KLinePositions,
  SubPaneInfo,
  Viewport,
  ViewportState,
} from './types.js'
